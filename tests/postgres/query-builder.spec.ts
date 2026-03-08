import { ArkormCollection, LengthAwarePaginator, Paginator } from '../../src'
import { DbArticle, DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe('PostgreSQL QueryBuilder', () => {
    beforeAll(async () => {
        await acquirePostgresTestLock()
    })

    afterAll(async () => {
        await releasePostgresTestLock()
    })

    beforeEach(async () => {
        await seedPostgresFixtures()
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

    it('supports query ergonomics', async () => {
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

    it('supports filtering parity helpers', async () => {
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

    it('supports read helpers and utility shortcuts', async () => {
        const foundOr = await DbUser.query().findOr(1, () => ({ fallback: true }))
        expect((foundOr as DbUser).getAttribute('id')).toBe(1)

        const missingOr = await DbUser.query().findOr(99999, () => ({ fallback: true }))
        expect(missingOr).toEqual({ fallback: true })

        await expect(DbUser.query().value('email')).resolves.toBe('jane@example.com')
        await expect(DbUser.query().whereKey('id', 99999).value('email')).resolves.toBeNull()
        await expect(DbUser.query().valueOrFail('email')).resolves.toBe('jane@example.com')
        await expect(DbUser.query().whereKey('id', 99999).valueOrFail('email')).rejects.toThrow('Record not found.')

        const plucked = await DbUser.query().orderBy({ id: 'asc' }).pluck('email')
        expect(plucked).toBeInstanceOf(ArkormCollection)
        expect(plucked.all()).toEqual(['jane@example.com', 'john@example.com'])

        const pluckedByKey = await DbUser.query().pluck('email', 'id')
        expect(pluckedByKey.all().length).toBe(2)

        const randomUsers = await DbUser.query().inRandomOrder().get()
        expect(randomUsers.all().length).toBe(2)

        const reordered = await DbUser.query().orderBy({ id: 'desc' }).reorder('id', 'asc').get()
        expect(reordered.all()[0]?.getAttribute('id')).toBe(1)

        const whenResult = DbUser.query().when(true, query => query.whereKey('id', 1)).get()
        await expect(whenResult).resolves.toBeInstanceOf(ArkormCollection)

        const unlessResult = DbUser.query().unless(false, query => query.whereKey('id', 1)).get()
        await expect(unlessResult).resolves.toBeInstanceOf(ArkormCollection)

        const tapped = DbUser.query().tap(query => query.whereKey('id', 1))
        await expect(tapped.get()).resolves.toBeInstanceOf(ArkormCollection)

        const pipedCount = await DbUser.query().pipe(query => query.count())
        expect(pipedCount).toBe(2)
    })

    it('supports aggregate and advanced query helpers', async () => {
        await expect(DbUser.query().min('id')).resolves.toBe(1)
        await expect(DbUser.query().max('id')).resolves.toBe(2)
        await expect(DbUser.query().sum('id')).resolves.toBe(3)
        await expect(DbUser.query().avg('id')).resolves.toBe(1.5)

        await expect(DbUser.query().whereKey('id', 1).existsOr(() => 'missing')).resolves.toBe(true)
        await expect(DbUser.query().whereKey('id', 99999).existsOr(() => 'missing')).resolves.toBe('missing')

        await expect(DbUser.query().whereKey('id', 99999).doesntExistOr(() => 'exists')).resolves.toBe(true)
        await expect(DbUser.query().whereKey('id', 1).doesntExistOr(() => 'exists')).resolves.toBe('exists')

        expect(() => DbUser.query().whereRaw('id = ?', [1])).toThrow('Raw where clauses are not supported by the current adapter.')
        expect(() => DbUser.query().orWhereRaw('id = ?', [1])).toThrow('Raw where clauses are not supported by the current adapter.')
    })

    it('supports relationship existence/query helpers', async () => {
        const hasPosts = await DbUser.query().has('posts').orderBy({ id: 'asc' }).get()
        expect(hasPosts.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const hasManyPosts = await DbUser.query().has('posts', '>=', 2).get()
        expect(hasManyPosts.all().map(user => user.getAttribute('id'))).toEqual([1])

        const noComments = await DbUser.query().doesntHave('comments').get()
        expect(noComments.all().map(user => user.getAttribute('id'))).toEqual([2])

        const whereHasA = await DbUser.query().whereHas('posts', query => query.where({ title: 'A' })).get()
        expect(whereHasA.all().map(user => user.getAttribute('id'))).toEqual([1])

        const orWhereHas = await DbUser.query().whereKey('id', 2).orWhereHas('posts', query => query.where({ title: 'A' })).orderBy({ id: 'asc' }).get()
        expect(orWhereHas.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereDoesntHaveA = await DbUser.query().whereDoesntHave('posts', query => query.where({ title: 'A' })).get()
        expect(whereDoesntHaveA.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orWhereDoesntHaveA = await DbUser.query().whereKey('id', 1).orWhereDoesntHave('posts', query => query.where({ title: 'A' })).orderBy({ id: 'asc' }).get()
        expect(orWhereDoesntHaveA.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const withCounts = await DbUser.query().withCount('posts').withExists('profile').orderBy({ id: 'asc' }).get()
        expect(withCounts.all()[0]?.getAttribute('postsCount')).toBe(2)
        expect(withCounts.all()[0]?.getAttribute('profileExists')).toBe(true)

        const withAggregates = await DbUser.query()
            .withSum('posts', 'id')
            .withAvg('posts', 'id')
            .withMin('posts', 'id')
            .withMax('posts', 'id')
            .whereKey('id', 1)
            .firstOrFail()

        expect(withAggregates.getAttribute('postsSumId')).toBe(3)
        expect(withAggregates.getAttribute('postsAvgId')).toBe(1.5)
        expect(withAggregates.getAttribute('postsMinId')).toBe(1)
        expect(withAggregates.getAttribute('postsMaxId')).toBe(2)
    })

    it('supports insert and upsert family write helpers', async () => {
        await expect(DbUser.query().insert({
            id: 3,
            name: 'Alice',
            email: 'alice@example.com',
            isActive: 1,
            createdAt: new Date('2026-03-04T03:00:00.000Z'),
        })).resolves.toBe(true)

        await expect(DbUser.query().insertOrIgnore([
            {
                id: 4,
                name: 'Bob',
                email: 'bob@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T04:00:00.000Z'),
            },
            {
                id: 5,
                name: 'Carol',
                email: 'carol@example.com',
                isActive: 0,
                createdAt: new Date('2026-03-04T05:00:00.000Z'),
            },
        ])).resolves.toBe(2)

        const insertedId = await DbUser.query().insertGetId({
            id: 6,
            name: 'Dylan',
            email: 'dylan@example.com',
            isActive: 1,
            createdAt: new Date('2026-03-04T06:00:00.000Z'),
        })
        expect(insertedId).toBe(6)

        const insertedUsing = await DbUser.query().insertUsing(
            ['id', 'name', 'email', 'isActive', 'createdAt'],
            [
                {
                    id: 7,
                    name: 'Eve',
                    email: 'eve@example.com',
                    isActive: 1,
                    createdAt: new Date('2026-03-04T07:00:00.000Z'),
                },
            ]
        )
        expect(insertedUsing).toBe(1)

        const insertedOrIgnoreUsing = await DbUser.query().insertOrIgnoreUsing(
            ['id', 'name', 'email', 'isActive', 'createdAt'],
            async () => ([
                {
                    id: 8,
                    name: 'Frank',
                    email: 'frank@example.com',
                    isActive: 0,
                    createdAt: new Date('2026-03-04T08:00:00.000Z'),
                },
            ])
        )
        expect(insertedOrIgnoreUsing).toBe(1)

        const updatedCount = await DbUser.query().where({ email: 'jane@example.com' }).updateFrom({ name: 'Jane Updated' })
        expect(updatedCount).toBe(1)

        await expect(DbUser.query().updateOrInsert(
            { email: 'new-user@example.com' },
            { id: 9, name: 'New User', isActive: 1, createdAt: new Date('2026-03-04T09:00:00.000Z') }
        )).resolves.toBe(true)

        await expect(DbUser.query().upsert(
            [{
                id: 10,
                name: 'Jane Upserted',
                email: 'jane@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T10:00:00.000Z'),
            }],
            'email',
            ['name']
        )).resolves.toBe(1)

        const total = await DbUser.query().count()
        expect(total).toBe(9)
        await expect(DbUser.query().where({ email: 'jane@example.com' }).value('name')).resolves.toBe('Jane Upserted')
    })

    it('throws firstOrFail when no records match', async () => {
        await expect(DbUser.query().whereKey('id', 99999).firstOrFail()).rejects.toThrow('Record not found.')
    })

    it('throws for update/delete without where constraints', async () => {
        await expect(DbUser.query().update({ name: 'Nope' })).rejects.toThrow('Update requires a where clause.')
        await expect(DbUser.query().delete()).rejects.toThrow('Delete requires a where clause.')
    })
})
