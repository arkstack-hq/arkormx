import type { DelegateRow, PrismaDelegateLike, SoftDeleteConfig } from './core'
import type { ModelMetadata, RelationMetadata } from './metadata'

import type { DatabaseAdapter } from './adapter'
import type { QueryBuilder } from '../QueryBuilder'

export interface ModelStatic<TModel, TDelegate extends PrismaDelegateLike = PrismaDelegateLike> {
    new(attributes?: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>): TModel
    query: () => QueryBuilder<TModel, TDelegate>
    hydrate: (attributes: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>) => TModel
    hydrateMany: (attributes: (DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>)[]) => TModel[]
    hydrateRetrieved: (attributes: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>) => Promise<TModel>
    hydrateManyRetrieved: (attributes: (DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>)[]) => Promise<TModel[]>
    getAdapter: () => DatabaseAdapter | undefined
    getColumnMap: () => Record<string, string>
    getColumnName: (attribute: string) => string
    getDelegate: (delegate?: string) => TDelegate
    getModelMetadata: () => ModelMetadata
    getPrimaryKey: () => string
    getRelationMetadata: (name: string) => RelationMetadata | null
    setAdapter: (adapter?: DatabaseAdapter) => void
    getSoftDeleteConfig: () => SoftDeleteConfig
    getTable: () => string
}

export interface RelationshipModelStatic {
    new(attributes?: Record<string, unknown>): any
    query: () => QueryBuilder<any, any>
    hydrate: (attributes: Record<string, unknown>) => any
    getAdapter: () => DatabaseAdapter | undefined
    getColumnMap: () => Record<string, string>
    getColumnName: (attribute: string) => string
    getDelegate: (delegate?: string) => PrismaDelegateLike
    getModelMetadata: () => ModelMetadata
    getPrimaryKey: () => string
    getRelationMetadata: (name: string) => RelationMetadata | null
    getTable: () => string
}