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

  it('inlines an expression node that is not also projected', () => {
    const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')
    const sql = compile(() => DbUser.query().select({ total: count() }).groupBy(tier))

    expect(sql).toContain('group by case when ("isActive" = $')
  })

  it('references the select alias when the grouped expression is projected', () => {
    const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')
    const sql = compile(() =>
      DbUser.query()
        .select({ tier, total: sum('id') })
        .groupBy(tier),
    )

    // Grouping by the same expression that is selected references the output alias
    // (Postgres cannot match a re-bound duplicate expression against the SELECT).
    expect(sql).toContain('as "tier"')
    expect(sql).toContain('group by "tier"')
  })

  it('groups by a select alias name by referencing the alias', () => {
    const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')
    const sql = compile(() =>
      DbUser.query()
        .select({ tier, total: sum('id') })
        .groupBy('tier'),
    )

    expect(sql).toContain('group by "tier"')
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
      DbUser.query().select({ tier, total: count() }).groupBy(tier).having(count(), '>', 5),
    )

    expect(sql).toContain('having ((count(*))::bigint > $')
  })
})
