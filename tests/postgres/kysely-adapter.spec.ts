import {
    DbArticle,
    DbPost,
    DbRole,
    DbUser,
    acquirePostgresTestLock,
    prisma,
    releasePostgresTestLock,
    seedPostgresFixtures,
    setPostgresModelAdapter,
} from './helpers/fixtures'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    ArkormCollection,
    type DatabaseAdapter,
    Model,
    QueryExecutionException,
    QueryBuilder,
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

    it('persists only dirty model attributes and serializes JSON casts', async () => {
        const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const tableName = `arkorm_json_updates_${suffix}`

        class JsonRecord extends Model {
            protected static override table = tableName
            protected override casts = {
                payload: 'json',
                createdAt: 'date',
                updatedAt: 'date',
            } as const

            public static override getModelMetadata () {
                return {
                    ...super.getModelMetadata(),
                    timestampColumns: [
                        { column: 'createdAt', default: 'now()' as const },
                        { column: 'updatedAt', updatedAt: true },
                    ],
                }
            }
        }

        await sql`
            create table ${sql.table(tableName)} (
                id serial primary key,
                payload jsonb not null,
                score integer not null,
                "createdAt" timestamptz not null default now(),
                "updatedAt" timestamptz not null default now()
            )
        `.execute(db)
        await sql`
            insert into ${sql.table(tableName)} (payload, score)
            values (${JSON.stringify([{ code: 'A' }])}::jsonb, 1)
        `.execute(db)

        const updateSpy = vi.spyOn(kyselyAdapter, 'update')
        const insertSpy = vi.spyOn(kyselyAdapter, 'insert')
        JsonRecord.setAdapter(kyselyAdapter)

        try {
            const record = await JsonRecord.query().find(1)
            expect(record).not.toBeNull()
            expect(record?.getAttribute('payload')).toEqual([{ code: 'A' }])

            record?.setAttribute('score', 2)
            await record?.save()

            const unrelatedUpdate = updateSpy.mock.calls.at(-1)?.[0].values
            expect(unrelatedUpdate).toMatchObject({
                score: 2,
                updatedAt: expect.any(Date),
            })
            expect(unrelatedUpdate).not.toHaveProperty('id')
            expect(unrelatedUpdate).not.toHaveProperty('payload')
            expect(unrelatedUpdate).not.toHaveProperty('createdAt')

            record?.setAttribute('payload', [{ code: 'B' }, { code: 'C' }])
            await record?.save()

            const jsonUpdate = updateSpy.mock.calls.at(-1)?.[0].values
            expect(jsonUpdate?.payload).toBe('[{"code":"B"},{"code":"C"}]')
            expect(jsonUpdate).not.toHaveProperty('id')
            expect(jsonUpdate).not.toHaveProperty('createdAt')
            expect(jsonUpdate?.updatedAt).toBeInstanceOf(Date)

            const persisted = await sql<{ payload: unknown, score: number }>`
                select payload, score
                from ${sql.table(tableName)}
                where id = 1
            `.execute(db)
            expect(persisted.rows[0]).toEqual({
                payload: [{ code: 'B' }, { code: 'C' }],
                score: 2,
            })

            const created = new JsonRecord({
                payload: [{ code: 'D' }],
                score: 3,
            })
            await created.save()

            const insertValues = insertSpy.mock.calls.at(-1)?.[0].values
            expect(insertValues?.payload).toBe('[{"code":"D"}]')
            expect(insertValues?.createdAt).toBeInstanceOf(Date)
            expect(insertValues?.updatedAt).toBeInstanceOf(Date)
        } finally {
            updateSpy.mockRestore()
            insertSpy.mockRestore()
            JsonRecord.setAdapter(undefined)
            await sql`drop table if exists ${sql.table(tableName)}`.execute(db)
        }
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
        if (!deleted)
            throw new Error('Expected deleted user to exist.')
        expect(deleted.getAttribute('email')).toBe('noah-kysely@example.com')

        const liveArticles = await DbArticle.query().get()
        expect(liveArticles.all().map(article => article.getAttribute('title'))).toEqual(['Live'])

        const trashedArticles = await DbArticle.query().onlyTrashed().get()
        expect(trashedArticles.all().map(article => article.getAttribute('title'))).toEqual(['Archived'])
    })

    it('supports raw and aliased select expressions through QueryBuilder', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const aliased = await DbUser.query()
            .select({ id: true, '1': 'isActive' })
            .orderBy({ id: 'asc' })
            .firstOrFail()

        expect(aliased.getAttribute('id')).toBe(1)
        expect(aliased.getAttribute('isActive')).toBe(1)

        const raw = await DbUser.query()
            .select(['id', '1 as "isActive"'])
            .orderBy({ id: 'asc' })
            .firstOrFail()

        expect(raw.getAttribute('id')).toBe(1)
        expect(raw.getAttribute('isActive')).toBe(1)

        const rawExpression = await DbUser.query()
            .select('1 as "isActive"')
            .firstOrFail()

        expect(rawExpression.getAttribute('isActive')).toBe(1)

        const appended = await DbUser.query()
            .select({ id: true })
            .addSelect({ '1': 'isActive' })
            .addSelect('2 as "priority"')
            .orderBy({ id: 'asc' })
            .firstOrFail()

        expect(appended.getAttribute('id')).toBe(1)
        expect(appended.getAttribute('isActive')).toBe(1)
        expect(appended.getAttribute('priority')).toBe(2)

        const appendedToWildcard = await DbUser.query()
            .addSelect({ '1': 'computedActive' })
            .orderBy({ id: 'asc' })
            .firstOrFail()

        expect(appendedToWildcard.getAttribute('id')).toBe(1)
        expect(appendedToWildcard.getAttribute('email')).toBe('jane@example.com')
        expect(appendedToWildcard.getAttribute('computedActive')).toBe(1)

        const normalizedSql = executedQueries.at(-1)?.replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('select *, 1 as "computedActive" from "users"')
    })

    it('supports raw where clauses through the Kysely adapter', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const normalizedLocalPart = 'jane'
        const query = DbUser.query().whereRaw(
            'LOWER("email") = ? OR LOWER("email") LIKE ?',
            [`${normalizedLocalPart}@example.com`, `%${normalizedLocalPart}@%`],
        )

        const users = await query.get()

        expect(users.all().map(user => user.getAttribute('email'))).toEqual(['jane@example.com'])

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('LOWER("email") = $1 OR LOWER("email") LIKE $2')
    })

    it('auto-quotes bare camelCase identifiers in raw where clauses', () => {
        setPostgresModelAdapter(kyselyAdapter)

        const inspection = DbUser.query()
            .whereRaw('createdAt < ? and users.updatedAt is not null and status = ?', [new Date('2020-01-01'), 'active'])
            .inspect()
        const normalizedSql = inspection?.sql?.replace(/\s+/g, ' ')

        // camelCase identifiers are quoted, lower-case identifiers and keywords are left alone.
        expect(normalizedSql).toContain('"createdAt" < $1')
        expect(normalizedSql).toContain('users."updatedAt" is not null')
        expect(normalizedSql).toContain('and status = $2')
    })

    it('compiles the join family into SQL', () => {
        setPostgresModelAdapter(kyselyAdapter)

        const innerSql = DbUser.query()
            .join('posts', 'users.id', '=', 'posts.userId')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(innerSql).toContain('inner join "posts" on "users"."id" = "posts"."userId"')

        const leftSql = DbUser.query()
            .leftJoin('posts', 'users.id', 'posts.userId')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(leftSql).toContain('left join "posts" on "users"."id" = "posts"."userId"')

        const compoundSql = DbUser.query()
            .join('posts', join => join.on('users.id', 'posts.userId').where('posts.published', '=', true))
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(compoundSql).toContain('inner join "posts" on "users"."id" = "posts"."userId" and "posts"."published" = $1')

        const crossSql = DbUser.query()
            .crossJoin('posts')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(crossSql).toContain('cross join "posts"')

        const whereSql = DbUser.query()
            .joinWhere('posts', 'posts.views', '>', 100)
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(whereSql).toContain('inner join "posts" on "posts"."views" > $1')
    })

    it('compiles subquery and lateral joins into SQL', () => {
        setPostgresModelAdapter(kyselyAdapter)

        const subSql = DbUser.query()
            .joinSub(DbPost.query().where({ userId: 1 }), 'p', 'users.id', '=', 'p.userId')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(subSql).toContain('inner join ( select * from "posts" where "userId" = $1 ) as "p" on "users"."id" = "p"."userId"')

        const lateralSql = DbUser.query()
            .joinLateral(DbPost.query(), 'p')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(lateralSql).toContain('inner join lateral ( select * from "posts" ) as "p" on true')
    })

    it('compiles the JSON where family into SQL', () => {
        setPostgresModelAdapter(kyselyAdapter)

        const containsSql = DbUser.query()
            .whereJsonContains('meta', { tier: 'pro' })
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(containsSql).toContain('"meta"::jsonb @> $1::jsonb')

        const doesntContainSql = DbUser.query()
            .whereJsonDoesntContain('meta', { tier: 'pro' })
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(doesntContainSql).toContain('not ("meta"::jsonb @> $1::jsonb)')

        const pathContainsSql = DbUser.query()
            .whereJsonContains('meta->roles', ['admin'])
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(pathContainsSql).toContain('("meta"::jsonb #> $1::text[]) @> $2::jsonb')

        const containsKeySql = DbUser.query()
            .whereJsonContainsKey('meta->tier')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(containsKeySql).toContain('("meta"::jsonb #> $1::text[]) is not null')

        const doesntContainKeySql = DbUser.query()
            .whereJsonDoesntContainKey('meta->tier')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(doesntContainKeySql).toContain('("meta"::jsonb #> $1::text[]) is null')

        const lengthSql = DbUser.query()
            .whereJsonLength('meta', '>=', 2)
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(lengthSql).toContain('jsonb_array_length("meta"::jsonb) >= $1')

        const overlapsSql = DbUser.query()
            .whereJsonOverlaps('meta', ['a', 'b'])
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(overlapsSql).toContain('jsonb_array_elements("meta"::jsonb)')
        expect(overlapsSql).toContain('jsonb_array_elements($1::jsonb)')
    })

    it('compiles the LIKE family and having into SQL', () => {
        setPostgresModelAdapter(kyselyAdapter)

        const notLikeSql = DbUser.query()
            .whereNotLike('email', 'jane')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(notLikeSql).toContain('not ("email" like $1)')

        const orLikeSql = DbUser.query()
            .where({ isActive: 1 })
            .orWhereLike('email', 'jane')
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(orLikeSql).toContain('or "email" like $2')

        const havingSql = DbUser.query()
            .groupBy('isActive')
            .having('isActive', '>=', 1)
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(havingSql).toContain('group by "isActive"')
        expect(havingSql).toContain('having "isActive" >= $1')

        const orHavingSql = DbUser.query()
            .groupBy('isActive')
            .having('isActive', '>=', 1)
            .orHaving('isActive', 0)
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(orHavingSql).toContain('having ("isActive" >= $1 or "isActive" = $2)')

        const havingRawSql = DbUser.query()
            .groupBy('isActive')
            .havingRaw('count(*) > ?', [5])
            .inspect()?.sql?.replace(/\s+/g, ' ')
        expect(havingRawSql).toContain('having count(*) > $1')
    })

    it('executes multi-statement raw SQL one statement at a time', async () => {
        const tableName = `raw_multi_${Date.now()}`

        await kyselyAdapter.rawQuery({
            sql: `
                create table if not exists "${tableName}" (id integer primary key, label text);
                do $$
                begin
                    insert into "${tableName}" (id, label) values (1, 'one; still one');
                end $$;
                insert into "${tableName}" (id, label) values (2, 'two');
            `,
        })

        const rows = await kyselyAdapter.rawQuery<{ id: number, label: string }>({
            sql: `select id, label from "${tableName}" order by id`,
        })

        expect(rows.map(row => row.id)).toEqual([1, 2])
        expect(rows[0]?.label).toBe('one; still one')

        await kyselyAdapter.rawQuery({ sql: `drop table if exists "${tableName}"` })
    })

    it('compiles advanced structured where helpers', () => {
        setPostgresModelAdapter(kyselyAdapter)

        const inspection = DbUser.query()
            .whereTime('createdAt', '>=', '09:30')
            .whereDay('createdAt', 9)
            .whereColumn('name', '!=', 'email')
            .whereFullText(['name', 'email'], 'Jane')
            .whereExists(DbPost.query().where({ title: 'A' }))
            .inspect()
        const normalizedSql = inspection?.sql?.replace(/\s+/g, ' ')

        expect(normalizedSql).toContain('"createdAt"::time >= $1::time')
        expect(normalizedSql).toContain('extract(day from "createdAt") = $2')
        expect(normalizedSql).toContain('"name" != "email"')
        expect(normalizedSql).toContain('to_tsvector')
        expect(normalizedSql).toContain('plainto_tsquery')
        expect(normalizedSql).toContain('exists ( select 1 from "posts"')
        expect(inspection?.parameters).toEqual(expect.arrayContaining(['09:30:00', 9, 'Jane', 'A']))

        const callbackInspection = DbUser.query()
            .whereExists(query => query.whereColumn('id', 'id'))
            .inspect()

        expect(callbackInspection?.sql?.replace(/\s+/g, ' ')).toContain(
            'exists ( select 1 from "users" where "id" = "id" )',
        )
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

    it('executes eager loading through the Kysely adapter relationLoads path', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const loadRelationsSpy = vi.spyOn(kyselyAdapter, 'loadRelations')

        const users = await DbUser.query()
            .with('posts.comments')
            .orderBy({ id: 'asc' })
            .get()

        expect(loadRelationsSpy).toHaveBeenCalledTimes(2)
        expect(loadRelationsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
            relations: [
                {
                    relation: 'posts',
                    relationLoads: [
                        { relation: 'comments', relationLoads: undefined },
                    ],
                },
            ],
        }))
        expect(loadRelationsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
            relations: [
                { relation: 'comments', relationLoads: undefined },
            ],
        }))

        const firstUserPosts = users.all()[0]?.getAttribute('posts') as ArkormCollection<DbPost>
        expect(firstUserPosts.all().map(post => post.getAttribute('title'))).toEqual(['A', 'B'])

        const firstPostComments = firstUserPosts.all()[0]?.getAttribute('comments') as ArkormCollection<unknown>
        expect(firstPostComments.all()).toHaveLength(1)

        const secondUserPosts = users.all()[1]?.getAttribute('posts') as ArkormCollection<DbPost>
        expect(secondUserPosts.all().map(post => post.getAttribute('title'))).toEqual(['C'])

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('select * from "users" order by "id" asc')
        expect(normalizedSql).toContain('select * from "posts" where "userId" in ($1, $2)')
        // morphMany is set-based: all posts' comments load in one batched query.
        expect(executedQueries.filter((query) => query.includes('from "comments"'))).toHaveLength(1)
    })

    it('supports constrained eager loading and model.load() through Arkorm relation load specs on the Kysely path', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const loadRelationsSpy = vi.spyOn(kyselyAdapter, 'loadRelations')
        loadRelationsSpy.mockClear()

        const relationPlanQuery = DbUser.query().with({
            posts: (query) => (query as QueryBuilder<DbPost>)
                .where({ title: 'A' })
                .orderBy({ id: 'desc' })
                .take(1)
                .with('comments'),
        }) as unknown as {
            tryBuildAdapterRelationLoadPlans: () => unknown
        }

        expect(relationPlanQuery.tryBuildAdapterRelationLoadPlans()).toEqual([
            {
                relation: 'posts',
                constraint: {
                    type: 'comparison',
                    column: 'title',
                    operator: '=',
                    value: 'A',
                },
                softDeleteMode: undefined,
                orderBy: [{ column: 'id', direction: 'desc' }],
                limit: 1,
                offset: undefined,
                columns: undefined,
                relationLoads: [
                    {
                        relation: 'comments',
                        constraint: undefined,
                        softDeleteMode: undefined,
                        orderBy: undefined,
                        limit: undefined,
                        offset: undefined,
                        columns: undefined,
                        relationLoads: undefined,
                    },
                ],
            },
        ])

        const user = await DbUser.query().with({
            posts: (query) => (query as QueryBuilder<DbPost>)
                .where({ title: 'A' })
                .orderBy({ id: 'desc' })
                .take(1)
                .with('comments'),
        }).find(1)

        expect(user).not.toBeNull()
        if (!user)
            throw new Error('Expected user to exist.')

        const posts = user.getAttribute('posts') as ArkormCollection<DbPost>
        expect(posts.all().map(post => post.getAttribute('title'))).toEqual(['A'])
        expect(((posts.all()[0]?.getAttribute('comments')) as ArkormCollection<unknown>).all()).toHaveLength(1)

        executedQueries.length = 0

        const reloaded = await DbUser.query().find(1)
        expect(reloaded).not.toBeNull()
        if (!reloaded)
            throw new Error('Expected reloaded user to exist.')

        await reloaded.load({
            posts: (query) => (query as QueryBuilder<DbPost>)
                .where({ title: 'A' })
                .orderBy({ id: 'desc' })
                .take(1)
                .with('comments'),
        })

        const reloadedPosts = reloaded.getAttribute('posts') as ArkormCollection<DbPost>
        expect(reloadedPosts.all().map(post => post.getAttribute('title'))).toEqual(['A'])
        expect(((reloadedPosts.all()[0]?.getAttribute('comments')) as ArkormCollection<unknown>).all()).toHaveLength(1)

        expect(loadRelationsSpy).toHaveBeenCalled()

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('select * from "posts" where ("userId" in ($1) and "title" = $2) order by "id" desc limit $3')
        expect(normalizedSql).toContain('select * from "comments" where ("commentableId" in ($1) and "commentableType" = $2)')
    })

    it('matches Prisma compatibility and Kysely adapter behavior for adapter-first relation filters and eager loading without delegate warnings', async () => {
        const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)

        const runScenario = async (adapter: DatabaseAdapter) => {
            setPostgresModelAdapter(adapter)

            const users = await DbUser.query()
                .has('comments', '>=', 1)
                .with({
                    posts: (query) => (query as QueryBuilder<DbPost>)
                        .where({ title: 'A' })
                        .orderBy({ id: 'desc' })
                        .take(1)
                        .with('comments'),
                })
                .orderBy({ id: 'asc' })
                .get()

            const user = users.all()[0]
            if (!user)
                throw new Error('Expected user to exist.')

            await user.load('roles')

            const posts = user.getAttribute('posts') as ArkormCollection<DbPost>
            const roles = user.getAttribute('roles') as ArkormCollection<DbRole>
            const firstPost = posts.all()[0]
            const firstPostComments = firstPost?.getAttribute('comments') as ArkormCollection<unknown>

            return {
                userIds: users.all().map(loadedUser => loadedUser.getAttribute('id')),
                postTitles: posts.all().map(post => post.getAttribute('title')),
                firstPostCommentCount: firstPostComments.all().length,
                roleNames: roles.all().map(role => role.getAttribute('name')).sort(),
            }
        }

        const prismaGraph = await runScenario(prismaAdapter)
        const kyselyGraph = await runScenario(kyselyAdapter)

        expect(prismaGraph).toEqual({
            userIds: [1],
            postTitles: ['A'],
            firstPostCommentCount: 1,
            roleNames: ['admin', 'editor'],
        })
        expect(kyselyGraph).toEqual(prismaGraph)
        expect(warningSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Model.getDelegate() is deprecated'),
            expect.anything(),
        )

        warningSpy.mockRestore()
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

    it('supports belongsToMany write helpers through the Kysely adapter', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const user = await DbUser.query().find(1)
        expect(user).not.toBeNull()
        if (!user)
            throw new Error('Expected user to exist.')

        const draft = user.roles().make({ name: 'draft-role' })
        expect(draft).toBeInstanceOf(DbRole)
        expect(draft.getAttribute('name')).toBe('draft-role')

        const created = await user.roles().create({ name: 'reviewer' })
        const saved = await user.roles().save(new DbRole({ name: 'auditor' }))
        const observer = await DbRole.query().create({ name: 'observer' })
        const attached = await user.roles().attach(observer.getAttribute('id'))

        expect(created.getAttribute('name')).toBe('reviewer')
        expect(saved.getAttribute('name')).toBe('auditor')
        expect(attached).toBe(1)

        const reviewerId = created.getAttribute('id')
        const observerId = observer.getAttribute('id')

        const detached = await user.roles().detach(reviewerId)
        expect(detached).toBe(1)

        const syncChanges = await user.roles().sync([1, reviewerId, observerId])
        expect(syncChanges).toEqual({ attached: 1, detached: 2, updated: 0 })

        const finalRoles = await user.roles().orderBy({ id: 'asc' }).getResults()
        expect(finalRoles.all().map(role => role.getAttribute('name'))).toEqual(['admin', 'reviewer', 'observer'])

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('insert into "roles"')
        expect(normalizedSql).toContain('insert into "role_users"')
        expect(normalizedSql).toContain('delete from "role_users"')
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

    it('supports SQL-backed OR and negative relation helper variants through QueryBuilder', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const withoutAvatar = await DbUser.query().doesntHave('avatar').orderBy({ id: 'asc' }).get()
        expect(withoutAvatar.all().map(user => user.getAttribute('id'))).toEqual([2])

        const orHasPosts = await DbUser.query().whereKey('id', 2).orHas('posts', '>=', 2).orderBy({ id: 'asc' }).get()
        expect(orHasPosts.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const orWhereHasPosts = await DbUser.query().whereKey('id', 2).orWhereHas('posts', query => query.where({ title: 'A' })).orderBy({ id: 'asc' }).get()
        expect(orWhereHasPosts.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const orDoesntHaveAvatar = await DbUser.query().whereKey('id', 1).orDoesntHave('avatar').orderBy({ id: 'asc' }).get()
        expect(orDoesntHaveAvatar.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const orWhereDoesntHaveAvatar = await DbUser.query().whereKey('id', 1).orWhereDoesntHave('avatar', query => query.where({ url: 'a.png' })).orderBy({ id: 'asc' }).get()
        expect(orWhereDoesntHaveAvatar.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain(' or ')
        expect(normalizedSql).toContain(') < $')
    })

    it('falls back for unsupported relation helpers while preserving correctness, aggregates, and pagination semantics', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const filtered = await DbUser.query().has('comments', '>=', 1).orderBy({ id: 'asc' }).get()
        expect(filtered.all().map(user => user.getAttribute('id'))).toEqual([1])

        const noComments = await DbUser.query().doesntHave('comments').orderBy({ id: 'asc' }).get()
        expect(noComments.all().map(user => user.getAttribute('id'))).toEqual([2])

        const total = await DbUser.query().has('comments', '>=', 1).count()
        expect(total).toBe(1)

        const page = await DbUser.query().has('comments', '>=', 1).orderBy({ id: 'asc' }).paginate(1, 1)
        expect(page.meta.total).toBe(1)
        expect(page.data.all().map(user => user.getAttribute('id'))).toEqual([1])

        const orHasComments = await DbUser.query().whereKey('id', 2).orHas('comments').orderBy({ id: 'asc' }).get()
        expect(orHasComments.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const orWhereHasComments = await DbUser.query().whereKey('id', 2).orWhereHas('comments', query => query.where({ body: 'Hi user' })).orderBy({ id: 'asc' }).get()
        expect(orWhereHasComments.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const orDoesntHaveComments = await DbUser.query().whereKey('id', 1).orDoesntHave('comments').orderBy({ id: 'asc' }).get()
        expect(orDoesntHaveComments.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const orWhereDoesntHaveComments = await DbUser.query().whereKey('id', 1).orWhereDoesntHave('comments', query => query.where({ body: 'Hi user' })).orderBy({ id: 'asc' }).get()
        expect(orWhereDoesntHaveComments.all().map(user => user.getAttribute('id'))).toEqual([1, 2])

        const withAggregates = await DbUser.query()
            .withCount('comments')
            .withExists('comments')
            .withSum('comments', 'id')
            .withAvg('comments', 'id')
            .withMin('comments', 'id')
            .withMax('comments', 'id')
            .whereKey('id', 1)
            .firstOrFail()

        expect(withAggregates.getAttribute('commentsCount')).toBe(1)
        expect(withAggregates.getAttribute('commentsExists')).toBe(true)
        expect(withAggregates.getAttribute('commentsSumId')).toBe(1)
        expect(Number(withAggregates.getAttribute('commentsAvgId'))).toBe(1)
        expect(withAggregates.getAttribute('commentsMinId')).toBe(1)
        expect(withAggregates.getAttribute('commentsMaxId')).toBe(1)

        const missingAggregates = await DbUser.query()
            .withExists('comments')
            .withCount('comments')
            .whereKey('id', 2)
            .firstOrFail()

        expect(missingAggregates.getAttribute('commentsExists')).toBe(false)
        expect(missingAggregates.getAttribute('commentsCount')).toBe(0)
    })

    it('supports SQL-backed conflict-handling write helpers through QueryBuilder', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        const ignored = await DbUser.query().insertOrIgnore([
            {
                name: 'Ignored Jane',
                email: 'jane@example.com',
                isActive: 1,
            },
            {
                name: 'Lia',
                email: 'lia@example.com',
                isActive: 1,
            },
        ])
        expect(ignored).toBe(1)

        await expect(DbUser.query().updateOrInsert(
            { email: 'john@example.com' },
            { name: 'John Conflict Updated', isActive: 1 }
        )).resolves.toBe(true)

        await expect(DbUser.query().upsert(
            [
                {
                    name: 'Jane Conflict Updated',
                    email: 'jane@example.com',
                    isActive: 0,
                },
                {
                    name: 'Mira',
                    email: 'mira@example.com',
                    isActive: 1,
                },
            ],
            'email',
            ['name', 'isActive']
        )).resolves.toBe(2)

        await expect(DbUser.query().where({ email: 'john@example.com' }).value('name')).resolves.toBe('John Conflict Updated')
        await expect(DbUser.query().where({ email: 'jane@example.com' }).value('name')).resolves.toBe('Jane Conflict Updated')
        await expect(DbUser.query().where({ email: 'mira@example.com' }).exists()).resolves.toBe(true)
        await expect(DbUser.query().where({ email: 'lia@example.com' }).exists()).resolves.toBe(true)

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('on conflict do nothing')
        expect(normalizedSql).toContain('on conflict ("email") do update set')
        expect(normalizedSql).toContain('excluded."name"')
        expect(normalizedSql).toContain('excluded."isActive"')
    })

    it('falls back for updateOrInsert when conflict keys are not backed by a unique constraint', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        await expect(DbUser.query().updateOrInsert(
            { name: 'Casey Fallback' },
            { email: 'casey@example.com', isActive: 1 }
        )).resolves.toBe(true)

        await expect(DbUser.query().updateOrInsert(
            { name: 'Casey Fallback' },
            { email: 'casey.updated@example.com', isActive: 0 }
        )).resolves.toBe(true)

        await expect(DbUser.query().where({ name: 'Casey Fallback' }).value('email')).resolves.toBe('casey.updated@example.com')

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('select * from "users" where "name" = $1 limit $2')
        expect(normalizedSql).toContain('insert into "users" ("name", "email", "isActive") values')
        expect(normalizedSql).toContain('update "users"')
    })

    it('uses RETURNING-aware single-row update and delete for non-unique QueryBuilder writes', async () => {
        setPostgresModelAdapter(kyselyAdapter)

        await DbUser.query().create({
            name: 'Ava',
            email: 'ava@example.com',
            isActive: 1,
        })

        const updated = await DbUser.query().where({ isActive: 1 }).update({ name: 'First Active Updated' })
        expect(updated.getAttribute('name')).toBe('First Active Updated')

        const activeUsers = await DbUser.query().where({ isActive: 1 }).orderBy({ id: 'asc' }).get()
        expect(activeUsers.all().map(user => user.getAttribute('name'))).toContain('First Active Updated')

        const deleted = await DbUser.query().where({ isActive: 1 }).delete()
        if (!deleted)
            throw new Error('Expected deleted user to exist.')
        expect(deleted.getAttribute('name')).toBeDefined()

        const remaining = await DbUser.query().where({ isActive: 1 }).get()
        expect(remaining.all()).toHaveLength(1)

        const normalizedSql = executedQueries.join('\n').replace(/\s+/g, ' ')
        expect(normalizedSql).toContain('with target_row as ( select "id" from "users" where "isActive" = $1 limit 1 ) update "users"')
        expect(normalizedSql).toContain('returning "users".*')
        expect(normalizedSql).toContain('with target_row as ( select "id" from "users" where "isActive" = $1 limit 1 ) delete from "users"')
    })

    it('inspects compiled SQL for supported Kysely queries', () => {
        const inspection = kyselyAdapter.inspectQuery?.({
            operation: 'select',
            spec: {
                target: { table: 'users' },
                where: {
                    type: 'comparison',
                    column: 'id',
                    operator: '=',
                    value: 1,
                },
                limit: 1,
            },
        })

        expect(inspection).toMatchObject({
            adapter: 'kysely',
            operation: 'select',
            target: 'users',
        })
        expect(inspection?.sql).toContain('select')
        expect(inspection?.sql).toContain('from "users"')
        expect(inspection?.parameters).toContain(1)
    })

    it('compiles distinct and group-by select clauses', () => {
        const inspection = kyselyAdapter.inspectQuery?.({
            operation: 'select',
            spec: {
                target: { table: 'users' },
                columns: [{ column: 'isActive' }],
                distinct: true,
                groupBy: ['isActive'],
                orderBy: [{ column: 'isActive', direction: 'asc' }],
            },
        })
        const normalizedSql = inspection?.sql?.replace(/\s+/g, ' ')

        expect(normalizedSql).toContain('select distinct "isActive"')
        expect(normalizedSql).toContain('group by "isActive"')
        expect(normalizedSql).toContain('order by "isActive" asc')
    })

    it('wraps invalid column errors with compiled SQL context', async () => {
        const error = await kyselyAdapter.select({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'ids',
                operator: '=',
                value: 1,
            },
        }).catch(caught => caught as QueryExecutionException)

        expect(error).toBeInstanceOf(QueryExecutionException)
        expect((error as any).getContext()).toMatchObject({
            code: 'QUERY_EXECUTION_FAILED',
            operation: 'adapter.select',
            delegate: 'users',
        })
        expect((error as any).getInspection()).toMatchObject({
            adapter: 'kysely',
            operation: 'select',
            target: 'users',
        })
        expect((error as any).getInspection()?.sql).toContain('"ids"')
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
