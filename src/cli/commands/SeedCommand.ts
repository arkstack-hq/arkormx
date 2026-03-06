import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { Seeder } from '../../database/Seeder'

type SeederClass = new () => Seeder

export class SeedCommand extends Command<CliApp> {
    protected signature = `seed
        {name? : Seeder class or file name}
        {--all : Run all seeders in the configured seeders directory}
    `

    protected description = 'Run one or more seeders'

    async handle () {
        this.app.command = this
        const seedersDir = this.app.getConfig('seedersDir') ?? join(process.cwd(), 'database', 'seeders')
        if (!existsSync(seedersDir))
            return void this.error(`Error: Seeders directory not found: ${seedersDir}`)

        const classes = this.option('all')
            ? await this.loadAllSeeders(seedersDir)
            : await this.loadNamedSeeder(seedersDir, this.argument('name') ?? 'DatabaseSeeder')

        if (classes.length === 0)
            return void this.error('Error: No seeder classes found to run.')

        for (const SeederClassItem of classes)
            await new SeederClassItem().run()

        this.success(`Ran ${classes.length} seeder(s).`)
    }

    private async loadAllSeeders (seedersDir: string): Promise<SeederClass[]> {
        const files = readdirSync(seedersDir)
            .filter(file => /\.(ts|js|mjs|cjs)$/i.test(file))
            .map(file => join(seedersDir, file))

        const classes = await Promise.all(files.map(async file => await this.loadSeederClassesFromFile(file)))

        return classes.flat()
    }

    private async loadNamedSeeder (seedersDir: string, name: string): Promise<SeederClass[]> {
        const base = name.replace(/Seeder$/, '')
        const candidates = [
            `${name}.ts`, `${name}.js`, `${name}.mjs`, `${name}.cjs`,
            `${base}Seeder.ts`, `${base}Seeder.js`, `${base}Seeder.mjs`, `${base}Seeder.cjs`,
        ].map(file => join(seedersDir, file))

        const target = candidates.find(file => existsSync(file))
        if (!target)
            return []

        return await this.loadSeederClassesFromFile(target)
    }

    private async loadSeederClassesFromFile (filePath: string): Promise<SeederClass[]> {
        const imported = await import(`${pathToFileURL(resolve(filePath)).href}?arkorm_seed=${Date.now()}`)
        const exports = Object.values(imported) as unknown[]

        return exports
            .filter((value): value is SeederClass => {
                if (typeof value !== 'function')
                    return false

                const candidate = value as SeederClass

                return candidate.prototype instanceof Seeder
            })
    }
}
