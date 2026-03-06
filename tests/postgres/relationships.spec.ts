import { ArkormCollection, QueryBuilder } from '../../src'
import {
    DbPost,
    DbProfile,
    DbUser,
    acquirePostgresTestLock,
    releasePostgresTestLock,
    seedPostgresFixtures
} from './helpers/fixtures'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

describe('PostgreSQL model relationships', () => {
    beforeAll(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterAll(async () => {
        await releasePostgresTestLock()
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
        expect((comment as { getAttribute: (key: string) => unknown }).getAttribute('body')).toBe('Hi user')
    })

    it('supports MorphManyRelation', async () => {
        const user = await DbUser.query().find(1)
        const comments = await user?.comments().getResults()

        expect(comments).toBeInstanceOf(ArkormCollection)
        expect(comments?.all().length).toBe(1)
    })

    it('supports MorphToManyRelation', async () => {
        const user = await DbUser.query().find(1)
        const tags = await user?.tags().getResults()

        expect(tags).toBeInstanceOf(ArkormCollection)
        expect(tags?.all().length).toBe(2)
    })

    it('supports fluent relation query chaining', async () => {
        const user = await DbUser.query().whereKey('id', 1).firstOrFail()

        const posts = await user
            .posts()
            .where({ title: 'A' })
            .orderBy({ id: 'asc' })
            .getResults()

        const profile = await user
            .profile()
            .where({ id: 1 })
            .getResults()

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
            posts: query => (query as QueryBuilder<DbPost>).whereKey('title', 'A'),
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
})
