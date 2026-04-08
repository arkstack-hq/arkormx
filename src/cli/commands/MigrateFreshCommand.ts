import { MigrationClass, MigrationInstanceLike } from 'src/types'
import { applyMigrationToDatabase, applyMigrationToPrismaSchema, runPrismaCommand, stripPrismaSchemaModelsAndEnums, supportsDatabaseMigrationExecution, supportsDatabaseReset } from '../../helpers/migrations'
import { buildMigrationIdentity, buildMigrationRunId, computeMigrationChecksum, createEmptyAppliedMigrationsState, markMigrationApplied, markMigrationRun, resolveMigrationStateFilePath, writeAppliedMigrationsStateToStore } from '../../helpers/migration-history'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { resolvePersistedMetadataFeatures, syncPersistedColumnMappingsFromState, validatePersistedMetadataFeaturesForMigrations } from '../../helpers/column-mappings'
import { MIGRATION_BRAND } from '../../database/Migration'
import { RuntimeModuleLoader } from '../../helpers/runtime-module-loader'

export class MigrateFreshCommand extends Command<CliApp> {
    protected signature = `migrate:fresh
        {--skip-generate : Skip prisma generate}
        {--skip-migrate : Skip prisma database sync}
        {--state-file= : Path to applied migration state file}
        {--schema= : Explicit prisma schema path}
    `

    protected description = 'Reset the database and rerun all migration classes'

    async handle () {
        this.app.command = this

        const configuredMigrationsDir =
            this.app.getConfig('paths')?.migrations ??
            join(process.cwd(), 'database', 'migrations')
        const migrationsDir = this.app.resolveRuntimeDirectoryPath(configuredMigrationsDir)

        if (!existsSync(migrationsDir))
            return void this.error(`Error: Migrations directory not found: ${this.app.formatPathForLog(configuredMigrationsDir)}`)

        const adapter = this.app.getConfig('adapter')
        const useDatabaseMigrations = supportsDatabaseMigrationExecution(adapter)
        const persistedFeatures = resolvePersistedMetadataFeatures(this.app.getConfig('features'))
        const schemaPath = this.option('schema')
            ? resolve(String(this.option('schema')))
            : join(process.cwd(), 'prisma', 'schema.prisma')
        const stateFilePath = resolveMigrationStateFilePath(
            process.cwd(),
            this.option('state-file') ? String(this.option('state-file')) : undefined
        )
        const migrations = await this.loadAllMigrations(migrationsDir)

        if (migrations.length === 0)
            return void this.error('Error: No migration classes found to run.')

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
                    'Error: Adapter-backed migrate:fresh requires adapter.resetDatabase() support and will not modify prisma/schema.prisma.'
                )
            }

            await adapter.resetDatabase()
        } else {
            if (!existsSync(schemaPath))
                return void this.error(`Error: Prisma schema file not found: ${this.app.formatPathForLog(schemaPath)}`)

            const source = readFileSync(schemaPath, 'utf-8')
            writeFileSync(schemaPath, stripPrismaSchemaModelsAndEnums(source))
        }

        let appliedState = createEmptyAppliedMigrationsState()
        await writeAppliedMigrationsStateToStore(adapter, stateFilePath, appliedState)

        for (const [MigrationClassItem] of migrations) {
            if (useDatabaseMigrations) {
                await applyMigrationToDatabase(adapter, MigrationClassItem)
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
            migrationIds: appliedState.migrations.map(migration => migration.id),
        })

        await writeAppliedMigrationsStateToStore(adapter, stateFilePath, appliedState)
        try {
            await syncPersistedColumnMappingsFromState(process.cwd(), appliedState, migrations, persistedFeatures)
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

    private async loadMigrationClassesFromFile (filePath: string): Promise<MigrationClass[]> {
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