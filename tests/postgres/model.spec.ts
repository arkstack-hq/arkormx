import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquirePostgresTestLock, DbUser, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'

describe('PostgreSQL model lifecycle', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
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
})
