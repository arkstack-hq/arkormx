import { Kysely, PostgresDialect, sql } from 'kysely'
import { acquirePostgresTestLock, releasePostgresTestLock } from './helpers/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { SchemaBuilder, createKyselyAdapter } from '../../src'

describe('Generated columns DDL (#16)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) })
  const adapter = createKyselyAdapter(db)

  beforeAll(async () => {
    await acquirePostgresTestLock()
  })

  afterAll(async () => {
    await releasePostgresTestLock()
    await db.destroy()
  })

  it('creates a STORED generated column that the database computes', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const table = `arkorm_generated_test_${suffix}`

    const schema = new SchemaBuilder()
    schema.createTable(table, (builder) => {
      builder.id('id')
      builder.integer('price')
      builder.integer('quantity')
      builder.generated('total', (e) => e.col('price').times(e.col('quantity')), {
        type: 'integer',
      })
      builder.generated(
        'tier',
        (e) => e.caseWhen(e.col('price').gte(100), 'premium').else('standard'),
        { type: 'text' },
      )
      builder.index('total')
    })

    try {
      await adapter.executeSchemaOperations?.(schema.getOperations())

      await sql`insert into ${sql.table(table)} ("price", "quantity") values (30, 4), (150, 1)`.execute(
        db,
      )

      const rows = await sql<{
        total: number
        tier: string
      }>`select "total", "tier" from ${sql.table(table)} order by "id"`.execute(db)

      expect(rows.rows).toEqual([
        { total: 120, tier: 'standard' },
        { total: 150, tier: 'premium' },
      ])
    } finally {
      await sql`drop table if exists ${sql.table(table)}`.execute(db)
    }
  })

  it('rejects writes to a generated column at the database level', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const table = `arkorm_generated_ro_${suffix}`

    const schema = new SchemaBuilder()
    schema.createTable(table, (builder) => {
      builder.id('id')
      builder.integer('price')
      builder.generated('doubled', '"price" * 2', { type: 'integer' })
    })

    try {
      await adapter.executeSchemaOperations?.(schema.getOperations())

      await expect(
        sql`insert into ${sql.table(table)} ("price", "doubled") values (5, 999)`.execute(db),
      ).rejects.toThrow()
    } finally {
      await sql`drop table if exists ${sql.table(table)}`.execute(db)
    }
  })
})
