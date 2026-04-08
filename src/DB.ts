import type { AdapterTransactionContext, DatabaseAdapter } from './types/adapter'
import type { PrismaDelegateLike, SoftDeleteConfig } from './types/core'
import { getActiveTransactionClient, getRuntimeAdapter, getRuntimePrismaClient, getUserConfig } from './helpers/runtime-config'

import { ArkormException } from './Exceptions/ArkormException'
import type { DatabaseTableOptions } from './types/db'
import type { ModelMetadata } from './types/metadata'
import type { ModelStatic } from './types/ModelStatic'
import { QueryBuilder } from './QueryBuilder'
import { PrismaDatabaseAdapter, createPrismaCompatibilityAdapter } from './adapters/PrismaDatabaseAdapter'
import { getPersistedTableMetadata, resolvePersistedMetadataFeatures } from './helpers/column-mappings'

const noopDelegate: PrismaDelegateLike = {
    findMany: async () => [],
    findFirst: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({}),
    count: async () => 0,
}

const defaultSoftDeleteConfig: SoftDeleteConfig = {
    enabled: false,
    column: 'deletedAt',
}

export class DB {
    private static adapter?: DatabaseAdapter
    private readonly scopedAdapter?: DatabaseAdapter

    private constructor(adapter?: DatabaseAdapter) {
        this.scopedAdapter = adapter
    }

    public static setAdapter (adapter?: DatabaseAdapter): void {
        this.adapter = adapter
    }

    public static getAdapter (): DatabaseAdapter | undefined {
        if (this.adapter)
            return this.adapter

        const runtimeAdapter = getRuntimeAdapter()
        if (runtimeAdapter)
            return runtimeAdapter

        const client = getActiveTransactionClient() ?? getRuntimePrismaClient()
        if (!client || typeof client !== 'object')
            return undefined

        return createPrismaCompatibilityAdapter(client)
    }

    public getAdapter (): DatabaseAdapter | undefined {
        return this.scopedAdapter ?? DB.getAdapter()
    }

    public static table<TRow extends Record<string, unknown> = Record<string, unknown>> (
        table: string,
        options: DatabaseTableOptions = {},
    ): QueryBuilder<TRow, PrismaDelegateLike> {
        return new DB().table<TRow>(table, options)
    }

    public table<TRow extends Record<string, unknown> = Record<string, unknown>> (
        table: string,
        options: DatabaseTableOptions = {},
    ): QueryBuilder<TRow, PrismaDelegateLike> {
        return DB.createTableModel<TRow>(table, options, this.getAdapter()).query()
    }

    public static async transaction<TResult> (
        callback: (db: DB) => TResult | Promise<TResult>,
        context?: AdapterTransactionContext,
    ): Promise<TResult> {
        return await new DB().transaction(callback, context)
    }

    public async transaction<TResult> (
        callback: (db: DB) => TResult | Promise<TResult>,
        context?: AdapterTransactionContext,
    ): Promise<TResult> {
        const adapter = this.getAdapter()
        if (!adapter)
            throw new ArkormException('DB transactions require a configured database adapter.', {
                code: 'ADAPTER_NOT_CONFIGURED',
                operation: 'db.transaction',
            })

        return await adapter.transaction(async (transactionAdapter) => {
            return await callback(new DB(transactionAdapter))
        }, context)
    }

    private static createTableModel<TRow extends Record<string, unknown>> (
        table: string,
        options: DatabaseTableOptions,
        adapter?: DatabaseAdapter,
    ): ModelStatic<TRow, PrismaDelegateLike> {
        const primaryKey = options.primaryKey ?? 'id'
        const resolvedAdapter = options.adapter ?? adapter ?? DB.getAdapter()
        const persistedMetadata = DB.resolvePersistedTableMetadata(table, options, resolvedAdapter)
        const columns = {
            ...persistedMetadata.columns,
            ...(options.columns ?? {}),
        }
        const softDelete = options.softDelete ?? defaultSoftDeleteConfig
        const primaryKeyGeneration = options.primaryKeyGeneration
            ? { ...options.primaryKeyGeneration }
            : persistedMetadata.primaryKeyGeneration?.column === primaryKey
                ? {
                    strategy: persistedMetadata.primaryKeyGeneration.strategy,
                    prismaDefault: persistedMetadata.primaryKeyGeneration.prismaDefault,
                    databaseDefault: persistedMetadata.primaryKeyGeneration.databaseDefault,
                    runtimeFactory: persistedMetadata.primaryKeyGeneration.runtimeFactory,
                }
                : undefined
        const timestampColumns = options.timestampColumns?.map(column => ({ ...column }))
            ?? persistedMetadata.timestampColumns?.map(column => ({ ...column }))

        const buildMetadata = (): ModelMetadata => {
            return {
                table,
                primaryKey,
                columns: { ...columns },
                softDelete: { ...softDelete },
                primaryKeyGeneration,
                timestampColumns,
            }
        }

        const modelStatic = {
            query: (): QueryBuilder<TRow, PrismaDelegateLike> => new QueryBuilder<TRow, PrismaDelegateLike>(
                modelStatic as unknown as ModelStatic<TRow, PrismaDelegateLike>,
                modelStatic.getAdapter(),
            ),
            hydrate: (attributes: Record<string, unknown>): TRow => ({ ...attributes }) as TRow,
            hydrateMany: (attributes: Record<string, unknown>[]): TRow[] => attributes.map(attribute => ({ ...attribute }) as TRow),
            hydrateRetrieved: async (attributes: Record<string, unknown>): Promise<TRow> => ({ ...attributes }) as TRow,
            hydrateManyRetrieved: async (attributes: Record<string, unknown>[]): Promise<TRow[]> => attributes.map(attribute => ({ ...attribute }) as TRow),
            getAdapter: (): DatabaseAdapter | undefined => resolvedAdapter,
            getColumnMap: (): Record<string, string> => ({ ...columns }),
            getColumnName: (attribute: string): string => columns[attribute] ?? attribute,
            getDelegate: (): PrismaDelegateLike => noopDelegate,
            getModelMetadata: (): ModelMetadata => buildMetadata(),
            getPrimaryKey: (): string => primaryKey,
            getRelationMetadata: (): null => null,
            setAdapter: (): void => { },
            getSoftDeleteConfig: (): SoftDeleteConfig => ({ ...softDelete }),
            getTable: (): string => table,
        }

        return modelStatic as unknown as ModelStatic<TRow, PrismaDelegateLike>
    }

    private static resolvePersistedTableMetadata (
        table: string,
        options: DatabaseTableOptions,
        adapter?: DatabaseAdapter,
    ) {
        if (options.persistedMetadata === false)
            return { columns: {}, enums: {} }

        const persistedMetadataOptions = typeof options.persistedMetadata === 'object'
            ? options.persistedMetadata
            : {}

        return getPersistedTableMetadata(table, {
            cwd: persistedMetadataOptions.cwd,
            configuredPath: persistedMetadataOptions.configuredPath,
            features: resolvePersistedMetadataFeatures(getUserConfig('features')),
            strict: persistedMetadataOptions.strict
                ?? (Boolean(adapter) && !(adapter instanceof PrismaDatabaseAdapter)),
        })
    }
}