import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Tracks whether a migration body is currently being invoked purely to collect
 * its schema plan (rather than to actually apply it).
 *
 * A migration's `up()`/`down()` is executed both to gather its {@link SchemaOperation}s
 * and, when it uses helpers like `DB.raw()`, as real database side effects. Some
 * flows (column-mapping sync, feature validation) re-invoke `up()` on already
 * applied migrations solely to rebuild metadata — they must NOT re-run those side
 * effects, or a rollback would replay every still-applied migration's raw SQL
 * against a schema it was never meant to touch again.
 *
 * While this context is active, direct data-affecting `DB` calls become no-ops.
 * Actual apply/rollback runs outside it, so side effects happen normally.
 */
// The CLI (`dist/cli.mjs`) and the library (`dist/index.mjs`) are separate
// bundles, so a plain module-scoped store would give each its own instance and
// the flag would not cross from the CLI's getMigrationPlan() to a migration's
// DB.raw() (imported from the library). Anchor a single instance on globalThis
// via the global symbol registry so every bundle shares it.
const STORAGE_KEY = Symbol.for('arkorm.migrationPlanningStorage')

const globalScope = globalThis as typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<true>
}

const migrationPlanningStorage: AsyncLocalStorage<true> =
  globalScope[STORAGE_KEY] ?? (globalScope[STORAGE_KEY] = new AsyncLocalStorage<true>())

/** Runs `fn` in a side-effect-free migration-planning context. */
export const runInMigrationPlanning = async <TResult>(
  fn: () => Promise<TResult> | TResult,
): Promise<TResult> => {
  return await migrationPlanningStorage.run(true, async () => await fn())
}

/** True when a migration body is being invoked only to collect its schema plan. */
export const isMigrationPlanningActive = (): boolean => {
  return migrationPlanningStorage.getStore() === true
}
