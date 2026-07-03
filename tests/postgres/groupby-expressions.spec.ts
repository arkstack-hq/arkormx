import { DbUser, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { caseWhen, col, count, createKyselyAdapter, sum } from '../../src'

describe('Group-by expressions (#12)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) })
  const adapter = createKyselyAdapter(db)

  beforeAll(() => setPostgresModelAdapter(adapter))
  afterAll(async () => {
    setPostgresModelAdapter(undefined)
    await db.destroy()
  })

  const compile = (build: () => { inspect(): { sql?: string } | null }) =>
    build().inspect()?.sql?.replace(/\s+/g, ' ').trim()

  it('groups by a plain column (unchanged behavior)', () => {
    const sql = compile(() => DbUser.query().select({ isActive: true }).groupBy('isActive'))

    expect(sql).toContain('group by "isActive"')
  })

  it('groups by an expression node', () => {
    const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')
    const sql = compile(() =>
      DbUser.query().select({ tier, total: count() }).groupBy(tier),
    )

    expect(sql).toContain('group by case when ("isActive" = $')
  })

  it('groups by a select alias by repeating the underlying expression', () => {
    const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')
    const sql = compile(() =>
      DbUser.query().select({ tier, total: sum('id') }).groupBy('tier'),
    )

    // The alias `tier` in group by is expanded to the CASE expression, not a bare ref.
    expect(sql).toContain('group by case when')
    expect(sql).not.toContain('group by "tier"')
  })

  it('supports groupByRaw with bindings', () => {
    const inspection = DbUser.query()
      .select({ bucket: col('id') })
      .groupByRaw('width_bucket("id", ?, ?, ?)', [0, 100, 10])
      .inspect()
    const sql = inspection?.sql?.replace(/\s+/g, ' ').trim()

    expect(sql).toContain('group by width_bucket("id", $')
    expect(inspection?.parameters).toEqual([0, 100, 10])
  })

  it('combines columns and groupByRaw', () => {
    const sql = compile(() =>
      DbUser.query().select({ isActive: true }).groupBy('isActive').groupByRaw('date("createdAt")'),
    )

    expect(sql).toContain('group by "isActive", date("createdAt")')
  })

  it('composes having with expression grouping', () => {
    const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')
    const sql = compile(() =>
      DbUser.query()
        .select({ tier, total: count() })
        .groupBy(tier)
        .having(count(), '>', 5),
    )

    expect(sql).toContain('having ((count(*))::bigint > $')
  })
})
