import { existsSync, readdirSync } from 'node:fs'
import { getRegisteredPaths, getRegisteredSeeders } from '../../helpers/runtime-registry'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { RuntimeModuleLoader } from '../../helpers/runtime-module-loader'
import { SEEDER_BRAND, Seeder } from '../../database/Seeder'
import { join } from 'node:path'

type SeederInstanceLike = {
    run: (...args: any[]) => Promise<void> | void
}

type SeederClass = (new () => SeederInstanceLike) & {
    [SEEDER_BRAND]?: boolean
}

/**
 * The SeedCommand class implements the CLI command for running seeder classes. 
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class SeedCommand extends Command<CliApp> {
    protected signature = `seed
        {name? : Seeder class or file name}
        {--all : Run all seeders in the configured seeders directory}
    `

    protected description = 'Run one or more seeders'

    /**
     * Command handler for the seed command.
     * 
     * @returns 
     */
    async handle () {
        this.app.command = this
        const configuredSeedersDir = this.app.getConfig('paths')?.seeders ?? join(process.cwd(), 'database', 'seeders')
        const seederDirs = this.resolveSeederDirectories(configuredSeedersDir)
        if (seederDirs.length === 0 && getRegisteredSeeders().length === 0)
            return void this.error(`ERROR: Seeders directory not found: ${this.app.formatPathForLog(configuredSeedersDir)}`)

        const classes = this.option('all')
            ? await this.loadAllSeeders(seederDirs)
            : await this.loadNamedSeeder(seederDirs, this.argument('name') ?? 'DatabaseSeeder')

        if (classes.length === 0)
            return void this.error('ERROR: No seeder classes found to run.')

        const executedSeeders: string[] = []
        for (const SeederClassItem of classes) {
            executedSeeders.push(...await Seeder.runWithReport(
                new SeederClassItem() as Seeder
            ))
        }

        this.success('Database seeding completed')
        executedSeeders.forEach(name => this.success(this.app.splitLogger('Seeded', name)))
    }

    /**
     * Load all seeder classes from the specified directory.
     * 
     * @param seedersDir 
     * @returns 
     */
    private resolveSeederDirectories (configuredSeedersDir: string): string[] {
        const configured = this.app.resolveRuntimeDirectoryPath(configuredSeedersDir)
        const registered = getRegisteredPaths('seeders') as string[]

        return [configured, ...registered.map(directory => this.app.resolveRuntimeDirectoryPath(directory))]
            .filter((directory, index, all) => existsSync(directory) && all.indexOf(directory) === index)
    }

    private async loadAllSeeders (seedersDirs: string[]): Promise<SeederClass[]> {
        const files = seedersDirs.flatMap(seedersDir => readdirSync(seedersDir)
            .filter(file => /\.(ts|js|mjs|cjs)$/i.test(file))
            .map(file => this.app.resolveRuntimeScriptPath(join(seedersDir, file))))

        const classes = await Promise.all(files.map(async file => await this.loadSeederClassesFromFile(file)))

        return [
            ...classes.flat(),
            ...getRegisteredSeeders() as SeederClass[],
        ]
    }

    /**
     * Load seeder classes from a specific file or by class name.
     * 
     * @param seedersDir 
     * @param name 
     * @returns 
     */
    private async loadNamedSeeder (
        seedersDirs: string[],
        name: string
    ): Promise<SeederClass[]> {
        const base = name.replace(/Seeder$/, '')
        const registered = getRegisteredSeeders().find(cls => cls.name === name || cls.name === `${base}Seeder`)
        if (registered)
            return [registered as SeederClass]

        const candidates = seedersDirs.flatMap(seedersDir => [
            `${name}.ts`, `${name}.js`, `${name}.mjs`, `${name}.cjs`,
            `${base}Seeder.ts`, `${base}Seeder.js`, `${base}Seeder.mjs`, `${base}Seeder.cjs`,
        ].map(file => join(seedersDir, file)))

        const target = candidates.find(file => existsSync(file))
        if (!target)
            return []

        const runtimeTarget = this.app.resolveRuntimeScriptPath(target)

        return await this.loadSeederClassesFromFile(runtimeTarget)
    }

    /**
     * Load seeder classes from a given file path.
     * 
     * @param filePath The path to the file containing seeder classes.
     * @returns An array of seeder classes.
     */
    private async loadSeederClassesFromFile (filePath: string): Promise<SeederClass[]> {
        const imported = await RuntimeModuleLoader.load<Record<string, unknown>>(filePath)
        const exports = Object.values(imported) as unknown[]

        return exports
            .filter((value): value is SeederClass => {
                if (typeof value !== 'function')
                    return false

                const candidate = value as SeederClass
                const prototype = candidate.prototype as Partial<SeederInstanceLike> | undefined

                return candidate[SEEDER_BRAND] === true
                    || typeof prototype?.run === 'function'
            })
    }
}
