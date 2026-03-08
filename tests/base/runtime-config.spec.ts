import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    configureArkormRuntime,
    getDefaultStubsPath,
    getUserConfig,
    loadArkormConfig,
    resetArkormRuntimeForTests,
} from '../../src/helpers/runtime-config'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'

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

    temporaryDirectories.splice(0).forEach((directory) => {
        rmSync(directory, { recursive: true, force: true })
    })
})

describe('runtime config defaults', () => {
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
