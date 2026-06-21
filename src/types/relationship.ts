import type { QueryCondition, QueryOrderBy, QuerySelectColumn } from './adapter'

import { ModelAttributes } from './model'
import { QueryBuilder } from 'src/QueryBuilder'
import type { RelationMetadata } from './metadata'

export type RelationResult = unknown[] | unknown | null
export type RelationResultCache = WeakMap<
  object,
  Map<string, Map<unknown, Promise<RelationResult>>>
>
export type RelationAggregateType = 'count' | 'exists' | 'sum' | 'avg' | 'min' | 'max'
export type RelationAggregateConstraint = (query: QueryBuilder<any, any>) => unknown
export type RelationAggregateInput =
  | string
  | string[]
  | Record<string, boolean | RelationAggregateConstraint | undefined>

export type RelationConstraint<TModel> = (
  query: QueryBuilder<TModel>,
) => QueryBuilder<TModel> | void

export type RelationDefaultValue<TParent, TRelated> =
  | Partial<ModelAttributes<TRelated>>
  | TRelated
  | ((parent: TParent) => Partial<ModelAttributes<TRelated>> | TRelated)

export type RelationDefaultResolver<TParent, TRelated> = (
  parent: TParent,
) => Partial<ModelAttributes<TRelated>> | TRelated

export interface RelationTableLookupSpec {
  table: string
  where?: QueryCondition
  columns?: QuerySelectColumn[]
  orderBy?: QueryOrderBy[]
  limit?: number
  offset?: number
}

export interface RelationColumnLookupSpec {
  lookup: RelationTableLookupSpec
  column: string
}

export interface RelationMetadataProvider {
  getMetadata: () => RelationMetadata
}
