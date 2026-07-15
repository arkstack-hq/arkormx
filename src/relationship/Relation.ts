import type {
  DatabaseAdapter,
  DatabaseValue,
  ModelAttributes,
  ModelOrderByInput,
  ModelWhereInput,
  PaginationOptions,
  QueryScalarComparisonOperator,
  QuerySchemaForModelInstance,
  QuerySchemaInclude,
  QuerySchemaSelect,
  RelationAggregateInput,
  RelationMetadata,
} from '../types'
import type { LengthAwarePaginator, Paginator } from '../Paginator'

import { ArkormCollection } from '../Collection'
import type { EagerLoadRelations } from '../types/query-builder'
import { QueryBuilder } from '../QueryBuilder'
import type { RelationConstraint } from '../types/relationship'
import { RelationTableLoader } from './RelationTableLoader'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'

/**
 * Base class for all relationship types. Not meant to be used directly.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export abstract class Relation<TModel> {
  protected constraint: RelationConstraint<TModel> | null = null

  protected getRelationAdapter(): DatabaseAdapter {
    const model = this.getRelatedModel()
    const adapter = model.getAdapter()

    if (!adapter) {
      throw new UnsupportedAdapterFeatureException(
        'Relationship resolution requires a configured adapter.',
        {
          operation: 'relation.adapter',
        },
      )
    }

    return adapter
  }

  protected getRelatedModel(): {
    getAdapter: () => DatabaseAdapter | undefined
    query: () => QueryBuilder<TModel>
  } {
    return (
      this as unknown as {
        related: {
          getAdapter: () => DatabaseAdapter | undefined
          query: () => QueryBuilder<TModel>
        }
      }
    ).related
  }

  protected getRelatedModelConstructor(): {
    hydrate: (attributes: Record<string, unknown>) => TModel
    query: () => QueryBuilder<TModel>
    getPrimaryKey: () => string
  } {
    return (
      this as unknown as {
        related: {
          hydrate: (attributes: Record<string, unknown>) => TModel
          query: () => QueryBuilder<TModel>
          getPrimaryKey: () => string
        }
      }
    ).related
  }

  protected createRelationTableLoader(): RelationTableLoader {
    return new RelationTableLoader(this.getRelationAdapter())
  }

  protected getCreationAttributes(): Record<string, unknown> {
    return {}
  }

  protected mergeCreationAttributes(
    attributes: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      ...attributes,
      ...this.getCreationAttributes(),
    }
  }

  protected applyCreationAttributesToModel(model: TModel): TModel {
    const attributes = this.getCreationAttributes()
    const fillable = model as TModel & {
      fill?: (attributes: Record<string, unknown>) => TModel
      setAttribute?: (key: string, value: unknown) => TModel
    }

    if (Object.keys(attributes).length === 0) return model

    if (typeof fillable.fill === 'function') {
      fillable.fill(attributes)

      return model
    }

    if (typeof fillable.setAttribute === 'function') {
      Object.entries(attributes).forEach(([key, value]) => {
        fillable.setAttribute?.(key, value)
      })
    }

    return model
  }

  /**
   * Apply a constraint to the relationship query.
   *
   * @param constraint The constraint function to apply to the query.
   * @returns The current relation instance.
   */
  public constrain(constraint: RelationConstraint<TModel>): this {
    if (!this.constraint) {
      this.constraint = constraint

      return this
    }

    const previousConstraint = this.constraint
    this.constraint = (query: QueryBuilder<TModel>) => {
      const constrained = previousConstraint(query) ?? query

      return constraint(constrained) ?? constrained
    }

    return this
  }

  /**
   * Add a where clause to the relationship query.
   *
   * @param where
   * @returns
   */
  public where(where: ModelWhereInput<TModel>): this {
    return this.constrain((query) => query.where(where as never))
  }

  /**
   * Adds an OR where clause to the query.
   *
   * @param where
   * @returns
   */
  public orWhere(where: ModelWhereInput<TModel>): this {
    return this.constrain((query) => query.orWhere(where as never))
  }

  /**
   * Adds a NOT where clause to the query.
   *
   * @param where
   * @returns
   */
  public whereNot(where: ModelWhereInput<TModel>): this {
    return this.constrain((query) => query.whereNot(where as never))
  }

  /**
   * Adds an OR NOT where clause to the query.
   *
   * @param where
   * @returns
   */
  public orWhereNot(where: ModelWhereInput<TModel>): this {
    return this.constrain((query) => query.orWhereNot(where as never))
  }

  /**
   * Adds a null check for a key.
   *
   * @param key
   * @returns
   */
  public whereNull<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereNull(key))
  }

  /**
   * Adds a not-null check for a key.
   *
   * @param key
   * @returns
   */
  public whereNotNull<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereNotNull(key))
  }

  /**
   * Adds a between range clause for a key.
   *
   * @param key
   * @param range
   * @returns
   */
  public whereBetween<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    range: [ModelAttributes<TModel>[TKey], ModelAttributes<TModel>[TKey]],
  ): this {
    return this.constrain((query) => query.whereBetween(key, range))
  }

  /**
   * Adds a date-only equality clause for a date-like key.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereDate<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Date | string,
  ): this {
    return this.constrain((query) => query.whereDate(key, value))
  }

  public whereMonth<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    month: number,
    year?: number,
  ): this {
    return this.constrain((query) => query.whereMonth(key, month, year))
  }

  public whereYear<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    year: number,
  ): this {
    return this.constrain((query) => query.whereYear(key, year))
  }

  /**
   * Adds a time clause for a date-like key.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereTime<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Date | string,
  ): this
  /**
   * Adds a time clause for a date-like key.
   *
   * @param key
   * @param operator
   * @param value
   * @returns
   */
  public whereTime<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    operator: QueryScalarComparisonOperator,
    value: Date | string,
  ): this
  public whereTime<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    operatorOrValue: QueryScalarComparisonOperator | Date | string,
    maybeValue?: Date | string,
  ): this {
    return this.constrain((query) =>
      maybeValue === undefined
        ? query.whereTime(key, operatorOrValue as Date | string)
        : query.whereTime(key, operatorOrValue as QueryScalarComparisonOperator, maybeValue),
    )
  }

  /**
   * Adds a day clause for a date-like key.
   *
   * @param key
   * @param day
   * @returns
   */
  public whereDay<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey, day: number): this
  /**
   * Adds a day clause for a date-like key.
   *
   * @param key
   * @param operator
   * @param day
   * @returns
   */
  public whereDay<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    operator: QueryScalarComparisonOperator,
    day: number,
  ): this
  public whereDay<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    operatorOrDay: QueryScalarComparisonOperator | number,
    maybeDay?: number,
  ): this {
    return this.constrain((query) =>
      maybeDay === undefined
        ? query.whereDay(key, operatorOrDay as number)
        : query.whereDay(key, operatorOrDay as QueryScalarComparisonOperator, maybeDay),
    )
  }

  /**
   * Adds clause to determine if a column's value is in the past
   *
   * @param key
   * @returns
   */
  public wherePast<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.wherePast(key))
  }

  /**
   * Adds clause to determine if a column's value is in the future
   *
   * @param key
   * @returns
   */
  public whereFuture<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereFuture(key))
  }

  /**
   * Adds clause to determine if a column's value is in the past, inclusive of the current date and time
   *
   * @param key
   * @returns
   */
  public whereNowOrPast<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereNowOrPast(key))
  }

  /**
   * Adds clause to determine if a column's value is in the future, inclusive of the current date and time
   *
   * @param key
   * @returns
   */
  public whereNowOrFuture<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereNowOrFuture(key))
  }

  /**
   * Adds clause to determine if a column's value is today
   *
   * @param key
   * @returns
   */
  public whereToday<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereToday(key))
  }

  /**
   * Adds clause to determine if a column's value is before today
   *
   * @param key
   * @returns
   */
  public whereBeforeToday<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereBeforeToday(key))
  }

  /**
   * Adds clause to determine if a column's value is after today
   *
   * @param key
   * @returns
   */
  public whereAfterToday<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereAfterToday(key))
  }

  /**
   * Adds clause to determine if a column's value is today or before today
   *
   * @param key
   * @returns
   */
  public whereTodayOrBefore<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereTodayOrBefore(key))
  }

  /**
   * Adds clause to determine if a column's value is today or after today
   *
   * @param key
   * @returns
   */
  public whereTodayOrAfter<TKey extends keyof ModelAttributes<TModel> & string>(key: TKey): this {
    return this.constrain((query) => query.whereTodayOrAfter(key))
  }

  /**
   * Adds clause to verify that two columns are equal
   *
   * @param left
   * @param right
   */
  public whereColumn<
    TLeft extends keyof ModelAttributes<TModel> & string,
    TRight extends keyof ModelAttributes<TModel> & string,
  >(left: TLeft, right: TRight): this
  /**
   * Adds clause to verify that two columns are equal
   *
   * @param left
   * @param operator
   * @param right
   */
  public whereColumn<
    TLeft extends keyof ModelAttributes<TModel> & string,
    TRight extends keyof ModelAttributes<TModel> & string,
  >(left: TLeft, operator: QueryScalarComparisonOperator, right: TRight): this
  public whereColumn(
    left: keyof ModelAttributes<TModel> & string,
    operatorOrRight: QueryScalarComparisonOperator | (keyof ModelAttributes<TModel> & string),
    maybeRight?: keyof ModelAttributes<TModel> & string,
  ): this {
    return this.constrain((query) =>
      maybeRight === undefined
        ? query.whereColumn(left, operatorOrRight as keyof ModelAttributes<TModel> & string)
        : query.whereColumn(left, operatorOrRight as QueryScalarComparisonOperator, maybeRight),
    )
  }

  /**
   * Adds "where exists" SQL clauses.
   *
   * @param queryOrCallback
   * @returns
   */
  public whereExists(
    queryOrCallback:
      | QueryBuilder<any, any>
      | ((query: QueryBuilder<TModel>) => QueryBuilder<any, any> | void),
  ): this {
    return this.constrain((query) => query.whereExists(queryOrCallback))
  }

  /**
   * Adds a fulltext clause for columns that have full text indexes.
   *
   * @param columns
   * @param value
   * @param options
   * @returns
   */
  public whereFullText<TKey extends keyof ModelAttributes<TModel> & string>(
    columns: TKey | TKey[],
    value: string,
    options: { language?: string } = {},
  ): this {
    return this.constrain((query) => query.whereFullText(columns, value, options))
  }

  /**
   * Add an OR fulltext clause to the relationship query.
   *
   * @param columns
   * @param value
   * @param options
   * @returns
   */
  public orWhereFullText<TKey extends keyof ModelAttributes<TModel> & string>(
    columns: TKey | TKey[],
    value: string,
    options: { language?: string } = {},
  ): this {
    return this.constrain((query) => query.orWhereFullText(columns, value, options))
  }

  /**
   * Add a strongly-typed where key clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereKey<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: ModelAttributes<TModel>[TKey],
  ): this {
    return this.constrain((query) => query.whereKey(key, value))
  }

  /**
   * Adds a strongly-typed inequality where clause for a single attribute key.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereKeyNot<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: ModelAttributes<TModel>[TKey],
  ): this {
    return this.constrain((query) => query.whereKeyNot(key, value))
  }

  /**
   * Add a strongly-typed where in clause to the relationship query.
   *
   * @param key
   * @param values
   * @returns
   */
  public whereIn<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    values: ModelAttributes<TModel>[TKey][],
  ): this {
    return this.constrain((query) => query.whereIn(key, values))
  }

  /**
   * Adds a strongly-typed OR IN where clause for a single attribute key.
   *
   * @param key
   * @param values
   * @returns
   */
  public orWhereIn<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    values: ModelAttributes<TModel>[TKey][],
  ): this {
    return this.constrain((query) => query.orWhereIn(key, values))
  }

  /**
   * Adds a strongly-typed NOT IN where clause for a single attribute key.
   *
   * @param key
   * @param values
   * @returns
   */
  public whereNotIn<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    values: ModelAttributes<TModel>[TKey][],
  ): this {
    return this.constrain((query) => query.whereNotIn(key, values))
  }

  /**
   * Adds a strongly-typed OR NOT IN where clause for a single attribute key.
   *
   * @param key
   * @param values
   * @returns
   */
  public orWhereNotIn<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    values: ModelAttributes<TModel>[TKey][],
  ): this {
    return this.constrain((query) => query.orWhereNotIn(key, values))
  }

  /**
   * Add a string contains clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereLike<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Extract<ModelAttributes<TModel>[TKey], string>,
  ): this {
    return this.constrain((query) => query.whereLike(key, value))
  }

  /**
   * Add an OR string contains clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public orWhereLike<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Extract<ModelAttributes<TModel>[TKey], string>,
  ): this {
    return this.constrain((query) => query.orWhereLike(key, value))
  }

  /**
   * Add a negated string contains (NOT LIKE) clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereNotLike<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Extract<ModelAttributes<TModel>[TKey], string>,
  ): this {
    return this.constrain((query) => query.whereNotLike(key, value))
  }

  /**
   * Add an OR negated string contains (NOT LIKE) clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public orWhereNotLike<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Extract<ModelAttributes<TModel>[TKey], string>,
  ): this {
    return this.constrain((query) => query.orWhereNotLike(key, value))
  }

  /**
   * Add a JSON containment clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereJsonContains(column: string, value: DatabaseValue): this {
    return this.constrain((query) => query.whereJsonContains(column, value))
  }

  /**
   * OR variant of whereJsonContains().
   *
   * @param column
   * @param value
   * @returns
   */
  public orWhereJsonContains(column: string, value: DatabaseValue): this {
    return this.constrain((query) => query.orWhereJsonContains(column, value))
  }

  /**
   * Add a negated JSON containment clause to the relationship query.
   *
   * @param column
   * @param value
   * @returns
   */
  public whereJsonDoesntContain(column: string, value: DatabaseValue): this {
    return this.constrain((query) => query.whereJsonDoesntContain(column, value))
  }

  /**
   * OR variant of whereJsonDoesntContain().
   *
   * @param column
   * @param value
   * @returns
   */
  public orWhereJsonDoesntContain(column: string, value: DatabaseValue): this {
    return this.constrain((query) => query.orWhereJsonDoesntContain(column, value))
  }

  /**
   * Add a JSON key-existence clause to the relationship query.
   *
   * @param column
   * @param value
   * @returns
   */
  public whereJsonContainsKey(column: string): this {
    return this.constrain((query) => query.whereJsonContainsKey(column))
  }

  /**
   * OR variant of whereJsonContainsKey().
   *
   * @param column
   * @returns
   */
  public orWhereJsonContainsKey(column: string): this {
    return this.constrain((query) => query.orWhereJsonContainsKey(column))
  }

  /**
   * Add a negated JSON key-existence clause to the relationship query.
   *
   * @param column
   * @returns
   */
  public whereJsonDoesntContainKey(column: string): this {
    return this.constrain((query) => query.whereJsonDoesntContainKey(column))
  }

  /**
   * OR variant of whereJsonDoesntContainKey().
   *
   * @param column
   * @returns
   */
  public orWhereJsonDoesntContainKey(column: string): this {
    return this.constrain((query) => query.orWhereJsonDoesntContainKey(column))
  }

  /**
   * Add a JSON array-length clause to the relationship query.
   *
   * @param column
   * @returns
   */
  public whereJsonLength(column: string, value: number): this
  public whereJsonLength(
    column: string,
    operator: QueryScalarComparisonOperator,
    value: number,
  ): this
  public whereJsonLength(
    column: string,
    operatorOrValue: QueryScalarComparisonOperator | number,
    maybeValue?: number,
  ): this {
    return this.constrain((query) =>
      maybeValue === undefined
        ? query.whereJsonLength(column, operatorOrValue as number)
        : query.whereJsonLength(
            column,
            operatorOrValue as QueryScalarComparisonOperator,
            maybeValue,
          ),
    )
  }

  /**
   * OR variant of whereJsonLength().
   *
   * @param column
   * @param value
   */
  public orWhereJsonLength(column: string, value: number): this
  public orWhereJsonLength(
    column: string,
    operator: QueryScalarComparisonOperator,
    value: number,
  ): this
  public orWhereJsonLength(
    column: string,
    operatorOrValue: QueryScalarComparisonOperator | number,
    maybeValue?: number,
  ): this {
    return this.constrain((query) =>
      maybeValue === undefined
        ? query.orWhereJsonLength(column, operatorOrValue as number)
        : query.orWhereJsonLength(
            column,
            operatorOrValue as QueryScalarComparisonOperator,
            maybeValue,
          ),
    )
  }

  /**
   * Add a JSON array overlap clause to the relationship query.
   *
   * @param column
   * @param value
   */
  public whereJsonOverlaps(column: string, value: DatabaseValue): this {
    return this.constrain((query) => query.whereJsonOverlaps(column, value))
  }

  /**
   * OR variant of whereJsonOverlaps().
   *
   * @param column
   * @param value
   */
  public orWhereJsonOverlaps(column: string, value: DatabaseValue): this {
    return this.constrain((query) => query.orWhereJsonOverlaps(column, value))
  }

  /**
   * Add a HAVING clause to the relationship query.
   *
   * @param column
   * @param value
   */
  public having(column: string, value: DatabaseValue): this
  public having(column: string, operator: QueryScalarComparisonOperator, value: DatabaseValue): this
  public having(
    column: string,
    operatorOrValue: QueryScalarComparisonOperator | DatabaseValue,
    maybeValue?: DatabaseValue,
  ): this {
    return this.constrain((query) =>
      maybeValue === undefined
        ? query.having(column, operatorOrValue as DatabaseValue)
        : query.having(column, operatorOrValue as QueryScalarComparisonOperator, maybeValue),
    )
  }

  /**
   * Add an OR HAVING clause to the relationship query.
   */
  public orHaving(column: string, value: DatabaseValue): this
  public orHaving(
    column: string,
    operator: QueryScalarComparisonOperator,
    value: DatabaseValue,
  ): this
  public orHaving(
    column: string,
    operatorOrValue: QueryScalarComparisonOperator | DatabaseValue,
    maybeValue?: DatabaseValue,
  ): this {
    return this.constrain((query) =>
      maybeValue === undefined
        ? query.orHaving(column, operatorOrValue as DatabaseValue)
        : query.orHaving(column, operatorOrValue as QueryScalarComparisonOperator, maybeValue),
    )
  }

  /**
   * Add a raw HAVING clause to the relationship query.
   */
  public havingRaw(sql: string, bindings: unknown[] = []): this {
    return this.constrain((query) => query.havingRaw(sql, bindings))
  }

  /**
   * Add a raw OR HAVING clause to the relationship query.
   */
  public orHavingRaw(sql: string, bindings: unknown[] = []): this {
    return this.constrain((query) => query.orHavingRaw(sql, bindings))
  }

  /**
   * Add a string starts-with clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereStartsWith<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Extract<ModelAttributes<TModel>[TKey], string>,
  ): this {
    return this.constrain((query) => query.whereStartsWith(key, value))
  }

  /**
   * Add a string ends-with clause to the relationship query.
   *
   * @param key
   * @param value
   * @returns
   */
  public whereEndsWith<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: Extract<ModelAttributes<TModel>[TKey], string>,
  ): this {
    return this.constrain((query) => query.whereEndsWith(key, value))
  }

  /**
   * Add an order by clause to the relationship query.
   *
   * @param orderBy
   * @returns
   */
  public orderBy(orderBy: ModelOrderByInput<TModel>): this {
    return this.constrain((query) => query.orderBy(orderBy as never))
  }

  /**
   * Puts the query results in random order.
   *
   * @returns
   */
  public inRandomOrder(): this {
    return this.constrain((query) => query.inRandomOrder())
  }

  /**
   * Removes existing order clauses and optionally applies a new one.
   *
   * @param column
   * @param direction
   * @returns
   */
  public reorder(column?: string, direction: 'asc' | 'desc' = 'asc'): this {
    return this.constrain((query) => query.reorder(column, direction))
  }

  /**
   * Adds an orderBy descending clause for a timestamp-like column.
   *
   * @param column
   * @returns
   */
  public latest(column = 'createdAt'): this {
    return this.constrain((query) => query.latest(column))
  }

  /**
   * Adds an orderBy ascending clause for a timestamp-like column.
   *
   * @param column
   * @returns
   */
  public oldest(column = 'createdAt'): this {
    return this.constrain((query) => query.oldest(column))
  }

  /**
   * Add an include clause to the relationship query.
   *
   * @param include
   * @returns
   */
  public include(include: QuerySchemaInclude<QuerySchemaForModelInstance<TModel>>): this {
    return this.constrain((query) => query.include(include as never))
  }

  /**
   * Add eager loading relations to the relationship query.
   *
   * @param relations
   * @returns
   */
  public with(relations: string | string[] | EagerLoadRelations<TModel>): this {
    return this.constrain((query) => query.with(relations))
  }

  /**
   * Add relationship count aggregates to the related-model query.
   *
   * @param relations
   * @returns
   */
  public withCount(relations: RelationAggregateInput): this {
    return this.constrain((query) => query.withCount(relations))
  }

  /**
   * Add relationship existence aggregates to the related-model query.
   *
   * @param relations
   * @returns
   */
  public withExists(relations: RelationAggregateInput): this {
    return this.constrain((query) => query.withExists(relations))
  }

  /**
   * Add relationship sum aggregates to the related-model query.
   *
   * @param relations
   * @returns
   */
  public withSum(relations: RelationAggregateInput, column: string): this {
    return this.constrain((query) => query.withSum(relations, column))
  }

  /**
   * Add relationship average aggregates to the related-model query.
   *
   * @param relations
   * @returns
   */
  public withAvg(relations: RelationAggregateInput, column: string): this {
    return this.constrain((query) => query.withAvg(relations, column))
  }

  /**
   * Add relationship minimum aggregates to the related-model query.
   *
   * @param relations
   * @returns
   */
  public withMin(relations: RelationAggregateInput, column: string): this {
    return this.constrain((query) => query.withMin(relations, column))
  }

  /**
   * Add relationship maximum aggregates to the related-model query.
   *
   * @param relations
   * @returns
   */
  public withMax(relations: RelationAggregateInput, column: string): this {
    return this.constrain((query) => query.withMax(relations, column))
  }

  /**
   * Add a select clause to the relationship query.
   *
   * @param select
   * @returns
   */
  public select(select: QuerySchemaSelect<QuerySchemaForModelInstance<TModel>>): this {
    return this.constrain((query) => query.select(select as never))
  }

  public addSelect(select: QuerySchemaSelect<QuerySchemaForModelInstance<TModel>>): this {
    return this.constrain((query) => query.addSelect(select as never))
  }

  /**
   * Apply or remove DISTINCT from the relationship query.
   *
   * @param enabled
   * @returns
   */
  public distinct(enabled = true): this {
    return this.constrain((query) => query.distinct(enabled))
  }

  /**
   * Group relationship results by one or more related-model attributes.
   *
   * @param columns
   * @returns
   */
  public groupBy<TKey extends keyof ModelAttributes<TModel> & string>(columns: TKey[]): this
  public groupBy<TKey extends keyof ModelAttributes<TModel> & string>(...columns: TKey[]): this
  public groupBy(...columns: Array<string | string[]>): this {
    const normalized = (Array.isArray(columns[0]) ? columns[0] : columns) as string[]

    return this.constrain((query) =>
      query.groupBy(...(normalized as Array<keyof ModelAttributes<TModel> & string>)),
    )
  }

  /**
   * Add a skip clause to the relationship query.
   *
   * @param skip
   * @returns
   */
  public skip(skip: number): this {
    return this.constrain((query) => query.skip(skip))
  }

  public offset(value: number): this {
    return this.constrain((query) => query.offset(value))
  }

  /**
   * Add a take clause to the relationship query.
   *
   * @param take
   * @returns
   */
  public take(take: number): this {
    return this.constrain((query) => query.take(take))
  }

  /**
   * Alias for take.
   *
   * @param value
   * @returns
   */
  public limit(value: number): this {
    return this.constrain((query) => query.limit(value))
  }

  /**
   * Sets offset/limit for a 1-based page.
   *
   * @param page
   * @param perPage
   * @returns
   */
  public forPage(page: number, perPage = 15): this {
    return this.constrain((query) => query.forPage(page, perPage))
  }

  /**
   * Adds a raw where clause when supported by the adapter.
   *
   * @param sql
   * @param bindings
   * @returns
   */
  public whereRaw(sql: string, bindings: unknown[] = []): this {
    return this.constrain((query) => query.whereRaw(sql, bindings))
  }

  /**
   * Adds a raw OR where clause when supported by the adapter.
   *
   * @param sql
   * @param bindings
   * @returns
   */
  public orWhereRaw(sql: string, bindings: unknown[] = []): this {
    return this.constrain((query) => query.orWhereRaw(sql, bindings))
  }

  /**
   * Include soft-deleted records in the relationship query.
   *
   * @returns
   */
  public withTrashed(): this {
    return this.constrain((query) => query.withTrashed())
  }

  /**
   * Limit relationship query to only soft-deleted records.
   *
   * @returns
   */
  public onlyTrashed(): this {
    return this.constrain((query) => query.onlyTrashed())
  }

  /**
   * Exclude soft-deleted records from the relationship query.
   *
   * @returns
   */
  public withoutTrashed(): this {
    return this.constrain((query) => query.withoutTrashed())
  }

  /**
   * Apply a scope to the relationship query.
   *
   * @param name
   * @param args
   * @returns
   */
  public scope(name: string, ...args: unknown[]): this {
    return this.constrain((query) => query.scope(name, ...args))
  }

  /**
   * Apply the defined constraint to the given query, if any.
   *
   * @param query The query builder instance to apply the constraint to.
   *
   * @returns The query builder instance with the constraint applied, if any.
   */
  protected applyConstraint(query: QueryBuilder<TModel>): QueryBuilder<TModel> {
    if (!this.constraint) return query

    const constrained = this.constraint(query)

    return constrained ?? query
  }

  public abstract getMetadata(): RelationMetadata

  /**
   * Build the underlying query for the relationship.
   *
   * @returns
   */
  public abstract getQuery(): Promise<QueryBuilder<TModel>>

  /**
   * Execute the relationship query and return relation results.
   *
   * @returns
   */
  public async get(): Promise<TModel | ArkormCollection<TModel> | null> {
    return this.getResults()
  }

  /**
   * Execute the relationship query and return the first related model.
   *
   * @returns
   */
  public async first(): Promise<TModel | null> {
    const results = await this.getResults()

    if (results instanceof ArkormCollection) return (results.all()[0] ?? null) as TModel | null

    return results
  }

  /**
   * Execute the relationship query and return the first related model or throw an error if not found.
   *
   * @returns
   */
  public async firstOrFail(): Promise<TModel> {
    const query = await this.getQuery()

    return query.firstOrFail()
  }

  /**
   * Execute the relationship query and return the first related model or the result of
   * the callback if not found.
   *
   * @param callback
   * @returns
   */
  public async firstOr<TResult>(
    callback: () => TResult | Promise<TResult>,
  ): Promise<TModel | TResult> {
    const result = await this.first()
    if (result) return result

    return callback()
  }

  /**
   * Execute the relationship query with an additional where clause and return the first
   * related model or null if not found.
   *
   * @param key
   * @param value
   */
  public async firstWhere<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    value: ModelAttributes<TModel>[TKey],
  ): Promise<TModel | null>
  public async firstWhere<TKey extends keyof ModelAttributes<TModel> & string>(
    key: TKey,
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=',
    value: ModelAttributes<TModel>[TKey],
  ): Promise<TModel | null>
  public async firstWhere(
    key: string,
    operatorOrValue: unknown,
    maybeValue?: unknown,
  ): Promise<TModel | null> {
    const query = await this.getQuery()

    return maybeValue === undefined
      ? query.firstWhere(key as never, operatorOrValue as never)
      : query.firstWhere(key as never, operatorOrValue as never, maybeValue as never)
  }

  /**
   * Count records that match the relationship query.
   *
   * @returns
   */
  public async count(): Promise<number> {
    const query = await this.getQuery()

    return query.count()
  }

  /**
   * Determine whether the relationship query has any matching records.
   *
   * @returns
   */
  public async exists(): Promise<boolean> {
    const query = await this.getQuery()

    return query.exists()
  }

  /**
   * Determine whether the relationship query has no matching records.
   *
   * @returns
   */
  public async doesntExist(): Promise<boolean> {
    return !(await this.exists())
  }

  /**
   * Create a new instance of the related model with the given attributes and
   * relationship creation attributes applied, but do not save it.
   *
   * @param attributes
   * @returns
   */
  public make(attributes: Record<string, unknown> = {}): TModel {
    const model = this.getRelatedModelConstructor().hydrate(
      this.mergeCreationAttributes(attributes),
    )

    // make() builds an unpersisted instance, so it must not be flagged as
    // existing even though hydrate() marks rows loaded from the database.
    ;(model as unknown as { exists: boolean }).exists = false

    return model
  }

  /**
   * Create new instances of the related model with the given attributes and relationship
   * creation attributes applied, but do not save them.
   *
   * @param attributes
   * @returns
   */
  public makeMany(attributes: Record<string, unknown>[] = []): TModel[] {
    return attributes.map((item) => this.make(item))
  }

  /**
   * Create a new instance of the related model with the given attributes and relationship
   * creation attributes applied, and save it to the database.
   *
   * @param attributes
   * @returns
   */
  public async create(attributes: Record<string, unknown> = {}): Promise<TModel> {
    return await this.getRelatedModelConstructor()
      .query()
      .create(this.mergeCreationAttributes(attributes) as never)
  }

  /**
   * Create new instances of the related model with the given attributes and relationship
   * creation attributes applied, and save them to the database.
   *
   * @param values
   * @returns
   */
  public async createMany(values: Record<string, unknown>[] = []): Promise<TModel[]> {
    if (values.length === 0) return []

    return await Promise.all(values.map(async (value) => await this.create(value)))
  }

  /**
   * Save the given model instance by applying relationship creation attributes and calling save() on it.
   *
   * @param model
   * @returns
   */
  public async save(model: TModel): Promise<TModel> {
    const saveable = this.applyCreationAttributesToModel(model) as TModel & {
      save?: () => Promise<TModel>
      getRawAttributes?: () => Record<string, unknown>
    }

    if (typeof saveable.save !== 'function')
      throw new UnsupportedAdapterFeatureException('Related model does not support save().', {
        operation: 'relation.save',
      })

    try {
      return await saveable.save()
    } catch (error) {
      if (!this.shouldCreateAfterSaveMiss(error)) throw error

      const attributes =
        typeof saveable.getRawAttributes === 'function' ? saveable.getRawAttributes() : {}

      return await this.create(attributes)
    }
  }

  /**
   * Save the given model instance by applying relationship creation attributes and
   * calling saveQuietly() on it if supported, otherwise falling back to save().
   *
   * @param model
   * @returns
   */
  public async saveQuietly(model: TModel): Promise<TModel> {
    const saveable = this.applyCreationAttributesToModel(model) as TModel & {
      getRawAttributes?: () => Record<string, unknown>
      save?: () => Promise<TModel>
      saveQuietly?: () => Promise<TModel>
    }

    if (typeof saveable.saveQuietly === 'function') {
      try {
        return await saveable.saveQuietly()
      } catch (error) {
        if (!this.shouldCreateAfterSaveMiss(error)) throw error

        const attributes =
          typeof saveable.getRawAttributes === 'function' ? saveable.getRawAttributes() : {}

        return await this.create(attributes)
      }
    }

    if (typeof saveable.save === 'function') return await saveable.save()

    throw new UnsupportedAdapterFeatureException('Related model does not support saveQuietly().', {
      operation: 'relation.saveQuietly',
    })
  }

  private shouldCreateAfterSaveMiss(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'ModelNotFoundException' || error.message.includes('Record not found'))
    )
  }

  /**
   * Create new instances of the related model with the given attributes and
   * relationship * creation attributes applied, and save them to the database.
   *
   * @param models
   * @returns
   */
  public async saveMany(models: TModel[] = []): Promise<TModel[]> {
    return await Promise.all(models.map(async (model) => await this.save(model)))
  }

  /**
   * Create new instances of the related model with the given attributes and relationship
   * creation attributes applied, and save them to the database.
   *
   * @param models
   * @returns
   */
  public async saveManyQuietly(models: TModel[] = []): Promise<TModel[]> {
    return await Promise.all(models.map(async (model) => await this.saveQuietly(model)))
  }

  /**
   * Find a related model by a specific key and value, applying relationship constraints.
   *
   * @param value
   * @param key
   */
  public async find<TKey extends keyof ModelAttributes<TModel> & string>(
    value: ModelAttributes<TModel>[TKey],
    key: TKey,
  ): Promise<TModel | null>
  public async find(value: string | number, key?: string): Promise<TModel | null>
  public async find(value: unknown, key?: string): Promise<TModel | null> {
    const query = await this.getQuery()

    return query.find(value as never, key as never)
  }

  /**
   * Find related models by a specific key and array of values, applying relationship constraints.
   *
   * @param values
   * @param key
   */
  public async findMany<TKey extends keyof ModelAttributes<TModel> & string>(
    values: ModelAttributes<TModel>[TKey][],
    key: TKey,
  ): Promise<ArkormCollection<TModel>>
  public async findMany(
    values: Array<string | number>,
    key?: string,
  ): Promise<ArkormCollection<TModel>>
  public async findMany(values: unknown[], key?: string): Promise<ArkormCollection<TModel>> {
    const related = this.getRelatedModelConstructor()
    const resolvedKey = key ?? related.getPrimaryKey()
    const query = await this.getQuery()

    return query.where({ [resolvedKey]: { in: values } } as never).get()
  }

  /**
   * Find a related model by a specific key and value, applying relationship constraints, or
   * return the result of the callback if not found.
   *
   * @param value
   * @param callback
   */
  public async findOr<TResult>(
    value: string | number,
    callback: () => TResult | Promise<TResult>,
  ): Promise<TModel | TResult>
  public async findOr<TResult>(
    value: string | number,
    key: string,
    callback: () => TResult | Promise<TResult>,
  ): Promise<TModel | TResult>
  public async findOr<TResult>(
    value: string | number,
    keyOrCallback: string | (() => TResult | Promise<TResult>),
    maybeCallback?: () => TResult | Promise<TResult>,
  ): Promise<TModel | TResult> {
    const query = await this.getQuery()

    return typeof keyOrCallback === 'function'
      ? query.findOr(value, keyOrCallback)
      : query.findOr(value, keyOrCallback, maybeCallback!)
  }

  /**
   * Find a related model by a specific key and value, applying relationship constraints, or
   * throw an error if not found.
   *
   * @param value
   * @param key
   */
  public async findOrFail<TKey extends keyof ModelAttributes<TModel> & string>(
    value: ModelAttributes<TModel>[TKey],
    key: TKey,
  ): Promise<TModel>
  public async findOrFail(value: string | number, key?: string): Promise<TModel>
  public async findOrFail(value: unknown, key?: string): Promise<TModel> {
    const found = await this.find(value as never, key as never)
    if (found) return found

    const query = await this.getQuery()

    return query
      .where({
        [key ?? this.getRelatedModelConstructor().getPrimaryKey()]: value,
      })
      .firstOrFail()
  }

  /**
   * Find the first related model by a specific key and value, or create a new instance if not found.
   *
   * @param attributes
   * @param values
   * @returns
   */
  public async firstOrNew(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {},
  ): Promise<TModel> {
    const query = await this.getQuery()
    const found = await query
      .clone()
      .where(attributes as never)
      .first()
    if (found) return found

    return this.make({ ...attributes, ...values })
  }

  /**
   * Find the first related model by a specific key and value, or create and save a new instance
   * if not found.
   *
   * @param attributes
   * @param values
   * @returns
   */
  public async firstOrCreate(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {},
  ): Promise<TModel> {
    const query = await this.getQuery()
    const found = await query
      .clone()
      .where(attributes as never)
      .first()
    if (found) return found

    return await this.create({ ...attributes, ...values })
  }

  /**
   * Find the first related model by a specific key and value, update the first matching record with
   * the given values, or create and save a new instance if no matching record is found.
   *
   * @param attributes
   * @param values
   * @returns
   */
  public async updateOrCreate(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {},
  ): Promise<TModel> {
    const query = await this.getQuery()
    const found = await query
      .clone()
      .where(attributes as never)
      .first()
    if (!found) return await this.create({ ...attributes, ...values })

    const updatable = found as TModel & {
      fill?: (attributes: Record<string, unknown>) => TModel
      save?: () => Promise<TModel>
    }

    if (typeof updatable.fill === 'function' && typeof updatable.save === 'function')
      return await (updatable.fill(values) as any).save()

    return await query
      .clone()
      .where(attributes as never)
      .update(values as never)
  }

  /**
   * Find related models by specific attributes, update matching records with the given values, or
   * create and save new instances if no matching records are found.
   *
   * @param values
   * @param uniqueBy
   * @param update
   * @returns
   */
  public async upsert(
    values: Array<Record<string, unknown>>,
    uniqueBy: string | string[],
    update: string[] | null = null,
  ): Promise<number> {
    const query = await this.getQuery()

    return await query.upsert(
      values.map((value) => this.mergeCreationAttributes(value)),
      uniqueBy,
      update,
    )
  }

  /**
   * Paginate the relationship query results.
   *
   * @param perPage
   * @param page
   * @param options
   * @returns
   */
  public async paginate(
    perPage = 15,
    page?: number,
    options: PaginationOptions = {},
  ): Promise<LengthAwarePaginator<TModel>> {
    const query = await this.getQuery()

    return query.paginate(perPage, page, options)
  }

  /**
   * Paginate the relationship query results without total count optimization.
   *
   * @param perPage
   * @param page
   * @param options
   * @returns
   */
  public async simplePaginate(
    perPage = 15,
    page?: number,
    options: PaginationOptions = {},
  ): Promise<Paginator<TModel>> {
    const query = await this.getQuery()

    return query.simplePaginate(perPage, page, options)
  }

  /**
   * Get the results of the relationship query.
   *
   * @returns A promise that resolves to the related model(s) or null if not found.
   */
  public abstract getResults(): Promise<TModel | ArkormCollection<TModel> | null>
}
