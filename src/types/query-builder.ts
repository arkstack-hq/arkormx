import type {
  EagerLoadConstraint,
  ModelQuerySchemaLike,
  ModelRelationshipKey,
  QuerySchemaForModelInstance,
} from '../types'

import type { ArkormCollection } from '../Collection'
import type { JoinClause } from '../JoinClause'
import type { QueryBuilder } from '../QueryBuilder'

export type RelatedModelFromResult<TResult> =
  TResult extends ArkormCollection<infer TRelated> ? TRelated : Exclude<TResult, null | undefined>

export type RelatedModelForRelationship<
  TModel,
  TKey extends ModelRelationshipKey<TModel>,
> = TModel[TKey] extends (...args: any[]) => infer TRelation
  ? TRelation extends { getResults: (...args: any[]) => Promise<infer TResult> }
    ? RelatedModelFromResult<TResult>
    : never
  : never

export type EagerLoadQueryForRelationship<
  TModel,
  TKey extends ModelRelationshipKey<TModel>,
  TRelated = RelatedModelForRelationship<TModel, TKey>,
> = [TRelated] extends [never]
  ? QueryBuilder<any, any>
  : unknown extends TRelated
    ? QueryBuilder<any, any>
    : QueryBuilder<TRelated, QuerySchemaForModelInstance<TRelated>>

/**
 * The left-hand argument accepted by the join helpers: either a column name or a
 * closure that configures the join constraints through a {@link JoinClause}.
 */
export type JoinOn = string | ((join: JoinClause) => void)

/**
 * A subquery source accepted by the subquery/lateral join helpers.
 */
export type JoinSource = QueryBuilder<any, any> | string

/**
 * A callback that builds a parenthesized group of nested where conditions.
 */
export type WhereCallback<TModel, TDelegate extends ModelQuerySchemaLike> = (
  query: QueryBuilder<TModel, TDelegate>,
) => QueryBuilder<any, any> | void

export type EagerLoadRelations<TModel> = {
  [TKey in ModelRelationshipKey<TModel>]?:
    | true
    | EagerLoadConstraint<EagerLoadQueryForRelationship<TModel, TKey>>
}
