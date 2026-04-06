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
    const executedQueries: string[] = []
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    })
    const db = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({ pool }),
        log (event) {
            if (event.level === 'query')
                executedQueries.push(event.query.sql)
        },
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
        executedQueries.length = 0
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

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('select count(*)::int from "posts"')
        expect(normalizedSql).toContain('exists( select 1 from "profiles"')
        expect(normalizedSql).toContain('and "title" = $1')
        expect(normalizedSql).toContain('sum("posts"."id")::double precision')
        expect(normalizedSql).toContain('avg("posts"."id")::double precision')
    })

    it('supports SQL-backed belongsToMany relation filters and aggregates through QueryBuilder', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const hasRoles = await DbUser.query().has('roles', '>=', 2).orderBy({ id: 'asc' }).get()
        expect(hasRoles.all().map(user => user.getAttribute('id'))).toEqual([1])

        const whereHasAdminRole = await DbUser.query().whereHas('roles', query => query.where({ name: 'admin' })).get()
        expect(whereHasAdminRole.all().map(user => user.getAttribute('id'))).toEqual([1])

        const withoutAdminRole = await DbUser.query().whereDoesntHave('roles', query => query.where({ name: 'admin' })).get()
        expect(withoutAdminRole.all().map(user => user.getAttribute('id'))).toEqual([2])

        const withCounts = await DbUser.query()
            .withCount('roles')
            .withExists('roles')
            .orderBy({ id: 'asc' })
            .get()
        expect(withCounts.all()[0]?.getAttribute('rolesCount')).toBe(2)
        expect(withCounts.all()[0]?.getAttribute('rolesExists')).toBe(true)
        expect(withCounts.all()[1]?.getAttribute('rolesCount')).toBe(0)
        expect(withCounts.all()[1]?.getAttribute('rolesExists')).toBe(false)

        const withAggregates = await DbUser.query()
            .withSum('roles', 'id')
            .withAvg('roles', 'id')
            .withMin('roles', 'id')
            .withMax('roles', 'id')
            .whereKey('id', 1)
            .firstOrFail()

        expect(withAggregates.getAttribute('rolesSumId')).toBe(3)
        expect(Number(withAggregates.getAttribute('rolesAvgId'))).toBe(1.5)
        expect(withAggregates.getAttribute('rolesMinId')).toBe(1)
        expect(withAggregates.getAttribute('rolesMaxId')).toBe(2)

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('from "roles" inner join "role_users"')
        expect(normalizedSql).toContain('"roles"."id" = "role_users"."roleId"')
        expect(normalizedSql).toContain('"role_users"."userId" = "users"."id"')
        expect(normalizedSql).toContain('and "name" = $1')
        expect(normalizedSql).toContain('exists( select 1 from "roles" inner join "role_users"')
        expect(normalizedSql).toContain('sum("roles"."id")::double precision')
    })

    it('supports SQL-backed through relation filters and aggregates through QueryBuilder', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const hasPostImages = await DbUser.query().has('postImages', '>=', 2).orderBy({ id: 'asc' }).get()
        expect(hasPostImages.all().map(user => user.getAttribute('id'))).toEqual([1])

        const whereHasImageA = await DbUser.query().whereHas('postImages', query => query.where({ url: 'a.png' })).get()
        expect(whereHasImageA.all().map(user => user.getAttribute('id'))).toEqual([1])

        const hasAvatar = await DbUser.query().has('avatar').orderBy({ id: 'asc' }).get()
        expect(hasAvatar.all().map(user => user.getAttribute('id'))).toEqual([1])

        const withoutAvatarA = await DbUser.query().whereDoesntHave('avatar', query => query.where({ url: 'a.png' })).orderBy({ id: 'asc' }).get()
        expect(withoutAvatarA.all().map(user => user.getAttribute('id'))).toEqual([2])

        const withCounts = await DbUser.query()
            .withCount('postImages')
            .withExists('avatar')
            .orderBy({ id: 'asc' })
            .get()
        expect(withCounts.all()[0]?.getAttribute('postImagesCount')).toBe(2)
        expect(withCounts.all()[0]?.getAttribute('avatarExists')).toBe(true)
        expect(withCounts.all()[1]?.getAttribute('postImagesCount')).toBe(0)
        expect(withCounts.all()[1]?.getAttribute('avatarExists')).toBe(false)

        const withAggregates = await DbUser.query()
            .withSum('postImages', 'id')
            .withAvg('postImages', 'id')
            .withMin('postImages', 'id')
            .withMax('postImages', 'id')
            .whereKey('id', 1)
            .firstOrFail()

        expect(withAggregates.getAttribute('postImagesSumId')).toBe(3)
        expect(Number(withAggregates.getAttribute('postImagesAvgId'))).toBe(1.5)
        expect(withAggregates.getAttribute('postImagesMinId')).toBe(1)
        expect(withAggregates.getAttribute('postImagesMaxId')).toBe(2)

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('from "images" inner join "posts"')
        expect(normalizedSql).toContain('"images"."postId" = "posts"."id"')
        expect(normalizedSql).toContain('"posts"."userId" = "users"."id"')
        expect(normalizedSql).toContain('from "images" inner join "profiles"')
        expect(normalizedSql).toContain('"images"."profileId" = "profiles"."id"')
        expect(normalizedSql).toContain('"profiles"."userId" = "users"."id"')
        expect(normalizedSql).toContain('and "url" = $1')
        expect(normalizedSql).toContain('sum("images"."id")::double precision')
    })

    it('falls back for unsupported relation helpers while preserving count and pagination semantics', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const filtered = await DbUser.query().has('comments', '>=', 1).orderBy({ id: 'asc' }).get()
        expect(filtered.all().map(user => user.getAttribute('id'))).toEqual([1])

        const total = await DbUser.query().has('comments', '>=', 1).count()
        expect(total).toBe(1)

        const page = await DbUser.query().has('comments', '>=', 1).orderBy({ id: 'asc' }).paginate(1, 1)
        expect(page.meta.total).toBe(1)
        expect(page.data.all().map(user => user.getAttribute('id'))).toEqual([1])

        const withCounts = await DbUser.query()
            .withCount('comments')
            .whereKey('id', 1)
            .firstOrFail()

        expect(withCounts.getAttribute('commentsCount')).toBe(1)
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