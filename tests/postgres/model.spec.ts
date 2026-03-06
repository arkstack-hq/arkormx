import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquirePostgresTestLock, DbUser, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'

describe('PostgreSQL model lifecycle', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
        DbUser.clearGlobalScopes()
        DbUser.clearEventListeners()
    })

    afterEach(async () => {
        DbUser.clearGlobalScopes()
        DbUser.clearEventListeners()
        await releasePostgresTestLock()
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

        created.setAttribute('name', 'Mia Events Updated')
        await created.save()
        await created.delete()

        expect(events).toEqual([
            'saving', 'creating', 'created', 'saved',
            'saving', 'updating', 'updated', 'saved',
            'deleting', 'deleted',
        ])
    })
})
