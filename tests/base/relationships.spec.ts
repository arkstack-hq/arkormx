import { ArkormCollection, PivotModel, QueryBuilder, createPrismaDatabaseAdapter } from '../../src'
import { Comment, Image, Post, Profile, Role, Tag, User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createCoreClient } from './helpers/core-fixtures'

describe('Model relationships', () => {
    class MembershipPivot extends PivotModel {
        public getAttribute (key: string): any {
            return this.attributes[key]
        }
    }

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
        if (!user)
            throw new Error('Expected user to exist.')

        const posts = await user.posts().getResults()
        expectTypeOf(posts.all()).toEqualTypeOf<Post[]>()

        await user.load('posts')
        const eagerLoadedPosts = user.getAttribute('posts')
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

    it('routes pivot and through table reads through the adapter seam', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const selectSpy = vi.spyOn(adapter, 'select')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')

        User.setAdapter(adapter)
        Role.setAdapter(adapter)
        Image.setAdapter(adapter)
        Tag.setAdapter(adapter)

        try {
            const user = await User.query().find(1)
            expect(user).not.toBeNull()

            await user?.roles().getResults()
            await user?.postImages().getResults()
            await user?.avatar().getResults()
            await user?.tags().getResults()

            expect(selectSpy).toHaveBeenCalledWith(expect.objectContaining({
                target: expect.objectContaining({ table: 'roleUsers' }),
            }))
            expect(selectSpy).toHaveBeenCalledWith(expect.objectContaining({
                target: expect.objectContaining({ table: 'posts' }),
            }))
            expect(selectSpy).toHaveBeenCalledWith(expect.objectContaining({
                target: expect.objectContaining({ table: 'taggables' }),
            }))
            expect(selectOneSpy).toHaveBeenCalledWith(expect.objectContaining({
                target: expect.objectContaining({ table: 'profiles' }),
            }))
        } finally {
            User.setAdapter(undefined)
            Role.setAdapter(undefined)
            Image.setAdapter(undefined)
            Tag.setAdapter(undefined)
        }
    })

    it('supports polymorphic relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const comments = await user?.comments().getResults()
        const tags = await user?.tags().getResults()

        expect((comments as ArkormCollection<Comment>).all().length).toBe(1)
        expect((tags as ArkormCollection<Tag>).all().length).toBe(2)
    })

    it('exposes relation metadata from model relationship definitions', () => {
        expect(User.getRelationMetadata('profile')).toMatchObject({
            type: 'hasOne',
            foreignKey: 'userId',
            localKey: 'id',
        })
        expect(User.getRelationMetadata('roles')).toMatchObject({
            type: 'belongsToMany',
            throughTable: 'roleUsers',
            foreignPivotKey: 'userId',
            relatedPivotKey: 'roleId',
            parentKey: 'id',
            relatedKey: 'id',
        })
        expect(User.getRelationMetadata('avatar')).toMatchObject({
            type: 'hasOneThrough',
            throughTable: 'profiles',
            firstKey: 'userId',
            secondKey: 'profileId',
            localKey: 'id',
            secondLocalKey: 'id',
        })
        expect(User.getRelationMetadata('tags')).toMatchObject({
            type: 'morphToMany',
            throughTable: 'taggables',
            morphName: 'taggable',
            morphIdColumn: 'taggableId',
            morphTypeColumn: 'taggableType',
            relatedPivotKey: 'tagId',
            parentKey: 'id',
            relatedKey: 'id',
        })
        expect(User.getRelationMetadata('missing')).toBeNull()
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
            .withDefault((parent: User) => new Image({ id: 9010, profileId: parent.getAttribute('id'), url: 'fallback.png' }))
            .getResults()

        expect(throughDefault).toBeInstanceOf(Image)
        expect((throughDefault as Image).getAttribute('url')).toBe('fallback.png')

        const morphDefault = await missingUser.primaryComment()
            .withDefault((parent: User) => ({ body: `No comment for ${String(parent.getAttribute('name'))}` }))
            .getResults()

        expect(morphDefault).toBeInstanceOf(Comment)
        expect((morphDefault as Comment).getAttribute('body')).toBe('No comment for Ghost')
    })

    it('supports belongsToMany make, create, save, and attach helpers', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()
        if (!user)
            throw new Error('Expected user to exist.')

        const draft = user.roles().make({ name: 'draft-role' })
        expect(draft).toBeInstanceOf(Role)
        expect(draft.getAttribute('name')).toBe('draft-role')

        const created = await user.roles()
            .withPivot('approved')
            .as('membership')
            .create({ id: 502, name: 'reviewer' }, { approved: true })

        expect(created).toBeInstanceOf(Role)
        expect(created.getAttribute('name')).toBe('reviewer')
        expect(created.getAttribute('membership')).toMatchObject({ approved: true })

        const saved = await user.roles().save(new Role({ id: 503, name: 'auditor' }))
        expect(saved).toBeInstanceOf(Role)
        expect(saved.getAttribute('name')).toBe('auditor')

        const attached = await user.roles().attach(500, { approved: false, priority: 99 })
        expect(attached).toBe(1)

        const attachedRole = await user.roles()
            .withPivot('priority', 'approved')
            .as('membership')
            .wherePivot('priority', 99)
            .first()

        expect(attachedRole).not.toBeNull()
        expect(attachedRole?.getAttribute('name')).toBe('admin')
        expect(attachedRole?.getAttribute('membership')).toMatchObject({ approved: false, priority: 99 })

        const allRoles = await user.roles().orderBy({ id: 'asc' }).getResults()
        expect(allRoles.all().map(role => role.getAttribute('name'))).toEqual(['admin', 'editor', 'reviewer', 'auditor'])
    })

    it('supports belongsToMany detach and sync helpers', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()
        if (!user)
            throw new Error('Expected user to exist.')

        const detached = await user.roles().detach(500)
        expect(detached).toBe(1)

        const rolesAfterDetach = await user.roles().orderBy({ id: 'asc' }).getResults()
        expect(rolesAfterDetach.all().map(role => role.getAttribute('name'))).toEqual(['editor'])

        await user.roles().create({ id: 502, name: 'reviewer' }, { approved: true, priority: 2 })

        const changes = await user.roles().sync({
            500: { approved: true, priority: 10 },
            502: { approved: false, priority: 20 },
        })

        expect(changes).toEqual({ attached: 1, detached: 1, updated: 1 })

        const syncedRoles = await user.roles()
            .withPivot('approved', 'priority')
            .as('membership')
            .orderBy({ id: 'asc' })
            .getResults()

        expect(syncedRoles.all().map(role => role.getAttribute('name'))).toEqual(['admin', 'reviewer'])
        expect(syncedRoles.all()[0]?.getAttribute('membership')).toMatchObject({ approved: true, priority: 10 })
        expect(syncedRoles.all()[1]?.getAttribute('membership')).toMatchObject({ approved: false, priority: 20 })

        const detachedAll = await user.roles().detach()
        expect(detachedAll).toBe(2)
        expect((await user.roles().getResults()).all()).toEqual([])
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

    it('supports belongsToMany pivot helpers for filtering and attached pivot payloads', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const roles = await user?.roles()
            .withPivot('approved', 'priority', 'assignedAt', 'revokedAt')
            .withTimestamps()
            .as('membership')
            .using(MembershipPivot)
            .wherePivot('approved', true)
            .wherePivotNotIn('roleId', [501])
            .wherePivotBetween('priority', [1, 2])
            .wherePivotNull('revokedAt')
            .getResults()

        expect(roles).toBeInstanceOf(ArkormCollection)
        expect((roles as ArkormCollection<Role>).all()).toHaveLength(1)
        expect((roles as ArkormCollection<Role>).all()[0]?.getAttribute('name')).toBe('admin')

        const membership = (roles as ArkormCollection<Role>).all()[0]?.getAttribute('membership') as MembershipPivot
        expect(membership).toBeInstanceOf(MembershipPivot)
        expect(membership.getAttribute('userId')).toBe(1)
        expect(membership.getAttribute('roleId')).toBe(500)
        expect(membership.getAttribute('approved')).toBe(true)
        expect(membership.getAttribute('assignedAt')).toBe('2026-03-05T12:00:00.000Z')
        expect(membership.getAttribute('createdAt')).toBe('2026-03-05T12:00:00.000Z')
        expect(membership.getAttribute('updatedAt')).toBe('2026-03-06T12:00:00.000Z')
    })

    it('supports negative and null pivot helpers on belongsToMany relations', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const roles = await user?.roles()
            .wherePivotNotBetween('priority', [1, 2])
            .wherePivotNotNull('revokedAt')
            .getResults()

        expect(roles).toBeInstanceOf(ArkormCollection)
        expect((roles as ArkormCollection<Role>).all()).toHaveLength(1)
        expect((roles as ArkormCollection<Role>).all()[0]?.getAttribute('name')).toBe('editor')
    })

    it('applies configured pivot metadata during eager loading for belongsToMany relations', async () => {
        class UserWithMembershipRoles extends User {
            public override roles () {
                return this.belongsToMany(Role, 'roleUsers', 'userId', 'roleId')
                    .withPivot('approved')
                    .withTimestamps()
                    .as('membership')
                    .using(MembershipPivot)
                    .wherePivot('approved', true)
            }
        }

        const user = await UserWithMembershipRoles.query().find(1)
        expect(user).not.toBeNull()

        await user?.load('roles')

        const roles = user?.getAttribute('roles') as ArkormCollection<Role>
        expect(roles).toBeInstanceOf(ArkormCollection)
        expect(roles.all()).toHaveLength(1)
        expect(roles.all()[0]?.getAttribute('name')).toBe('admin')

        const membership = roles.all()[0]?.getAttribute('membership') as MembershipPivot
        expect(membership).toBeInstanceOf(MembershipPivot)
        expect(membership.getAttribute('approved')).toBe(true)
        expect(membership.getAttribute('createdAt')).toBe('2026-03-05T12:00:00.000Z')
        expect(membership.getAttribute('updatedAt')).toBe('2026-03-06T12:00:00.000Z')
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

    it('preserves configured pivot payloads when executing terminal methods from getQuery()', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const rolesQuery = await user?.roles()
            .withPivot('approved', 'priority')
            .withTimestamps()
            .as('membership')
            .using(MembershipPivot)
            .wherePivot('approved', true)
            .getQuery()

        const roles = await rolesQuery?.get()
        expect(roles).toBeInstanceOf(ArkormCollection)
        expect((roles as ArkormCollection<Role>).all()).toHaveLength(1)

        const membership = (roles as ArkormCollection<Role>).all()[0]?.getAttribute('membership') as MembershipPivot
        expect(membership).toBeInstanceOf(MembershipPivot)
        expect(membership.getAttribute('approved')).toBe(true)
        expect(membership.getAttribute('createdAt')).toBe('2026-03-05T12:00:00.000Z')

        const paginated = await rolesQuery?.clone().paginate(10, 1)
        expect(paginated?.data.all()).toHaveLength(1)

        const paginatedMembership = paginated?.data.all()[0]?.getAttribute('membership') as MembershipPivot
        expect(paginatedMembership).toBeInstanceOf(MembershipPivot)
        expect(paginatedMembership.getAttribute('priority')).toBe(1)
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

    it('batches hasOne and hasMany eager loads across parent models', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const selectSpy = vi.spyOn(adapter, 'select')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')

        User.setAdapter(adapter)
        Profile.setAdapter(adapter)
        Post.setAdapter(adapter)

        try {
            const users = await User.query()
                .with(['profile', 'posts'])
                .orderBy({ id: 'asc' })
                .get()

            expect(users.all()).toHaveLength(2)
            expect(selectSpy).toHaveBeenCalledTimes(3)
            expect(selectOneSpy).not.toHaveBeenCalled()

            const firstUser = users.all()[0] as User
            expect(firstUser.getAttribute('profile')).toBeInstanceOf(Profile)
            expect((firstUser.getAttribute('posts') as ArkormCollection<Post>).all()).toHaveLength(2)
        } finally {
            User.setAdapter(undefined)
            Profile.setAdapter(undefined)
            Post.setAdapter(undefined)
        }
    })

    it('batches belongsTo eager loads across parent models', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const selectSpy = vi.spyOn(adapter, 'select')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')

        User.setAdapter(adapter)
        Profile.setAdapter(adapter)

        try {
            const profiles = await Profile.query()
                .with('user')
                .orderBy({ id: 'asc' })
                .get()

            expect(profiles.all()).toHaveLength(2)
            expect(selectSpy).toHaveBeenCalledTimes(2)
            expect(selectOneSpy).not.toHaveBeenCalled()

            const firstProfile = profiles.all()[0] as Profile
            expect(firstProfile.getAttribute('user')).toBeInstanceOf(User)
        } finally {
            User.setAdapter(undefined)
            Profile.setAdapter(undefined)
        }
    })

    it('batches belongsToMany eager loads across parent models', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const selectSpy = vi.spyOn(adapter, 'select')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')

        User.setAdapter(adapter)
        Role.setAdapter(adapter)

        try {
            const users = await User.query()
                .with('roles')
                .orderBy({ id: 'asc' })
                .get()

            expect(users.all()).toHaveLength(2)
            expect(selectSpy).toHaveBeenCalledTimes(3)
            expect(selectOneSpy).not.toHaveBeenCalled()

            const firstUser = users.all()[0] as User
            expect(firstUser.getAttribute('roles')).toBeInstanceOf(ArkormCollection)
            expect((firstUser.getAttribute('roles') as ArkormCollection<Role>).all()).toHaveLength(2)
        } finally {
            User.setAdapter(undefined)
            Role.setAdapter(undefined)
        }
    })

    it('batches through eager loads across parent models', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const selectSpy = vi.spyOn(adapter, 'select')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')

        User.setAdapter(adapter)
        Image.setAdapter(adapter)

        try {
            const users = await User.query()
                .with(['avatar', 'postImages'])
                .orderBy({ id: 'asc' })
                .get()

            expect(users.all()).toHaveLength(2)
            expect(selectSpy).toHaveBeenCalledTimes(5)
            expect(selectOneSpy).not.toHaveBeenCalled()

            const firstUser = users.all()[0] as User
            expect(firstUser.getAttribute('avatar')).toBeInstanceOf(Image)
            expect((firstUser.getAttribute('postImages') as ArkormCollection<Image>).all()).toHaveLength(2)
        } finally {
            User.setAdapter(undefined)
            Image.setAdapter(undefined)
        }
    })

    it('loads relations by string and list syntax', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()
        if (!user)
            throw new Error('Expected user to exist.')

        await user.load(['profile', 'posts'])

        const profile = user.getAttribute('profile')
        const posts = user.getAttribute('posts')

        expect(profile).not.toBeNull()
        expect(posts).toBeInstanceOf(ArkormCollection)
        expect(posts.all().length).toBe(2)
    })
})
