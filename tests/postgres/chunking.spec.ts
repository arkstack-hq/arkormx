import { DbPost, seedPostgresFixtures, setPostgresModelAdapter } from './helpers/fixtures'
import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { createKyselyAdapter } from '../../src'

const idOf = (model: unknown) =>
  Number((model as { getAttribute(key: string): unknown }).getAttribute('id'))

describe('Chunking & lazy streaming on the SQL adapter', () => {
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

  it('chunk() pages by offset over real rows', async () => {
    const sizes: number[] = []

    const completed = await DbPost.query()
      .orderBy({ id: 'asc' })
      .chunk(2, (models) => {
        sizes.push(models.count())
      })

    expect(completed).toBe(true)
    expect(sizes).toEqual([2, 1])
  })

  it('chunkById() pages by key column', async () => {
    const ids: number[] = []

    await DbPost.query().chunkById(2, (models) => {
      ids.push(...models.all().map(idOf))
    })

    expect(ids).toEqual([1, 2, 3])
  })

  it('lazy() streams rows via async iteration', async () => {
    const ids: number[] = []

    for await (const post of DbPost.query().orderBy({ id: 'asc' }).lazy(2)) {
      ids.push(idOf(post))
    }

    expect(ids).toEqual([1, 2, 3])
  })

  it('lazyByIdDesc() streams in descending key order', async () => {
    const ids: number[] = []

    for await (const post of DbPost.query().lazyByIdDesc(2)) {
      ids.push(idOf(post))
    }

    expect(ids).toEqual([3, 2, 1])
  })
})
