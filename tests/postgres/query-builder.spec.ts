import { DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ArkormCollection } from '../../src'

describe('PostgreSQL QueryBuilder', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
        await releasePostgresTestLock()
    })

    it('supports filtering, ordering, and pagination with real data', async () => {
        const users = await DbUser.query().orderBy({ id: 'asc' }).get()
        expect(users).toBeInstanceOf(ArkormCollection)
        expect(users.all().length).toBe(2)

        const page = await DbUser.query().paginate(1, 1)
        expect(page.data).toBeInstanceOf(ArkormCollection)
        expect(page.data.all().length).toBe(1)
        expect(page.meta.total).toBe(2)
    })

    it('supports whereKey, whereIn, find, and scopes', async () => {
        const activeByKey = await DbUser.query().whereKey('isActive', 1).get()
        expect(activeByKey.all().length).toBe(1)

        const activeByIn = await DbUser.query().whereIn('id', [1, 2]).whereKey('isActive', 1).get()
        expect(activeByIn.all().length).toBe(1)

        const byEmail = await DbUser.query().find('jane@example.com', 'email')
        expect(byEmail?.getAttribute('name')).toBe('Jane')

        const scoped = await DbUser.scope('active').get()
        expect(scoped).toBeInstanceOf(ArkormCollection)
        expect(scoped.all().length).toBe(1)
        expect(scoped.all()[0]?.getAttribute('email')).toBe('jane@example.com')
    })

    it('throws firstOrFail when no records match', async () => {
        await expect(DbUser.query().whereKey('id', 99999).firstOrFail()).rejects.toThrow('Record not found.')
    })

    it('throws for update/delete without where constraints', async () => {
        await expect(DbUser.query().update({ name: 'Nope' })).rejects.toThrow('Update requires a where clause.')
        await expect(DbUser.query().delete()).rejects.toThrow('Delete requires a where clause.')
    })
})
