import { MigrationClass, MigrationInstanceLike } from 'src/types'
import { applyMigrationToPrismaSchema, runPrismaCommand } from '../../helpers/migrations'
import { buildMigrationIdentity, computeMigrationChecksum, findAppliedMigration, isMigrationApplied, markMigrationApplied, readAppliedMigrationsState, resolveMigrationStateFilePath, writeAppliedMigrationsState } from '../../helpers/migration-history'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { MIGRATION_BRAND } from '../../database/Migration'
import { pathToFileURL } from 'node:url'

/**
 * The MigrateCommand class implements the CLI command for applying migration 
 * classes to the Prisma schema and running the Prisma workflow.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MigrateCommand extends Command<CliApp> {
    protected signature = `migrate
        {name? : Migration class or file name}
        {--all : Run all migrations from the configured migrations directory}
        {--deploy : Use prisma migrate deploy instead of migrate dev}
        {--skip-generate : Skip prisma generate}
        {--skip-migrate : Skip prisma migrate command}
        {--skip-ran : Skip migration classes already tracked as applied}
        {--state-file= : Path to applied migration state file}
        {--schema= : Explicit prisma schema path}
        {--migration-name= : Name for prisma migrate dev}
    `

    protected description = 'Apply migration classes to schema.prisma and run Prisma workflow'

    /**
     * Command handler for the migrate command.
     * This method is responsible for orchestrating the migration 
     * process, including loading migration classes, applying them to 
     * the Prisma schema, and running the appropriate Prisma commands 
     * based on the provided options.
     * 
     * @returns 
     */
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

        const classes = this.option('all') || !this.argument('name')
            ? await this.loadAllMigrations(migrationsDir)
            : (await this.loadNamedMigration(migrationsDir, this.argument('name')))
                .filter(([cls]) => cls !== undefined) as [MigrationClass, string][]

        if (classes.length === 0)
            return void this.error('Error: No migration classes found to run.')

        const shouldTrackApplied = Boolean(this.option('skip-ran') || this.option('state-file'))
        const stateFilePath = resolveMigrationStateFilePath(
            process.cwd(),
            this.option('state-file') ? String(this.option('state-file')) : undefined
        )
        let appliedState = shouldTrackApplied
            ? readAppliedMigrationsState(stateFilePath)
            : undefined

        const skipped: [MigrationClass, string][] = []
        const changed: [MigrationClass, string][] = []
        const pending = classes.filter(([migrationClass, file]) => {
            if (!appliedState)
                return true

            const identity = buildMigrationIdentity(file, migrationClass.name)
            const checksum = computeMigrationChecksum(file)
            const alreadyApplied = isMigrationApplied(appliedState, identity, checksum)
            if (alreadyApplied)
                skipped.push([migrationClass, file])
            else if (findAppliedMigration(appliedState, identity))
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
            this.success('No pending migration classes to apply.')

            return
        }

        for (const [MigrationClassItem] of pending)
            await applyMigrationToPrismaSchema(MigrationClassItem, { schemaPath, write: true })

        if (appliedState) {
            for (const [migrationClass, file] of pending) {
                const identity = buildMigrationIdentity(file, migrationClass.name)
                appliedState = markMigrationApplied(appliedState, {
                    id: identity,
                    file,
                    className: migrationClass.name,
                    appliedAt: new Date().toISOString(),
                    checksum: computeMigrationChecksum(file),
                })
            }

            writeAppliedMigrationsState(stateFilePath, appliedState)
        }

        if (!this.option('skip-generate'))
            runPrismaCommand(['generate'], process.cwd())

        if (!this.option('skip-migrate')) {
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

    /**
     * Load migration classes from a specific file or by class name.
     * 
     * @param migrationsDir 
     * @param name 
     * @returns 
     */
    private async loadNamedMigration (
        migrationsDir: string,
        name?: string
    ): Promise<[MigrationClass | undefined, string][]> {
        if (!name)
            return [[undefined, '']]

        const base = name.replace(/Migration$/, '')
        const candidates = [
            `${name}.ts`, `${name}.js`, `${name}.mjs`, `${name}.cjs`,
            `${base}Migration.ts`, `${base}Migration.js`, `${base}Migration.mjs`, `${base}Migration.cjs`,
        ].map(file => join(migrationsDir, file))

        const target = candidates.find(file => existsSync(file))
        if (!target)
            return [[undefined, name]]

        const runtimeTarget = this.app.resolveRuntimeScriptPath(target)

        return (await this.loadMigrationClassesFromFile(runtimeTarget)).map(cls => [cls, runtimeTarget])
    }

    /**
     * Load migration classes from a given file path.
     * 
     * @param filePath 
     * @returns 
     */
    private async loadMigrationClassesFromFile (
        filePath: string
    ): Promise<MigrationClass[]> {
        const imported = await import(`${pathToFileURL(resolve(filePath)).href}?arkorm_migrate=${Date.now()}`)
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
