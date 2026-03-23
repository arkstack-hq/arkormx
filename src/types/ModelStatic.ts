import type { DelegateRow, PrismaDelegateLike, SoftDeleteConfig } from './core'

import type { QueryBuilder } from '../QueryBuilder'

export interface ModelStatic<TModel, TDelegate extends PrismaDelegateLike = PrismaDelegateLike> {
    new(attributes?: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>): TModel
    query: () => QueryBuilder<TModel, TDelegate>
    hydrate: (attributes: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>) => TModel
    hydrateMany: (attributes: (DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>)[]) => TModel[]
    hydrateRetrieved: (attributes: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>) => Promise<TModel>
    hydrateManyRetrieved: (attributes: (DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>)[]) => Promise<TModel[]>
    getDelegate: (delegate?: string) => TDelegate
    getSoftDeleteConfig: () => SoftDeleteConfig
}

export interface RelationshipModelStatic {
    new(attributes?: Record<string, unknown>): any
    query: () => QueryBuilder<any, any>
    hydrate: (attributes: Record<string, unknown>) => any
    getDelegate: (delegate?: string) => PrismaDelegateLike
}