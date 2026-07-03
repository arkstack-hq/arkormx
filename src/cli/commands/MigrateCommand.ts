import { MigrationClass, MigrationInstanceLike } from 'src/types'
import {
  applyMigrationToDatabase,
  applyMigrationToPrismaSchema,
  getMigrationPlan,
  runPrismaCommand,
  supportsDatabaseCreation,
  supportsDatabaseMigrationExecution,
} from '../../helpers/migrations'
import {
  applyOperationsToPersistedColumnMappingsState,
  createEmptyPersistedColumnMappingsState,
  resolvePersistedMetadataFeatures,
  syncPersistedColumnMappingsFromState,
} from '../../helpers/column-mappings'
import {
  buildMigrationIdentity,
  buildMigrationRunId,
  computeMigrationChecksum,
  findAppliedMigration,
  isMigrationApplied,
  markMigrationApplied,
  markMigrationRun,
  readAppliedMigrationsStateFromStore,
  resolveMigrationStateFilePath,
  writeAppliedMigrationsStateToStore,
} from '../../helpers/migration-history'
import { existsSync, readdirSync } from 'node:fs'
import { getRegisteredMigrations, getRegisteredPaths } from '../../helpers/runtime-registry'
import { join, resolve } from 'node:path'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { MIGRATION_BRAND } from '../../database/Migration'
import { RuntimeModuleLoader } from '../../helpers/runtime-module-loader'
import { loadArkormConfig } from '../../helpers/runtime-config'

/**
 * The MigrateCommand class implements the CLI command for applying migration
 * classes to the database or Prisma schema and running the Prisma workflow when
 * using the Prisma compatibility driver.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MigrateCommand extends Command<CliApp> {
  protected signature = `migrate
        {name? : Migration class or file name}
        {--all : Run all migrations from the configured migrations directory}
        {--deploy : Use prisma migrate deploy instead of migrate dev (Prisma compatibility driver only)}
        {--skip-generate : Skip prisma generate (Prisma compatibility driver only)}
        {--skip-migrate : Skip prisma migrate command}
        {--state-file= : Path to applied migration state file}
        {--schema= : Explicit prisma schema path (Prisma compatibility driver only)}
        {--migration-name= : Name for prisma migrate dev (Prisma compatibility driver only)}
        {--create-database : Create the configured database without prompting}
    `

  protected description =
    'Apply migration classes to the database or schema.prisma and run Prisma workflow when using the Prisma compatibility driver'

  /**
   * Command handler for the migrate command.
   * This method is responsible for orchestrating the migration
   * process, including loading migration classes, applying them to
   * the the database or Prisma schema, and running the appropriate Prisma commands
   * when using the Prisma compatibility driver based on the provided options.
   *
   * @returns
   */
  async handle() {
    this.app.command = this
    // Ensure the user configuration (and its database adapter) is applied
    // before resolving the adapter. Consumers such as the Arkstack CLI invoke
    // this handler with a freshly constructed CliApp that has not yet loaded
    // the config, so without this the adapter is undefined and the command
    // incorrectly falls back to the Prisma workflow.
    await loadArkormConfig()
    const configuredMigrationsDir =
      this.app.getConfig('paths')?.migrations ?? join(process.cwd(), 'database', 'migrations')
    const migrationDirs = this.resolveMigrationDirectories(configuredMigrationsDir)

    if (migrationDirs.length === 0 && getRegisteredMigrations().length === 0)
      return void this.error(
        `Error: Migrations directory not found: ${this.app.formatPathForLog(configuredMigrationsDir)}`,
      )

    const schemaPath = this.option('schema')
      ? resolve(String(this.option('schema')))
      : join(process.cwd(), 'prisma', 'schema.prisma')

    const classes =
      this.option('all') || !this.argument('name')
        ? await this.loadAllMigrations(migrationDirs)
        : ((await this.loadNamedMigration(migrationDirs, this.argument('name'))).filter(
            ([cls]) => cls !== undefined,
          ) as [MigrationClass, string][])

    if (classes.length === 0) return void this.error('Error: No migration classes found to run.')

    const shouldTrackApplied = true
    const stateFilePath = resolveMigrationStateFilePath(
      process.cwd(),
      this.option('state-file') ? String(this.option('state-file')) : undefined,
    )
    const adapter = this.app.getConfig('adapter')
    const useDatabaseMigrations = supportsDatabaseMigrationExecution(adapter)
    const persistedFeatures = resolvePersistedMetadataFeatures(this.app.getConfig('features'))

    const appliedState = shouldTrackApplied
      ? await this.runWithDatabaseCreationRetry(adapter, () =>
          readAppliedMigrationsStateFromStore(adapter, stateFilePath),
        )
      : { ok: true, value: undefined }

    if (!appliedState.ok) return

    let appliedMigrationState = appliedState.value

    const skipped: [MigrationClass, string][] = []
    const changed: [MigrationClass, string][] = []
    const pending = classes.filter(([migrationClass, file]) => {
      if (!appliedMigrationState) return true

      const identity = buildMigrationIdentity(file, migrationClass.name)
      const checksum = computeMigrationChecksum(file)
      const alreadyApplied = isMigrationApplied(appliedMigrationState, identity, checksum)
      if (alreadyApplied) skipped.push([migrationClass, file])
      else if (findAppliedMigration(appliedMigrationState, identity))
        changed.push([migrationClass, file])

      return !alreadyApplied
    })

    skipped.forEach(([migrationClass, file]) => {
      this.success(this.app.splitLogger('Skipped', `${file} (${migrationClass.name})`))
    })
    changed.forEach(([migrationClass, file]) => {
      this.success(this.app.splitLogger('Changed', `${file} (${migrationClass.name})`))
    })

    if (pending.length === 0) {
      if (appliedMigrationState) {
        try {
          await syncPersistedColumnMappingsFromState(
            process.cwd(),
            appliedMigrationState,
            await this.loadAllMigrations(migrationDirs),
            persistedFeatures,
          )
        } catch (error) {
          return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      this.success('No pending migration classes to apply.')

      return
    }

    // Validate persisted-metadata features one migration at a time, in
    // application order, immediately before each migration is applied. Building
    // a migration's plan executes its up(); validating the whole batch up front
    // would therefore run a later migration's raw SQL (e.g. a trigger or
    // constraint referencing a table from an earlier migration) before that
    // table exists, breaking a from-zero migrate. Per-migration validation still
    // aborts before applying a migration that uses a disabled feature.
    let columnMappingsState = createEmptyPersistedColumnMappingsState()

    for (const [MigrationClassItem] of pending) {
      if (useDatabaseMigrations) {
        const planned = await this.runWithDatabaseCreationRetry(adapter, () =>
          getMigrationPlan(MigrationClassItem, 'up'),
        )
        if (!planned.ok) return

        try {
          columnMappingsState = applyOperationsToPersistedColumnMappingsState(
            columnMappingsState,
            planned.value,
            persistedFeatures,
          )
        } catch (error) {
          return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        }

        const applied = await this.runWithDatabaseCreationRetry(adapter, () =>
          applyMigrationToDatabase(adapter, MigrationClassItem),
        )
        if (!applied.ok) return

        continue
      }

      await applyMigrationToPrismaSchema(MigrationClassItem, { schemaPath, write: true })
    }

    if (appliedMigrationState) {
      const runAppliedIds: string[] = []

      for (const [migrationClass, file] of pending) {
        const identity = buildMigrationIdentity(file, migrationClass.name)
        appliedMigrationState = markMigrationApplied(appliedMigrationState, {
          id: identity,
          file,
          className: migrationClass.name,
          appliedAt: new Date().toISOString(),
          checksum: computeMigrationChecksum(file),
        })
        runAppliedIds.push(identity)
      }

      appliedMigrationState = markMigrationRun(appliedMigrationState, {
        id: buildMigrationRunId(),
        appliedAt: new Date().toISOString(),
        migrationIds: runAppliedIds,
      })

      const wroteState = await this.runWithDatabaseCreationRetry(adapter, () =>
        writeAppliedMigrationsStateToStore(adapter, stateFilePath, appliedMigrationState!),
      )
      if (!wroteState.ok) return

      try {
        await syncPersistedColumnMappingsFromState(
          process.cwd(),
          appliedMigrationState,
          await this.loadAllMigrations(migrationDirs),
          persistedFeatures,
        )
      } catch (error) {
        return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (!useDatabaseMigrations && !this.option('skip-generate'))
      runPrismaCommand(['generate'], process.cwd())

    if (!useDatabaseMigrations && !this.option('skip-migrate')) {
      if (this.option('deploy')) {
        runPrismaCommand(['migrate', 'deploy'], process.cwd())
      } else {
        const name = this.option('migration-name')
          ? String(this.option('migration-name'))
          : `arkorm_cli_${Date.now()}`
        runPrismaCommand(['migrate', 'dev', '--name', name], process.cwd())
      }
    }

    this.success(`Applied ${pending.length} migration(s).`)
    pending.forEach(([_, file]) => this.success(this.app.splitLogger('Migrated', file)))
  }

  /**
   * Load all migration classes from the specified directory.
   *
   * @param migrationsDir The directory to load migration classes from.
   */
  private resolveMigrationDirectories(configuredMigrationsDir: string): string[] {
    const configured = this.app.resolveRuntimeDirectoryPath(configuredMigrationsDir)
    const registered = getRegisteredPaths('migrations') as string[]

    return [
      configured,
      ...registered.map((directory) => this.app.resolveRuntimeDirectoryPath(directory)),
    ].filter((directory, index, all) => existsSync(directory) && all.indexOf(directory) === index)
  }

  private async loadAllMigrations(migrationsDirs: string[]): Promise<[MigrationClass, string][]> {
    const files = migrationsDirs.flatMap((migrationsDir) =>
      readdirSync(migrationsDir)
        .filter((file) => /\.(ts|js|mjs|cjs)$/i.test(file))
        .sort((left, right) => left.localeCompare(right))
        .map((file) => this.app.resolveRuntimeScriptPath(join(migrationsDir, file))),
    )

    const classes = await Promise.all(
      files.map(async (file) =>
        (await this.loadMigrationClassesFromFile(file)).map(
          (cls) => [cls, file] as [MigrationClass, string],
        ),
      ),
    )

    return [
      ...classes.flat(),
      ...getRegisteredMigrations().map(
        (cls) => [cls, `registered:${cls.name}`] as [MigrationClass, string],
      ),
    ]
  }

  /**
   * Load migration classes from a specific file or by class name.
   *
   * @param migrationsDir
   * @param name
   * @returns
   */
  private async loadNamedMigration(
    migrationsDirs: string[],
    name?: string,
  ): Promise<[MigrationClass | undefined, string][]> {
    if (!name) return [[undefined, '']]

    const base = name.replace(/Migration$/, '')
    const registered = getRegisteredMigrations().find(
      (cls) => cls.name === name || cls.name === `${base}Migration`,
    )
    if (registered) return [[registered, `registered:${registered.name}`]]

    const candidates = migrationsDirs.flatMap((migrationsDir) =>
      [
        `${name}.ts`,
        `${name}.js`,
        `${name}.mjs`,
        `${name}.cjs`,
        `${base}Migration.ts`,
        `${base}Migration.js`,
        `${base}Migration.mjs`,
        `${base}Migration.cjs`,
      ].map((file) => join(migrationsDir, file)),
    )

    const target = candidates.find((file) => existsSync(file))
    if (!target) return [[undefined, name]]

    const runtimeTarget = this.app.resolveRuntimeScriptPath(target)

    return (await this.loadMigrationClassesFromFile(runtimeTarget)).map((cls) => [
      cls,
      runtimeTarget,
    ])
  }

  /**
   * Load migration classes from a given file path.
   *
   * @param filePath
   * @returns
   */
  private async loadMigrationClassesFromFile(filePath: string): Promise<MigrationClass[]> {
    const imported = await RuntimeModuleLoader.load<Record<string, unknown>>(filePath)
    const exports = Object.values(imported) as unknown[]

    return exports.filter((value): value is MigrationClass => {
      if (typeof value !== 'function') return false

      const candidate = value as MigrationClass & { [MIGRATION_BRAND]?: boolean }
      const prototype = candidate.prototype as Partial<MigrationInstanceLike> | undefined

      return (
        candidate[MIGRATION_BRAND] === true ||
        (typeof prototype?.up === 'function' && typeof prototype?.down === 'function')
      )
    })
  }

  private async runWithDatabaseCreationRetry<TResult>(
    adapter: any,
    callback: () => Promise<TResult>,
  ): Promise<{ ok: true; value: TResult } | { ok: false }> {
    if (!supportsDatabaseCreation(adapter)) return { ok: true, value: await callback() }

    try {
      return { ok: true, value: await callback() }
    } catch (error) {
      const database = this.getMissingDatabaseName(error)
      if (!database) throw error

      if (!(await this.shouldCreateDatabase(database))) {
        this.error(`Error: Configured database [${database}] does not exist.`)

        return { ok: false }
      }

      let created: Awaited<ReturnType<typeof adapter.createDatabaseFromError>>
      try {
        created = await adapter.createDatabaseFromError(error)
      } catch (creationError) {
        this.error(
          `Error: ${creationError instanceof Error ? creationError.message : String(creationError)}`,
        )

        return { ok: false }
      }

      if (!created) {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)

        return { ok: false }
      }

      if (created.created) this.success(`Created database: ${created.database ?? database}`)

      return { ok: true, value: await callback() }
    }
  }

  private getMissingDatabaseName(error: unknown): string | undefined {
    const candidate = error as { code?: unknown; message?: unknown } | undefined
    const message = typeof candidate?.message === 'string' ? candidate.message : ''
    const matched = message.match(/database "([^"]+)" does not exist/i)

    if (candidate?.code === '3D000' && matched?.[1]) return matched[1]

    return undefined
  }

  private async shouldCreateDatabase(database?: string): Promise<boolean> {
    if (this.option('create-database')) return true

    if (this.isNonInteractive()) return false

    return await this.confirm(
      `Configured database${database ? ` [${database}]` : ''} does not exist. Create it before running migrations?`,
      true,
    )
  }
}
