import type { PrismaDelegateLike, SoftDeleteConfig } from './types/core'
import { getActiveTransactionClient, getRuntimeAdapter, getRuntimePrismaClient } from './helpers/runtime-config'

import type { DatabaseAdapter } from './types/adapter'
import type { DatabaseTableOptions } from './types/db'
import type { ModelMetadata } from './types/metadata'
import type { ModelStatic } from './types/ModelStatic'
import { QueryBuilder } from './QueryBuilder'
import { createPrismaCompatibilityAdapter } from './adapters/PrismaDatabaseAdapter'

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

    public static table<TRow extends Record<string, unknown> = Record<string, unknown>> (
        table: string,
        options: DatabaseTableOptions = {},
    ): QueryBuilder<TRow, PrismaDelegateLike> {
        return this.createTableModel<TRow>(table, options).query()
    }

    private static createTableModel<TRow extends Record<string, unknown>> (
        table: string,
        options: DatabaseTableOptions,
    ): ModelStatic<TRow, PrismaDelegateLike> {
        const primaryKey = options.primaryKey ?? 'id'
        const columns = { ...(options.columns ?? {}) }
        const softDelete = options.softDelete ?? defaultSoftDeleteConfig

        const buildMetadata = (): ModelMetadata => {
            return {
                table,
                primaryKey,
                columns: { ...columns },
                softDelete: { ...softDelete },
                primaryKeyGeneration: options.primaryKeyGeneration
                    ? { ...options.primaryKeyGeneration }
                    : undefined,
                timestampColumns: options.timestampColumns?.map(column => ({ ...column })),
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
            getAdapter: (): DatabaseAdapter | undefined => options.adapter ?? DB.getAdapter(),
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
}