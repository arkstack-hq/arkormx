import { beforeEach, describe, expect, it } from 'vitest'

import { ArkormCollection, LengthAwarePaginator, Paginator } from '../src'
import { Article, User } from './helpers/core-fixtures'
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

    it('supports query ergonomics', async () => {
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

    it('supports filtering parity helpers', async () => {
        const orWhere = await User.query()
            .whereKey('id', 999)
            .orWhere({ id: 2 })
            .get()
        expect(orWhere.all().map(user => user.getAttribute('id'))).toEqual([2])

        const whereNot = await User.query().whereNot({ isActive: 1 }).get()
        expect(whereNot.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orWhereNot = await User.query()
            .whereKey('id', 1)
            .orWhereNot({ isActive: 1 })
            .orderBy({ id: 'asc' })
            .get()
        expect(orWhereNot.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereNull = await Article.query().withTrashed().whereNull('deletedAt').get()
        expect(whereNull.all().map(article => article.getAttribute('title'))).toEqual(['Live'])

        const whereNotNull = await Article.query().withTrashed().whereNotNull('deletedAt').get()
        expect(whereNotNull.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])

        const whereBetween = await User.query().whereBetween('id', [1, 1]).get()
        expect(whereBetween.all().map(user => user.getAttribute('id'))).toEqual([1])

        const whereKeyNot = await User.query().whereKeyNot('id', 1).get()
        expect(whereKeyNot.all().map(user => user.getAttribute('id'))).toEqual([2])

        const firstWhereEquals = await User.query().firstWhere('email', 'jane@example.com')
        expect(firstWhereEquals?.getAttribute('id')).toBe(1)

        const firstWhereComparison = await User.query().orderBy({ id: 'asc' }).firstWhere('id', '>', 1)
        expect(firstWhereComparison?.getAttribute('id')).toBe(2)

        const orWhereIn = await User.query().whereKey('id', 999).orWhereIn('id', [2]).get()
        expect(orWhereIn.all().map(user => user.getAttribute('id'))).toEqual([2])

        const whereNotIn = await User.query().whereNotIn('id', [1]).get()
        expect(whereNotIn.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orWhereNotIn = await User.query().whereKey('id', 1).orWhereNotIn('id', [1]).orderBy({ id: 'asc' }).get()
        expect(orWhereNotIn.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereDate = await User.query().whereDate('createdAt', '2026-03-04').get()
        expect(whereDate.all().length).toBe(2)

        const whereMonth = await User.query().whereMonth('createdAt', 3, 2026).get()
        expect(whereMonth.all().length).toBe(2)

        const whereYear = await User.query().whereYear('createdAt', 2026).get()
        expect(whereYear.all().length).toBe(2)
    })

    it('supports read helpers and utility shortcuts', async () => {
        const foundOr = await User.query().findOr(1, () => ({ fallback: true }))
        expect((foundOr as User).getAttribute('id')).toBe(1)

        const missingOr = await User.query().findOr(999, () => ({ fallback: true }))
        expect(missingOr).toEqual({ fallback: true })

        await expect(User.query().value('email')).resolves.toBe('jane@example.com')
        await expect(User.query().whereKey('id', 999).value('email')).resolves.toBeNull()
        await expect(User.query().valueOrFail('email')).resolves.toBe('jane@example.com')
        await expect(User.query().whereKey('id', 999).valueOrFail('email')).rejects.toThrow('Record not found.')

        const plucked = await User.query().orderBy({ id: 'asc' }).pluck('email')
        expect(plucked).toBeInstanceOf(ArkormCollection)
        expect(plucked.all()).toEqual(['jane@example.com', 'john@example.com'])

        const pluckedByKey = await User.query().pluck('email', 'id')
        expect(pluckedByKey.all().length).toBe(2)

        const randomUsers = await User.query().inRandomOrder().get()
        expect(randomUsers.all().length).toBe(2)

        const reordered = await User.query().orderBy({ id: 'desc' }).reorder('id', 'asc').get()
        expect(reordered.all()[0]?.getAttribute('id')).toBe(1)

        const whenResult = User.query().when(true, query => query.whereKey('id', 1)).get()
        await expect(whenResult).resolves.toBeInstanceOf(ArkormCollection)

        const unlessResult = User.query().unless(false, query => query.whereKey('id', 1)).get()
        await expect(unlessResult).resolves.toBeInstanceOf(ArkormCollection)

        const tapped = User.query().tap(query => query.whereKey('id', 1))
        await expect(tapped.get()).resolves.toBeInstanceOf(ArkormCollection)

        const pipedCount = await User.query().pipe(query => query.count())
        expect(pipedCount).toBe(2)
    })

    it('supports aggregate and advanced query helpers', async () => {
        await expect(User.query().min('id')).resolves.toBe(1)
        await expect(User.query().max('id')).resolves.toBe(2)
        await expect(User.query().sum('id')).resolves.toBe(3)
        await expect(User.query().avg('id')).resolves.toBe(1.5)

        await expect(User.query().whereKey('id', 1).existsOr(() => 'missing')).resolves.toBe(true)
        await expect(User.query().whereKey('id', 999).existsOr(() => 'missing')).resolves.toBe('missing')

        await expect(User.query().whereKey('id', 999).doesntExistOr(() => 'exists')).resolves.toBe(true)
        await expect(User.query().whereKey('id', 1).doesntExistOr(() => 'exists')).resolves.toBe('exists')

        expect(() => User.query().whereRaw('id = ?', [1])).toThrow('Raw where clauses are not supported by the current adapter.')
        expect(() => User.query().orWhereRaw('id = ?', [1])).toThrow('Raw where clauses are not supported by the current adapter.')
    })

    it('supports relationship existence/query helpers', async () => {
        const hasPosts = await User.query().has('posts').orderBy({ id: 'asc' }).get()
        expect(hasPosts.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const hasManyPosts = await User.query().has('posts', '>=', 2).get()
        expect(hasManyPosts.all().map(user => user.getAttribute('id'))).toEqual([1])

        const noComments = await User.query().doesntHave('comments').get()
        expect(noComments.all().map(user => user.getAttribute('id'))).toEqual([2])

        const whereHasA = await User.query().whereHas('posts', query => query.where({ title: 'A' })).get()
        expect(whereHasA.all().map(user => user.getAttribute('id'))).toEqual([1])

        const orWhereHas = await User.query().whereKey('id', 2).orWhereHas('posts', query => query.where({ title: 'A' })).orderBy({ id: 'asc' }).get()
        expect(orWhereHas.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereDoesntHaveA = await User.query().whereDoesntHave('posts', query => query.where({ title: 'A' })).get()
        expect(whereDoesntHaveA.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orWhereDoesntHaveA = await User.query().whereKey('id', 1).orWhereDoesntHave('posts', query => query.where({ title: 'A' })).orderBy({ id: 'asc' }).get()
        expect(orWhereDoesntHaveA.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const withCounts = await User.query().withCount('posts').withExists('profile').orderBy({ id: 'asc' }).get()
        expect(withCounts.all()[0]?.getAttribute('postsCount')).toBe(2)
        expect(withCounts.all()[0]?.getAttribute('profileExists')).toBe(true)

        const withAggregates = await User.query()
            .withSum('posts', 'id')
            .withAvg('posts', 'id')
            .withMin('posts', 'id')
            .withMax('posts', 'id')
            .whereKey('id', 1)
            .firstOrFail()

        expect(withAggregates.getAttribute('postsSumId')).toBe(201)
        expect(withAggregates.getAttribute('postsAvgId')).toBe(100.5)
        expect(withAggregates.getAttribute('postsMinId')).toBe(100)
        expect(withAggregates.getAttribute('postsMaxId')).toBe(101)
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
