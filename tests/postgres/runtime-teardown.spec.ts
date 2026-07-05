import { Kysely, PostgresDialect } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import {
  configureArkormRuntime,
  createKyselyAdapter,
  disposeArkormRuntime,
  resetArkormRuntimeForTests,
} from '../../src'

import { Pool } from 'pg'

describe('runtime teardown releases the connection pool', () => {
  afterEach(() => {
    resetArkormRuntimeForTests()
  })

  const makeAdapter = () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) })

    return { adapter: createKyselyAdapter(db), pool }
  }

  it('dispose() ends the Kysely pool so further queries fail', async () => {
    const { adapter, pool } = makeAdapter()

    expect(await adapter.rawQuery!({ sql: 'select 1 as one' })).toEqual([{ one: 1 }])

    await adapter.dispose!()

    // A destroyed pool rejects further use — the handle is released, letting the
    // process exit instead of waiting on the pool's idle timeout.
    expect(pool.ended).toBe(true)
    await expect(adapter.rawQuery!({ sql: 'select 1' })).rejects.toBeTruthy()
  })

  it('disposeArkormRuntime() tears down the configured adapter end-to-end', async () => {
    const { adapter, pool } = makeAdapter()
    configureArkormRuntime(undefined, { adapter })

    await adapter.rawQuery!({ sql: 'select 1' })
    await disposeArkormRuntime()

    expect(pool.ended).toBe(true)
  })
})
