import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { Migration } from '../../database/Migration'
import { applyMigrationToPrismaSchema, runPrismaCommand } from '../../helpers/migrations'

type MigrationClass = new () => Migration

export class MigrateCommand extends Command<CliApp> {
    protected signature = `migrate
        {name? : Migration class or file name}
        {--all : Run all migrations from the configured migrations directory}
        {--deploy : Use prisma migrate deploy instead of migrate dev}
        {--skip-generate : Skip prisma generate}
        {--skip-migrate : Skip prisma migrate command}
        {--schema= : Explicit prisma schema path}
        {--migration-name= : Name for prisma migrate dev}
    `

    protected description = 'Apply migration classes to schema.prisma and run Prisma workflow'

    async handle () {
        this.app.command = this
        const migrationsDir = this.app.getConfig('migrationsDir') ?? join(process.cwd(), 'database', 'migrations')
        if (!existsSync(migrationsDir))
            return void this.error(`Error: Migrations directory not found: ${migrationsDir}`)

        const schemaPath = this.option('schema')
            ? resolve(String(this.option('schema')))
            : join(process.cwd(), 'prisma', 'schema.prisma')

        const classes = this.option('all')
            ? await this.loadAllMigrations(migrationsDir)
            : await this.loadNamedMigration(migrationsDir, this.argument('name'))

        if (classes.length === 0)
            return void this.error('Error: No migration classes found to run.')

        for (const MigrationClassItem of classes)
            await applyMigrationToPrismaSchema(MigrationClassItem, { schemaPath, write: true })

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

        this.success(`Applied ${classes.length} migration(s).`)
    }

    private async loadAllMigrations (migrationsDir: string): Promise<MigrationClass[]> {
        const files = readdirSync(migrationsDir)
            .filter(file => /\.(ts|js|mjs|cjs)$/i.test(file))
            .sort((left, right) => left.localeCompare(right))
            .map(file => join(migrationsDir, file))

        const classes = await Promise.all(files.map(async file => await this.loadMigrationClassesFromFile(file)))

        return classes.flat()
    }

    private async loadNamedMigration (migrationsDir: string, name?: string): Promise<MigrationClass[]> {
        if (!name)
            return []

        const base = name.replace(/Migration$/, '')
        const candidates = [
            `${name}.ts`, `${name}.js`, `${name}.mjs`, `${name}.cjs`,
            `${base}Migration.ts`, `${base}Migration.js`, `${base}Migration.mjs`, `${base}Migration.cjs`,
        ].map(file => join(migrationsDir, file))

        const target = candidates.find(file => existsSync(file))
        if (!target)
            return []

        return await this.loadMigrationClassesFromFile(target)
    }

    private async loadMigrationClassesFromFile (filePath: string): Promise<MigrationClass[]> {
        const imported = await import(`${pathToFileURL(resolve(filePath)).href}?arkorm_migrate=${Date.now()}`)
        const exports = Object.values(imported) as unknown[]

        return exports
            .filter((value): value is MigrationClass => {
                if (typeof value !== 'function')
                    return false

                const candidate = value as MigrationClass

                return candidate.prototype instanceof Migration
            })
    }
}
