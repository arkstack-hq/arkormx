import { Article, User, UserWithAttributeObjects, setupCoreRuntime } from './helpers/core-fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Model lifecycle and serialization', () => {
    beforeEach(() => {
        setupCoreRuntime()
        User.clearGlobalScopes()
        User.clearEventListeners()
    })

    afterEach(() => {
        User.clearGlobalScopes()
        User.clearEventListeners()
    })

    it('applies mutators, casts, and serialization rules', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const model = user as User
        const dynamic = model as User
        expect(dynamic.id).toBe(1)
        expect(dynamic.email).toBe('jane@example.com')
        expect(model.getAttribute('name')).toBe('Jane')
        expect(model.getAttribute('isActive')).toBe(true)
        expect(model.getAttribute('meta')).toEqual({ tier: 'pro' })
        expect(model.getAttribute('createdAt')).toBeInstanceOf(Date)

        dynamic.name = '  Property Setter  '
        expect(model.getAttribute('name')).toBe('Property Setter')
        expect(dynamic.name).toBe('Property Setter')

        const serialized = model.toObject()
        expect(serialized.password).toBeUndefined()
        expect(serialized.displayName).toBe('PROPERTY SETTER')
        expect(typeof serialized.createdAt).toBe('string')
        expect(model.toJSON()).toEqual(serialized)
    })

    it('persists updates through save()', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const model = user as User
        model.setAttribute('name', '  Jane Updated  ')
        await model.save()

        const reloaded = await User.query().find(1)
        expect(reloaded?.getAttribute('name')).toBe('Jane Updated')
    })

    it('returns a copy from getRawAttributes()', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const raw = (user as User).getRawAttributes()
        raw.name = 'Mutated Outside'

        expect((user as User).getAttribute('name')).toBe('Jane')
    })

    it('throws when deleting or force deleting without an id', async () => {
        const user = new User({ name: 'No Id' })

        await expect(user.delete()).rejects.toThrow('Cannot delete a model without an id.')
        await expect(user.forceDelete()).rejects.toThrow('Cannot force delete a model without an id.')
    })

    it('supports global scopes', async () => {
        User.addGlobalScope('active', query => query.whereKey('isActive', 1))

        const activeUsers = await User.query().get()
        expect(activeUsers.all().length).toBe(1)
        expect(activeUsers.all()[0]?.getAttribute('email')).toBe('jane@example.com')

        User.removeGlobalScope('active')
        const allUsers = await User.query().get()
        expect(allUsers.all().length).toBe(2)
    })

    it('dispatches lifecycle events', async () => {
        const events: string[] = []
        User.on('retrieved', () => void events.push('retrieved'))
        User.on('saving', () => void events.push('saving'))
        User.on('creating', () => void events.push('creating'))
        User.on('created', () => void events.push('created'))
        User.on('saved', () => void events.push('saved'))
        User.on('updating', () => void events.push('updating'))
        User.on('updated', () => void events.push('updated'))
        User.on('deleting', () => void events.push('deleting'))
        User.on('deleted', () => void events.push('deleted'))

        const newUser = new User({ name: 'Mia', email: 'mia@example.com', isActive: 1 })
        await newUser.save()

        const existing = await User.query().find(1)
        expect(existing).not.toBeNull()
        const existingUser = existing as User
        existingUser.setAttribute('name', 'Jane Updated')
        await existingUser.save()
        await existingUser.delete()

        expect(events).toEqual([
            'saving', 'creating', 'created', 'saved',
            'retrieved',
            'saving', 'updating', 'updated', 'saved',
            'deleting', 'deleted',
        ])
    })

    it('supports retrieved listeners for query hydration', async () => {
        const events: number[] = []
        User.retrieved(model => {
            events.push(Number(model.getAttribute('id')))
        })

        const allUsers = await User.query().orderBy({ id: 'asc' }).get()
        const singleUser = await User.query().find(1)

        expect(allUsers.all().length).toBe(2)
        expect(singleUser).not.toBeNull()
        expect(events).toEqual([1, 2, 1])
    })

    it('supports class-based event listeners via dispatchesEvents', async () => {
        const events: string[] = []

        class CreatedListener {
            public handle (model: User): void {
                events.push(`created:${String(model.getAttribute('email'))}`)
            }
        }

        class DeletedListener {
            public handle (model: User): void {
                events.push(`deleted:${String(model.getAttribute('id'))}`)
            }
        }

        class DispatchingUser extends User {
            protected static override dispatchesEvents = {
                created: CreatedListener,
                deleted: DeletedListener,
            }
        }

        const created = new DispatchingUser({ name: 'Mia', email: 'mia-dispatch@example.com', isActive: 1 })
        await created.save()

        const existing = await DispatchingUser.query().find(1)
        expect(existing).not.toBeNull()

        const user = existing as DispatchingUser
        await user.delete()

        expect(events).toEqual([
            'created:mia-dispatch@example.com',
            `deleted:${String(user.getAttribute('id'))}`,
        ])
    })

    it('supports boot, booted, and Model.event() callbacks', async () => {
        const events: string[] = []
        let bootCalls = 0
        let bootedCalls = 0

        class BootedUser extends User {
            protected static override boot (): void {
                bootCalls += 1
                this.addGlobalScope('active', query => query.whereKey('isActive', 1))
            }

            protected static override booted (): void {
                bootedCalls += 1
                this.created(model => {
                    events.push(`created:${String(model.getAttribute('email'))}`)
                })
            }
        }

        const scoped = await BootedUser.query().get()
        expect(scoped.all().length).toBe(1)

        const created = new BootedUser({ name: 'Booted', email: 'booted@example.com', isActive: 1 })
        await created.save()
        await BootedUser.query().get()

        expect(bootCalls).toBe(1)
        expect(bootedCalls).toBe(1)
        expect(events).toEqual(['created:booted@example.com'])
    })

    it('supports event suppression, quiet methods, and global scope suppression', async () => {
        const events: string[] = []
        User.on('saved', () => void events.push('saved'))
        User.on('deleted', () => void events.push('deleted'))
        Article.on('restored', () => void events.push('restored'))
        Article.on('forceDeleted', () => void events.push('forceDeleted'))

        await User.withoutEvents(async () => {
            const muted = new User({ name: 'Muted', email: 'muted@example.com', isActive: 1 })
            await muted.save()
        })

        const quiet = await User.query().find(1)
        expect(quiet).not.toBeNull()

        const persisted = quiet as User
        persisted.setAttribute('name', 'Jane Quiet')
        await persisted.saveQuietly()
        await persisted.deleteQuietly()

        const article = await Article.onlyTrashed().find(2001)
        expect(article).not.toBeNull()

        const archived = article as Article
        await archived.restoreQuietly()
        await archived.forceDeleteQuietly()

        User.addGlobalScope('active', query => query.whereKey('isActive', 1))
        const allUsers = await User.withoutGlobalScopes(async () => await User.query().get())

        expect(events).toEqual([])
        expect(allUsers.all().length).toBe(2)
    })

    it('supports model comparison and identity helpers', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        class OtherUser extends User {
        }

        const existing = user as User
        const sameRecord = new User({ id: 1, name: 'Jane Clone', email: 'clone@example.com', isActive: 1 })
        const differentRecord = new User({ id: 2, name: 'John', email: 'john@example.com', isActive: 0 })
        const sameIdDifferentClass = new OtherUser({ id: 1, name: 'Jane', email: 'jane@example.com', isActive: 1 })
        const unsaved = new User({ name: 'Unsaved' })

        expect(existing.is(sameRecord)).toBe(true)
        expect(existing.isNot(differentRecord)).toBe(true)
        expect(existing.is(sameIdDifferentClass)).toBe(false)
        expect(existing.is(unsaved)).toBe(false)
        expect(existing.isSame(existing)).toBe(true)
        expect(existing.isNotSame(sameRecord)).toBe(true)
    })

    it('supports Attribute object mutators with get/set and serialization appends', async () => {
        const user = await UserWithAttributeObjects.query().find(1)
        expect(user).not.toBeNull()

        const model = user as UserWithAttributeObjects
        expect(model.getAttribute('name')).toBe('Jane')

        model.setAttribute('name', '  Attribute Setter  ')
        expect(model.getAttribute('name')).toBe('Attribute Setter')
        expect(model.getRawAttributes().name).toBe('Attribute Setter')

            ; (model as any).email = '  NEW@EXAMPLE.COM '
        expect(model.getRawAttributes().email).toBe('new@example.com')
        expect(model.getAttribute('email')).toBe('new@example.com')

        const serialized = model.toObject()
        expect(serialized.displayName).toBe('ATTRIBUTE SETTER')
    })

    it('prefers Attribute object mutators over legacy getXxxAttribute/setXxxAttribute methods', async () => {
        const user = await UserWithAttributeObjects.query().find(1)
        expect(user).not.toBeNull()

        const model = user as UserWithAttributeObjects
        expect(model.getAttribute('name')).toBe('Jane')

        model.setAttribute('name', '  Mia  ')
        expect(model.getRawAttributes().name).toBe('Mia')
    })

    it('keeps casts working with Attribute object mutators', async () => {
        const user = new UserWithAttributeObjects({ isActive: 0 })
        expect(user.getAttribute('isActive')).toBe(false)

        user.setAttribute('isActive', 1)
        expect(user.getAttribute('isActive')).toBe(true)
    })
})
