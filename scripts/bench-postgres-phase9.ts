import { createKyselyAdapter } from '../src'
import dotenv from 'dotenv'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

type BenchmarkResult = {
    name: string
    elapsedMs: number
    queryCount: number
}

type FixturesModule = typeof import('../tests/postgres/helpers/fixtures')

dotenv.config({ path: '.env.test', quiet: true })

if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required to run pnpm bench:postgres')

function createTrackedAdapter () {
    let queryCount = 0
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    })
    const db = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({ pool }),
        log (event) {
            if (event.level === 'query')
                queryCount += 1
        },
    })

    return {
        db,
        adapter: createKyselyAdapter(db, {
            userProfile: 'profiles',
            roleUsers: 'role_users',
        }),
        reset () {
            queryCount = 0
        },
        getQueryCount () {
            return queryCount
        },
    }
}

function elapsedMs (start: bigint): number {
    return Number(process.hrtime.bigint() - start) / 1_000_000
}

async function seedExistingUsers (count: number) {
    const { prisma } = await loadFixtures()

    await prisma.user.createMany({
        data: Array.from({ length: count }, (_, index) => ({
            name: `Existing ${index}`,
            email: `existing-${index}@example.com`,
            isActive: index % 2,
        })),
    })
}

let fixturesPromise: Promise<FixturesModule> | undefined

function loadFixtures () {
    fixturesPromise ??= import('../tests/postgres/helpers/fixtures')

    return fixturesPromise
}

async function benchmarkLegacyUpsert (): Promise<BenchmarkResult> {
    const { seedPostgresFixtures } = await loadFixtures()

    await seedPostgresFixtures()
    await seedExistingUsers(100)

    const tracked = createTrackedAdapter()
    const rows = Array.from({ length: 200 }, (_, index) => ({
        name: `Bench ${index}`,
        email: index < 100 ? `existing-${index}@example.com` : `new-${index}@example.com`,
        isActive: index % 2,
    }))

    tracked.reset()
    const start = process.hrtime.bigint()
    for (const row of rows) {
        const existing = await tracked.adapter.selectOne({
            target: { table: 'users', primaryKey: 'id' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: '=',
                value: row.email,
            },
            limit: 1,
        })

        if (existing) {
            await tracked.adapter.update({
                target: { table: 'users', primaryKey: 'id' },
                where: {
                    type: 'comparison',
                    column: 'email',
                    operator: '=',
                    value: row.email,
                },
                values: {
                    name: row.name,
                    isActive: row.isActive,
                },
            })
            continue
        }

        await tracked.adapter.insert({
            target: { table: 'users', primaryKey: 'id' },
            values: row,
        })
    }

    const result = {
        name: 'Legacy upsert emulation (200 rows)',
        elapsedMs: elapsedMs(start),
        queryCount: tracked.getQueryCount(),
    }
    await tracked.db.destroy()

    return result
}

async function benchmarkNativeUpsert (): Promise<BenchmarkResult> {
    const { seedPostgresFixtures } = await loadFixtures()

    await seedPostgresFixtures()
    await seedExistingUsers(100)

    const tracked = createTrackedAdapter()
    const rows = Array.from({ length: 200 }, (_, index) => ({
        name: `Bench ${index}`,
        email: index < 100 ? `existing-${index}@example.com` : `new-${index}@example.com`,
        isActive: index % 2,
    }))

    tracked.reset()
    const start = process.hrtime.bigint()
    await tracked.adapter.upsert?.({
        target: { table: 'users', primaryKey: 'id' },
        values: rows,
        uniqueBy: ['email'],
        updateColumns: ['name', 'isActive'],
    })

    const result = {
        name: 'Native ON CONFLICT upsert (200 rows)',
        elapsedMs: elapsedMs(start),
        queryCount: tracked.getQueryCount(),
    }
    await tracked.db.destroy()

    return result
}

async function benchmarkLegacySingleRowMutations (): Promise<BenchmarkResult> {
    const { prisma, seedPostgresFixtures } = await loadFixtures()

    await seedPostgresFixtures()
    await prisma.user.createMany({
        data: Array.from({ length: 100 }, (_, index) => ({
            name: `Active ${index}`,
            email: `active-${index}@example.com`,
            isActive: 1,
        })),
    })

    const tracked = createTrackedAdapter()
    tracked.reset()
    const start = process.hrtime.bigint()

    const existing = await tracked.adapter.selectOne({
        target: { table: 'users', primaryKey: 'id' },
        columns: [{ column: 'id' }],
        where: {
            type: 'comparison',
            column: 'isActive',
            operator: '=',
            value: 1,
        },
        limit: 1,
    }) as Record<string, unknown> | null

    if (existing?.id != null) {
        const existingId = Number(existing.id)

        await tracked.adapter.update({
            target: { table: 'users', primaryKey: 'id' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: existingId,
            },
            values: {
                name: 'Legacy Updated',
            },
        })
    }

    const deleteTarget = await tracked.adapter.selectOne({
        target: { table: 'users', primaryKey: 'id' },
        columns: [{ column: 'id' }],
        where: {
            type: 'comparison',
            column: 'isActive',
            operator: '=',
            value: 1,
        },
        limit: 1,
    }) as Record<string, unknown> | null

    if (deleteTarget?.id != null) {
        const deleteTargetId = Number(deleteTarget.id)

        await tracked.adapter.delete({
            target: { table: 'users', primaryKey: 'id' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: deleteTargetId,
            },
        })
    }

    const result = {
        name: 'Legacy single-row update/delete',
        elapsedMs: elapsedMs(start),
        queryCount: tracked.getQueryCount(),
    }
    await tracked.db.destroy()

    return result
}

async function benchmarkNativeSingleRowMutations (): Promise<BenchmarkResult> {
    const { prisma, seedPostgresFixtures } = await loadFixtures()

    await seedPostgresFixtures()
    await prisma.user.createMany({
        data: Array.from({ length: 100 }, (_, index) => ({
            name: `Active ${index}`,
            email: `active-${index}@example.com`,
            isActive: 1,
        })),
    })

    const tracked = createTrackedAdapter()
    tracked.reset()
    const start = process.hrtime.bigint()

    await tracked.adapter.updateFirst?.({
        target: { table: 'users', primaryKey: 'id' },
        where: {
            type: 'comparison',
            column: 'isActive',
            operator: '=',
            value: 1,
        },
        values: {
            name: 'Native Updated',
        },
    })

    await tracked.adapter.deleteFirst?.({
        target: { table: 'users', primaryKey: 'id' },
        where: {
            type: 'comparison',
            column: 'isActive',
            operator: '=',
            value: 1,
        },
    })

    const result = {
        name: 'Native RETURNING update/delete',
        elapsedMs: elapsedMs(start),
        queryCount: tracked.getQueryCount(),
    }
    await tracked.db.destroy()

    return result
}

function printResults (results: BenchmarkResult[]) {
    console.log('Phase 9 Postgres benchmark results')
    console.log('')
    console.log('| Scenario | Time (ms) | SQL statements |')
    console.log('| --- | ---: | ---: |')
    results.forEach((result) => {
        console.log(`| ${result.name} | ${result.elapsedMs.toFixed(2)} | ${result.queryCount} |`)
    })
}

async function main () {
    const {
        acquirePostgresTestLock,
        connectPostgresRuntime,
        disconnectPostgresRuntime,
        releasePostgresTestLock,
    } = await loadFixtures()

    await connectPostgresRuntime()
    await acquirePostgresTestLock()

    try {
        const results = [
            await benchmarkLegacyUpsert(),
            await benchmarkNativeUpsert(),
            await benchmarkLegacySingleRowMutations(),
            await benchmarkNativeSingleRowMutations(),
        ]

        printResults(results)
    } finally {
        await releasePostgresTestLock()
        await disconnectPostgresRuntime()
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})