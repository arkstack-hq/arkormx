import { DbUser, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { avg, caseWhen, col, count, createKyselyAdapter, sum, val, where } from '../../src'

describe('Filtered / conditional aggregates (#13)', () => {
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

  it('emits FILTER (WHERE …) for a filtered sum', () => {
    const boundary = new Date('2026-01-01')
    const sql = compile(() =>
      DbUser.query().select({ recent: sum('id').filter(where('createdAt', '>=', boundary)) }),
    )

    expect(sql).toContain('sum("id") filter (where ("createdAt" >= $1))')
  })

  it('supports count().filter(predicate)', () => {
    const sql = compile(() =>
      DbUser.query().select({ inactive: count().filter(col('isActive').eq(0)) }),
    )

    expect(sql).toContain('(count(*) filter (where ("isActive" = $1)))::bigint')
  })

  it('allows multiple filtered aggregates partitioning the same rows', () => {
    const boundary = val('2026-01-01')
    const sql = compile(() =>
      DbUser.query().select({
        current: sum('id').filter(col('createdAt').gte(boundary)),
        previous: sum('id').filter(col('createdAt').lt(boundary)),
      }),
    )

    expect(sql).toContain('sum("id") filter (where ("createdAt" >= $1))')
    expect(sql).toContain('sum("id") filter (where ("createdAt" < $2))')
  })

  it('composes filter with distinct and avg', () => {
    const sql = compile(() =>
      DbUser.query().select({ avgActive: avg('id').filter(col('isActive').eq(1)) }),
    )

    expect(sql).toContain('(avg("id") filter (where ("isActive" = $1)))::double precision')
  })

  it('works under group by', () => {
    const sql = compile(() =>
      DbUser.query()
        .select({ isActive: true, failed: count().filter(col('id').gt(100)) })
        .groupBy('isActive'),
    )

    expect(sql).toContain('filter (where ("id" > $')
    expect(sql).toContain('group by "isActive"')
  })

  it('documented portable fallback: an equivalent CASE WHEN aggregate', () => {
    // On adapters without FILTER support, the same result is expressible with CASE.
    const sql = compile(() =>
      DbUser.query().select({
        recent: sum(caseWhen(col('isActive').eq(1), col('id')).else(0)),
      }),
    )

    expect(sql).toContain('sum(case when ("isActive" = $1) then "id" else $2 end)')
  })
})
