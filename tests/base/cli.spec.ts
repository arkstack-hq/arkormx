import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { CliApp } from '../../src'
import type { ArkormConfig } from '../../src/types'

const originalCwd = process.cwd()
const tempDirectories: string[] = []

const makeTempDir = (prefix: string): string => {
    const directory = mkdtempSync(join(tmpdir(), prefix))
    tempDirectories.push(directory)

    return directory
}

const createCliApp = (config: Partial<ArkormConfig>): CliApp => {
    const app = new CliApp();

    (app as unknown as { getConfig: (key?: keyof ArkormConfig) => unknown }).getConfig =
        <K extends keyof ArkormConfig> (key?: K): Partial<ArkormConfig>[K] | Partial<ArkormConfig> => {
            if (!key)
                return config

            return config[key]
        }

    return app
}

const writePrismaSchema = (workspace: string) => {
    const schemaPath = join(workspace, 'prisma', 'schema.prisma')
    mkdirSync(join(workspace, 'prisma'), { recursive: true })
    writeFileSync(schemaPath, [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "postgresql"',
        '}',
        '',
    ].join('\n'))

    return schemaPath
}

afterEach(() => {
    process.chdir(originalCwd)

    tempDirectories.splice(0).forEach((directory) => {
        rmSync(directory, { recursive: true, force: true })
    })
})

describe('CLI application', () => {
    it('generates model, factory, seeder and migration files with TS output by default', () => {
        const tempWorkspace = makeTempDir('arkormx-cli-ts-')
        writePrismaSchema(tempWorkspace)
        process.chdir(tempWorkspace)
        const workspace = process.cwd()

        const app = createCliApp({
            outputExt: 'ts',
            paths: {
                stubs: join(originalCwd, 'stubs'),
                models: join(workspace, 'src', 'models'),
                factories: join(workspace, 'database', 'factories'),
                seeders: join(workspace, 'database', 'seeders'),
                migrations: join(workspace, 'database', 'migrations'),
            },
        })
            ; (app as unknown as { hasTypeScriptInstalled: () => boolean }).hasTypeScriptInstalled = () => true

        const created = app.makeModel('User', { all: true })

        expect(existsSync(created.model.path)).toBe(true)
        expect(existsSync(created.factory!.path)).toBe(true)
        expect(existsSync(created.seeder!.path)).toBe(true)
        expect(existsSync(created.migration!.path)).toBe(true)

        const modelSource = readFileSync(created.model.path, 'utf-8')
        expect(modelSource).toContain('import { UserFactory } from')
        expect(modelSource).toContain('/database/factories/UserFactory')
        expect(modelSource).toContain('protected static override factoryClass = UserFactory')

        const schemaSource = readFileSync(join(workspace, 'prisma', 'schema.prisma'), 'utf-8')
        expect(schemaSource).toContain('model User')
        expect(schemaSource).toContain('@@map("users")')
    })

    it('falls back to JS file generation when TypeScript is not installed in current cwd', () => {
        const tempWorkspace = makeTempDir('arkormx-cli-js-fallback-')
        process.chdir(tempWorkspace)
        const workspace = process.cwd()

        const app = createCliApp({
            outputExt: 'ts',
            paths: {
                stubs: join(originalCwd, 'stubs'),
                factories: join(workspace, 'database', 'factories'),
                seeders: join(workspace, 'database', 'seeders'),
                migrations: join(workspace, 'database', 'migrations'),
            },
        });
        (app as unknown as { hasTypeScriptInstalled: () => boolean }).hasTypeScriptInstalled = () => false

        const factory = app.makeFactory('User')
        const seeder = app.makeSeeder('Database')
        const migration = app.makeMigration('create users table')

        expect(factory.path.endsWith('.js')).toBe(true)
        expect(seeder.path.endsWith('.js')).toBe(true)
        expect(migration.path.endsWith('.js')).toBe(true)

        const factorySource = readFileSync(factory.path, 'utf-8')
        const seederSource = readFileSync(seeder.path, 'utf-8')
        const migrationSource = readFileSync(migration.path, 'utf-8')

        expect(factorySource).toContain('@returns {Record<string, unknown>}')
        expect(seederSource).toContain('@returns {Promise<void>}')
        expect(migrationSource).toContain('import { Migration } from \'arkormx\'')
        expect(migrationSource).toContain('@param {import(\'arkormx\').SchemaBuilder} schema')
    })

    it('resolves TS runtime script path to built JS output path', () => {
        const tempWorkspace = makeTempDir('arkormx-cli-runtime-path-')
        process.chdir(tempWorkspace)
        const workspace = process.cwd()

        const outputFile = join(workspace, 'dist', 'database', 'migrations', 'CreateUsersMigration.js')
        mkdirSync(join(workspace, 'dist', 'database', 'migrations'), { recursive: true })
        writeFileSync(outputFile, 'export default class CreateUsersMigration {}')

        const app = createCliApp({
            paths: {
                buildOutput: 'dist',
            },
        })

        const sourceFile = join(process.cwd(), 'database', 'migrations', 'CreateUsersMigration.ts')
        const resolved = app.resolveRuntimeScriptPath(sourceFile)

        expect([
            outputFile,
            sourceFile,
            'dist/database/migrations/CreateUsersMigration.js',
        ]).toContain(resolved)
    })

    it('syncs model declarations from prisma schema', () => {
        const tempWorkspace = makeTempDir('arkormx-cli-model-sync-')
        process.chdir(tempWorkspace)
        const workspace = process.cwd()
        const schemaPath = writePrismaSchema(workspace)
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

        const modelPath = join(modelsDir, 'User.ts')
        writeFileSync(modelPath, [
            'import { Model } from \'arkormx\'',
            '',
            'export class User extends Model<\'users\'> {',
            '    protected static override delegate = \'users\'',
            '}',
            '',
        ].join('\n'))

        const app = createCliApp({
            paths: {
                models: modelsDir,
            },
        })

        const result = app.syncModelsFromPrisma({ schemaPath, modelsDir })

        expect(result.total).toBe(1)
        expect(result.updated).toEqual([modelPath])

        const updatedSource = readFileSync(modelPath, 'utf-8')
        expect(updatedSource).toContain('declare id: number')
        expect(updatedSource).toContain('declare email: string')
        expect(updatedSource).toContain('declare isActive: boolean')
    })
})
