import type { AppliedMigrationsState, MigrationClass, PrimaryKeyGeneration, SchemaColumn, SchemaOperation, TimestampColumnBehavior } from '../types'
import type { ArkormConfig } from '../types/core'

import { ArkormException } from '../Exceptions/ArkormException'
import { buildMigrationIdentity } from './migration-history'
import { dirname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { getMigrationPlan } from './migrations'

export interface PersistedMetadataFeatures {
    persistedColumnMappings: boolean
    persistedEnums: boolean
}

export interface PersistedTableMetadata {
    columns: Record<string, string>
    enums: Record<string, string[]>
    primaryKeyGeneration?: PersistedPrimaryKeyGeneration
    timestampColumns?: PersistedTimestampColumn[]
}

export interface PersistedPrimaryKeyGeneration extends PrimaryKeyGeneration {
    column: string
}

export interface PersistedTimestampColumn extends TimestampColumnBehavior {
    column: string
}

export interface PersistedColumnMappingsState {
    version: 1
    tables: Record<string, PersistedTableMetadata>
}

let cachedColumnMappingsPath: string | undefined
let cachedColumnMappingsState: PersistedColumnMappingsState | undefined

export const resolvePersistedMetadataFeatures = (
    features?: ArkormConfig['features']
): PersistedMetadataFeatures => {
    return {
        persistedColumnMappings: features?.persistedColumnMappings !== false,
        persistedEnums: features?.persistedEnums !== false,
    }
}

export const createEmptyPersistedColumnMappingsState = (): PersistedColumnMappingsState => ({
    version: 1,
    tables: {},
})

export const resolveColumnMappingsFilePath = (
    cwd: string,
    configuredPath?: string
): string => {
    if (configuredPath && configuredPath.trim().length > 0)
        return resolve(configuredPath)

    return join(cwd, '.arkormx', 'column-mappings.json')
}

const normalizePersistedEnumValues = (values: unknown): string[] => {
    if (!Array.isArray(values))
        return []

    return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

const normalizeLegacyTableColumns = (columns: Record<string, unknown>): Record<string, string> => {
    return Object.entries(columns).reduce<Record<string, string>>((mapped, [attribute, column]) => {
        if (attribute.trim().length === 0)
            return mapped

        if (typeof column !== 'string' || column.trim().length === 0)
            return mapped

        mapped[attribute] = column

        return mapped
    }, {})
}

const normalizePersistedTableMetadata = (table: unknown): PersistedTableMetadata => {
    if (!table || typeof table !== 'object' || Array.isArray(table))
        return { columns: {}, enums: {} }

    const candidate = table as {
        columns?: Record<string, unknown>
        enums?: Record<string, unknown>
        primaryKeyGeneration?: unknown
        timestampColumns?: unknown
    }

    const hasStructuredMetadata = Object.prototype.hasOwnProperty.call(candidate, 'columns')
        || Object.prototype.hasOwnProperty.call(candidate, 'enums')
        || Object.prototype.hasOwnProperty.call(candidate, 'primaryKeyGeneration')
        || Object.prototype.hasOwnProperty.call(candidate, 'timestampColumns')

    if (!hasStructuredMetadata)
        return {
            columns: normalizeLegacyTableColumns(candidate as Record<string, unknown>),
            enums: {},
        }

    const columns = normalizeLegacyTableColumns(candidate.columns ?? {})
    const enums = Object.entries(candidate.enums ?? {}).reduce<Record<string, string[]>>((all, [columnName, values]) => {
        if (columnName.trim().length === 0)
            return all

        const normalizedValues = normalizePersistedEnumValues(values)
        if (normalizedValues.length > 0)
            all[columnName] = normalizedValues

        return all
    }, {})

    return {
        columns,
        enums,
        primaryKeyGeneration: normalizePersistedPrimaryKeyGeneration(candidate.primaryKeyGeneration),
        timestampColumns: normalizePersistedTimestampColumns(candidate.timestampColumns),
    }
}

const normalizePersistedPrimaryKeyGeneration = (value: unknown): PersistedPrimaryKeyGeneration | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined

    const candidate = value as Record<string, unknown>
    if (candidate.strategy !== 'uuid' || typeof candidate.column !== 'string' || candidate.column.trim().length === 0)
        return undefined

    return {
        column: candidate.column,
        strategy: 'uuid',
        prismaDefault: typeof candidate.prismaDefault === 'string' && candidate.prismaDefault.trim().length > 0
            ? candidate.prismaDefault
            : undefined,
        databaseDefault: typeof candidate.databaseDefault === 'string' && candidate.databaseDefault.trim().length > 0
            ? candidate.databaseDefault
            : undefined,
        runtimeFactory: candidate.runtimeFactory === 'uuid'
            ? 'uuid'
            : undefined,
    }
}

const normalizePersistedTimestampColumns = (value: unknown): PersistedTimestampColumn[] | undefined => {
    if (!Array.isArray(value))
        return undefined

    const columns = value.reduce<PersistedTimestampColumn[]>((all, entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            return all

        const candidate = entry as Record<string, unknown>
        if (typeof candidate.column !== 'string' || candidate.column.trim().length === 0)
            return all

        const normalized: PersistedTimestampColumn = {
            column: candidate.column,
        }

        if (candidate.default === 'now()')
            normalized.default = 'now()'

        if (candidate.updatedAt === true)
            normalized.updatedAt = true

        if (!normalized.default && !normalized.updatedAt)
            return all

        all.push(normalized)

        return all
    }, [])

    return columns.length > 0 ? columns : undefined
}

const normalizePersistedColumnMappingsState = (
    state: Partial<PersistedColumnMappingsState> | undefined
): PersistedColumnMappingsState => {
    const tables = Object.entries(state?.tables ?? {}).reduce<Record<string, PersistedTableMetadata>>((all, [tableName, tableMetadata]) => {
        if (tableName.trim().length === 0)
            return all

        const normalized = normalizePersistedTableMetadata(tableMetadata)
        if (Object.keys(normalized.columns).length > 0 || Object.keys(normalized.enums).length > 0 || normalized.primaryKeyGeneration || normalized.timestampColumns?.length)
            all[tableName] = normalized

        return all
    }, {})

    return {
        version: 1,
        tables,
    }
}

const buildPersistedFeatureDisabledError = (
    feature: 'persistedColumnMappings' | 'persistedEnums',
    table: string,
): ArkormException => {
    const label = feature === 'persistedColumnMappings'
        ? 'persisted column mappings'
        : 'persisted enum metadata'
    const configKey = feature === 'persistedColumnMappings'
        ? 'features.persistedColumnMappings'
        : 'features.persistedEnums'

    return new ArkormException(`Table [${table}] requires ${label}, but ${configKey} is disabled in arkormx.config.*.`, {
        operation: 'metadata.persisted',
        meta: {
            feature,
            table,
        },
    })
}

const assertPersistedTableMetadataEnabled = (
    table: string,
    metadata: PersistedTableMetadata,
    features: PersistedMetadataFeatures,
    strict: boolean,
): void => {
    if (!strict)
        return

    if (!features.persistedColumnMappings && Object.keys(metadata.columns).length > 0)
        throw buildPersistedFeatureDisabledError('persistedColumnMappings', table)

    if (!features.persistedEnums && Object.keys(metadata.enums).length > 0)
        throw buildPersistedFeatureDisabledError('persistedEnums', table)
}

const buildEnumUnionType = (values: string[]): string => {
    return values
        .map((value) => {
            const escapedValue = value.replace(/'/g, String.raw`\'`)

            return `'${escapedValue}'`
        })
        .join(' | ')
}

export const resetPersistedColumnMappingsCache = (): void => {
    cachedColumnMappingsPath = undefined
    cachedColumnMappingsState = undefined
}

export const readPersistedColumnMappingsState = (
    filePath: string
): PersistedColumnMappingsState => {
    if (cachedColumnMappingsPath === filePath && cachedColumnMappingsState)
        return cachedColumnMappingsState

    if (!existsSync(filePath)) {
        const empty = createEmptyPersistedColumnMappingsState()
        cachedColumnMappingsPath = filePath
        cachedColumnMappingsState = empty

        return empty
    }

    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<PersistedColumnMappingsState>
        const normalized = normalizePersistedColumnMappingsState(parsed)
        cachedColumnMappingsPath = filePath
        cachedColumnMappingsState = normalized

        return normalized
    } catch {
        const empty = createEmptyPersistedColumnMappingsState()
        cachedColumnMappingsPath = filePath
        cachedColumnMappingsState = empty

        return empty
    }
}

export const writePersistedColumnMappingsState = (
    filePath: string,
    state: PersistedColumnMappingsState
): void => {
    const normalized = normalizePersistedColumnMappingsState(state)
    const directory = dirname(filePath)

    if (!existsSync(directory))
        mkdirSync(directory, { recursive: true })

    writeFileSync(filePath, JSON.stringify(normalized, null, 2))
    cachedColumnMappingsPath = filePath
    cachedColumnMappingsState = normalized
}

export const deletePersistedColumnMappingsState = (
    filePath: string
): void => {
    if (existsSync(filePath))
        rmSync(filePath, { force: true })

    resetPersistedColumnMappingsCache()
}

export const getPersistedTableMetadata = (
    table: string,
    options: {
        cwd?: string
        configuredPath?: string
        features?: PersistedMetadataFeatures
        strict?: boolean
    } = {},
): PersistedTableMetadata => {
    const state = readPersistedColumnMappingsState(resolveColumnMappingsFilePath(options.cwd ?? process.cwd(), options.configuredPath))
    const metadata = state.tables[table] ?? { columns: {}, enums: {} }

    assertPersistedTableMetadataEnabled(
        table,
        metadata,
        options.features ?? resolvePersistedMetadataFeatures(),
        options.strict ?? false,
    )

    return {
        columns: { ...metadata.columns },
        enums: Object.entries(metadata.enums).reduce<Record<string, string[]>>((all, [columnName, values]) => {
            all[columnName] = [...values]

            return all
        }, {}),
        primaryKeyGeneration: metadata.primaryKeyGeneration ? { ...metadata.primaryKeyGeneration } : undefined,
        timestampColumns: metadata.timestampColumns?.map(column => ({ ...column })),
    }
}

export const getPersistedColumnMap = (
    table: string,
    options: {
        cwd?: string
        configuredPath?: string
        features?: PersistedMetadataFeatures
        strict?: boolean
    } = {},
): Record<string, string> => {
    return getPersistedTableMetadata(table, options).columns
}

export const getPersistedEnumMap = (
    table: string,
    options: {
        cwd?: string
        configuredPath?: string
        features?: PersistedMetadataFeatures
        strict?: boolean
    } = {},
): Record<string, string[]> => {
    return getPersistedTableMetadata(table, options).enums
}

export const getPersistedPrimaryKeyGeneration = (
    table: string,
    options: {
        cwd?: string
        configuredPath?: string
        features?: PersistedMetadataFeatures
        strict?: boolean
    } = {},
): PersistedPrimaryKeyGeneration | undefined => {
    return getPersistedTableMetadata(table, options).primaryKeyGeneration
}

export const getPersistedTimestampColumns = (
    table: string,
    options: {
        cwd?: string
        configuredPath?: string
        features?: PersistedMetadataFeatures
        strict?: boolean
    } = {},
): PersistedTimestampColumn[] => {
    return getPersistedTableMetadata(table, options).timestampColumns ?? []
}

const applyMappedColumn = (
    tableColumns: Record<string, string>,
    column: SchemaColumn,
    features: PersistedMetadataFeatures,
    table: string,
): void => {
    if (typeof column.map === 'string' && column.map.trim().length > 0 && column.map !== column.name) {
        if (!features.persistedColumnMappings)
            throw buildPersistedFeatureDisabledError('persistedColumnMappings', table)

        tableColumns[column.name] = column.map

        return
    }

    delete tableColumns[column.name]
}

const applyEnumColumn = (
    tableEnums: Record<string, string[]>,
    column: SchemaColumn,
    features: PersistedMetadataFeatures,
    table: string,
): void => {
    const values = column.enumValues ?? []
    if (column.type === 'enum' && values.length > 0) {
        if (!features.persistedEnums)
            throw buildPersistedFeatureDisabledError('persistedEnums', table)

        tableEnums[column.name] = [...values]

        return
    }

    delete tableEnums[column.name]
}

const removePersistedColumnMetadata = (
    tableMetadata: PersistedTableMetadata,
    columnName: string,
): void => {
    delete tableMetadata.columns[columnName]
    delete tableMetadata.enums[columnName]

    Object.entries(tableMetadata.columns).forEach(([attribute, mappedColumn]) => {
        if (mappedColumn === columnName)
            delete tableMetadata.columns[attribute]
    })

    if (tableMetadata.primaryKeyGeneration?.column === columnName)
        delete tableMetadata.primaryKeyGeneration

    if (tableMetadata.timestampColumns) {
        tableMetadata.timestampColumns = tableMetadata.timestampColumns.filter(column => column.column !== columnName)
        if (tableMetadata.timestampColumns.length === 0)
            delete tableMetadata.timestampColumns
    }
}

const applyPrimaryKeyGeneration = (
    tableMetadata: PersistedTableMetadata,
    column: SchemaColumn,
): void => {
    if (!column.primary || !column.primaryKeyGeneration) {
        if (tableMetadata.primaryKeyGeneration?.column === column.name)
            delete tableMetadata.primaryKeyGeneration

        return
    }

    tableMetadata.primaryKeyGeneration = {
        column: column.name,
        ...column.primaryKeyGeneration,
    }
}

const applyTimestampColumn = (
    tableMetadata: PersistedTableMetadata,
    column: SchemaColumn,
): void => {
    if (column.type !== 'timestamp' || (column.default !== 'now()' && column.updatedAt !== true)) {
        if (tableMetadata.timestampColumns) {
            tableMetadata.timestampColumns = tableMetadata.timestampColumns.filter(entry => entry.column !== column.name)
            if (tableMetadata.timestampColumns.length === 0)
                delete tableMetadata.timestampColumns
        }

        return
    }

    const nextColumn: PersistedTimestampColumn = {
        column: column.name,
        ...(column.default === 'now()' ? { default: 'now()' as const } : {}),
        ...(column.updatedAt ? { updatedAt: true } : {}),
    }

    tableMetadata.timestampColumns = [
        ...(tableMetadata.timestampColumns ?? []).filter(entry => entry.column !== column.name),
        nextColumn,
    ]
}

export const applyOperationsToPersistedColumnMappingsState = (
    state: PersistedColumnMappingsState,
    operations: SchemaOperation[],
    features: PersistedMetadataFeatures = resolvePersistedMetadataFeatures(),
): PersistedColumnMappingsState => {
    const nextTables = Object.entries(state.tables).reduce<Record<string, PersistedTableMetadata>>((all, [table, metadata]) => {
        all[table] = {
            columns: { ...metadata.columns },
            enums: Object.entries(metadata.enums).reduce<Record<string, string[]>>((nextEnums, [columnName, values]) => {
                nextEnums[columnName] = [...values]

                return nextEnums
            }, {}),
            primaryKeyGeneration: metadata.primaryKeyGeneration ? { ...metadata.primaryKeyGeneration } : undefined,
            timestampColumns: metadata.timestampColumns?.map(column => ({ ...column })),
        }

        return all
    }, {})

    operations.forEach((operation) => {
        if (operation.type === 'createTable') {
            const tableMetadata = nextTables[operation.table] ?? { columns: {}, enums: {} }
            operation.columns.forEach((column) => {
                applyMappedColumn(tableMetadata.columns, column, features, operation.table)
                applyEnumColumn(tableMetadata.enums, column, features, operation.table)
                applyPrimaryKeyGeneration(tableMetadata, column)
                applyTimestampColumn(tableMetadata, column)
            })

            if (Object.keys(tableMetadata.columns).length > 0 || Object.keys(tableMetadata.enums).length > 0 || tableMetadata.primaryKeyGeneration || tableMetadata.timestampColumns?.length)
                nextTables[operation.table] = tableMetadata
            else
                delete nextTables[operation.table]

            return
        }

        if (operation.type === 'alterTable') {
            const tableMetadata = nextTables[operation.table] ?? { columns: {}, enums: {} }
            operation.addColumns.forEach((column) => {
                applyMappedColumn(tableMetadata.columns, column, features, operation.table)
                applyEnumColumn(tableMetadata.enums, column, features, operation.table)
                applyPrimaryKeyGeneration(tableMetadata, column)
                applyTimestampColumn(tableMetadata, column)
            })
            operation.dropColumns.forEach((columnName) => {
                removePersistedColumnMetadata(tableMetadata, columnName)
            })

            if (Object.keys(tableMetadata.columns).length > 0 || Object.keys(tableMetadata.enums).length > 0 || tableMetadata.primaryKeyGeneration || tableMetadata.timestampColumns?.length)
                nextTables[operation.table] = tableMetadata
            else
                delete nextTables[operation.table]

            return
        }

        delete nextTables[operation.table]
    })

    return {
        version: 1,
        tables: nextTables,
    }
}

export const rebuildPersistedColumnMappingsState = async (
    state: AppliedMigrationsState,
    availableMigrations: [MigrationClass, string][],
    features: PersistedMetadataFeatures = resolvePersistedMetadataFeatures(),
): Promise<PersistedColumnMappingsState> => {
    const availableByIdentity = new Map<string, MigrationClass>(
        availableMigrations.map(([migrationClass, file]) => [buildMigrationIdentity(file, migrationClass.name), migrationClass])
    )

    let nextState = createEmptyPersistedColumnMappingsState()
    const orderedMigrations = state.migrations
        .map((migration, index) => ({ migration, index }))
        .sort((left, right) => {
            const appliedAtOrder = left.migration.appliedAt.localeCompare(right.migration.appliedAt)
            if (appliedAtOrder !== 0)
                return appliedAtOrder

            return left.index - right.index
        })

    for (const { migration } of orderedMigrations) {
        const migrationClass = availableByIdentity.get(migration.id)
        if (!migrationClass) {
            throw new ArkormException(`Unable to rebuild persisted column mappings because migration [${migration.id}] could not be resolved from the current migration files.`, {
                operation: 'migration.columnMappings',
                meta: {
                    migrationId: migration.id,
                    file: migration.file,
                    className: migration.className,
                },
            })
        }

        const operations = await getMigrationPlan(migrationClass, 'up')
        nextState = applyOperationsToPersistedColumnMappingsState(nextState, operations, features)
    }

    return nextState
}

export const syncPersistedColumnMappingsFromState = async (
    cwd: string,
    state: AppliedMigrationsState,
    availableMigrations: [MigrationClass, string][],
    features: PersistedMetadataFeatures = resolvePersistedMetadataFeatures(),
): Promise<void> => {
    const filePath = resolveColumnMappingsFilePath(cwd)
    const nextState = await rebuildPersistedColumnMappingsState(state, availableMigrations, features)

    if (Object.keys(nextState.tables).length === 0) {
        deletePersistedColumnMappingsState(filePath)

        return
    }

    writePersistedColumnMappingsState(filePath, nextState)
}

export const validatePersistedMetadataFeaturesForMigrations = async (
    migrations: [MigrationClass, string][],
    features: PersistedMetadataFeatures = resolvePersistedMetadataFeatures(),
): Promise<void> => {
    let nextState = createEmptyPersistedColumnMappingsState()

    for (const [migrationClass] of migrations) {
        const operations = await getMigrationPlan(migrationClass, 'up')
        nextState = applyOperationsToPersistedColumnMappingsState(nextState, operations, features)
    }
}

export const getPersistedEnumTsType = (values: string[]): string => {
    return buildEnumUnionType(values)
}
