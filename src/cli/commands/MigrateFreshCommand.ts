import { MigrationClass, MigrationInstanceLike } from 'src/types'
import {
  applyMigrationToDatabase,
  applyMigrationToPrismaSchema,
  runPrismaCommand,
  stripPrismaSchemaModelsAndEnums,
  supportsDatabaseCreation,
  supportsDatabaseMigrationExecution,
  supportsDatabaseReset,
} from '../../helpers/migrations'
import {
  buildMigrationIdentity,
  buildMigrationRunId,
  computeMigrationChecksum,
  createEmptyAppliedMigrationsState,
  markMigrationApplied,
  markMigrationRun,
  resolveMigrationStateFilePath,
  writeAppliedMigrationsStateToStore,
} from '../../helpers/migration-history'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  resolvePersistedMetadataFeatures,
  syncPersistedColumnMappingsFromState,
  validatePersistedMetadataFeaturesForMigrations,
} from '../../helpers/column-mappings'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { MIGRATION_BRAND } from '../../database/Migration'
import { RuntimeModuleLoader } from '../../helpers/runtime-module-loader'
import { getRegisteredMigrations, getRegisteredPaths } from '../../helpers/runtime-registry'

export class MigrateFreshCommand extends Command<CliApp> {
  protected signature = `migrate:fresh
        {--skip-generate : Skip prisma generate}
        {--skip-migrate : Skip prisma database sync}
        {--state-file= : Path to applied migration state file}
        {--schema= : Explicit prisma schema path}
        {--create-database : Create the configured database without prompting}
    `

  protected description = 'Reset the database and rerun all migration classes'

  async handle() {
    this.app.command = this

    const configuredMigrationsDir =
      this.app.getConfig('paths')?.migrations ?? join(process.cwd(), 'database', 'migrations')
    const migrationDirs = this.resolveMigrationDirectories(configuredMigrationsDir)

    if (migrationDirs.length === 0 && getRegisteredMigrations().length === 0)
      return void this.error(
        `Error: Migrations directory not found: ${this.app.formatPathForLog(configuredMigrationsDir)}`,
      )

    const adapter = this.app.getConfig('adapter')
    const useDatabaseMigrations = supportsDatabaseMigrationExecution(adapter)
    const persistedFeatures = resolvePersistedMetadataFeatures(this.app.getConfig('features'))
    const schemaPath = this.option('schema')
      ? resolve(String(this.option('schema')))
      : join(process.cwd(), 'prisma', 'schema.prisma')
    const stateFilePath = resolveMigrationStateFilePath(
      process.cwd(),
      this.option('state-file') ? String(this.option('state-file')) : undefined,
    )
    const migrations = await this.loadAllMigrations(migrationDirs)

    if (migrations.length === 0) return void this.error('Error: No migration classes found to run.')

    if (useDatabaseMigrations) {
      try {
        await validatePersistedMetadataFeaturesForMigrations(migrations, persistedFeatures)
      } catch (error) {
        return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (useDatabaseMigrations) {
      if (!supportsDatabaseReset(adapter)) {
        return void this.error(
          'Error: Your current database adapter does not support database reset.',
        )
      }

      const reset = await this.runWithDatabaseCreationRetry(adapter, () => adapter.resetDatabase())
      if (!reset.ok) return
    } else {
      if (!existsSync(schemaPath))
        return void this.error(
          `Error: Prisma schema file not found: ${this.app.formatPathForLog(schemaPath)}`,
        )

      const source = readFileSync(schemaPath, 'utf-8')
      writeFileSync(schemaPath, stripPrismaSchemaModelsAndEnums(source))
    }

    let appliedState = createEmptyAppliedMigrationsState()
    const wroteEmptyState = await this.runWithDatabaseCreationRetry(adapter, () =>
      writeAppliedMigrationsStateToStore(adapter, stateFilePath, appliedState),
    )
    if (!wroteEmptyState.ok) return

    for (const [MigrationClassItem] of migrations) {
      if (useDatabaseMigrations) {
        const applied = await this.runWithDatabaseCreationRetry(adapter, () =>
          applyMigrationToDatabase(adapter, MigrationClassItem),
        )
        if (!applied.ok) return

        continue
      }

      await applyMigrationToPrismaSchema(MigrationClassItem, { schemaPath, write: true })
    }

    for (const [migrationClass, file] of migrations) {
      appliedState = markMigrationApplied(appliedState, {
        id: buildMigrationIdentity(file, migrationClass.name),
        file,
        className: migrationClass.name,
        appliedAt: new Date().toISOString(),
        checksum: computeMigrationChecksum(file),
      })
    }

    appliedState = markMigrationRun(appliedState, {
      id: buildMigrationRunId(),
      appliedAt: new Date().toISOString(),
      migrationIds: appliedState.migrations.map((migration) => migration.id),
    })

    const wroteState = await this.runWithDatabaseCreationRetry(adapter, () =>
      writeAppliedMigrationsStateToStore(adapter, stateFilePath, appliedState),
    )
    if (!wroteState.ok) return

    try {
      await syncPersistedColumnMappingsFromState(
        process.cwd(),
        appliedState,
        migrations,
        persistedFeatures,
      )
    } catch (error) {
      return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (!useDatabaseMigrations) {
      const schemaArgs = this.option('schema') ? ['--schema', schemaPath] : []

      if (!this.option('skip-generate'))
        runPrismaCommand(['generate', ...schemaArgs], process.cwd())

      if (!this.option('skip-migrate'))
        runPrismaCommand(['db', 'push', '--force-reset', ...schemaArgs], process.cwd())
    }

    this.success(`Refreshed database with ${migrations.length} migration(s).`)
    migrations.forEach(([_, file]) => this.success(this.app.splitLogger('Migrated', file)))
  }

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
