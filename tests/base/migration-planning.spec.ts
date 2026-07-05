import { DB, configureArkormRuntime, getMigrationPlan, resetArkormRuntimeForTests } from '../../src'
import { afterEach, describe, expect, it, vi } from 'vitest'

class RawSideEffectMigration {
  async up(schema: any) {
    schema.createTable('banking_accounts', (table: any) => {
      table.id()
      table.integer('userId')
      table.string('currency')
    })
    // A direct raw side effect — the class of statement that broke rollback.
    await DB.raw(
      'alter table banking_accounts add constraint banking_accounts_user_currency_unique unique (user_id, currency)',
    )
  }

  async down(schema: any) {
    schema.dropTable('banking_accounts')
  }
}

const configureSpyAdapter = () => {
  const rawQuery = vi.fn(async () => [] as Record<string, unknown>[])
  configureArkormRuntime(undefined, { adapter: { rawQuery } as never })

  return rawQuery
}

afterEach(() => {
  resetArkormRuntimeForTests()
})

describe('migration planning side effects', () => {
  it('runs a migration DB.raw when planning normally (apply path)', async () => {
    const rawQuery = configureSpyAdapter()

    const operations = await getMigrationPlan(new RawSideEffectMigration(), 'up')

    expect(rawQuery).toHaveBeenCalledTimes(1)
    expect(operations[0]).toMatchObject({ type: 'createTable', table: 'banking_accounts' })
  })

  it('suppresses DB.raw during inert planning while still collecting operations', async () => {
    const rawQuery = configureSpyAdapter()

    const operations = await getMigrationPlan(new RawSideEffectMigration(), 'up', { inert: true })

    // The raw statement must NOT be replayed just to read the plan…
    expect(rawQuery).not.toHaveBeenCalled()
    // …but the schema operations are still gathered.
    expect(operations[0]).toMatchObject({ type: 'createTable', table: 'banking_accounts' })
  })

  it('leaves DB.raw active again after the inert plan completes', async () => {
    const rawQuery = configureSpyAdapter()

    await getMigrationPlan(new RawSideEffectMigration(), 'up', { inert: true })
    expect(rawQuery).not.toHaveBeenCalled()

    await DB.raw('select 1')
    expect(rawQuery).toHaveBeenCalledTimes(1)
  })
})
