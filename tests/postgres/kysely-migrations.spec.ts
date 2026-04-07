import { Kysely, PostgresDialect } from 'kysely'
import { acquirePostgresTestLock, prisma, releasePostgresTestLock } from './helpers/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Pool } from 'pg'
import { createKyselyAdapter } from '../../src'

describe('PostgreSQL Kysely migration backend', () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    })
    const db = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({ pool }),
    })
    const adapter = createKyselyAdapter(db)

    beforeAll(async () => {
        await acquirePostgresTestLock()
    })

    afterAll(async () => {
        await releasePostgresTestLock()
        await db.destroy()
    })

    it('executes schema operations and persists migration state in the database', async () => {
        const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const tableName = `arkorm_migration_test_${suffix}`
        const stateBefore = await adapter.readAppliedMigrationsState?.()

        try {
            await adapter.executeSchemaOperations?.([
                {
                    type: 'createTable',
                    table: tableName,
                    columns: [
                        { name: 'id', type: 'id', primary: true },
                        { name: 'email', type: 'string' },
                    ],
                    indexes: [],
                    foreignKeys: [],
                },
                {
                    type: 'alterTable',
                    table: tableName,
                    addColumns: [
                        { name: 'nickname', type: 'string', nullable: true },
                    ],
                    dropColumns: [],
                    addIndexes: [
                        { columns: ['nickname'], name: `${tableName}_nickname_idx` },
                    ],
                    addForeignKeys: [],
                },
            ])

            const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
                select column_name
                from information_schema.columns
                where table_name = '${tableName}'
                order by ordinal_position asc
            `)

            expect(columns.map(column => column.column_name)).toEqual(['id', 'email', 'nickname'])

            await adapter.writeAppliedMigrationsState?.({
                version: 1,
                migrations: [{
                    id: `${tableName}:Create${tableName}Migration`,
                    file: `/tmp/${tableName}.ts`,
                    className: `Create${tableName}Migration`,
                    appliedAt: '2026-04-07T00:00:00.000Z',
                    checksum: 'checksum',
                }],
                runs: [{
                    id: `run_${tableName}`,
                    appliedAt: '2026-04-07T00:00:00.000Z',
                    migrationIds: [`${tableName}:Create${tableName}Migration`],
                }],
            })

            const stateAfter = await adapter.readAppliedMigrationsState?.()
            expect(stateAfter?.migrations).toHaveLength(1)
            expect(stateAfter?.runs).toHaveLength(1)
            expect(stateAfter?.migrations[0]?.id).toContain(tableName)
        } finally {
            await adapter.executeSchemaOperations?.([
                {
                    type: 'dropTable',
                    table: tableName,
                },
            ])

            if (stateBefore)
                await adapter.writeAppliedMigrationsState?.(stateBefore)
        }
    })
})