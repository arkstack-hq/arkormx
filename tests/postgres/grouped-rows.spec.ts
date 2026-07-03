import { DbPost, DbUser, seedPostgresFixtures, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { count, createKyselyAdapter, sum } from '../../src'

describe('Typed grouped aggregate rows (#14)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) })
  const adapter = createKyselyAdapter(db)

  beforeEach(async () => {
    await seedPostgresFixtures()
    setPostgresModelAdapter(adapter)
  })

  afterAll(async () => {
    setPostgresModelAdapter(undefined)
    await db.destroy()
  })

  it('getRows() returns plain rows for select + groupBy', async () => {
    const rows = await DbPost.query()
      .select({ userId: true, total: count() })
      .groupBy('userId')
      .getRows<{ userId: number; total: string }>()

    const byUser = rows
      .map((row) => ({ userId: Number(row.userId), total: Number(row.total) }))
      .sort((a, b) => a.userId - b.userId)

    expect(byUser).toEqual([
      { userId: 1, total: 2 },
      { userId: 2, total: 1 },
    ])
  })

  it('Prisma-style groupBy returns typed nested aggregate rows', async () => {
    const rows = await DbUser.query().groupBy({
      by: ['isActive'],
      _count: true,
      _sum: { id: true },
    })

    const sorted = [...rows].sort((a, b) => Number(a.isActive) - Number(b.isActive))

    expect(sorted).toEqual([
      { isActive: 0, _count: 1, _sum: { id: 2 } },
      { isActive: 1, _count: 1, _sum: { id: 1 } },
    ])
  })

  it('supports per-column _count and multiple aggregates', async () => {
    const rows = await DbPost.query().groupBy({
      by: ['userId'],
      _count: { id: true },
      _sum: { userId: true },
    })

    const sorted = [...rows].sort((a, b) => Number(a.userId) - Number(b.userId))

    expect(sorted).toEqual([
      { userId: 1, _count: { id: 2 }, _sum: { userId: 2 } },
      { userId: 2, _count: { id: 1 }, _sum: { userId: 2 } },
    ])
  })

  it('getRows() numeric aggregates come back coercible to numbers', async () => {
    const rows = await DbUser.query()
      .select({ ids: sum('id') })
      .getRows<{ ids: number }>()

    expect(Number(rows[0].ids)).toBe(3)
  })
})
