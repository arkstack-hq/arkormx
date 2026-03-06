import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, relative } from 'path'

import { Command } from '@h3ravel/musket'
import { applyCreateTableOperation, findModelBlock, generateMigrationFile } from '../helpers/migrations'
import { getUserConfig } from '../helpers/runtime-config'
import { ArkormConfig, GetUserConfig } from 'src/types'
import { str } from '@h3ravel/support'

/**
 * Main application class for the Arkorm CLI.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class CliApp {
    public command!: Command
    protected config: Partial<ArkormConfig> = {}

    constructor() {
        this.config = getUserConfig()
    }

    /**
     * Get the current configuration object or a specific configuration value.
     *
     * @param key Optional specific configuration key to retrieve
     * @returns The entire configuration object or the value of the specified key
     */
    getConfig: GetUserConfig = getUserConfig

    /**
     * Utility to ensure directory exists
     *
     * @param filePath
     */
    ensureDirectory (filePath: string) {
        const dir = dirname(filePath)
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
        }
    }

    /**
     * Utility to generate file from stub
     *
     * @param stubPath
     * @param outputPath
     * @param replacements
     */
    generateFile (
        stubPath: string,
        outputPath: string,
        replacements: Record<string, string>,
        options?: any
    ): string {
        if (existsSync(outputPath) && !options?.force) {
            this.command.error(`Error: ${outputPath} already exists.`)
            process.exit(1)
        } else if (existsSync(outputPath) && options?.force) {
            rmSync(outputPath)
        }

        let content = readFileSync(stubPath, 'utf-8')
        for (const [key, value] of Object.entries(replacements)) {
            content = content.replace(new RegExp(`{{${key}}}`, 'g'), value)
        }

        this.ensureDirectory(outputPath)
        writeFileSync(outputPath, content)

        return outputPath
    }

    /**
     * Resolve a configuration path with a fallback default
     * 
     * @param key The configuration key to resolve
     * @param fallback The fallback value if the configuration key is not set
     * @returns The resolved configuration path
     */
    private resolveConfigPath (
        key: keyof Omit<ArkormConfig, 'prisma' | 'pagination'>,
        fallback: string
    ): string {
        const configured = this.getConfig(key)
        if (typeof configured === 'string' && configured.trim().length > 0)
            return configured

        return fallback
    }

    /**
     * Resolve the path to a stub file based on configuration
     * 
     * @param stubName 
     * @returns 
     */
    private resolveStubPath (stubName: string): string {
        const stubsDir = this.resolveConfigPath('stubsDir', join(process.cwd(), 'stubs'))

        return join(stubsDir, stubName)
    }

    /**
     * Generate a factory file for a given model name.
     * 
     * @param name 
     * @param options 
     * @returns 
     */
    public makeFactory (
        name: string,
        options: {
            force?: boolean
            modelName?: string
            modelImportPath?: string
        } = {}
    ): { name: string, path: string } {
        const baseName = str(name.replace(/Factory$/, '')).pascal()
        const factoryName = `${baseName}Factory`
        const modelName = options.modelName ? str(options.modelName).pascal() : baseName
        const factoriesDir = this.resolveConfigPath('factoriesDir', join(process.cwd(), 'database', 'factories'))
        const outputPath = join(factoriesDir, `${factoryName}.ts`)
        const modelPath = join(this.resolveConfigPath('modelsDir', join(process.cwd(), 'src', 'models')), `${modelName}.ts`)
        const relativeImport = options.modelImportPath
            ?? `./${relative(dirname(outputPath), modelPath).replace(/\\/g, '/').replace(/\.ts$/, '')}`
        const stubPath = this.resolveStubPath('factory.stub')

        const path = this.generateFile(stubPath, outputPath, {
            FactoryName: factoryName,
            ModelName: modelName.toString(),
            ModelImportPath: relativeImport.startsWith('.') ? relativeImport : `./${relativeImport}`,
        }, options)

        return { name: factoryName, path }
    }

    /**
     * Generate a seeder file for a given name.
     * 
     * @param name 
     * @param options 
     * @returns 
     */
    public makeSeeder (
        name: string,
        options: { force?: boolean } = {}
    ): { name: string, path: string } {
        const baseName = str(name.replace(/Seeder$/, '')).pascal()
        const seederName = `${baseName}Seeder`
        const seedersDir = this.resolveConfigPath('seedersDir', join(process.cwd(), 'database', 'seeders'))
        const outputPath = join(seedersDir, `${seederName}.ts`)
        const stubPath = this.resolveStubPath('seeder.stub')

        const path = this.generateFile(stubPath, outputPath, {
            SeederName: seederName,
        }, options)

        return { name: seederName, path }
    }

    /**
     * Generate a migration file for a given name.
     * 
     * @param name The name of the migration.
     * @returns An object containing the name and path of the generated migration file.
     */
    public makeMigration (name: string): { name: string, path: string } {
        const migrationsDir = this.resolveConfigPath('migrationsDir', join(process.cwd(), 'database', 'migrations'))
        const generated = generateMigrationFile(name, {
            directory: migrationsDir,
        })

        return {
            name: generated.className,
            path: generated.filePath,
        }
    }

    /**
     * Generate a model file along with optional factory, seeder, and migration files.
     * 
     * @param name 
     * @param options 
     * @returns 
     */
    public makeModel (
        name: string,
        options: {
            force?: boolean
            factory?: boolean
            seeder?: boolean
            migration?: boolean
            all?: boolean
        } = {}
    ): {
        model: { name: string, path: string }
        prisma: { path: string, updated: boolean }
        factory?: { name: string, path: string }
        seeder?: { name: string, path: string }
        migration?: { name: string, path: string }
    } {
        const baseName = str(name.replace(/Model$/, '')).pascal().toString()
        const modelName = `${baseName}`
        const delegateName = str(baseName).camel().plural().toString()
        const modelsDir = this.resolveConfigPath('modelsDir', join(process.cwd(), 'src', 'models'))

        const outputPath = join(modelsDir, `${modelName}.ts`)
        const shouldBuildFactory = options.all || options.factory
        const shouldBuildSeeder = options.all || options.seeder
        const shouldBuildMigration = options.all || options.migration
        const factoryName = `${baseName}Factory`
        const factoryPath = join(this.resolveConfigPath('factoriesDir', join(process.cwd(), 'database', 'factories')), `${factoryName}.ts`)

        const factoryImportPath = `./${relative(dirname(outputPath), factoryPath)
            .replace(/\\/g, '/')
            .replace(/\.ts$/, '')}`

        const stubPath = this.resolveStubPath('model.stub')

        const modelPath = this.generateFile(stubPath, outputPath, {
            ModelName: modelName,
            DelegateName: delegateName,
            FactoryImport: shouldBuildFactory
                ? `import { ${factoryName} } from '${factoryImportPath}'\n`
                : '',
            FactoryLink: shouldBuildFactory
                ? `\n    protected static override factoryClass = ${factoryName}`
                : '',
        }, options)

        const prisma = this.ensurePrismaModelEntry(modelName, delegateName)

        const created = {
            model: { name: modelName, path: modelPath },
            prisma,
            factory: undefined as { name: string, path: string } | undefined,
            seeder: undefined as { name: string, path: string } | undefined,
            migration: undefined as { name: string, path: string } | undefined,
        }

        if (shouldBuildFactory) {
            created.factory = this.makeFactory(baseName, {
                force: options.force,
                modelName,
                modelImportPath: `./${relative(dirname(factoryPath), outputPath)
                    .replace(/\\/g, '/')
                    .replace(/\.ts$/, '')}`,
            })
        }

        if (shouldBuildSeeder)
            created.seeder = this.makeSeeder(baseName, { force: options.force })

        if (shouldBuildMigration)
            created.migration = this.makeMigration(`create ${delegateName} table`)

        return created
    }

    private ensurePrismaModelEntry (
        modelName: string,
        delegateName: string
    ): { path: string, updated: boolean } {
        const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
        if (!existsSync(schemaPath))
            return { path: schemaPath, updated: false }

        const source = readFileSync(schemaPath, 'utf-8')
        const existingByTable = findModelBlock(source, delegateName)
        const existingByName = new RegExp(`model\\s+${modelName}\\s*\\{`, 'm').test(source)
        if (existingByTable || existingByName)
            return { path: schemaPath, updated: false }

        const updated = applyCreateTableOperation(source, {
            type: 'createTable',
            table: delegateName,
            columns: [
                {
                    name: 'id',
                    type: 'id',
                    primary: true,
                },
            ],
        })

        writeFileSync(schemaPath, updated)

        return { path: schemaPath, updated: true }
    }
}
