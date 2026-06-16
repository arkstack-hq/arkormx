import { ArkormCollection } from '../../src'
import { User } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

describe('Model persistence helpers', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    describe('firstOrNew', () => {
        it('returns the matching record when one exists', async () => {
            const user = await User.query().firstOrNew({ email: 'jane@example.com' })

            expect(user.getAttribute('id')).toBe(1)
            expect(user.wasRecentlyCreated).toBe(false)
        })

        it('instantiates an unpersisted model when no match exists', async () => {
            const user = await User.query().firstOrNew(
                { email: 'ghost@example.com' },
                { name: 'Ghost', isActive: 1 }
            )

            expect(user.getAttribute('id')).toBeUndefined()
            expect(user.getAttribute('email')).toBe('ghost@example.com')
            expect(user.getAttribute('name')).toBe('Ghost')
            expect(user.isDirty()).toBe(true)
            expect(await User.query().count()).toBe(2)
        })
    })

    describe('firstOrCreate', () => {
        it('returns the matching record without creating', async () => {
            const user = await User.query().firstOrCreate({ email: 'jane@example.com' })

            expect(user.getAttribute('id')).toBe(1)
            expect(await User.query().count()).toBe(2)
        })

        it('creates and persists a new record when no match exists', async () => {
            const user = await User.query().firstOrCreate(
                { email: 'created@example.com' },
                { id: 50, name: 'Created', isActive: 1, createdAt: new Date('2026-03-04T12:00:00.000Z') }
            )

            expect(user.getAttribute('id')).toBe(50)
            expect(user.getAttribute('email')).toBe('created@example.com')
            expect(await User.query().count()).toBe(3)
        })
    })

    describe('firstOr', () => {
        it('returns the first record when one exists', async () => {
            const result = await User.query().orderBy({ id: 'asc' }).firstOr(() => 'fallback')

            expect(result).not.toBe('fallback')
            expect((result as User).getAttribute('id')).toBe(1)
        })

        it('returns the callback result when no record matches', async () => {
            const result = await User.query().where({ email: 'missing@example.com' }).firstOr(() => 'fallback')

            expect(result).toBe('fallback')
        })

        it('accepts an explicit column list before the fallback', async () => {
            const result = await User.query()
                .where({ email: 'jane@example.com' })
                .firstOr(['id', 'email'], () => 'fallback')

            expect((result as User).getAttribute('id')).toBe(1)
        })
    })

    describe('updateOrCreate', () => {
        it('updates the matching record', async () => {
            const user = await User.query().updateOrCreate({ email: 'jane@example.com' }, { name: 'Renamed Jane' })

            expect(user.getAttribute('id')).toBe(1)
            expect(user.getAttribute('name')).toBe('Renamed Jane')
            expect(await User.query().count()).toBe(2)
        })

        it('creates a record when no match exists', async () => {
            const user = await User.query().updateOrCreate(
                { email: 'fresh@example.com' },
                { id: 60, name: 'Fresh', isActive: 1, createdAt: new Date('2026-03-04T12:00:00.000Z') }
            )

            expect(user.getAttribute('id')).toBe(60)
            expect(await User.query().count()).toBe(3)
        })
    })

    describe('static query helpers', () => {
        it('Model.all returns every record as a collection', async () => {
            const users = await User.all()

            expect(users).toBeInstanceOf(ArkormCollection)
            expect(users.all().length).toBe(2)
        })

        it('Model.where starts a constrained query', async () => {
            const users = await User.where({ isActive: 1 }).get()

            expect(users.all().map(user => user.getAttribute('id'))).toEqual([1])
        })

        it('Model.create persists and returns a hydrated model', async () => {
            const user = await User.create({
                id: 70,
                name: 'Static Create',
                email: 'static-create@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T12:00:00.000Z'),
            })

            expect(user.getAttribute('id')).toBe(70)
            expect(await User.query().count()).toBe(3)
        })

        it('Model.upsert inserts or updates by unique key', async () => {
            await expect(User.upsert(
                [{
                    id: 80,
                    name: 'Jane Upserted',
                    email: 'jane@example.com',
                    isActive: 1,
                    createdAt: new Date('2026-03-04T12:00:00.000Z'),
                    updatedAt: new Date('2026-03-04T12:00:00.000Z'),
                }],
                'email',
                ['name']
            )).resolves.toBe(1)

            await expect(User.where({ email: 'jane@example.com' }).value('name')).resolves.toBe('Jane Upserted')
        })

        it('Model.destroy deletes by primary key and returns the count', async () => {
            const deleted = await User.destroy([1, 2, 999])

            expect(deleted).toBe(2)
            expect(await User.query().count()).toBe(0)
        })
    })

    describe('exists flag', () => {
        it('is false for new models and true after a save', async () => {
            const user = new User({
                name: 'Exists',
                email: 'exists@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T12:00:00.000Z'),
            })
            expect(user.exists).toBe(false)

            await user.save()
            expect(user.exists).toBe(true)
        })

        it('is true for models loaded from the database', async () => {
            const user = await User.query().findOrFail(1)
            expect(user.exists).toBe(true)

            const collection = await User.all()
            expect(collection.all().every(model => model.exists)).toBe(true)
        })

        it('inserts a new model even when a primary key is provided', async () => {
            const user = new User({
                id: 999,
                name: 'Explicit Key',
                email: 'explicit-key@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T12:00:00.000Z'),
            })

            await user.save()

            expect(user.wasRecentlyCreated).toBe(true)
            expect(await User.query().count()).toBe(3)
        })

        it('clears exists after a hard delete', async () => {
            const user = await User.query().findOrFail(1)

            await user.delete()

            expect(user.exists).toBe(false)
        })
    })

    describe('change tracking', () => {
        it('marks wasRecentlyCreated only for inserts', async () => {
            const user = new User({
                name: 'Tracking',
                email: 'tracking@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T12:00:00.000Z'),
            })
            expect(user.wasRecentlyCreated).toBe(false)

            await user.save()
            expect(user.wasRecentlyCreated).toBe(true)

            const fetched = await User.query().findOrFail(1)
            expect(fetched.wasRecentlyCreated).toBe(false)
        })

        it('exposes getChanges and getPrevious after an update', async () => {
            const user = await User.query().findOrFail(2)

            await user.update({ name: 'John Changed' })

            expect(user.getChanges()).toMatchObject({ name: 'John Changed' })
            expect(user.getPrevious('name')).toBe('John')
        })
    })

    describe('orFail variants', () => {
        it('updateOrFail throws when the model has no identifier', async () => {
            const user = new User({ name: 'No id', email: 'no-id@example.com' })

            await expect(user.updateOrFail({ name: 'Nope' })).rejects.toThrow()
        })

        it('updateOrFail persists changes for an existing model', async () => {
            const user = await User.query().findOrFail(1)

            const result = await user.updateOrFail({ name: 'Jane OrFail' })

            expect(result.getAttribute('name')).toBe('Jane OrFail')
            await expect(User.where({ id: 1 }).value('name')).resolves.toBe('Jane OrFail')
        })

        it('deleteOrFail removes an existing model', async () => {
            const user = await User.query().findOrFail(1)

            await user.deleteOrFail()

            expect(await User.query().count()).toBe(1)
        })

        it('saveOrFail persists a new model', async () => {
            const user = new User({
                name: 'Save Or Fail',
                email: 'save-or-fail@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T12:00:00.000Z'),
            })

            await user.saveOrFail()

            expect(user.wasRecentlyCreated).toBe(true)
            expect(await User.query().count()).toBe(3)
        })
    })
})
