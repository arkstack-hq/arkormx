import { seedPostgresFixtures, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { type ExpressionBuilder, Model, count, createKyselyAdapter } from '../../src'

class ComputedUser extends Model {
  protected static override table = 'users'

  protected static override computed = {
    tier: (e: ExpressionBuilder) => e.caseWhen(e.col('isActive').eq(1), 'active').else('inactive'),
  }
}

describe('Computed / virtual model attributes (#15)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) })
  const adapter = createKyselyAdapter(db)

  beforeEach(async () => {
    await seedPostgresFixtures()
    ComputedUser.setAdapter(adapter)
    setPostgresModelAdapter(adapter)
  })

  afterAll(async () => {
    ComputedUser.setAdapter(undefined)
    setPostgresModelAdapter(undefined)
    await db.destroy()
  })

  const compile = (build: () => { inspect(): { sql?: string } | null }) =>
    build().inspect()?.sql?.replace(/\s+/g, ' ').trim()

  it('resolves the computed expression map once', () => {
    expect(ComputedUser.getComputed().tier).toMatchObject({ kind: 'case' })
  })

  it('expands a computed name in select', () => {
    const sql = compile(() => ComputedUser.query().select({ tier: true }))

    expect(sql).toContain('case when ("isActive" = $1) then $2 else $3 end as "tier"')
  })

  it('expands a computed name in groupBy', () => {
    const sql = compile(() => ComputedUser.query().select({ tier: true, n: count() }).groupBy('tier'))

    // The selected computed alias is referenced (avoids re-binding params).
    expect(sql).toContain('as "tier"')
    expect(sql).toContain('group by "tier"')
  })

  it('expands a computed name in where', () => {
    const sql = compile(() => ComputedUser.query().where({ tier: 'active' }))

    expect(sql).toContain('case when ("isActive" = $1) then $2 else $3 end = $4')
  })

  it('expands a computed name in orderBy', () => {
    const sql = compile(() => ComputedUser.query().orderBy({ tier: 'desc' }))

    expect(sql).toContain('order by case when ("isActive" = $1) then $2 else $3 end desc')
  })

  it('runs a computed-grouped report end to end', async () => {
    const rows = await ComputedUser.query()
      .select({ tier: true, total: count() })
      .groupBy('tier')
      .getRows<{ tier: string; total: string }>()

    const byTier = Object.fromEntries(rows.map((row) => [row.tier, Number(row.total)]))

    expect(byTier).toEqual({ active: 1, inactive: 1 })
  })

  it('filters by a computed attribute end to end', async () => {
    const rows = await ComputedUser.query()
      .where({ tier: 'active' })
      .getRows<{ id: number }>()

    expect(rows.map((row) => Number(row.id))).toEqual([1])
  })
})
