import { ArkormCollection, QueryBuilder, createKyselyAdapter } from '../../src'
import {
  DbComment,
  DbImage,
  DbPost,
  DbProfile,
  DbRole,
  DbTag,
  DbUser,
  acquirePostgresTestLock,
  prisma,
  releasePostgresTestLock,
  seedPostgresFixtures,
  setPostgresModelAdapter,
} from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { Pool } from 'pg'

describe('PostgreSQL model relationships', () => {
  const executedQueries: string[] = []
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool }),
    log(event) {
      if (event.level === 'query') executedQueries.push(event.query.sql)
    },
  })
  const kyselyAdapter = createKyselyAdapter(db, {
    userProfile: 'profiles',
    roleUsers: 'role_users',
  })

  beforeAll(async () => {
    await acquirePostgresTestLock()
    await seedPostgresFixtures()
  })

  afterAll(async () => {
    setPostgresModelAdapter(undefined)
    await releasePostgresTestLock()
    await db.destroy()
  })

  it('supports HasOneRelation', async () => {
    const user = await DbUser.query().find(1)
    const profile = await user?.profile().getResults()

    expect(profile).not.toBeNull()
    expect(profile?.getAttribute('userId')).toBe(1)
  })

  it('supports HasManyRelation', async () => {
    const user = await DbUser.query().find(1)
    const posts = await user?.posts().getResults()

    expectTypeOf(posts).toEqualTypeOf<ArkormCollection<DbPost, DbPost[]> | undefined>()

    expect(posts).toBeInstanceOf(ArkormCollection)
    expect(posts?.all().length).toBe(2)
  })

  it('supports BelongsToRelation', async () => {
    const post = await DbPost.query().whereKey('title', 'A').firstOrFail()
    const user = await post.user().getResults()

    expect(user).not.toBeNull()
    expect(user?.getAttribute('email')).toBe('jane@example.com')
  })

  it('supports BelongsToManyRelation', async () => {
    const user = await DbUser.query().find(1)
    const roles = await user?.roles().getResults()

    expect(roles).toBeInstanceOf(ArkormCollection)
    expect(roles?.all().length).toBe(2)
  })

  it('supports HasOneThroughRelation', async () => {
    const user = await DbUser.query().find(1)
    const avatar = await user?.avatar().getResults()

    expect(avatar).not.toBeNull()
    expect(avatar?.getAttribute('url')).toBe('a.png')
  })

  it('supports HasManyThroughRelation', async () => {
    const user = await DbUser.query().find(1)
    const postImages = await user?.postImages().getResults()

    expect(postImages).toBeInstanceOf(ArkormCollection)
    expect(postImages?.all().length).toBe(2)
  })

  it('supports MorphOneRelation', async () => {
    const user = await DbUser.query().find(1)
    const comment = await user?.primaryComment().getResults()

    expect(comment).not.toBeNull()
    expect((comment as { getAttribute: (key: string) => unknown }).getAttribute('body')).toBe(
      'Hi user',
    )
  })

  it('supports MorphManyRelation', async () => {
    const user = await DbUser.query().find(1)
    const comments = await user?.comments().getResults()

    expect(comments).toBeInstanceOf(ArkormCollection)
    expect(comments?.all().length).toBe(1)
  })

  it('supports MorphManyRelation create helpers against real database records', async () => {
    setPostgresModelAdapter(kyselyAdapter)
    executedQueries.length = 0

    try {
      const user = await DbUser.query().find(1)
      expect(user).not.toBeNull()
      if (!user) throw new Error('Expected user to exist.')

      const created = await user.comments().create({ body: 'Morph created' })
      const [manyCreated] = await user.comments().createMany([{ body: 'Morph created many' }])
      const firstOrCreated = await user.comments().firstOrCreate({
        body: 'Morph first or create',
      })
      const updatedOrCreated = await user
        .comments()
        .updateOrCreate({ body: 'Morph update or create' }, {})
      const saved = await user.comments().save(
        new DbComment({
          body: 'Morph saved',
        }),
      )

      for (const comment of [created, manyCreated, firstOrCreated, updatedOrCreated, saved]) {
        expect(comment?.getAttribute('commentableId')).toBe(user.getAttribute('id'))
        expect(comment?.getAttribute('commentableType')).toBe('DbUser')
      }

      const persisted = await user
        .comments()
        .whereIn('body', [
          'Morph created',
          'Morph created many',
          'Morph first or create',
          'Morph update or create',
          'Morph saved',
        ])
        .orderBy({ id: 'asc' })
        .getResults()

      expect(
        persisted.all().map((comment) => ({
          body: comment.getAttribute('body'),
          commentableId: comment.getAttribute('commentableId'),
          commentableType: comment.getAttribute('commentableType'),
        })),
      ).toEqual([
        { body: 'Morph created', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph created many', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph first or create', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph update or create', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph saved', commentableId: 1, commentableType: 'DbUser' },
      ])

      const stored = await prisma.comment.findMany({
        where: {
          body: {
            in: [
              'Morph created',
              'Morph created many',
              'Morph first or create',
              'Morph update or create',
              'Morph saved',
            ],
          },
        },
        orderBy: { id: 'asc' },
      })

      expect(
        stored.map((comment) => ({
          body: comment.body,
          commentableId: comment.commentableId,
          commentableType: comment.commentableType,
        })),
      ).toEqual([
        { body: 'Morph created', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph created many', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph first or create', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph update or create', commentableId: 1, commentableType: 'DbUser' },
        { body: 'Morph saved', commentableId: 1, commentableType: 'DbUser' },
      ])

      const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
      expect(normalizedSql).toContain('insert into "comments"')
      expect(normalizedSql).toContain('"commentableId"')
      expect(normalizedSql).toContain('"commentableType"')
    } finally {
      setPostgresModelAdapter(undefined)
      await seedPostgresFixtures()
    }
  })

  it('supports MorphToManyRelation', async () => {
    const user = await DbUser.query().find(1)
    const tags = await user?.tags().getResults()

    expect(tags).toBeInstanceOf(ArkormCollection)
    expect(tags?.all().length).toBe(2)
  })

  it('returns empty collections for through and many-to-many relations with no matches', async () => {
    const user = await DbUser.query().find(2)

    const roles = await user?.roles().getResults()
    const postImages = await user?.postImages().getResults()
    const tags = await user?.tags().getResults()
    const avatar = await user?.avatar().getResults()

    expect(roles).toBeInstanceOf(ArkormCollection)
    expect((roles as ArkormCollection<DbRole>).all()).toEqual([])
    expect(postImages).toBeInstanceOf(ArkormCollection)
    expect((postImages as ArkormCollection<DbImage>).all()).toEqual([])
    expect(tags).toBeInstanceOf(ArkormCollection)
    expect((tags as ArkormCollection<DbTag>).all()).toEqual([])
    expect(avatar).toBeNull()
  })

  it('supports fluent relation query chaining', async () => {
    const user = await DbUser.query().whereKey('id', 1).firstOrFail()

    const posts = await user.posts().where({ title: 'A' }).orderBy({ id: 'asc' }).getResults()

    const profile = await user.profile().where({ id: 1 }).getResults()

    expect(posts.all().length).toBe(1)
    expect(posts.all()[0]?.getAttribute('title')).toBe('A')
    expect(profile).not.toBeNull()
    expect(profile?.getAttribute('id')).toBe(1)
  })

  it('supports relation get() and first() helpers', async () => {
    const user = await DbUser.query().whereKey('id', 1).firstOrFail()

    const posts = await user.posts().where({ title: 'A' }).get()
    const firstPost = await user.posts().orderBy({ id: 'asc' }).first()
    const firstProfile = await user.profile().first()

    expect(posts).toBeInstanceOf(ArkormCollection)
    expect((posts as ArkormCollection<DbPost>).all().length).toBe(1)
    expect(firstPost).not.toBeNull()
    expect(firstPost?.getAttribute('title')).toBe('A')
    expect(firstProfile).not.toBeNull()
    expect(firstProfile?.getAttribute('id')).toBe(1)
  })

  it('supports eager loading with relation constraints', async () => {
    const user = await DbUser.query().whereKey('id', 1).firstOrFail()

    await user.load({
      posts: (query) => (query as QueryBuilder<DbPost>).whereKey('title', 'A'),
      profile: undefined,
      tags: undefined,
    })

    const posts = user.getAttribute('posts') as ArkormCollection<DbPost>
    const profile = user.getAttribute('profile') as DbProfile
    const tags = user.getAttribute('tags') as ArkormCollection

    expect(posts).toBeInstanceOf(ArkormCollection)
    expect(posts.all().length).toBe(1)
    expect(posts.all()[0]?.getAttribute('title')).toBe('A')
    expect(profile).not.toBeNull()
    expect(tags).toBeInstanceOf(ArkormCollection)
    expect(tags.all().length).toBe(2)
  })

  it('supports loading relations on an existing model instance', async () => {
    const user = await DbUser.query().find(1)
    expect(user).not.toBeNull()

    await user?.load(['profile', 'posts', 'comments'])

    const profile = user?.getAttribute('profile') as DbProfile
    const posts = user?.getAttribute('posts') as ArkormCollection<DbPost>
    const comments = user?.getAttribute('comments') as ArkormCollection

    expect(profile).not.toBeNull()
    expect(posts).toBeInstanceOf(ArkormCollection)
    expect(posts.all().length).toBe(2)
    expect(comments).toBeInstanceOf(ArkormCollection)
    expect(comments.all().length).toBe(1)
  })

  it('supports loading relationship counts on an existing model instance', async () => {
    setPostgresModelAdapter(kyselyAdapter)

    try {
      const user = await DbUser.query().find(1)
      expect(user).not.toBeNull()
      if (!user) throw new Error('Expected user to exist.')

      await user.loadCount(['posts', 'roles', 'comments'])

      expect(user.getAttribute('postsCount')).toBe(2)
      expect(user.getAttribute('rolesCount')).toBe(2)
      expect(user.getAttribute('commentsCount')).toBe(1)
    } finally {
      setPostgresModelAdapter(undefined)
    }
  })

  it('eager loads relations by string and list syntax', async () => {
    const user = await DbUser.query().with(['profile']).find(1)
    expect(user).not.toBeNull()

    const profile = user?.getAttribute('profile')

    expect(profile).not.toBeUndefined()
    expect(profile).toBeInstanceOf(DbProfile)
  })
})
