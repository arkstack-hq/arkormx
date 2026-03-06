import type { DelegateRow, PrismaDelegateLike, SoftDeleteConfig } from './core'

import type { QueryBuilder } from '../QueryBuilder'

export interface ModelStatic<TModel, TDelegate extends PrismaDelegateLike = PrismaDelegateLike> {
    new(attributes?: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>): TModel
    query: () => QueryBuilder<TModel, TDelegate>
    hydrate: (attributes: DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>) => TModel
    hydrateMany: (attributes: (DelegateRow<TDelegate> extends Record<string, unknown> ? DelegateRow<TDelegate> : Record<string, unknown>)[]) => TModel[]
    getDelegate: (delegate?: string) => TDelegate
    getSoftDeleteConfig: () => SoftDeleteConfig
}

export interface RelationshipModelStatic {
    query: () => QueryBuilder<any, any>
    getDelegate: (delegate?: string) => PrismaDelegateLike
}