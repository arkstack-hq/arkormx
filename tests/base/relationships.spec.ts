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

        const profile = await user?.profile().getResults()
        const posts = await user?.posts().getResults()

        expect(profile).not.toBeNull()
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(Array.isArray(posts)).toBe(false)
        expect((posts as ArkormCollection<Post>).all().length).toBe(2)
    })

    it('keeps strong typing for relationship collections', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const posts = await user?.posts().getResults() as ArkormCollection<Post>
        expectTypeOf(posts.all()).toEqualTypeOf<Post[]>()

        await user?.load('posts')
        const eagerLoadedPosts = user?.getAttribute('posts') as ArkormCollection<Post>
        expectTypeOf(eagerLoadedPosts.all()).toEqualTypeOf<Post[]>()
    })

    it('supports many-to-many and through relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const roles = await user?.roles().getResults()
        const avatar = await user?.avatar().getResults()
        const postImages = await user?.postImages().getResults()

        expect((roles as ArkormCollection<Role>).all().length).toBe(2)
        expect(avatar).not.toBeNull()
        expect((postImages as ArkormCollection<Image>).all().length).toBe(2)
    })

    it('supports polymorphic relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const comments = await user?.comments().getResults()
        const tags = await user?.tags().getResults()

        expect((comments as ArkormCollection<Comment>).all().length).toBe(1)
        expect((tags as ArkormCollection<Tag>).all().length).toBe(2)
    })

    it('returns empty collections for through and many-to-many relations with no matches', async () => {
        const user = await User.query().find(2)
        expect(user).not.toBeNull()

        const roles = await user?.roles().getResults()
        const postImages = await user?.postImages().getResults()
        const tags = await user?.tags().getResults()
        const avatar = await user?.avatar().getResults()

        expect(roles).toBeInstanceOf(ArkormCollection)
        expect((roles as ArkormCollection<Role>).all()).toEqual([])
        expect(postImages).toBeInstanceOf(ArkormCollection)
        expect((postImages as ArkormCollection<Image>).all()).toEqual([])
        expect(tags).toBeInstanceOf(ArkormCollection)
        expect((tags as ArkormCollection<Tag>).all()).toEqual([])
        expect(avatar).toBeNull()
    })

    it('supports withDefault for single-result relationships', async () => {
        const missingProfileOwner = new Profile({ id: 99, userId: 999 })
        const belongsToDefault = await missingProfileOwner.user()
            .withDefault({ name: 'Guest User', email: 'guest@example.com' })
            .getResults()

        expect(belongsToDefault).toBeInstanceOf(User)
        expect((belongsToDefault as User).getAttribute('name')).toBe('Guest User')

        const missingUser = new User({ id: 999, name: 'Ghost', email: 'ghost@example.com', isActive: 0 })
        const hasOneDefault = await missingUser.profile()
            .withDefault(new Profile({ id: 500, userId: 999 }))
            .getResults()

        expect(hasOneDefault).toBeInstanceOf(Profile)
        expect((hasOneDefault as Profile).getAttribute('id')).toBe(500)

        const throughDefault = await missingUser.avatar()
            .withDefault((parent) => new Image({ id: 9010, profileId: parent.getAttribute('id'), url: 'fallback.png' }))
            .getResults()

        expect(throughDefault).toBeInstanceOf(Image)
        expect((throughDefault as Image).getAttribute('url')).toBe('fallback.png')

        const morphDefault = await missingUser.primaryComment()
            .withDefault((parent) => ({ body: `No comment for ${String(parent.getAttribute('name'))}` }))
            .getResults()

        expect(morphDefault).toBeInstanceOf(Comment)
        expect((morphDefault as Comment).getAttribute('body')).toBe('No comment for Ghost')
    })

    it('supports fluent relation query chaining', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const posts = await user?.posts()
            .where({ title: 'A' })
            .orderBy({ id: 'asc' })
            .getResults()

        const profile = await user?.profile()
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

        const posts = await user?.posts().where({ title: 'A' }).get()
        const firstPost = await user?.posts().orderBy({ id: 'asc' }).first()
        const firstProfile = await user?.profile().first()

        expect(posts).toBeInstanceOf(ArkormCollection)
        expect((posts as ArkormCollection<Post>).all().length).toBe(1)
        expect(firstPost).not.toBeNull()
        expect((firstPost as Post).getAttribute('title')).toBe('A')
        expect(firstProfile).not.toBeNull()
        expect((firstProfile as Profile).getAttribute('id')).toBe(10)
    })

    it('supports getQuery() for continued query chaining', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const postsQuery = await user?.posts().getQuery()
        const posts = await postsQuery?.where({ title: 'B' }).get()

        expect(posts).toBeInstanceOf(ArkormCollection)
        expect((posts as ArkormCollection<Post>).all()).toHaveLength(1)
        expect((posts as ArkormCollection<Post>).all()[0]?.getAttribute('title')).toBe('B')

        const rolesQuery = await user?.roles().getQuery()
        const firstRole = await rolesQuery?.orderBy({ id: 'desc' }).first()

        expect(firstRole).not.toBeNull()
        expect((firstRole as Role).getAttribute('name')).toBe('editor')
    })

    it('supports relation exists() and count() helpers', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const postCount = await user?.posts().count()
        const hasAvatar = await user?.avatar().exists()
        const hasNoMissingProfile = await user?.profile().doesntExist()
        const roleCount = await user?.roles().count()

        expect(postCount).toBe(2)
        expect(hasAvatar).toBe(true)
        expect(hasNoMissingProfile).toBe(false)
        expect(roleCount).toBe(2)

        const missingUser = new User({ id: 999, name: 'Ghost', email: 'ghost@example.com', isActive: 0 })
        const missingProfileCount = await missingUser.profile()
            .withDefault({ id: 500 })
            .count()
        const missingProfileExists = await missingUser.profile()
            .withDefault({ id: 500 })
            .exists()
        const missingProfileDoesntExist = await missingUser.profile()
            .withDefault({ id: 500 })
            .doesntExist()

        expect(missingProfileCount).toBe(0)
        expect(missingProfileExists).toBe(false)
        expect(missingProfileDoesntExist).toBe(true)
    })

    it('supports constrained eager loading callbacks', async () => {
        const user = await User.query().with({
            posts: (query) => (query as QueryBuilder<Post>).where({ title: 'A' }),
        }).find(1)

        expect(user).not.toBeNull()
        const posts = user?.getAttribute('posts') as ArkormCollection<Post>
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(posts.all().length).toBe(1)
    })

    it('loads relations by string and list syntax', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        await user?.load(['profile', 'posts'])

        const profile = user?.getAttribute('profile')
        const posts = user?.getAttribute('posts') as ArkormCollection<Post>

        expect(profile).not.toBeNull()
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(posts.all().length).toBe(2)
    })
})
