import { ArkormCollection, LengthAwarePaginator, Paginator, UnsupportedAdapterFeatureException, createPrismaDatabaseAdapter, type DatabaseAdapter } from '../../src'
import { Article, User } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreClient, setupCoreRuntime } from './helpers/core-fixtures'
import { Model } from '../../src'

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

    it('routes basic read execution through the configured adapter seam', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const selectSpy = vi.spyOn(adapter, 'select')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')
        const countSpy = vi.spyOn(adapter, 'count')
        const existsSpy = vi.spyOn(adapter, 'exists')

        User.setAdapter(adapter)

        try {
            await User.query().orderBy({ id: 'asc' }).get()
            await User.query().whereKey('id', 1).first()
            await User.query().count()
            await User.query().whereKey('id', 1).exists()

            expect(selectSpy).toHaveBeenCalled()
            expect(selectOneSpy).toHaveBeenCalled()
            expect(countSpy).toHaveBeenCalled()
            expect(existsSpy).toHaveBeenCalled()
        } finally {
            User.setAdapter(undefined)
        }
    })

    it('inspects the constructed query through adapters that support inspection', () => {
        const inspectQuery = vi.fn(() => ({
            adapter: 'fake',
            operation: 'select',
            target: 'users',
            sql: 'select * from users where id = ?',
            parameters: [1],
        }))

        const transaction: DatabaseAdapter['transaction'] = async <TResult> (callback: (nextAdapter: DatabaseAdapter) => TResult | Promise<TResult>): Promise<TResult> => await callback(adapter)

        const adapter: DatabaseAdapter = {
            capabilities: {},
            inspectQuery,
            select: async () => [],
            selectOne: async () => null,
            insert: async () => ({ id: 0 }),
            insertMany: async () => 0,
            update: async () => null,
            updateMany: async () => 0,
            delete: async () => null,
            deleteMany: async () => 0,
            count: async () => 0,
            exists: async () => false,
            transaction,
        }

        User.setAdapter(adapter)

        try {
            const inspection = User.query().whereKey('id', 1).inspect()

            expect(inspectQuery).toHaveBeenCalledWith(expect.objectContaining({
                operation: 'select',
                spec: expect.objectContaining({
                    target: expect.objectContaining({ table: 'users' }),
                }),
            }))
            expect(inspection).toMatchObject({
                sql: 'select * from users where id = ?',
                parameters: [1],
            })
        } finally {
            User.setAdapter(undefined)
        }
    })

    it('routes core write execution through the configured adapter seam', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const insertSpy = vi.spyOn(adapter, 'insert')
        const insertManySpy = vi.spyOn(adapter, 'insertMany')
        const selectOneSpy = vi.spyOn(adapter, 'selectOne')
        const updateSpy = vi.spyOn(adapter, 'update')
        const updateManySpy = vi.spyOn(adapter, 'updateMany')
        const deleteSpy = vi.spyOn(adapter, 'delete')

        User.setAdapter(adapter)

        try {
            await User.query().create({
                id: 20,
                name: 'Adapter Create',
                email: 'adapter-create@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T20:00:00.000Z'),
                updatedAt: new Date('2026-03-04T20:00:00.000Z'),
            })

            await User.query().insert([
                {
                    id: 21,
                    name: 'Adapter Insert A',
                    email: 'adapter-insert-a@example.com',
                    isActive: 1,
                    createdAt: new Date('2026-03-04T21:00:00.000Z'),
                    updatedAt: new Date('2026-03-04T21:00:00.000Z'),
                },
                {
                    id: 22,
                    name: 'Adapter Insert B',
                    email: 'adapter-insert-b@example.com',
                    isActive: 0,
                    createdAt: new Date('2026-03-04T22:00:00.000Z'),
                    updatedAt: new Date('2026-03-04T22:00:00.000Z'),
                },
            ])

            await User.query().whereKey('id', 20).update({ name: 'Adapter Updated' })
            await User.query().where({ email: 'adapter-create@example.com' }).update({ name: 'Adapter Updated Again' })
            await User.query().where({ isActive: 1 }).updateFrom({ name: 'Batch Updated' })
            await User.query().whereKey('id', 22).delete()

            expect(insertSpy).toHaveBeenCalled()
            expect(insertManySpy).toHaveBeenCalled()
            expect(selectOneSpy).toHaveBeenCalledWith(expect.objectContaining({
                columns: [{ column: 'id' }],
                where: {
                    type: 'comparison',
                    column: 'email',
                    operator: '=',
                    value: 'adapter-create@example.com',
                },
            }))
            expect(updateSpy).toHaveBeenCalled()
            expect(updateManySpy).toHaveBeenCalled()
            expect(deleteSpy).toHaveBeenCalled()
        } finally {
            User.setAdapter(undefined)
        }
    })

    it('routes duplicate-ignore inserts through the configured adapter seam', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)
        const insertManySpy = vi.spyOn(adapter, 'insertMany')

        User.setAdapter(adapter)

        try {
            await User.query().insertOrIgnore([
                {
                    id: 30,
                    name: 'Ignore A',
                    email: 'ignore-a@example.com',
                    isActive: 1,
                    createdAt: new Date('2026-03-04T23:00:00.000Z'),
                    updatedAt: new Date('2026-03-04T23:00:00.000Z'),
                },
                {
                    id: 31,
                    name: 'Ignore B',
                    email: 'ignore-b@example.com',
                    isActive: 0,
                    createdAt: new Date('2026-03-04T23:30:00.000Z'),
                    updatedAt: new Date('2026-03-04T23:30:00.000Z'),
                },
            ])

            expect(insertManySpy).toHaveBeenCalledWith(expect.objectContaining({
                ignoreDuplicates: true,
            }))
        } finally {
            User.setAdapter(undefined)
        }
    })

    it('routes raw where clauses through Arkorm query state when the adapter supports them', async () => {
        const selectSpy = vi.fn(async () => ([
            {
                id: 1,
                name: 'Jane',
                email: 'jane@example.com',
                password: 'secret',
                isActive: 1,
                meta: '{"tier":"pro"}',
                createdAt: '2026-03-04T12:00:00.000Z',
            },
        ]))

        const transaction: DatabaseAdapter['transaction'] = async <TResult> (callback: (nextAdapter: DatabaseAdapter) => TResult | Promise<TResult>): Promise<TResult> => await callback(adapter)

        const adapter: DatabaseAdapter = {
            capabilities: { rawWhere: true },
            select: selectSpy,
            selectOne: async () => null,
            insert: async () => ({ id: 0 }),
            insertMany: async () => 0,
            update: async () => null,
            updateMany: async () => 0,
            delete: async () => null,
            deleteMany: async () => 0,
            count: async () => 0,
            exists: async () => false,
            transaction,
        }

        User.setAdapter(adapter)

        try {
            const users = await User.query().whereRaw('id = ?', [1]).get()

            expect(selectSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    type: 'raw',
                    sql: 'id = ?',
                    bindings: [1],
                },
            }))
            expect(users.all()).toHaveLength(1)
        } finally {
            User.setAdapter(undefined)
        }
    })

    it('routes include clauses through Arkorm relation load plans', async () => {
        const selectSpy = vi.fn(async () => ([]))

        const transaction: DatabaseAdapter['transaction'] = async <TResult> (callback: (nextAdapter: DatabaseAdapter) => TResult | Promise<TResult>): Promise<TResult> => await callback(adapter)

        const adapter: DatabaseAdapter = {
            select: selectSpy,
            selectOne: async () => null,
            insert: async () => ({ id: 0 }),
            insertMany: async () => 0,
            update: async () => null,
            updateMany: async () => 0,
            delete: async () => null,
            deleteMany: async () => 0,
            count: async () => 0,
            exists: async () => false,
            transaction,
        }

        User.setAdapter(adapter)

        try {
            await User.query().include({
                posts: {
                    where: { title: 'A' },
                    orderBy: { id: 'desc' },
                    select: { id: true, title: true },
                    take: 1,
                },
            }).get()

            expect(selectSpy).toHaveBeenCalledWith(expect.objectContaining({
                relationLoads: [
                    {
                        relation: 'posts',
                        constraint: {
                            type: 'comparison',
                            column: 'title',
                            operator: '=',
                            value: 'A',
                        },
                        orderBy: [{ column: 'id', direction: 'desc' }],
                        columns: [{ column: 'id' }, { column: 'title' }],
                        limit: 1,
                        offset: undefined,
                        relationLoads: undefined,
                    },
                ],
            }))
        } finally {
            User.setAdapter(undefined)
        }
    })

    it('applies explicit model metadata with convention fallback', async () => {
        class MetadataUser extends Model {
            protected static override delegate = 'users'
            protected static override table = 'app_users'
            protected static override primaryKey = 'uuid'
            protected static override columns = {
                displayName: 'display_name',
            }
        }

        const selectSpy = vi.fn(async () => ([{ uuid: 'user-1', displayName: 'Jane' }]))
        const updateSpy = vi.fn(async () => ({ uuid: 'user-1', displayName: 'Updated' }))
        const deleteSpy = vi.fn(async () => ({ uuid: 'user-1', displayName: 'Updated' }))
        const insertSpy = vi.fn(async () => ({ uuid: 'user-2', displayName: 'Created' }))

        const transaction: DatabaseAdapter['transaction'] = async <TResult> (callback: (nextAdapter: DatabaseAdapter) => TResult | Promise<TResult>): Promise<TResult> => await callback(adapter)

        const adapter: DatabaseAdapter = {
            select: selectSpy,
            selectOne: async () => ({ uuid: 'user-1' }),
            insert: insertSpy,
            insertMany: async () => 0,
            update: updateSpy,
            updateMany: async () => 0,
            delete: deleteSpy,
            deleteMany: async () => 0,
            count: async () => 0,
            exists: async () => false,
            transaction,
        }

        MetadataUser.setAdapter(adapter)

        try {
            expect(User.getModelMetadata()).toMatchObject({
                table: 'users',
                primaryKey: 'id',
                columns: {},
                softDelete: { enabled: false, column: 'deletedAt' },
            })
            expect(MetadataUser.getModelMetadata()).toMatchObject({
                table: 'app_users',
                primaryKey: 'uuid',
                columns: { displayName: 'display_name' },
                softDelete: { enabled: false, column: 'deletedAt' },
            })
            expect(MetadataUser.getColumnName('displayName')).toBe('display_name')
            expect(MetadataUser.getColumnName('email')).toBe('email')

            const found = await MetadataUser.query().find('user-1')
            expect(found).not.toBeNull()
            expect(selectSpy).not.toHaveBeenCalled()

            await MetadataUser.query().get()
            expect(selectSpy).toHaveBeenCalledWith(expect.objectContaining({
                target: expect.objectContaining({
                    table: 'app_users',
                    primaryKey: 'uuid',
                    columns: { displayName: 'display_name' },
                }),
            }))

            const saved = new MetadataUser({ uuid: 'user-1', displayName: 'Updated' })
            await saved.save()
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    type: 'comparison',
                    column: 'uuid',
                    operator: '=',
                    value: 'user-1',
                },
            }))

            await saved.delete()
            expect(deleteSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    type: 'comparison',
                    column: 'uuid',
                    operator: '=',
                    value: 'user-1',
                },
            }))

            const insertedId = await MetadataUser.query().insertGetId({ displayName: 'Created' } as never)
            expect(insertedId).toBe('user-2')
            expect(insertSpy).toHaveBeenCalled()

            const left = new MetadataUser({ uuid: 'same-user' })
            const right = new MetadataUser({ uuid: 'same-user' })
            expect(left.is(right)).toBe(true)
        } finally {
            MetadataUser.setAdapter(undefined)
        }
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

        const whereLike = await User.query().whereLike('email', '@example.com').orderBy({ id: 'asc' }).get()
        expect(whereLike.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const whereStartsWith = await User.query().whereStartsWith('email', 'jane').get()
        expect(whereStartsWith.all().map(user => user.getAttribute('id'))).toEqual([1])

        const whereEndsWith = await User.query().whereEndsWith('email', '@example.com').orderBy({ id: 'asc' }).get()
        expect(whereEndsWith.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

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

    it('rejects non-normalizable top-level select and order clauses', () => {
        expect(() => User.query().select({
            posts: {
                select: { id: true },
            },
        } as never)).toThrow(UnsupportedAdapterFeatureException)

        expect(() => User.query().orderBy({
            posts: {
                _count: 'desc',
            },
        } as never)).toThrow(UnsupportedAdapterFeatureException)
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

    it('supports insert and upsert family write helpers', async () => {
        await expect(User.query().insert({
            id: 3,
            name: 'Alice',
            email: 'alice@example.com',
            isActive: 1,
            createdAt: new Date('2026-03-04T03:00:00.000Z'),
            updatedAt: new Date('2026-03-04T03:00:00.000Z'),
        })).resolves.toBe(true)

        await expect(User.query().insertOrIgnore([
            {
                id: 4,
                name: 'Bob',
                email: 'bob@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T04:00:00.000Z'),
                updatedAt: new Date('2026-03-04T04:00:00.000Z'),
            },
            {
                id: 5,
                name: 'Carol',
                email: 'carol@example.com',
                isActive: 0,
                createdAt: new Date('2026-03-04T05:00:00.000Z'),
                updatedAt: new Date('2026-03-04T05:00:00.000Z'),
            },
        ])).resolves.toBe(2)

        const insertedId = await User.query().insertGetId({
            id: 6,
            name: 'Dylan',
            email: 'dylan@example.com',
            isActive: 1,
            createdAt: new Date('2026-03-04T06:00:00.000Z'),
            updatedAt: new Date('2026-03-04T06:00:00.000Z'),
        })
        expect(insertedId).toBe(6)

        const insertedUsing = await User.query().insertUsing(
            ['id', 'name', 'email', 'isActive', 'createdAt', 'updatedAt'],
            [
                {
                    id: 7,
                    name: 'Eve',
                    email: 'eve@example.com',
                    isActive: 1,
                    createdAt: new Date('2026-03-04T07:00:00.000Z'),
                    updatedAt: new Date('2026-03-04T07:00:00.000Z'),
                },
            ]
        )
        expect(insertedUsing).toBe(1)

        const insertedOrIgnoreUsing = await User.query().insertOrIgnoreUsing(
            ['id', 'name', 'email', 'isActive', 'createdAt', 'updatedAt'],
            async () => ([
                {
                    id: 8,
                    name: 'Frank',
                    email: 'frank@example.com',
                    isActive: 0,
                    createdAt: new Date('2026-03-04T08:00:00.000Z'),
                    updatedAt: new Date('2026-03-04T08:00:00.000Z'),
                },
            ])
        )
        expect(insertedOrIgnoreUsing).toBe(1)

        const updatedCount = await User.query().where({ email: 'jane@example.com' }).updateFrom({ name: 'Jane Updated' })
        expect(updatedCount).toBe(1)

        await expect(User.query().updateOrInsert(
            { email: 'new-user@example.com' },
            { id: 9, name: 'New User', isActive: 1, createdAt: new Date('2026-03-04T09:00:00.000Z'), updatedAt: new Date('2026-03-04T09:00:00.000Z') }
        )).resolves.toBe(true)

        await expect(User.query().upsert(
            [{
                id: 10,
                name: 'Jane Upserted',
                email: 'jane@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-04T10:00:00.000Z'),
                updatedAt: new Date('2026-03-04T10:00:00.000Z'),
            }],
            'email',
            ['name']
        )).resolves.toBe(1)

        const total = await User.query().count()
        expect(total).toBe(9)
        await expect(User.query().where({ email: 'jane@example.com' }).value('name')).resolves.toBe('Jane Upserted')
    })

    it('throws for firstOrFail when no record matches', async () => {
        await expect(
            User.query().whereKey('id', 999).firstOrFail()
        ).rejects.toThrow('Record not found.')
    })

    it('returns null when delete matches no records through a non-unique predicate', async () => {
        const deleted = await User.query()
            .where({ id: 1 })
            .whereNot({ id: 1 })
            .delete()

        expect(deleted).toBeNull()
        await expect(User.query().whereKey('id', 1).value('name')).resolves.toBe('John Doe')
    })

    it('deleteOrFail preserves the throwing delete contract', async () => {
        await expect(
            User.query()
                .where({ id: 1 })
                .whereNot({ id: 1 })
                .deleteOrFail()
        ).rejects.toThrow('Record not found for delete operation.')
    })

    it('throws when update or delete are called without where constraints', async () => {
        await expect(User.query().update({ name: 'Nope' })).rejects.toThrow('Update requires a where clause.')
        await expect(User.query().delete()).rejects.toThrow('Delete requires a where clause.')
    })
})
