import { AppliedMigrationEntry, AppliedMigrationRun, AppliedMigrationsState } from 'src/types'
import { dirname, extname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { createHash } from 'node:crypto'

const DEFAULT_STATE: AppliedMigrationsState = {
    version: 1,
    migrations: [],
    runs: [],
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
            runs: Array.isArray(parsed.runs)
                ? parsed.runs.filter((run): run is AppliedMigrationRun => {
                    return typeof run?.id === 'string'
                        && typeof run?.appliedAt === 'string'
                        && Array.isArray(run?.migrationIds)
                        && run.migrationIds.every(item => typeof item === 'string')
                })
                : [],
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
        runs: state.runs ?? [],
    }
}

export const removeAppliedMigration = (
    state: AppliedMigrationsState,
    identity: string
): AppliedMigrationsState => {
    const remainingMigrations = state.migrations.filter(migration => migration.id !== identity)
    const remainingRuns = (state.runs ?? [])
        .map(run => ({
            ...run,
            migrationIds: run.migrationIds.filter(id => id !== identity),
        }))
        .filter(run => run.migrationIds.length > 0)

    return {
        version: 1,
        migrations: remainingMigrations,
        runs: remainingRuns,
    }
}

export const buildMigrationRunId = (): string => {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export const markMigrationRun = (
    state: AppliedMigrationsState,
    run: AppliedMigrationRun
): AppliedMigrationsState => {
    const nextRuns = (state.runs ?? [])
        .filter(existing => existing.id !== run.id)
    nextRuns.push(run)

    return {
        version: 1,
        migrations: state.migrations,
        runs: nextRuns,
    }
}

export const getLastMigrationRun = (
    state: AppliedMigrationsState
): AppliedMigrationRun | undefined => {
    const runs = state.runs ?? []
    if (runs.length === 0)
        return undefined

    return [...runs].sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))[0]
}

export const getLatestAppliedMigrations = (
    state: AppliedMigrationsState,
    steps: number
): AppliedMigrationEntry[] => {
    return [...state.migrations]
        .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
        .slice(0, Math.max(0, steps))
}