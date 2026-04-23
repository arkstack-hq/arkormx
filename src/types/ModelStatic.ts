import type { ModelQuerySchemaLike, QuerySchemaRow, SoftDeleteConfig } from './core'
import type { ModelMetadata, RelationMetadata } from './metadata'

import type { DatabaseAdapter } from './adapter'
import type { QueryBuilder } from '../QueryBuilder'

export interface ModelStatic<TModel, TDelegate extends ModelQuerySchemaLike = ModelQuerySchemaLike> {
    new(attributes?: QuerySchemaRow<TDelegate> extends Record<string, unknown> ? QuerySchemaRow<TDelegate> : Record<string, unknown>): TModel
    query: () => QueryBuilder<TModel, TDelegate>
    hydrate: (attributes: QuerySchemaRow<TDelegate> extends Record<string, unknown> ? QuerySchemaRow<TDelegate> : Record<string, unknown>) => TModel
    hydrateMany: (attributes: (QuerySchemaRow<TDelegate> extends Record<string, unknown> ? QuerySchemaRow<TDelegate> : Record<string, unknown>)[]) => TModel[]
    hydrateRetrieved: (attributes: QuerySchemaRow<TDelegate> extends Record<string, unknown> ? QuerySchemaRow<TDelegate> : Record<string, unknown>) => Promise<TModel>
    hydrateManyRetrieved: (attributes: (QuerySchemaRow<TDelegate> extends Record<string, unknown> ? QuerySchemaRow<TDelegate> : Record<string, unknown>)[]) => Promise<TModel[]>
    getAdapter: () => DatabaseAdapter | undefined
    getColumnMap: () => Record<string, string>
    getColumnName: (attribute: string) => string
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
    getModelMetadata: () => ModelMetadata
    getPrimaryKey: () => string
    getRelationMetadata: (name: string) => RelationMetadata | null
    getTable: () => string
}