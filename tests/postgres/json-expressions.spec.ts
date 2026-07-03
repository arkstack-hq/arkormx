import { DbUser, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { caseWhen, count, createKyselyAdapter, json, sum } from '../../src'

describe('JSON value extraction in expressions (#11)', () => {
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

  it('extracts a single key with ->>', () => {
    const sql = compile(() => DbUser.query().select({ bill: json('metadata', 'billType') }))

    expect(sql).toContain('("metadata"::jsonb ->> $1) as "bill"')
  })

  it('extracts a nested path with #>>', () => {
    const sql = compile(() => DbUser.query().select({ city: json('metadata', 'address', 'city') }))

    expect(sql).toContain('("metadata"::jsonb #>> $1::text[]) as "city"')
  })

  it('applies a numeric cast', () => {
    const sql = compile(() => DbUser.query().select({ score: json('metadata', 'score').asNumber() }))

    expect(sql).toContain('::numeric as "score"')
  })

  it('applies a boolean cast', () => {
    const sql = compile(() => DbUser.query().select({ vip: json('metadata', 'vip').asBoolean() }))

    expect(sql).toContain('::boolean as "vip"')
  })

  it('is groupable', () => {
    const bill = json('metadata', 'billType')
    const sql = compile(() =>
      DbUser.query().select({ bill, total: count() }).groupBy(bill),
    )

    expect(sql).toContain('group by ("metadata"::jsonb ->> $')
  })

  it('is orderable', () => {
    const sql = compile(() => DbUser.query().orderBy(json('metadata', 'score').asNumber(), 'desc'))

    expect(sql).toContain('order by (("metadata"::jsonb ->> $1))::numeric desc')
  })

  it('works as a predicate value', () => {
    const sql = compile(() =>
      DbUser.query().where(json('metadata', 'billType').in(['airtime', 'data'])),
    )

    expect(sql).toContain('("metadata"::jsonb ->> $1) in ($2, $3)')
  })

  it('composes inside CASE and aggregates', () => {
    const category = caseWhen(json('metadata', 'billType').eq('airtime'), 'airtime_data').else('other')
    const sql = compile(() =>
      DbUser.query()
        .select({ category, revenue: sum(json('metadata', 'amount').asNumber()) })
        .groupBy(category),
    )

    expect(sql).toContain('sum((("metadata"::jsonb ->> $')
    expect(sql).toContain('))::numeric))::double precision as "revenue"')
  })
})
