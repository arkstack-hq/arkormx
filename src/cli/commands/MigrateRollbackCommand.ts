import { MigrationClass, MigrationInstanceLike } from 'src/types'
import { applyMigrationRollbackToDatabase, applyMigrationRollbackToPrismaSchema, runPrismaCommand, supportsDatabaseMigrationExecution } from '../../helpers/migrations'
import { buildMigrationIdentity, getLastMigrationRun, getLatestAppliedMigrations, readAppliedMigrationsStateFromStore, removeAppliedMigration, resolveMigrationStateFilePath, writeAppliedMigrationsStateToStore } from '../../helpers/migration-history'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { resolvePersistedMetadataFeatures, syncPersistedColumnMappingsFromState } from '../../helpers/column-mappings'
import { MIGRATION_BRAND } from '../../database/Migration'
import { RuntimeModuleLoader } from '../../helpers/runtime-module-loader'

/**
 * Rollback migration classes from the Prisma schema and run Prisma workflow.
 * By default, rolls back classes applied in the last migrate run.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.2.4
 */
export class MigrateRollbackCommand extends Command<CliApp> {
    protected signature = `migrate:rollback
        {--step= : Number of latest applied migration classes to rollback}
        {--dry-run : Preview rollback targets without applying changes}
        {--deploy : Use prisma migrate deploy instead of migrate dev}
        {--skip-generate : Skip prisma generate}
        {--skip-migrate : Skip prisma migrate command}
        {--state-file= : Path to applied migration state file}
        {--schema= : Explicit prisma schema path}
        {--migration-name= : Name for prisma migrate dev}
    `

    protected description = 'Rollback migration classes from schema.prisma and run Prisma workflow'

    async handle () {
        this.app.command = this

        const configuredMigrationsDir =
            this.app.getConfig('paths')?.migrations ??
            join(process.cwd(), 'database', 'migrations')
        const migrationsDir = this.app.resolveRuntimeDirectoryPath(configuredMigrationsDir)

        if (!existsSync(migrationsDir))
            return void this.error(`Error: Migrations directory not found: ${this.app.formatPathForLog(configuredMigrationsDir)}`)

        const schemaPath = this.option('schema')
            ? resolve(String(this.option('schema')))
            : join(process.cwd(), 'prisma', 'schema.prisma')

        const stateFilePath = resolveMigrationStateFilePath(
            process.cwd(),
            this.option('state-file') ? String(this.option('state-file')) : undefined
        )
        const adapter = this.app.getConfig('adapter')
        const useDatabaseMigrations = supportsDatabaseMigrationExecution(adapter)
        const persistedFeatures = resolvePersistedMetadataFeatures(this.app.getConfig('features'))
        let appliedState = await readAppliedMigrationsStateFromStore(adapter, stateFilePath)

        const stepOption = this.option('step')
        const stepCount = stepOption == null ? undefined : Number(stepOption)
        if (stepCount != null && (!Number.isFinite(stepCount) || stepCount <= 0 || !Number.isInteger(stepCount)))
            return void this.error('Error: --step must be a positive integer.')

        const targets = stepCount
            ? getLatestAppliedMigrations(appliedState, stepCount)
            : (() => {
                const lastRun = getLastMigrationRun(appliedState)
                if (!lastRun)
                    return []

                return lastRun.migrationIds
                    .map(id => appliedState.migrations.find(migration => migration.id === id))
                    .filter((migration): migration is NonNullable<typeof migration> => Boolean(migration))
            })()

        if (targets.length === 0)
            return void this.error('Error: No tracked migrations available to rollback.')

        const available = await this.loadAllMigrations(migrationsDir)
        const rollbackClasses = targets
            .map((target) => {
                return available.find(([migrationClass, file]) => {
                    return buildMigrationIdentity(file, migrationClass.name) === target.id
                        || migrationClass.name === target.className
                })
            })
            .filter((entry): entry is [MigrationClass, string] => Boolean(entry))

        if (rollbackClasses.length === 0)
            return void this.error('Error: Unable to resolve rollback migration classes from tracked history.')

        if (this.option('dry-run')) {
            this.success(`Dry run: ${rollbackClasses.length} migration(s) would be rolled back.`)
            rollbackClasses.forEach(([_, file]) => this.success(this.app.splitLogger('WouldRollback', file)))

            return
        }

        for (const [MigrationClassItem] of rollbackClasses) {
            if (useDatabaseMigrations) {
                await applyMigrationRollbackToDatabase(adapter, MigrationClassItem)
                continue
            }

            await applyMigrationRollbackToPrismaSchema(MigrationClassItem, { schemaPath, write: true })
        }

        for (const [migrationClass, file] of rollbackClasses) {
            const identity = buildMigrationIdentity(file, migrationClass.name)
            appliedState = removeAppliedMigration(appliedState, identity)
        }

        await writeAppliedMigrationsStateToStore(adapter, stateFilePath, appliedState)
        try {
            await syncPersistedColumnMappingsFromState(process.cwd(), appliedState, available, persistedFeatures)
        } catch (error) {
            return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        }

        if (!useDatabaseMigrations && !this.option('skip-generate'))
            runPrismaCommand(['generate'], process.cwd())

        if (!useDatabaseMigrations && !this.option('skip-migrate')) {
            if (this.option('deploy')) {
                runPrismaCommand(['migrate', 'deploy'], process.cwd())
            } else {
                const name = this.option('migration-name')
                    ? String(this.option('migration-name'))
                    : `arkorm_cli_rollback_${Date.now()}`
                runPrismaCommand(['migrate', 'dev', '--name', name], process.cwd())
            }
        }

        this.success(`Rolled back ${rollbackClasses.length} migration(s).`)
        rollbackClasses.forEach(([_, file]) => this.success(this.app.splitLogger('RolledBack', file)))
    }

    private async loadAllMigrations (migrationsDir: string): Promise<[MigrationClass, string][]> {
        const files = readdirSync(migrationsDir)
            .filter(file => /\.(ts|js|mjs|cjs)$/i.test(file))
            .sort((left, right) => left.localeCompare(right))
            .map(file => this.app.resolveRuntimeScriptPath(join(migrationsDir, file)))

        const classes = await Promise.all(files.map(
            async file => (await this.loadMigrationClassesFromFile(file)).map(cls => [cls, file] as [MigrationClass, string])
        ))

        return classes.flat()
    }

    private async loadMigrationClassesFromFile (
        filePath: string
    ): Promise<MigrationClass[]> {
        const imported = await RuntimeModuleLoader.load<Record<string, unknown>>(filePath)
        const exports = Object.values(imported) as unknown[]

        return exports
            .filter((value): value is MigrationClass => {
                if (typeof value !== 'function')
                    return false

                const candidate = value as MigrationClass & { [MIGRATION_BRAND]?: boolean }
                const prototype = candidate.prototype as Partial<MigrationInstanceLike> | undefined

                return candidate[MIGRATION_BRAND] === true
                    || typeof prototype?.up === 'function'
                    && typeof prototype?.down === 'function'
            })
    }
}
