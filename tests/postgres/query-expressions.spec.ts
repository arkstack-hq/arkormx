import { DbUser, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { caseWhen, coalesce, col, createKyselyAdapter, raw, val, where } from '../../src'

describe('Query expression builder (#10)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool }),
  })
  const adapter = createKyselyAdapter(db)

  beforeAll(() => {
    setPostgresModelAdapter(adapter)
  })

  afterEach(() => {
    setPostgresModelAdapter(adapter)
  })

  afterAll(async () => {
    setPostgresModelAdapter(undefined)
    await db.destroy()
  })

  const compile = (
    build: () => { inspect(): { sql?: string; parameters?: readonly unknown[] } | null },
  ) => {
    const inspection = build().inspect()

    return {
      sql: inspection?.sql?.replace(/\s+/g, ' ').trim(),
      parameters: inspection?.parameters ?? [],
    }
  }

  it('projects a CASE expression with a column alias', () => {
    const { sql } = compile(() =>
      DbUser.query().select({
        tier: caseWhen(col('isActive').eq(1), 'active').else('inactive'),
      }),
    )

    expect(sql).toContain('case when ("isActive" = $1) then $2 else $3 end as "tier"')
  })

  it('binds literal values as parameters (never interpolated)', () => {
    const { sql, parameters } = compile(() => DbUser.query().select({ label: val('vip') }))

    expect(sql).toContain('$1 as "label"')
    expect(parameters).toContain('vip')
  })

  it('compiles COALESCE over column references', () => {
    const { sql } = compile(() =>
      DbUser.query().select({ display: coalesce(col('name'), col('email'), val('anonymous')) }),
    )

    expect(sql).toContain('coalesce("name", "email", $1) as "display"')
  })

  it('supports a raw expression escape hatch with bindings', () => {
    const { sql, parameters } = compile(() =>
      DbUser.query().select({ score: raw('? + "id"', [10]) }),
    )

    expect(sql).toContain('as "score"')
    expect(parameters).toContain(10)
  })

  it('accepts a boolean expression as a where predicate', () => {
    const { sql } = compile(() =>
      DbUser.query().where(col('name').like('a%').and(col('isActive').eq(1))),
    )

    expect(sql).toContain('("name" like $1) and ("isActive" = $2)')
  })

  it('accepts an expression in orderBy', () => {
    const { sql } = compile(() => DbUser.query().orderBy(coalesce(col('name'), val('')), 'desc'))

    expect(sql).toContain('order by coalesce("name", $1) desc')
  })

  it('composes the where() helper as an inline predicate', () => {
    const { sql } = compile(() => DbUser.query().where(where('isActive', '>=', 1)))

    expect(sql).toContain('("isActive" >= $1)')
  })

  it('compiles arithmetic and IN expressions', () => {
    const { sql } = compile(() => DbUser.query().where(col('id').plus(1).in([2, 3, 4])))

    expect(sql).toContain('("id" + $1) in ($2, $3, $4)')
  })
})
