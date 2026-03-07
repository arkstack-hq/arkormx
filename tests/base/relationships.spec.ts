import { ArkormCollection, QueryBuilder } from '../../src'
import { Comment, Image, Post, Profile, Role, Tag, User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

describe('Model relationships', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('supports one-to-one and one-to-many relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const profile = await (user as User).profile().getResults()
        const posts = await (user as User).posts().getResults()

        expect(profile).not.toBeNull()
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(Array.isArray(posts)).toBe(false)
        expect((posts as ArkormCollection<Post>).all().length).toBe(2)
    })

    it('keeps strong typing for relationship collections', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const posts = await (user as User).posts().getResults() as ArkormCollection<Post>
        expectTypeOf(posts.all()).toEqualTypeOf<Post[]>()

        await (user as User).load('posts')
        const eagerLoadedPosts = (user as User).getAttribute('posts') as ArkormCollection<Post>
        expectTypeOf(eagerLoadedPosts.all()).toEqualTypeOf<Post[]>()
    })

    it('supports many-to-many and through relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const roles = await (user as User).roles().getResults()
        const avatar = await (user as User).avatar().getResults()
        const postImages = await (user as User).postImages().getResults()

        expect((roles as ArkormCollection<Role>).all().length).toBe(2)
        expect(avatar).not.toBeNull()
        expect((postImages as ArkormCollection<Image>).all().length).toBe(2)
    })

    it('supports polymorphic relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const comments = await (user as User).comments().getResults()
        const tags = await (user as User).tags().getResults()

        expect((comments as ArkormCollection<Comment>).all().length).toBe(1)
        expect((tags as ArkormCollection<Tag>).all().length).toBe(2)
    })

    it('supports fluent relation query chaining', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const posts = await (user as User)
            .posts()
            .where({ title: 'A' })
            .orderBy({ id: 'asc' })
            .getResults()

        const profile = await (user as User)
            .profile()
            .where({ id: 10 })
            .getResults()

        expect((posts as ArkormCollection<Post>).all().length).toBe(1)
        expect((posts as ArkormCollection<Post>).all()[0]?.getAttribute('title')).toBe('A')
        expect(profile).not.toBeNull()
        expect((profile as Profile).getAttribute('id')).toBe(10)
    })

    it('supports relation get() and first() helpers', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const posts = await (user as User).posts().where({ title: 'A' }).get()
        const firstPost = await (user as User).posts().orderBy({ id: 'asc' }).first()
        const firstProfile = await (user as User).profile().first()

        expect(posts).toBeInstanceOf(ArkormCollection)
        expect((posts as ArkormCollection<Post>).all().length).toBe(1)
        expect(firstPost).not.toBeNull()
        expect((firstPost as Post).getAttribute('title')).toBe('A')
        expect(firstProfile).not.toBeNull()
        expect((firstProfile as Profile).getAttribute('id')).toBe(10)
    })

    it('supports constrained eager loading callbacks', async () => {
        const user = await User.query().with({
            posts: (query) => (query as QueryBuilder<Post>).where({ title: 'A' }),
        }).find(1)

        expect(user).not.toBeNull()
        const posts = (user as User).getAttribute('posts') as ArkormCollection<Post>
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(posts.all().length).toBe(1)
    })

    it('loads relations by string and list syntax', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        await (user as User).load(['profile', 'posts'])

        const profile = (user as User).getAttribute('profile')
        const posts = (user as User).getAttribute('posts') as ArkormCollection<Post>

        expect(profile).not.toBeNull()
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(posts.all().length).toBe(2)
    })
})
