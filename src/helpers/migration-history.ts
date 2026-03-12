import { AppliedMigrationEntry, AppliedMigrationsState } from 'src/types'
import { dirname, extname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { createHash } from 'node:crypto'

const DEFAULT_STATE: AppliedMigrationsState = {
    version: 1,
    migrations: [],
}

export const resolveMigrationStateFilePath = (
    cwd: string,
    configuredPath?: string
): string => {
    if (configuredPath && configuredPath.trim().length > 0)
        return resolve(configuredPath)

    return join(cwd, '.arkormx', 'migrations.applied.json')
}

export const buildMigrationIdentity = (
    filePath: string,
    className: string
): string => {
    const fileName = filePath.split('/').pop()?.split('\\').pop() ?? filePath
    const baseName = fileName.slice(0, fileName.length - extname(fileName).length)

    return `${baseName}:${className}`
}

export const computeMigrationChecksum = (
    filePath: string
): string => {
    const source = readFileSync(filePath, 'utf-8')

    return createHash('sha256').update(source).digest('hex')
}

export const readAppliedMigrationsState = (
    stateFilePath: string
): AppliedMigrationsState => {
    if (!existsSync(stateFilePath))
        return { ...DEFAULT_STATE }

    try {
        const parsed = JSON.parse(readFileSync(stateFilePath, 'utf-8')) as Partial<AppliedMigrationsState>
        if (!Array.isArray(parsed.migrations))
            return { ...DEFAULT_STATE }

        return {
            version: 1,
            migrations: parsed.migrations
                .filter((migration): migration is AppliedMigrationEntry => {
                    return typeof migration?.id === 'string'
                        && typeof migration?.file === 'string'
                        && typeof migration?.className === 'string'
                        && typeof migration?.appliedAt === 'string'
                        && (migration?.checksum === undefined || typeof migration?.checksum === 'string')
                }),
        }
    } catch {
        return { ...DEFAULT_STATE }
    }
}

export const writeAppliedMigrationsState = (
    stateFilePath: string,
    state: AppliedMigrationsState
): void => {
    const directory = dirname(stateFilePath)
    if (!existsSync(directory))
        mkdirSync(directory, { recursive: true })

    writeFileSync(stateFilePath, JSON.stringify(state, null, 2))
}

export const isMigrationApplied = (
    state: AppliedMigrationsState,
    identity: string,
    checksum?: string
): boolean => {
    const matched = state.migrations.find(migration => migration.id === identity)
    if (!matched)
        return false

    if (checksum && matched.checksum)
        return matched.checksum === checksum

    if (checksum && !matched.checksum)
        return false

    return true
}

export const findAppliedMigration = (
    state: AppliedMigrationsState,
    identity: string
): AppliedMigrationEntry | undefined => {
    return state.migrations.find(migration => migration.id === identity)
}

export const markMigrationApplied = (
    state: AppliedMigrationsState,
    entry: AppliedMigrationEntry
): AppliedMigrationsState => {
    const next = state.migrations.filter(migration => migration.id !== entry.id)
    next.push(entry)

    return {
        version: 1,
        migrations: next,
    }
}