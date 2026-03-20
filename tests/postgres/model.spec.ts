import { DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe('PostgreSQL model lifecycle', () => {
    beforeAll(async () => {
        await acquirePostgresTestLock()
    })

    afterAll(async () => {
        await releasePostgresTestLock()
    })

    beforeEach(async () => {
        await seedPostgresFixtures()
        DbUser.clearGlobalScopes()
        DbUser.clearEventListeners()
    })

    afterEach(() => {
        DbUser.clearGlobalScopes()
        DbUser.clearEventListeners()
    })

    it('creates, updates, saves, and deletes rows with real DB data', async () => {
        const created = await DbUser.query().create({
            name: 'Mia',
            email: 'mia@example.com',
            isActive: 1,
        })

        expect(created.getAttribute('id')).toBeDefined()

        created.setAttribute('name', 'Mia Updated')
        await created.save()

        const reloaded = await DbUser.query().find(created.getAttribute('id'))
        expect(reloaded?.getAttribute('name')).toBe('Mia Updated')

        await reloaded?.delete()
        const deleted = await DbUser.query().find(created.getAttribute('id'))
        expect(deleted).toBeNull()
    })

    it('returns serializable object and json output', async () => {
        const user = await DbUser.query().whereKey('email', 'jane@example.com').firstOrFail()

        const object = user.toObject()
        const json = user.toJSON()

        expect(object.id).toBeDefined()
        expect(object.email).toBe('jane@example.com')
        expect(json).toEqual(object)
    })

    it('tracks original, dirty, clean, and changed attributes with real DB data', async () => {
        const user = await DbUser.query().whereKey('email', 'jane@example.com').firstOrFail()

        expect(user.isClean()).toBe(true)
        expect(user.wasChanged()).toBe(false)
        expect(user.getOriginal('name')).toBe('Jane')

        user.setAttribute('name', 'Jane Dirty')

        expect(user.isDirty()).toBe(true)
        expect(user.isDirty('name')).toBe(true)
        expect(user.isClean('name')).toBe(false)
        expect(user.wasChanged('name')).toBe(false)

        await user.save()

        expect(user.isClean()).toBe(true)
        expect(user.wasChanged()).toBe(true)
        expect(user.wasChanged('name')).toBe(true)
        expect(user.getOriginal('name')).toBe('Jane Dirty')
    })

    it('does not mark loaded relations as dirty with real DB data', async () => {
        const user = await DbUser.query().find(1)
        expect(user).not.toBeNull()

        const model = user as DbUser
        await model.load(['posts', 'profile'])

        expect(model.isClean()).toBe(true)
        expect(model.isDirty()).toBe(false)
    })

    it('throws when delete/forceDelete/restore are called without id', async () => {
        const model = new DbUser({ name: 'No Id', email: 'no-id@example.com', isActive: 0 })

        await expect(model.delete()).rejects.toThrow('Cannot delete a model without an id.')
        await expect(model.forceDelete()).rejects.toThrow('Cannot force delete a model without an id.')
        await expect(model.restore()).rejects.toThrow('Cannot restore a model without an id.')
    })

    it('supports global scopes with real DB data', async () => {
        DbUser.addGlobalScope('active', query => query.whereKey('isActive', 1))

        const scoped = await DbUser.query().get()
        expect(scoped.all().length).toBe(1)
        expect(scoped.all()[0]?.getAttribute('email')).toBe('jane@example.com')
    })

    it('dispatches lifecycle events with real DB operations', async () => {
        const events: string[] = []
        DbUser.retrieved(() => void events.push('retrieved'))
        DbUser.on('saving', () => void events.push('saving'))
        DbUser.on('creating', () => void events.push('creating'))
        DbUser.on('created', () => void events.push('created'))
        DbUser.on('saved', () => void events.push('saved'))
        DbUser.on('updating', () => void events.push('updating'))
        DbUser.on('updated', () => void events.push('updated'))
        DbUser.on('deleting', () => void events.push('deleting'))
        DbUser.on('deleted', () => void events.push('deleted'))

        const created = new DbUser({ name: 'Mia', email: 'mia-events@example.com', isActive: 1 })
        await created.save()

        const fetched = await DbUser.query().find(1)
        expect(fetched).not.toBeNull()

        created.setAttribute('name', 'Mia Events Updated')
        await created.save()
        await created.delete()

        expect(events).toEqual([
            'saving', 'creating', 'created', 'saved',
            'retrieved',
            'saving', 'updating', 'updated', 'saved',
            'deleting', 'deleted',
        ])
    })
})
