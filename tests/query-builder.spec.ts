import { beforeEach, describe, expect, it } from 'vitest'

import { ArkormCollection, LengthAwarePaginator, Paginator } from '../src'
import { User } from './helpers/core-fixtures'
import { setupCoreRuntime } from './helpers/core-fixtures'

describe('QueryBuilder', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('supports basic querying and pagination', async () => {
        const users = await User.query().orderBy({ id: 'asc' }).get()
        expect(users).toBeInstanceOf(ArkormCollection)
        expect(users.all().length).toBe(2)

        const page = await User.query().paginate(1, 1)
        expect(page).toBeInstanceOf(LengthAwarePaginator)
        expect(page.data).toBeInstanceOf(ArkormCollection)
        expect(page.data.all().length).toBe(1)
        expect(page.meta.total).toBe(2)
        expect(page.meta.lastPage).toBe(2)

        const simplePage = await User.query().orderBy({ id: 'asc' }).simplePaginate(1, 1)
        expect(simplePage).toBeInstanceOf(Paginator)
        expect(simplePage.data).toBeInstanceOf(ArkormCollection)
        expect(simplePage.data.all().length).toBe(1)
        expect(simplePage.meta.hasMorePages).toBe(true)
    })

    it('supports whereKey and whereIn helpers', async () => {
        const users = await User.query()
            .whereKey('isActive', 1)
            .whereIn('id', [1, 2])
            .get()

        expect(users.all().length).toBe(1)
        expect(users.all()[0]?.getAttribute('email')).toBe('jane@example.com')
    })

    it('supports phase 1 query ergonomics', async () => {
        const latest = await User.query().latest('id').firstOrFail()
        const oldest = await User.query().oldest('id').firstOrFail()
        const limited = await User.query().orderBy({ id: 'asc' }).limit(1).get()
        const offsetLimited = await User.query().orderBy({ id: 'asc' }).offset(1).limit(1).get()
        const paged = await User.query().orderBy({ id: 'asc' }).forPage(2, 1).get()

        expect(latest.getAttribute('id')).toBe(2)
        expect(oldest.getAttribute('id')).toBe(1)
        expect(limited.all().length).toBe(1)
        expect(offsetLimited.all()[0]?.getAttribute('id')).toBe(2)
        expect(paged.all()[0]?.getAttribute('id')).toBe(2)

        await expect(User.query().whereKey('id', 1).exists()).resolves.toBe(true)
        await expect(User.query().whereKey('id', 999).exists()).resolves.toBe(false)
        await expect(User.query().whereKey('id', 999).doesntExist()).resolves.toBe(true)
    })

    it('supports key-based find and local scopes', async () => {
        const byEmail = await User.query().find('jane@example.com', 'email')
        expect(byEmail?.getAttribute('id')).toBe(1)

        const activeUsers = await User.scope('active').get()
        expect(activeUsers.all().length).toBe(1)
        expect(activeUsers.all()[0]?.getAttribute('email')).toBe('jane@example.com')
    })

    it('throws for firstOrFail when no record matches', async () => {
        await expect(
            User.query().whereKey('id', 999).firstOrFail()
        ).rejects.toThrow('Record not found.')
    })

    it('throws when update or delete are called without where constraints', async () => {
        await expect(User.query().update({ name: 'Nope' })).rejects.toThrow('Update requires a where clause.')
        await expect(User.query().delete()).rejects.toThrow('Delete requires a where clause.')
    })
})
