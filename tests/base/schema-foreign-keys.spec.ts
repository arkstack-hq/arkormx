import {
  SchemaBuilder,
  UnsupportedAdapterFeatureException,
  configureArkormRuntime,
  resetArkormRuntimeForTests,
  type DatabaseAdapter,
} from '../../src'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface RecordingAdapter {
  adapter: DatabaseAdapter
  calls: string[]
}

function createRecordingAdapter(options: { withRawQuery?: boolean } = {}): RecordingAdapter {
  const { withRawQuery = true } = options
  const calls: string[] = []

  const adapter = {
    ...(withRawQuery
      ? {
          rawQuery: vi.fn(async ({ sql }: { sql: string }) => {
            calls.push(sql)

            return []
          }),
        }
      : {}),
    transaction: vi.fn(async (callback: (next: DatabaseAdapter) => unknown) => {
      calls.push('BEGIN')
      const result = await callback(adapter as unknown as DatabaseAdapter)
      calls.push('COMMIT')

      return result
    }),
  } as unknown as DatabaseAdapter

  return { adapter, calls }
}

describe('SchemaBuilder foreign-key constraint toggles', () => {
  afterEach(() => {
    resetArkormRuntimeForTests()
  })

  it('disableForeignKeyConstraints switches the session into replica mode', async () => {
    const { adapter, calls } = createRecordingAdapter()
    configureArkormRuntime(undefined, { adapter })

    await SchemaBuilder.disableForeignKeyConstraints()

    expect(calls).toEqual(["SET session_replication_role = 'replica'"])
  })

  it('enableForeignKeyConstraints restores the origin role', async () => {
    const { adapter, calls } = createRecordingAdapter()
    configureArkormRuntime(undefined, { adapter })

    await SchemaBuilder.enableForeignKeyConstraints()

    expect(calls).toEqual(["SET session_replication_role = 'origin'"])
  })

  it('withoutForeignKeyConstraints disables, runs the callback, and re-enables inside one transaction', async () => {
    const { adapter, calls } = createRecordingAdapter()
    configureArkormRuntime(undefined, { adapter })

    const result = await SchemaBuilder.withoutForeignKeyConstraints(async () => {
      calls.push('callback')

      return 'seeded'
    })

    expect(result).toBe('seeded')
    expect(calls).toEqual([
      'BEGIN',
      "SET session_replication_role = 'replica'",
      'callback',
      "SET session_replication_role = 'origin'",
      'COMMIT',
    ])
  })

  it('withoutForeignKeyConstraints re-enables constraints even when the callback throws', async () => {
    const { adapter, calls } = createRecordingAdapter()
    configureArkormRuntime(undefined, { adapter })

    await expect(
      SchemaBuilder.withoutForeignKeyConstraints(async () => {
        throw new Error('seed failed')
      }),
    ).rejects.toThrow('seed failed')

    expect(calls).toEqual([
      'BEGIN',
      "SET session_replication_role = 'replica'",
      "SET session_replication_role = 'origin'",
    ])
  })

  it('throws when no adapter is configured', async () => {
    configureArkormRuntime(undefined, { adapter: undefined })

    await expect(SchemaBuilder.disableForeignKeyConstraints()).rejects.toThrow()
  })

  it('throws when the adapter does not support raw queries', async () => {
    const { adapter } = createRecordingAdapter({ withRawQuery: false })
    configureArkormRuntime(undefined, { adapter })

    await expect(SchemaBuilder.disableForeignKeyConstraints()).rejects.toBeInstanceOf(
      UnsupportedAdapterFeatureException,
    )
  })
})
