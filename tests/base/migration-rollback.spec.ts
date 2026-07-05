import { describe, expect, it } from 'vitest'
import { getLastBatchMigrations } from '../../src'
import type { AppliedMigrationsState } from '../../src'

const entry = (id: string, appliedAt: string) => ({
  id,
  file: `${id}.ts`,
  className: id,
  appliedAt,
})

// Two batches: batch 1 applied [a, b], batch 2 applied [c, d].
const twoBatchState = (): AppliedMigrationsState => ({
  version: 1,
  migrations: [
    entry('a', '2026-01-01T00:00:00.000Z'),
    entry('b', '2026-01-01T00:00:00.001Z'),
    entry('c', '2026-02-01T00:00:00.000Z'),
    entry('d', '2026-02-01T00:00:00.001Z'),
  ],
  runs: [
    { id: 'run_1', appliedAt: '2026-01-01T00:00:00.000Z', migrationIds: ['a', 'b'] },
    { id: 'run_2', appliedAt: '2026-02-01T00:00:00.000Z', migrationIds: ['c', 'd'] },
  ],
})

describe('migration rollback ordering (#regression)', () => {
  it('rolls back the last batch in reverse application order', () => {
    const targets = getLastBatchMigrations(twoBatchState())

    // Only the most recent batch (c, d), and d (applied last) rolls back first.
    expect(targets.map((migration) => migration.id)).toEqual(['d', 'c'])
  })

  it('does not cross batch boundaries by default', () => {
    const ids = getLastBatchMigrations(twoBatchState()).map((migration) => migration.id)

    expect(ids).not.toContain('a')
    expect(ids).not.toContain('b')
  })

  it('honors run order over timestamp, so identical appliedAt still reverses correctly', () => {
    const state: AppliedMigrationsState = {
      version: 1,
      migrations: [
        entry('first', '2026-03-01T00:00:00.000Z'),
        entry('second', '2026-03-01T00:00:00.000Z'),
        entry('third', '2026-03-01T00:00:00.000Z'),
      ],
      runs: [
        {
          id: 'run_same_ts',
          appliedAt: '2026-03-01T00:00:00.000Z',
          migrationIds: ['first', 'second', 'third'],
        },
      ],
    }

    expect(getLastBatchMigrations(state).map((migration) => migration.id)).toEqual([
      'third',
      'second',
      'first',
    ])
  })

  it('treats each migration as its own batch when no runs were recorded', () => {
    const state: AppliedMigrationsState = {
      version: 1,
      migrations: [
        entry('legacy-1', '2026-01-01T00:00:00.000Z'),
        entry('legacy-2', '2026-01-02T00:00:00.000Z'),
      ],
      runs: [],
    }

    expect(getLastBatchMigrations(state).map((migration) => migration.id)).toEqual(['legacy-2'])
    expect(getLastBatchMigrations(state, 2).map((migration) => migration.id)).toEqual([
      'legacy-2',
      'legacy-1',
    ])
  })

  it('returns an empty list when nothing has been applied', () => {
    expect(getLastBatchMigrations({ version: 1, migrations: [], runs: [] })).toEqual([])
    expect(getLastBatchMigrations(twoBatchState(), 0)).toEqual([])
  })

  it('--step=N rolls back the last N batches, newest batch first, each reversed', () => {
    expect(getLastBatchMigrations(twoBatchState(), 2).map((migration) => migration.id)).toEqual([
      'd',
      'c',
      'b',
      'a',
    ])
  })

  it('clamps --step beyond the number of recorded batches', () => {
    expect(getLastBatchMigrations(twoBatchState(), 99).map((migration) => migration.id)).toEqual([
      'd',
      'c',
      'b',
      'a',
    ])
  })
})
