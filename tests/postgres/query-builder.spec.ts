import { DbArticle, DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ArkormCollection, LengthAwarePaginator, Paginator } from '../../src'

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
        expect(page).toBeInstanceOf(LengthAwarePaginator)
        expect(page.data).toBeInstanceOf(ArkormCollection)
        expect(page.data.all().length).toBe(1)
        expect(page.meta.total).toBe(2)

        const simplePage = await DbUser.query().orderBy({ id: 'asc' }).simplePaginate(1, 1)
        expect(simplePage).toBeInstanceOf(Paginator)
        expect(simplePage.data).toBeInstanceOf(ArkormCollection)
        expect(simplePage.data.all().length).toBe(1)
        expect(simplePage.meta.hasMorePages).toBe(true)
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

    it('supports phase 1 query ergonomics', async () => {
        const latest = await DbUser.query().latest('id').firstOrFail()
        const oldest = await DbUser.query().oldest('id').firstOrFail()
        const limited = await DbUser.query().orderBy({ id: 'asc' }).limit(1).get()
        const offsetLimited = await DbUser.query().orderBy({ id: 'asc' }).offset(1).limit(1).get()
        const paged = await DbUser.query().orderBy({ id: 'asc' }).forPage(2, 1).get()

        expect(latest.getAttribute('id')).toBe(2)
        expect(oldest.getAttribute('id')).toBe(1)
        expect(limited.all().length).toBe(1)
        expect(offsetLimited.all()[0]?.getAttribute('id')).toBe(2)
        expect(paged.all()[0]?.getAttribute('id')).toBe(2)

        await expect(DbUser.query().whereKey('id', 1).exists()).resolves.toBe(true)
        await expect(DbUser.query().whereKey('id', 99999).exists()).resolves.toBe(false)
        await expect(DbUser.query().whereKey('id', 99999).doesntExist()).resolves.toBe(true)
    })

    it('supports phase 2 filtering parity helpers', async () => {
        const orWhere = await DbUser.query()
            .whereKey('id', 99999)
            .orWhere({ id: 2 })
            .get()
        expect(orWhere.all().map(user => user.getAttribute('id'))).toEqual([2])

        const whereNot = await DbUser.query().whereNot({ isActive: 1 } as Record<string, unknown>).get()
        expect(whereNot.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orWhereNot = await DbUser.query()
            .whereKey('id', 1)
            .orWhereNot({ isActive: 1 } as Record<string, unknown>)
            .orderBy({ id: 'asc' })
            .get()
        expect(orWhereNot.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereNull = await DbArticle.query().withTrashed().whereNull('deletedAt').get()
        expect(whereNull.all().map(article => article.getAttribute('title'))).toEqual(['Live'])

        const whereNotNull = await DbArticle.query().withTrashed().whereNotNull('deletedAt').get()
        expect(whereNotNull.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])

        const whereBetween = await DbUser.query().whereBetween('id', [1, 1]).get()
        expect(whereBetween.all().map(user => user.getAttribute('id'))).toEqual([1])

        const whereKeyNot = await DbUser.query().whereKeyNot('id', 1).get()
        expect(whereKeyNot.all().map(user => user.getAttribute('id'))).toEqual([2])

        const firstWhereEquals = await DbUser.query().firstWhere('email', 'jane@example.com')
        expect(firstWhereEquals?.getAttribute('id')).toBe(1)

        const firstWhereComparison = await DbUser.query().orderBy({ id: 'asc' }).firstWhere('id', '>', 1)
        expect(firstWhereComparison?.getAttribute('id')).toBe(2)

        const orWhereIn = await DbUser.query().whereKey('id', 99999).orWhereIn('id', [2]).get()
        expect(orWhereIn.all().map(user => user.getAttribute('id'))).toEqual([2])

        const whereNotIn = await DbUser.query().whereNotIn('id', [1]).get()
        expect(whereNotIn.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orWhereNotIn = await DbUser.query().whereKey('id', 1).orWhereNotIn('id', [1]).orderBy({ id: 'asc' }).get()
        expect(orWhereNotIn.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereDate = await DbArticle.query().withTrashed().whereDate('deletedAt', '2026-03-04').get()
        expect(whereDate.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])

        const whereMonth = await DbArticle.query().withTrashed().whereMonth('deletedAt', 3, 2026).get()
        expect(whereMonth.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])

        const whereYear = await DbArticle.query().withTrashed().whereYear('deletedAt', 2026).get()
        expect(whereYear.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])
    })

    it('throws firstOrFail when no records match', async () => {
        await expect(DbUser.query().whereKey('id', 99999).firstOrFail()).rejects.toThrow('Record not found.')
    })

    it('throws for update/delete without where constraints', async () => {
        await expect(DbUser.query().update({ name: 'Nope' })).rejects.toThrow('Update requires a where clause.')
        await expect(DbUser.query().delete()).rejects.toThrow('Delete requires a where clause.')
    })
})
