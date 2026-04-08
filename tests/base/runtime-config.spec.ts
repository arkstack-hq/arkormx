import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    bindAdapterToModels,
    configureArkormRuntime,
    getDefaultStubsPath,
    getRuntimeAdapter,
    getUserConfig,
    getRuntimePrismaClient,
    loadArkormConfig,
    resetArkormRuntimeForTests,
} from '../../src/helpers/runtime-config'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { Model } from '../../src'
import type { DatabaseAdapter } from '../../src'
import { RuntimeModuleLoader } from '../../src/helpers/runtime-module-loader'

import { join } from 'node:path'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const originalCwd = process.cwd()
const temporaryDirectories: string[] = []

const makeTempDir = (prefix: string): string => {
    const directory = mkdtempSync(join(tmpdir(), prefix))
    temporaryDirectories.push(directory)

    return directory
}

beforeEach(() => {
    resetArkormRuntimeForTests()
})

afterEach(() => {
    process.chdir(originalCwd)
    resetArkormRuntimeForTests()
    delete (globalThis as { __arkormBootRan__?: number }).__arkormBootRan__

    temporaryDirectories.splice(0).forEach((directory) => {
        rmSync(directory, { recursive: true, force: true })
    })
})

describe('runtime config defaults', () => {
    it('uses a configured global adapter for models without model-specific bindings', () => {
        class RuntimeUser extends Model<'users'> {
            protected static override delegate = 'users'
        }

        const adapter = { capabilities: {} } as DatabaseAdapter

        configureArkormRuntime(() => ({}), {
            adapter,
        })

        expect(RuntimeUser.getAdapter()).toBe(adapter)
    })

    it('binds one adapter to many models centrally', () => {
        class RuntimeUser extends Model<'users'> {
            protected static override delegate = 'users'
        }

        class RuntimeArticle extends Model<'articles'> {
            protected static override delegate = 'articles'
        }

        const adapter = { capabilities: {} } as DatabaseAdapter

        bindAdapterToModels(adapter, [RuntimeUser, RuntimeArticle])

        expect(RuntimeUser.getAdapter()).toBe(adapter)
        expect(RuntimeArticle.getAdapter()).toBe(adapter)

        RuntimeUser.setAdapter(undefined)
        RuntimeArticle.setAdapter(undefined)
    })

    it('runs boot hooks during runtime configuration so adapters can be bound centrally', () => {
        class RuntimeUser extends Model<'users'> {
            protected static override delegate = 'users'
        }

        const adapter = { capabilities: {} } as DatabaseAdapter

        configureArkormRuntime(() => ({}), {
            boot: ({ bindAdapter }) => {
                bindAdapter(adapter, [RuntimeUser])
            },
        })

        expect(RuntimeUser.getAdapter()).toBe(adapter)

        RuntimeUser.setAdapter(undefined)
    })

    it('preserves default path values when only partial paths are configured at runtime', () => {
        const defaults = getUserConfig('paths') ?? {}

        configureArkormRuntime(() => ({}), {
            paths: {
                models: '/tmp/custom-models',
            },
        })

        const paths = getUserConfig('paths') ?? {}
        expect(paths.models).toBe('/tmp/custom-models')
        expect(paths.stubs).toBe(defaults.stubs)
        expect(paths.seeders).toBe(defaults.seeders)
        expect(paths.migrations).toBe(defaults.migrations)
    })

    it('keeps default stubs path when loaded user config only overrides other path keys', async () => {
        const workspace = makeTempDir('arkormx-runtime-config-')
        process.chdir(workspace)

        writeFileSync(join(workspace, 'arkormx.config.js'), [
            'export default {',
            '  prisma: () => ({}),',
            '  paths: {',
            '    migrations: "database/custom-migrations",',
            '  },',
            '}',
            '',
        ].join('\n'))

        await loadArkormConfig()

        const paths = getUserConfig('paths') ?? {}
        expect(paths.migrations).toBe(resolve(process.cwd(), 'database', 'custom-migrations'))
        expect(paths.stubs).toBe(getDefaultStubsPath())
    })

    it.each([
        ['arkormx.config.cjs', [
            'module.exports = {',
            '  adapter: { capabilities: {}, source: "cjs" },',
            '}',
            '',
        ].join('\n')],
        ['arkormx.config.js', [
            'export default {',
            '  adapter: { capabilities: {}, source: "js" },',
            '}',
            '',
        ].join('\n')],
        ['arkormx.config.ts', [
            'export default {',
            '  adapter: { capabilities: {}, source: "ts" },',
            '}',
            '',
        ].join('\n')],
    ])('loads %s through RuntimeModuleLoader for sync and async access', async (fileName, contents) => {
        const workspace = makeTempDir('arkormx-runtime-config-loader-')
        process.chdir(workspace)

        writeFileSync(join(workspace, fileName), contents)

        expect(getRuntimeAdapter()).toEqual({ capabilities: {}, source: fileName.split('.').at(-1) })

        resetArkormRuntimeForTests()
        await loadArkormConfig()

        expect(getUserConfig('adapter')).toEqual({ capabilities: {}, source: fileName.split('.').at(-1) })
    })

    it.each([
        ['arkormx.config.mjs', 'mjs'],
        ['arkormx.config.cts', 'cts'],
        ['arkormx.config.mts', 'mts'],
    ])('supports additional config module variants: %s', async (fileName, source) => {
        const workspace = makeTempDir('arkormx-runtime-config-variants-')
        process.chdir(workspace)

        writeFileSync(join(workspace, fileName), [
            'export default {',
            `  adapter: { capabilities: {}, source: "${source}" },`,
            '  prisma: () => ({ label: "client" }),',
            '}',
            '',
        ].join('\n'))

        expect(getRuntimeAdapter()).toEqual({ capabilities: {}, source })
        expect(getRuntimePrismaClient()).toEqual({ label: 'client' })
    })

    it('runs boot hooks when loading config files', async () => {
        const workspace = makeTempDir('arkormx-runtime-config-boot-')
        process.chdir(workspace)

        writeFileSync(join(workspace, 'arkormx.config.js'), [
            'export default {',
            '  prisma: () => ({}),',
            '  adapter: { capabilities: {} },',
            '  boot: () => {',
            '    globalThis.__arkormBootRan__ = (globalThis.__arkormBootRan__ ?? 0) + 1',
            '  },',
            '}',
            '',
        ].join('\n'))

        expect(getRuntimeAdapter()).toEqual({ capabilities: {} })
        expect((globalThis as { __arkormBootRan__?: number }).__arkormBootRan__).toBe(1)
        expect(getUserConfig('adapter')).toEqual({ capabilities: {} })
    })

    it('loads adapter-only config files without Prisma', async () => {
        const workspace = makeTempDir('arkormx-runtime-config-adapter-only-')
        process.chdir(workspace)

        writeFileSync(join(workspace, 'arkormx.config.js'), [
            'export default {',
            '  adapter: { capabilities: {} },',
            '  paths: {',
            '    models: "src/domain/models",',
            '  },',
            '}',
            '',
        ].join('\n'))

        expect(getRuntimeAdapter()).toEqual({ capabilities: {} })
        expect(getUserConfig('adapter')).toEqual({ capabilities: {} })
        expect(getUserConfig('prisma')).toBeUndefined()
        expect(getUserConfig('paths')?.models).toBe(resolve(process.cwd(), 'src', 'domain', 'models'))
    })

    it('applies the configured global adapter to models loaded from the configured models path', async () => {
        const workspace = makeTempDir('arkormx-runtime-config-discovered-models-')
        const modelsDirectory = join(workspace, 'src', 'models')

        mkdirSync(modelsDirectory, { recursive: true })
        process.chdir(workspace)

        writeFileSync(join(workspace, 'arkormx.config.js'), [
            'export default {',
            '  adapter: { capabilities: {} },',
            '  paths: {',
            '    models: "./src/models",',
            '  },',
            '}',
            '',
        ].join('\n'))

        writeFileSync(join(modelsDirectory, 'User.ts'), [
            'export const createUserModel = (ModelBase) => class User extends ModelBase {}',
            '',
        ].join('\n'))

        await loadArkormConfig()

        const imported = await RuntimeModuleLoader.load<{ createUserModel: (ModelBase: typeof Model) => typeof Model }>(join(modelsDirectory, 'User.ts'))
        const User = imported.createUserModel(Model)

        expect(getUserConfig('paths')?.models).toBe(resolve(process.cwd(), 'src', 'models'))
        expect(User.getAdapter()).toBe(getUserConfig('adapter'))
    })

    it('applies the configured global adapter to models defined outside the configured models path', async () => {
        const workspace = makeTempDir('arkormx-runtime-config-external-models-')
        process.chdir(workspace)

        writeFileSync(join(workspace, 'arkormx.config.js'), [
            'export default {',
            '  adapter: { capabilities: {} },',
            '  paths: {',
            '    models: "./src/models",',
            '  },',
            '}',
            '',
        ].join('\n'))

        await loadArkormConfig()

        class ExternalUser extends Model { }

        expect(getUserConfig('paths')?.models).toBe(resolve(process.cwd(), 'src', 'models'))
        expect(ExternalUser.getAdapter()).toBe(getUserConfig('adapter'))
    })

    it('rewrites relative runtime path overrides to absolute paths', () => {
        const workspace = makeTempDir('arkormx-runtime-config-abs-')
        process.chdir(workspace)

        configureArkormRuntime(() => ({}), {
            paths: {
                migrations: './database/migrations',
                buildOutput: './dist',
            },
        })

        const paths = getUserConfig('paths') ?? {}
        expect(paths.migrations).toBe(resolve(process.cwd(), 'database', 'migrations'))
        expect(paths.buildOutput).toBe(resolve(process.cwd(), 'dist'))
    })
})
