import { Kysely, PostgresDialect, sql } from 'kysely'
import { acquirePostgresTestLock, releasePostgresTestLock } from './helpers/fixtures'
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
          addColumns: [{ name: 'nickname', type: 'string', nullable: true }],
          dropColumns: [],
          addIndexes: [{ columns: ['nickname'], name: `${tableName}_nickname_idx` }],
          addForeignKeys: [],
        },
      ])

      const columnsResult = await sql<{ column_name: string }>`
                select column_name
                from information_schema.columns
                where table_name = ${tableName}
                order by ordinal_position asc
            `.execute(db)

      expect(columnsResult.rows.map((column) => column.column_name)).toEqual([
        'id',
        'email',
        'nickname',
      ])

      await adapter.writeAppliedMigrationsState?.({
        version: 1,
        migrations: [
          {
            id: `${tableName}:Create${tableName}Migration`,
            file: `/tmp/${tableName}.ts`,
            className: `Create${tableName}Migration`,
            appliedAt: '2026-04-07T00:00:00.000Z',
            checksum: 'checksum',
          },
        ],
        runs: [
          {
            id: `run_${tableName}`,
            appliedAt: '2026-04-07T00:00:00.000Z',
            migrationIds: [`${tableName}:Create${tableName}Migration`],
          },
        ],
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

      if (stateBefore) await adapter.writeAppliedMigrationsState?.(stateBefore)
    }
  })

  it('maps decimal and dateTime columns to numeric and timestamp types', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tableName = `arkorm_types_test_${suffix}`

    try {
      await adapter.executeSchemaOperations?.([
        {
          type: 'createTable',
          table: tableName,
          columns: [
            { name: 'id', type: 'id', primary: true },
            { name: 'price', type: 'decimal', precision: 10, scale: 4 },
            { name: 'publishedAt', type: 'dateTime', nullable: true },
          ],
          indexes: [],
          foreignKeys: [],
        },
      ])

      const columnsResult = await sql<{
        column_name: string
        data_type: string
        numeric_precision: number | null
        numeric_scale: number | null
      }>`
                select column_name, data_type, numeric_precision, numeric_scale
                from information_schema.columns
                where table_name = ${tableName}
                  and column_name in ('price', 'publishedAt')
                order by column_name asc
            `.execute(db)

      const byName = Object.fromEntries(columnsResult.rows.map((row) => [row.column_name, row]))

      expect(byName.price).toMatchObject({
        data_type: 'numeric',
        numeric_precision: 10,
        numeric_scale: 4,
      })
      expect(byName.publishedAt?.data_type).toBe('timestamp without time zone')
    } finally {
      await adapter.executeSchemaOperations?.([
        {
          type: 'dropTable',
          table: tableName,
        },
      ])
    }
  })

  it('applies generated defaults for uuid-backed primary keys', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tableName = `arkorm_uuid_default_${suffix}`

    try {
      await adapter.executeSchemaOperations?.([
        {
          type: 'createTable',
          table: tableName,
          columns: [
            {
              name: 'id',
              type: 'string',
              primary: true,
              primaryKeyGeneration: {
                strategy: 'uuid',
                prismaDefault: '@default(uuid())',
                databaseDefault: 'gen_random_uuid()::text',
                runtimeFactory: 'uuid',
              },
            },
          ],
          indexes: [],
          foreignKeys: [],
        },
      ])

      const defaultResult = await sql<{ column_default: string | null }>`
                select column_default
                from information_schema.columns
                where table_name = ${tableName}
                  and column_name = 'id'
            `.execute(db)

      expect(defaultResult.rows[0]?.column_default).toContain('gen_random_uuid')
    } finally {
      await adapter.executeSchemaOperations?.([
        {
          type: 'dropTable',
          table: tableName,
        },
      ])
    }
  })

  it('creates composite primary key constraints with mapped columns', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tableName = `arkorm_composite_key_${suffix}`
    const constraintName = `${tableName}_identity`
    const uniqueConstraintName = `${tableName}_tenant_value_unique`

    try {
      await adapter.executeSchemaOperations?.([
        {
          type: 'createTable',
          table: tableName,
          columns: [
            { name: 'tenantId', map: 'tenant_id', type: 'integer' },
            { name: 'slug', type: 'string' },
            { name: 'value', type: 'string' },
          ],
          indexes: [],
          foreignKeys: [],
          primaryKey: {
            columns: ['tenantId', 'slug'],
            name: constraintName,
          },
          uniqueConstraints: [
            {
              columns: ['tenantId', 'value'],
              name: uniqueConstraintName,
            },
          ],
        },
      ])

      const constraintResult = await sql<{ constraint_name: string; columns: string }>`
                select
                    constraint_name,
                    array_to_string(array_agg(column_name order by ordinal_position), ',') as columns
                from information_schema.key_column_usage
                where table_name = ${tableName}
                  and constraint_name = ${constraintName}
                group by constraint_name
            `.execute(db)

      expect(constraintResult.rows).toEqual([
        {
          constraint_name: constraintName,
          columns: 'tenant_id,slug',
        },
      ])

      const uniqueConstraintResult = await sql<{ constraint_name: string; columns: string }>`
                select
                    constraint_name,
                    array_to_string(array_agg(column_name order by ordinal_position), ',') as columns
                from information_schema.key_column_usage
                where table_name = ${tableName}
                  and constraint_name = ${uniqueConstraintName}
                group by constraint_name
            `.execute(db)

      expect(uniqueConstraintResult.rows).toEqual([
        {
          constraint_name: uniqueConstraintName,
          columns: 'tenant_id,value',
        },
      ])
    } finally {
      await adapter.executeSchemaOperations?.([
        {
          type: 'dropTable',
          table: tableName,
        },
      ])
    }
  })

  it('prefixes implicit enum type names with the table name to avoid collisions across tables', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const usersTable = `arkorm_users_${suffix}`
    const ordersTable = `arkorm_orders_${suffix}`
    const usersEnum = `${usersTable}_status_enum`
    const ordersEnum = `${ordersTable}_status_enum`

    try {
      await adapter.executeSchemaOperations?.([
        {
          type: 'createTable',
          table: usersTable,
          columns: [
            { name: 'id', type: 'id', primary: true },
            { name: 'status', type: 'enum', enumValues: ['draft', 'published'] },
          ],
          indexes: [],
          foreignKeys: [],
        },
        {
          type: 'createTable',
          table: ordersTable,
          columns: [
            { name: 'id', type: 'id', primary: true },
            { name: 'status', type: 'enum', enumValues: ['pending', 'paid'] },
          ],
          indexes: [],
          foreignKeys: [],
        },
      ])

      const enumTypes = await sql<{ enum_name: string }>`
                select typname as enum_name
                from pg_type
                where typname in (${sql.join([usersEnum, ordersEnum, 'status_enum'])})
                order by typname asc
            `.execute(db)

      expect(enumTypes.rows.map((row) => row.enum_name)).toEqual([ordersEnum, usersEnum])
    } finally {
      await adapter.executeSchemaOperations?.([
        {
          type: 'dropTable',
          table: usersTable,
        },
        {
          type: 'dropTable',
          table: ordersTable,
        },
      ])

      await sql.raw(`drop type if exists "${usersEnum}" cascade`).execute(db)
      await sql.raw(`drop type if exists "${ordersEnum}" cascade`).execute(db)
      await sql.raw('drop type if exists "status_enum" cascade').execute(db)
    }
  })

  it('resets database-backed schema objects and migration state', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const schemaName = `arkorm_reset_${suffix}`
    const tableName = `arkorm_migration_reset_${suffix}`
    const connectionString = new URL(process.env.DATABASE_URL as string)
    connectionString.searchParams.set('options', `-c search_path=${schemaName}`)

    await sql.raw(`create schema if not exists "${schemaName}"`).execute(db)

    const isolatedPool = new Pool({
      connectionString: connectionString.toString(),
    })
    const isolatedDb = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({ pool: isolatedPool }),
    })
    const isolatedAdapter = createKyselyAdapter(isolatedDb)
    const stateBefore = await isolatedAdapter.readAppliedMigrationsState?.()

    try {
      await isolatedAdapter.executeSchemaOperations?.([
        {
          type: 'createTable',
          table: tableName,
          columns: [{ name: 'id', type: 'id', primary: true }],
          indexes: [],
          foreignKeys: [],
        },
      ])

      await isolatedAdapter.writeAppliedMigrationsState?.({
        version: 1,
        migrations: [
          {
            id: `${tableName}:Create${tableName}Migration`,
            file: `/tmp/${tableName}.ts`,
            className: `Create${tableName}Migration`,
            appliedAt: '2026-04-07T00:00:00.000Z',
            checksum: 'checksum',
          },
        ],
        runs: [
          {
            id: `run_${tableName}`,
            appliedAt: '2026-04-07T00:00:00.000Z',
            migrationIds: [`${tableName}:Create${tableName}Migration`],
          },
        ],
      })

      await isolatedAdapter.resetDatabase?.()

      const tableResult = await sql<{ table_name: string }>`
                select table_name
                from information_schema.tables
                where table_schema = ${schemaName}
                  and table_name = ${tableName}
            `.execute(isolatedDb)
      const stateAfter = await isolatedAdapter.readAppliedMigrationsState?.()

      expect(tableResult.rows).toHaveLength(0)
      expect(stateAfter?.migrations).toEqual([])
      expect(stateAfter?.runs).toEqual([])
    } finally {
      if (stateBefore) await isolatedAdapter.writeAppliedMigrationsState?.(stateBefore)

      await isolatedDb.destroy()
      await sql.raw(`drop schema if exists "${schemaName}" cascade`).execute(db)
    }
  })
})
