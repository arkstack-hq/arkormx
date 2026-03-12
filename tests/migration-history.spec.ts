import { afterEach, describe, expect, it } from 'vitest'
import { buildMigrationIdentity, computeMigrationChecksum, isMigrationApplied, markMigrationApplied, readAppliedMigrationsState, resolveMigrationStateFilePath, writeAppliedMigrationsState } from '../src/helpers/migration-history'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'

import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('migration history helpers', () => {
    const tempDirectories: string[] = []

    const createTempDirectory = (): string => {
        const directory = mkdtempSync(join(tmpdir(), 'arkormx-migration-history-'))
        tempDirectories.push(directory)

        return directory
    }

    afterEach(() => {
        while (tempDirectories.length > 0) {
            const directory = tempDirectories.pop()
            if (directory)
                rmSync(directory, { recursive: true, force: true })
        }
    })

    it('resolves default and custom state file paths', () => {
        const cwd = '/tmp/project'

        expect(resolveMigrationStateFilePath(cwd)).toBe('/tmp/project/.arkormx/migrations.applied.json')
        expect(resolveMigrationStateFilePath(cwd, './database/custom-state.json')).toContain('/database/custom-state.json')
    })

    it('builds stable migration identity from file and class', () => {
        const identity = buildMigrationIdentity('/workspace/database/migrations/20260312102000_create_users.ts', 'CreateUsersMigration')

        expect(identity).toBe('20260312102000_create_users:CreateUsersMigration')
    })

    it('writes and reads migration state', () => {
        const directory = createTempDirectory()
        const stateFile = join(directory, '.arkormx', 'migrations.applied.json')

        const initial = readAppliedMigrationsState(stateFile)
        expect(initial.migrations).toEqual([])

        const updated = markMigrationApplied(initial, {
            id: 'abc:MigrationOne',
            file: '/tmp/abc.ts',
            className: 'MigrationOne',
            appliedAt: '2026-03-12T00:00:00.000Z',
            checksum: 'hash-one',
        })

        writeAppliedMigrationsState(stateFile, updated)
        const reread = readAppliedMigrationsState(stateFile)

        expect(reread.migrations.length).toBe(1)
        expect(isMigrationApplied(reread, 'abc:MigrationOne')).toBe(true)
        expect(isMigrationApplied(reread, 'abc:MigrationOne', 'hash-one')).toBe(true)
        expect(isMigrationApplied(reread, 'abc:MigrationOne', 'hash-two')).toBe(false)
    })

    it('falls back to default state when file is malformed', () => {
        const directory = createTempDirectory()
        const stateFile = join(directory, '.arkormx', 'migrations.applied.json')
        mkdirSync(join(directory, '.arkormx'), { recursive: true })

        writeFileSync(stateFile, '{ malformed json')

        const state = readAppliedMigrationsState(stateFile)
        expect(state.migrations).toEqual([])
    })

    it('computes deterministic migration checksum from file content', () => {
        const directory = createTempDirectory()
        const migrationPath = join(directory, 'Migration.ts')
        writeFileSync(migrationPath, 'export class Migration {}\n')

        const first = computeMigrationChecksum(migrationPath)
        const second = computeMigrationChecksum(migrationPath)

        expect(first).toBe(second)
        expect(first.length).toBeGreaterThan(10)
    })
})
