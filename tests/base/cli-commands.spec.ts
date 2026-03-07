import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
    CliApp,
    configureArkormRuntime,
    resetArkormRuntimeForTests,
} from '../../src'
import { InitCommand } from '../../src/cli/commands/InitCommand'
import { MakeFactoryCommand } from '../../src/cli/commands/MakeFactoryCommand'
import { MakeMigrationCommand } from '../../src/cli/commands/MakeMigrationCommand'
import { MakeModelCommand } from '../../src/cli/commands/MakeModelCommand'
import { MakeSeederCommand } from '../../src/cli/commands/MakeSeederCommand'
import { MigrateCommand } from '../../src/cli/commands/MigrateCommand'
import { ModelsSyncCommand } from '../../src/cli/commands/ModelsSyncCommand'
import { SeedCommand } from '../../src/cli/commands/SeedCommand'
import { Kernel } from '@h3ravel/musket'

const originalCwd = process.cwd()
const tempDirectories: string[] = []

const makeTempDir = (prefix: string): string => {
    const directory = mkdtempSync(join(tmpdir(), prefix))
    tempDirectories.push(directory)

    return directory
}

const attachCommandIo = (
    command: {
        option: (name: string) => unknown
        options: () => Record<string, unknown>
        argument: (name: string) => unknown
        success: (line: string) => void
        error: (line: string) => void
    },
    options: Record<string, unknown> = {},
    argumentsMap: Record<string, unknown> = {}
) => {
    const successLines: string[] = []
    const errorLines: string[] = []

    command.option = (name: string) => options[name]
    command.options = () => options
    command.argument = (name: string) => argumentsMap[name]
    command.success = (line: string) => {
        successLines.push(line)
    }
    command.error = (line: string) => {
        errorLines.push(line)
    }

    return { successLines, errorLines }
}

const writeBaseSchema = (workspace: string): string => {
    const schemaPath = join(workspace, 'prisma', 'schema.prisma')
    mkdirSync(join(workspace, 'prisma'), { recursive: true })
    writeFileSync(schemaPath, [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "postgresql"',
        '  url = env("DATABASE_URL")',
        '}',
        '',
    ].join('\n'))

    return schemaPath
}

afterEach(() => {
    process.chdir(originalCwd)
    delete (globalThis as { __seedRuns?: number }).__seedRuns
    resetArkormRuntimeForTests()

    tempDirectories.splice(0).forEach((directory) => {
        rmSync(directory, { recursive: true, force: true })
    })
})

describe('CLI command classes', () => {
    it('MakeFactoryCommand creates a factory file', async () => {
        const workspace = makeTempDir('arkormx-cmd-make-factory-')
        process.chdir(workspace)

        configureArkormRuntime(() => ({}), {
            outputExt: 'js',
            paths: {
                stubs: join(originalCwd, 'stubs'),
                factories: join(workspace, 'database', 'factories'),
                models: join(workspace, 'src', 'models'),
            },
        })

        const app = new CliApp()
        const command = new MakeFactoryCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {}, {
            name: 'User',
        })

        await command.handle()

        const outputPath = join(workspace, 'database', 'factories', 'UserFactory.js')
        expect(existsSync(outputPath)).toBe(true)
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Created factory:'))).toBe(true)
    })

    it('MakeSeederCommand creates a seeder file', async () => {
        const workspace = makeTempDir('arkormx-cmd-make-seeder-')
        process.chdir(workspace)

        configureArkormRuntime(() => ({}), {
            outputExt: 'js',
            paths: {
                stubs: join(originalCwd, 'stubs'),
                seeders: join(workspace, 'database', 'seeders'),
            },
        })

        const app = new CliApp()
        const command = new MakeSeederCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {}, {
            name: 'Database',
        })

        await command.handle()

        const outputPath = join(workspace, 'database', 'seeders', 'DatabaseSeeder.js')
        expect(existsSync(outputPath)).toBe(true)
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Created seeder:'))).toBe(true)
    })

    it('MakeMigrationCommand creates a migration file', async () => {
        const workspace = makeTempDir('arkormx-cmd-make-migration-')
        process.chdir(workspace)

        configureArkormRuntime(() => ({}), {
            outputExt: 'js',
            paths: {
                migrations: join(workspace, 'database', 'migrations'),
            },
        })

        const app = new CliApp()
        const command = new MakeMigrationCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {}, {
            name: 'create users table',
        })

        await command.handle()

        const migrationsDirectory = join(workspace, 'database', 'migrations')
        const generatedMigrationFile = readdirSync(migrationsDirectory).find(file => file.endsWith('.js'))
        expect(generatedMigrationFile).toBeTruthy()

        const generatedFileSource = readFileSync(join(migrationsDirectory, generatedMigrationFile as string), 'utf-8')
        expect(generatedFileSource).toContain('extends Migration')
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Created migration:'))).toBe(true)
    })

    it('MakeModelCommand creates model and optional linked files', async () => {
        const workspace = makeTempDir('arkormx-cmd-make-model-')
        process.chdir(workspace)

        writeBaseSchema(workspace)

        configureArkormRuntime(() => ({}), {
            outputExt: 'js',
            paths: {
                stubs: join(originalCwd, 'stubs'),
                models: join(workspace, 'src', 'models'),
                factories: join(workspace, 'database', 'factories'),
                seeders: join(workspace, 'database', 'seeders'),
                migrations: join(workspace, 'database', 'migrations'),
            },
        })

        const app = new CliApp()
        const command = new MakeModelCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {
            all: true,
        }, {
            name: 'User',
        })

        await command.handle()

        expect(existsSync(join(workspace, 'src', 'models', 'User.js'))).toBe(true)
        expect(existsSync(join(workspace, 'database', 'factories', 'UserFactory.js'))).toBe(true)
        expect(existsSync(join(workspace, 'database', 'seeders', 'UserSeeder.js'))).toBe(true)

        const schemaSource = readFileSync(join(workspace, 'prisma', 'schema.prisma'), 'utf-8')
        expect(schemaSource).toContain('model User')
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Created files:'))).toBe(true)
        expect(successLines.some(line => line.includes('Model'))).toBe(true)
    })

    it('InitCommand creates arkormx.config.js from configured stub path', async () => {
        const workspace = makeTempDir('arkormx-cmd-init-')
        process.chdir(workspace)

        const stubsDir = join(workspace, 'stubs')
        mkdirSync(stubsDir, { recursive: true })
        writeFileSync(join(stubsDir, 'arkormx.config.stub'), 'export default {}\n')

        configureArkormRuntime(() => ({}), {
            paths: {
                stubs: stubsDir,
            },
        })

        const app = new CliApp()
        const command = new InitCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any)

        await command.handle()

        const generatedConfig = join(workspace, 'arkormx.config.js')
        expect(existsSync(generatedConfig)).toBe(true)
        expect(readFileSync(generatedConfig, 'utf-8')).toBe('export default {}\n')
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Arkormˣ initialized successfully'))).toBe(true)
    })

    it('ModelsSyncCommand reports sync summary and updates model declarations', async () => {
        const workspace = makeTempDir('arkormx-cmd-models-sync-')
        process.chdir(workspace)

        const schemaPath = writeBaseSchema(workspace)
        const modelsDir = join(workspace, 'src', 'models')
        mkdirSync(modelsDir, { recursive: true })

        writeFileSync(schemaPath, readFileSync(schemaPath, 'utf-8') + [
            'model User {',
            '  id Int @id @default(autoincrement())',
            '  email String @unique',
            '  isActive Boolean',
            '  @@map("users")',
            '}',
            '',
        ].join('\n'))

        const userModelPath = join(modelsDir, 'User.ts')
        writeFileSync(userModelPath, [
            'import { Model } from \'arkormx\'',
            '',
            'export class User extends Model<\'users\'> {',
            '    protected static override delegate = \'users\'',
            '}',
            '',
        ].join('\n'))

        const app = new CliApp()
        const command = new ModelsSyncCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {
            schema: schemaPath,
            models: modelsDir,
        })

        await command.handle()

        const updatedSource = readFileSync(userModelPath, 'utf-8')
        expect(updatedSource).toContain('declare id: number')
        expect(updatedSource).toContain('declare email: string')
        expect(updatedSource).toContain('declare isActive: boolean')
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('SUCCESS: Model sync completed'))).toBe(true)
        expect(successLines.some(line => line.includes('Processed'))).toBe(true)
    })

    it('SeedCommand loads and runs all seeder classes from configured directory', async () => {
        const workspace = makeTempDir('arkormx-cmd-seed-')
        process.chdir(workspace)

        const seedersDir = join(workspace, 'database', 'seeders')
        mkdirSync(seedersDir, { recursive: true })

        const seederBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Seeder.ts`
        writeFileSync(join(seedersDir, 'UserSeeder.mjs'), [
            `import { Seeder } from '${seederBaseImport}'`,
            '',
            'export class UserSeeder extends Seeder {',
            '  async run () {',
            '    globalThis.__seedRuns = (globalThis.__seedRuns ?? 0) + 1',
            '  }',
            '}',
            '',
        ].join('\n'))

        configureArkormRuntime(() => ({}), {
            paths: {
                seeders: seedersDir,
            },
        })

        const app = new CliApp()
        const command = new SeedCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {
            all: true,
        })

        await command.handle()

        expect((globalThis as { __seedRuns?: number }).__seedRuns).toBe(1)
        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Database seeding completed'))).toBe(true)
        expect(successLines.some(line => line.includes('Seeded'))).toBe(true)
    })

    it('MigrateCommand loads migrations and applies schema updates when prisma steps are skipped', async () => {
        const workspace = makeTempDir('arkormx-cmd-migrate-')
        process.chdir(workspace)

        const schemaPath = writeBaseSchema(workspace)
        const migrationsDir = join(workspace, 'database', 'migrations')
        mkdirSync(migrationsDir, { recursive: true })

        const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
        writeFileSync(join(migrationsDir, 'CreateUsersMigration.mjs'), [
            `import { Migration } from '${migrationBaseImport}'`,
            '',
            'export class CreateUsersMigration extends Migration {',
            '  async up () {',
            '  }',
            '',
            '  async down () {',
            '  }',
            '}',
            '',
        ].join('\n'))

        configureArkormRuntime(() => ({}), {
            paths: {
                migrations: migrationsDir,
            },
        })

        const app = new CliApp()
        const command = new MigrateCommand(app, new Kernel(app))
            ; (command as unknown as { app: CliApp }).app = app
        const { successLines, errorLines } = attachCommandIo(command as unknown as any, {
            all: true,
            'skip-generate': true,
            'skip-migrate': true,
            schema: schemaPath,
        })

        await command.handle()

        expect(errorLines).toHaveLength(0)
        expect(successLines.some(line => line.includes('Applied 1 migration(s).'))).toBe(true)
        expect(successLines.some(line => line.includes('Migrated'))).toBe(true)
    })
})
