import {
    DbArticle,
    DbUser,
    acquirePostgresTestLock,
    prisma,
    releasePostgresTestLock,
    seedPostgresFixtures,
    setPostgresModelAdapter,
} from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
    createKyselyAdapter,
    createPrismaDatabaseAdapter,
} from '../../src'

import { Pool } from 'pg'

describe('PostgreSQL Kysely adapter', () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    })
    const db = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({ pool }),
    })

    const kyselyAdapter = createKyselyAdapter(db, {
        userProfile: 'profiles',
        roleUsers: 'role_users',
    })
    const prismaAdapter = createPrismaDatabaseAdapter(prisma)

    beforeAll(async () => {
        await acquirePostgresTestLock()
    })

    afterAll(async () => {
        setPostgresModelAdapter(undefined)
        await releasePostgresTestLock()
        await db.destroy()
    })

    beforeEach(async () => {
        await seedPostgresFixtures()
    })

    afterEach(() => {
        setPostgresModelAdapter(undefined)
    })

    it('matches Prisma adapter CRUD behavior for core specs', async () => {
        const selectedByPrisma = await prismaAdapter.select({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: 'contains',
                value: '@example.com',
            },
            orderBy: [{ column: 'id', direction: 'asc' }],
        })

        const selectedByKysely = await kyselyAdapter.select({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: 'contains',
                value: '@example.com',
            },
            orderBy: [{ column: 'id', direction: 'asc' }],
        })

        expect(selectedByKysely.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            isActive: row.isActive,
        }))).toEqual(selectedByPrisma.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            isActive: row.isActive,
        })))

        const inserted = await kyselyAdapter.insert({
            target: { table: 'users', primaryKey: 'id' },
            values: {
                name: 'Kysely User',
                email: 'kysely@example.com',
                isActive: 1,
            },
        })
        const insertedId = inserted.id

        if (typeof insertedId !== 'number')
            throw new Error('Expected inserted id to be a number.')

        expect(inserted.email).toBe('kysely@example.com')

        const updated = await kyselyAdapter.update({
            target: { table: 'users', primaryKey: 'id' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: insertedId,
            },
            values: {
                name: 'Kysely Updated',
            },
        })

        expect(updated?.name).toBe('Kysely Updated')

        const count = await kyselyAdapter.count({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'isActive',
                operator: '=',
                value: 1,
            },
            aggregate: { type: 'count' },
        })

        expect(count).toBe(2)

        const exists = await kyselyAdapter.exists({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: '=',
                value: 'kysely@example.com',
            },
        })

        expect(exists).toBe(true)

        const deleted = await kyselyAdapter.delete({
            target: { table: 'users', primaryKey: 'id' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: insertedId,
            },
        })

        expect(deleted?.email).toBe('kysely@example.com')
    })

    it('supports core QueryBuilder CRUD and pagination against Postgres', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const users = await DbUser.query().orderBy({ id: 'asc' }).get()
        expect(users.all().map(user => user.getAttribute('email'))).toEqual([
            'jane@example.com',
            'john@example.com',
        ])

        const page = await DbUser.query().orderBy({ id: 'asc' }).paginate(1, 1)
        expect(page.meta.total).toBe(2)
        expect(page.data.all()).toHaveLength(1)

        const created = await DbUser.query().create({
            name: 'Mia',
            email: 'mia-kysely@example.com',
            isActive: 1,
        })
        expect(created.getAttribute('email')).toBe('mia-kysely@example.com')

        const insertedId = await DbUser.query().insertGetId({
            name: 'Noah',
            email: 'noah-kysely@example.com',
            isActive: 0,
        })
        expect(typeof insertedId).toBe('number')

        const updated = await DbUser.query().whereKey('email', 'mia-kysely@example.com').update({
            name: 'Mia Updated',
        })
        expect(updated.getAttribute('name')).toBe('Mia Updated')

        await expect(DbUser.query().count()).resolves.toBe(4)
        await expect(DbUser.query().whereKey('email', 'mia-kysely@example.com').exists()).resolves.toBe(true)

        const deleted = await DbUser.query().whereKey('email', 'noah-kysely@example.com').delete()
        expect(deleted.getAttribute('email')).toBe('noah-kysely@example.com')

        const liveArticles = await DbArticle.query().get()
        expect(liveArticles.all().map(article => article.getAttribute('title'))).toEqual(['Live'])

        const trashedArticles = await DbArticle.query().onlyTrashed().get()
        expect(trashedArticles.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])
    })

    it('supports SQL-backed direct relation filters and aggregates through QueryBuilder', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const hasManyPosts = await DbUser.query().has('posts', '>=', 2).orderBy({ id: 'asc' }).get()
        expect(hasManyPosts.all().map(user => user.getAttribute('id'))).toEqual([1])

        const whereHasA = await DbUser.query().whereHas('posts', query => query.where({ title: 'A' })).get()
        expect(whereHasA.all().map(user => user.getAttribute('id'))).toEqual([1])

        const withCounts = await DbUser.query()
            .withCount('posts')
            .withExists('profile')
            .orderBy({ id: 'asc' })
            .get()
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
        expect(Number(withAggregates.getAttribute('postsAvgId'))).toBe(1.5)
        expect(withAggregates.getAttribute('postsMinId')).toBe(1)
        expect(withAggregates.getAttribute('postsMaxId')).toBe(2)
    })

    it('runs adapter transactions against Postgres', async () => {
        await kyselyAdapter.transaction(async (transactionAdapter) => {
            await transactionAdapter.insert({
                target: { table: 'users', primaryKey: 'id' },
                values: {
                    name: 'Txn User',
                    email: 'txn-kysely@example.com',
                    isActive: 1,
                },
            })
        })

        await expect(kyselyAdapter.exists({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: '=',
                value: 'txn-kysely@example.com',
            },
        })).resolves.toBe(true)

        await seedPostgresFixtures()

        await expect(kyselyAdapter.transaction(async (transactionAdapter) => {
            await transactionAdapter.insert({
                target: { table: 'users', primaryKey: 'id' },
                values: {
                    name: 'Rollback User',
                    email: 'rollback-kysely@example.com',
                    isActive: 1,
                },
            })

            throw new Error('rollback kysely transaction')
        })).rejects.toThrow('rollback kysely transaction')

        await expect(kyselyAdapter.exists({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: '=',
                value: 'rollback-kysely@example.com',
            },
        })).resolves.toBe(false)
    })
})