import type {
    AdapterQueryInspection,
    AdapterQueryOperation,
    AggregateSpec,
    DatabaseAdapter,
    DatabaseRow,
    DatabaseValue,
    DeleteSpec,
    EagerLoadConstraint,
    EagerLoadMap,
    InsertManySpec,
    InsertSpec,
    ModelQuerySchemaLike,
    PaginationOptions,
    QueryComparisonCondition,
    QueryComparisonOperator,
    QueryCondition,
    QueryJoin,
    QueryJoinConstraint,
    QueryJoinType,
    QueryJsonConditionKind,
    QueryOrderBy,
    QueryRawCondition,
    QueryScalarComparisonOperator,
    QuerySchemaCreateData,
    QuerySchemaInclude,
    QuerySchemaOrderBy,
    QuerySchemaSelect,
    QuerySchemaUniqueWhere,
    QuerySchemaUpdateData,
    QuerySchemaWhere,
    QuerySelectColumn,
    QueryTarget,
    RelationAggregateConstraint,
    RelationAggregateInput,
    RelationAggregateSpec,
    RelationAggregateType,
    RelationFilterSpec,
    RelationLoadPlan,
    RelationResult,
    RelationResultCache,
    SelectSpec,
    SoftDeleteQueryMode,
    UpdateManySpec,
    UpdateSpec,
    UpsertSpec,
} from './types'
import { EagerLoadRelations, JoinOn, JoinSource, WhereCallback } from './types/query-builder'
import { LengthAwarePaginator, Paginator } from './Paginator'
import type { ModelAttributes, ModelCreateData, ModelUpdateData } from './types/model'

import { ArkormCollection } from './Collection'
import { ArkormException } from './Exceptions/ArkormException'
import { JoinClause } from './JoinClause'
import { ModelNotFoundException } from './Exceptions/ModelNotFoundException'
import type { ModelStatic } from './types/ModelStatic'
import { PrimaryKeyGenerationPlanner } from './helpers/PrimaryKeyGenerationPlanner'
import { QueryConstraintException } from './Exceptions/QueryConstraintException'
import { QueryExecutionException } from './Exceptions/QueryExecutionException'
import { RelationResolutionException } from './Exceptions/RelationResolutionException'
import { ScopeNotDefinedException } from './Exceptions/ScopeNotDefinedException'
import { SetBasedEagerLoader } from './relationship/SetBasedEagerLoader'
import { UniqueConstraintResolutionException } from './Exceptions/UniqueConstraintResolutionException'
import { UnsupportedAdapterFeatureException } from './Exceptions/UnsupportedAdapterFeatureException'
import { getRuntimePaginationCurrentPageResolver } from './helpers/runtime-config'

/**
 * The QueryBuilder class provides a fluent interface for building and 
 * executing database queries.
 * 
 * @template TModel The type of the model being queried.
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class QueryBuilder<TModel, TDelegate extends ModelQuerySchemaLike = ModelQuerySchemaLike> {
    private queryWhere?: QueryCondition
    private legacyWhere?: QuerySchemaWhere<TDelegate>
    private queryRelationLoads?: RelationLoadPlan[]
    private queryOrderBy?: QueryOrderBy[]
    private querySelect?: QuerySelectColumn[]
    private queryDistinct = false
    private queryGroupBy?: string[]
    private queryHaving?: QueryCondition
    private queryJoins?: QueryJoin[]
    private offsetValue?: number
    private limitValue?: number
    private readonly eagerLoads: EagerLoadMap = {}
    private includeTrashed = false
    private onlyTrashedRecords = false
    private randomOrderEnabled = false
    private readonly relationFilters: Array<{
        relation: string
        callback?: (query: QueryBuilder<any, any>) => unknown
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<'
        count: number
        boolean: 'AND' | 'OR'
    }> = []
    private readonly relationAggregates: Array<{
        type: RelationAggregateType
        relation: string
        column?: string
        alias?: string
        callback?: RelationAggregateConstraint
    }> = []

    /**
     * Creates a new QueryBuilder instance.
     * 
     * @param model 
     */
    public constructor(
        private readonly model: ModelStatic<TModel, TDelegate>,
        private readonly adapter?: DatabaseAdapter,
    ) { }

    private resolvePaginationPage (
        page: number | undefined,
        options: PaginationOptions,
    ): number {
        if (typeof page !== 'undefined') {
            return Number.isFinite(page) ? Math.max(1, page) : 1
        }

        const pageName = options.pageName ?? 'page'
        const resolveCurrentPage = getRuntimePaginationCurrentPageResolver()
        const resolvedPage = resolveCurrentPage?.(pageName, options)

        if (typeof resolvedPage !== 'number' || !Number.isFinite(resolvedPage)) {
            return 1
        }

        return Math.max(1, resolvedPage)
    }

    /**
     * Adds a where clause to the query. Multiple calls to where will combine
     * the clauses with AND logic.
     *
     * Pass a callback to build a parenthesized group of nested conditions, e.g.
     * `where(query => query.where({ a: 1 }).orWhere({ b: 2 }))` compiles to
     * `(... or ...)`.
     *
     * @param where
     * @returns
     */
    public where (where: QuerySchemaWhere<TDelegate>): this
    public where (callback: WhereCallback<TModel, TDelegate>): this
    public where (whereOrCallback: QuerySchemaWhere<TDelegate> | WhereCallback<TModel, TDelegate>): this {
        if (typeof whereOrCallback === 'function')
            return this.appendNestedWhere('AND', whereOrCallback)

        return this.addLogicalWhere('AND', whereOrCallback)
    }

    /**
     * Adds an OR where clause to the query. Pass a callback to build a
     * parenthesized group of nested conditions.
     *
     * @param where
     * @returns
     */
    public orWhere (where: QuerySchemaWhere<TDelegate>): this
    public orWhere (callback: WhereCallback<TModel, TDelegate>): this
    public orWhere (whereOrCallback: QuerySchemaWhere<TDelegate> | WhereCallback<TModel, TDelegate>): this {
        if (typeof whereOrCallback === 'function')
            return this.appendNestedWhere('OR', whereOrCallback)

        return this.addLogicalWhere('OR', whereOrCallback)
    }

    /**
     * Resolve a callback into a parenthesized group condition and append it.
     */
    private appendNestedWhere (boolean: 'AND' | 'OR', callback: WhereCallback<TModel, TDelegate>): this {
        const nested = new QueryBuilder<TModel, TDelegate>(this.model, this.adapter)
        callback(nested)

        const condition = nested.getNestedWhereCondition()
        if (!condition)
            return this

        const grouped: QueryCondition = condition.type === 'group'
            ? condition
            : { type: 'group', operator: 'and', conditions: [condition] }

        this.appendQueryCondition(boolean, grouped)

        return this
    }

    /**
     * Returns the user-authored where condition for nesting, excluding any
     * soft-delete predicate (the parent query owns that).
     */
    private getNestedWhereCondition (): QueryCondition | undefined {
        if (this.legacyWhere)
            return this.tryBuildQueryCondition(this.legacyWhere) ?? undefined

        return this.queryWhere
    }

    /**
     * Adds a NOT where clause to the query.
     *
     * @param where
     * @returns
     */
    public whereNot (where: QuerySchemaWhere<TDelegate>): this {
        return this.where({ NOT: where } as unknown as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds an OR NOT where clause to the query.
     *
     * @param where
     * @returns
     */
    public orWhereNot (where: QuerySchemaWhere<TDelegate>): this {
        return this.orWhere({ NOT: where } as unknown as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a null check for a key.
     *
     * @param key
     * @returns
     */
    public whereNull<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: null } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a not-null check for a key.
     *
     * @param key
     * @returns
     */
    public whereNotNull<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: { not: null } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a between range clause for a key.
     *
     * @param key
     * @param range
     * @returns
     */
    public whereBetween<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        range: [ModelAttributes<TModel>[TKey], ModelAttributes<TModel>[TKey]]
    ): this {
        const [min, max] = range

        return this.where({ [key]: { gte: min, lte: max } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a date-only equality clause for a date-like key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereDate<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Date | string
    ): this {
        const target = this.coerceDate(value)
        const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()))
        const end = new Date(start)
        end.setUTCDate(end.getUTCDate() + 1)

        return this.where({ [key]: { gte: start, lt: end } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a month clause for a date-like key.
     *
     * @param key
     * @param month
     * @param year
     * @returns
     */
    public whereMonth<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        month: number,
        year = new Date().getUTCFullYear()
    ): this {
        const normalizedMonth = Math.min(12, Math.max(1, month))
        const start = new Date(Date.UTC(year, normalizedMonth - 1, 1))
        const end = new Date(Date.UTC(year, normalizedMonth, 1))

        return this.where({ [key]: { gte: start, lt: end } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a year clause for a date-like key.
     *
     * @param key
     * @param year
     * @returns
     */
    public whereYear<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        year: number
    ): this {
        const start = new Date(Date.UTC(year, 0, 1))
        const end = new Date(Date.UTC(year + 1, 0, 1))

        return this.where({ [key]: { gte: start, lt: end } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a time clause for a date-like key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereTime<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Date | string
    ): this
    /**
     * Adds a time clause for a date-like key.
     *
     * @param key
     * @param operator
     * @param value
     * @returns
     */
    public whereTime<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        operator: QueryScalarComparisonOperator,
        value: Date | string
    ): this
    public whereTime<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        operatorOrValue: QueryScalarComparisonOperator | Date | string,
        maybeValue?: Date | string
    ): this {
        const hasOperator = maybeValue !== undefined
        const operator = (hasOperator ? operatorOrValue : '=') as QueryScalarComparisonOperator
        const value = hasOperator ? maybeValue : operatorOrValue

        this.appendQueryCondition('AND', {
            type: 'time',
            column: key,
            operator,
            value: this.normalizeTimeValue(value as Date | string),
        })

        return this
    }

    /**
     * Adds a day clause for a date-like key.
     *
     * @param key
     * @param day
     * @returns
     */
    public whereDay<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        day: number
    ): this
    /**
     * Adds a day clause for a date-like key.
     *
     * @param key
     * @param operator
     * @param day
     * @returns
     */
    public whereDay<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        operator: QueryScalarComparisonOperator,
        day: number
    ): this
    public whereDay<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        operatorOrDay: QueryScalarComparisonOperator | number,
        maybeDay?: number
    ): this {
        const hasOperator = maybeDay !== undefined
        const operator = (hasOperator ? operatorOrDay : '=') as QueryScalarComparisonOperator
        const day = Number(hasOperator ? maybeDay : operatorOrDay)
        if (!Number.isInteger(day) || day < 1 || day > 31)
            throw new ArkormException('whereDay() expects an integer between 1 and 31.')

        this.appendQueryCondition('AND', {
            type: 'day',
            column: key,
            operator,
            value: day,
        })

        return this
    }

    /**
     * Adds clause to determine if a column's value is in the past
     * 
     * @param key 
     * @returns 
     */
    public wherePast<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: { lt: new Date() } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is in the future
     * 
     * @param key 
     * @returns 
     */
    public whereFuture<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: { gt: new Date() } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is in the past, inclusive of the current date and time
     * 
     * @param key 
     * @returns 
     */
    public whereNowOrPast<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: { lte: new Date() } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is in the future, inclusive of the current date and time
     * 
     * @param key 
     * @returns 
     */
    public whereNowOrFuture<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: { gte: new Date() } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is today
     * 
     * @param key 
     * @returns 
     */
    public whereToday<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        const [start, end] = this.getUtcDayBounds()

        return this.where({ [key]: { gte: start, lt: end } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is before today
     * 
     * @param key 
     * @returns 
     */
    public whereBeforeToday<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        const [start] = this.getUtcDayBounds()

        return this.where({ [key]: { lt: start } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is after today
     * 
     * @param key 
     * @returns 
     */
    public whereAfterToday<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        const [, end] = this.getUtcDayBounds()

        return this.where({ [key]: { gte: end } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is today or before today
     * 
     * @param key 
     * @returns 
     */
    public whereTodayOrBefore<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        const [, end] = this.getUtcDayBounds()

        return this.where({ [key]: { lt: end } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds clause to determine if a column's value is today or after today
     * 
     * @param key 
     * @returns 
     */
    public whereTodayOrAfter<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        const [start] = this.getUtcDayBounds()

        return this.where({ [key]: { gte: start } } as QuerySchemaWhere<TDelegate>)
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
    > (left: TLeft, right: TRight): this
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
    > (left: TLeft, operator: QueryScalarComparisonOperator, right: TRight): this
    public whereColumn (
        left: string,
        operatorOrRight: QueryScalarComparisonOperator | string,
        maybeRight?: string
    ): this {
        this.appendQueryCondition('AND', {
            type: 'column-comparison',
            leftColumn: left,
            operator: (maybeRight === undefined ? '=' : operatorOrRight) as QueryScalarComparisonOperator,
            rightColumn: maybeRight ?? operatorOrRight,
        })

        return this
    }

    /**
     * Adds "where exists" SQL clauses.
     * 
     * @param queryOrCallback 
     * @returns 
     */
    public whereExists (
        queryOrCallback: QueryBuilder<any, any>
            | ((query: QueryBuilder<TModel, TDelegate>) => QueryBuilder<any, any> | void)
    ): this {
        const baseQuery = new QueryBuilder<TModel, TDelegate>(this.model, this.adapter)
        const resolved = typeof queryOrCallback === 'function'
            ? queryOrCallback(baseQuery) ?? baseQuery
            : queryOrCallback
        const existsQuery = resolved as QueryBuilder<any, any>
        const spec = existsQuery.tryBuildSelectSpec(existsQuery.buildWhere() as never)
        if (!spec) {
            throw new UnsupportedAdapterFeatureException('Exists subquery could not be compiled.', {
                operation: 'whereExists',
                model: this.model.name,
            })
        }

        this.appendQueryCondition('AND', {
            type: 'exists',
            query: {
                ...spec,
                columns: undefined,
                orderBy: undefined,
                limit: undefined,
                offset: undefined,
                relationLoads: undefined,
                relationAggregates: undefined,
                relationFilters: undefined,
            },
        })

        return this
    }

    /**
     * Adds a fulltext clause for columns that have full text indexes.
     *
     * @param columns
     * @param value
     * @param options
     * @returns
     */
    public whereFullText<TKey extends keyof ModelAttributes<TModel> & string> (
        columns: TKey | TKey[],
        value: string,
        options: { language?: string } = {}
    ): this {
        const normalizedColumns = Array.isArray(columns) ? columns : [columns]
        if (normalizedColumns.length === 0)
            throw new ArkormException('whereFullText() expects at least one column.')

        const language = options.language ?? 'simple'
        if (!/^[a-z][a-z0-9_]*$/i.test(language))
            throw new ArkormException('whereFullText() language must be a valid PostgreSQL text search configuration name.')

        this.appendQueryCondition('AND', {
            type: 'full-text',
            columns: normalizedColumns,
            value,
            language,
        })

        return this
    }

    /**
     * Adds an OR fulltext clause for columns that have full text indexes.
     *
     * @param columns
     * @param value
     * @param options
     * @returns
     */
    public orWhereFullText<TKey extends keyof ModelAttributes<TModel> & string> (
        columns: TKey | TKey[],
        value: string,
        options: { language?: string } = {}
    ): this {
        const normalizedColumns = Array.isArray(columns) ? columns : [columns]
        if (normalizedColumns.length === 0)
            throw new ArkormException('orWhereFullText() expects at least one column.')

        const language = options.language ?? 'simple'
        if (!/^[a-z][a-z0-9_]*$/i.test(language))
            throw new ArkormException('orWhereFullText() language must be a valid PostgreSQL text search configuration name.')

        this.appendQueryCondition('OR', {
            type: 'full-text',
            columns: normalizedColumns,
            value,
            language,
        })

        return this
    }

    /**
     * Adds a strongly-typed inequality where clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereKeyNot<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: ModelAttributes<TModel>[TKey]
    ): this {
        return this.where({ [key]: { not: value } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a strongly-typed OR IN where clause for a single attribute key.
     *
     * @param key
     * @param values
     * @returns
     */
    public orWhereIn<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        values: ModelAttributes<TModel>[TKey][]
    ): this {
        return this.orWhere({ [key]: { in: values } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a strongly-typed NOT IN where clause for a single attribute key.
     *
     * @param key
     * @param values
     * @returns
     */
    public whereNotIn<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        values: ModelAttributes<TModel>[TKey][]
    ): this {
        return this.where({ [key]: { notIn: values } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a string contains clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereLike<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.where({ [key]: { contains: value } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds an OR string contains clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public orWhereLike<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.orWhere({ [key]: { contains: value } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a negated string contains (NOT LIKE) clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereNotLike<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.where({ NOT: { [key]: { contains: value } } } as unknown as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds an OR negated string contains (NOT LIKE) clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public orWhereNotLike<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.orWhere({ NOT: { [key]: { contains: value } } } as unknown as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Append a structured JSON predicate, splitting a `column->path->key`
     * expression into its base column and nested path segments.
     * 
     * @param boolean 
     * @param kind 
     * @param column 
     * @param options 
     * @returns 
     */
    private appendJsonCondition (
        boolean: 'AND' | 'OR',
        kind: QueryJsonConditionKind,
        column: string,
        options: { not?: boolean, value?: DatabaseValue, operator?: QueryScalarComparisonOperator } = {}
    ): this {
        const [base, ...path] = column.split('->').map(segment => segment.trim())
        if (!base)
            throw new ArkormException('JSON where clauses require a column name.')

        this.appendQueryCondition(boolean, {
            type: 'json',
            kind,
            column: base,
            path: path.length > 0 ? path : undefined,
            not: options.not,
            value: options.value,
            operator: options.operator,
        })

        return this
    }

    /**
     * Adds a clause asserting the JSON column contains the given value
     * (PostgreSQL `@>` containment).
     *
     * @param column
     * @param value
     * @returns
     */
    public whereJsonContains (column: string, value: DatabaseValue): this {
        return this.appendJsonCondition('AND', 'contains', column, { value })
    }

    /**
     * OR variant of whereJsonContains().
     * 
     * @param column 
     * @param value 
     * @returns 
     */
    public orWhereJsonContains (column: string, value: DatabaseValue): this {
        return this.appendJsonCondition('OR', 'contains', column, { value })
    }

    /**
     * Adds a clause asserting the JSON column does not contain the given value.
     *
     * @param column
     * @param value
     * @returns
     */
    public whereJsonDoesntContain (column: string, value: DatabaseValue): this {
        return this.appendJsonCondition('AND', 'contains', column, { value, not: true })
    }

    /**
     * OR variant of whereJsonDoesntContain().
     * 
     * @param column 
     * @param value 
     * @returns 
     */
    public orWhereJsonDoesntContain (column: string, value: DatabaseValue): this {
        return this.appendJsonCondition('OR', 'contains', column, { value, not: true })
    }

    /**
     * Adds a clause asserting the JSON document contains the given key/path.
     *
     * @param column
     * @returns
     */
    public whereJsonContainsKey (column: string): this {
        return this.appendJsonCondition('AND', 'contains-key', column)
    }

    /**
     * OR variant of whereJsonContainsKey().
     * 
     * @param column 
     * @returns 
     */
    public orWhereJsonContainsKey (column: string): this {
        return this.appendJsonCondition('OR', 'contains-key', column)
    }

    /**
     * Adds a clause asserting the JSON document does not contain the given key/path.
     *
     * @param column
     * @returns
     */
    public whereJsonDoesntContainKey (column: string): this {
        return this.appendJsonCondition('AND', 'contains-key', column, { not: true })
    }

    /**
     * OR variant of whereJsonDoesntContainKey().
     * 
     * @param column 
     * @returns 
     */
    public orWhereJsonDoesntContainKey (column: string): this {
        return this.appendJsonCondition('OR', 'contains-key', column, { not: true })
    }

    /**
     * Adds a clause comparing the length of a JSON array column.
     *
     * @param column
     * @param operatorOrValue
     * @param maybeValue
     * @returns
     */
    public whereJsonLength (column: string, value: number): this
    public whereJsonLength (column: string, operator: QueryScalarComparisonOperator, value: number): this
    public whereJsonLength (column: string, operatorOrValue: QueryScalarComparisonOperator | number, maybeValue?: number): this {
        const { operator, value } = this.resolveJsonLengthArgs(operatorOrValue, maybeValue)

        return this.appendJsonCondition('AND', 'length', column, { operator, value })
    }

    /**
     * OR variant of whereJsonLength().
     * 
     * @param column 
     * @param value 
     */
    public orWhereJsonLength (column: string, value: number): this
    public orWhereJsonLength (column: string, operator: QueryScalarComparisonOperator, value: number): this
    public orWhereJsonLength (column: string, operatorOrValue: QueryScalarComparisonOperator | number, maybeValue?: number): this {
        const { operator, value } = this.resolveJsonLengthArgs(operatorOrValue, maybeValue)

        return this.appendJsonCondition('OR', 'length', column, { operator, value })
    }

    private resolveJsonLengthArgs (
        operatorOrValue: QueryScalarComparisonOperator | number,
        maybeValue?: number
    ): { operator: QueryScalarComparisonOperator, value: number } {
        const hasOperator = maybeValue !== undefined
        const operator = (hasOperator ? operatorOrValue : '=') as QueryScalarComparisonOperator
        const value = (hasOperator ? maybeValue : operatorOrValue) as number
        if (!Number.isInteger(value) || value < 0)
            throw new ArkormException('whereJsonLength() expects a non-negative integer length.')

        return { operator, value }
    }

    /**
     * Adds a clause asserting the JSON array column overlaps with the given
     * array (shares at least one element).
     *
     * @param column
     * @param value
     * @returns
     */
    public whereJsonOverlaps (column: string, value: DatabaseValue): this {
        return this.appendJsonCondition('AND', 'overlaps', column, { value })
    }

    /**
     * OR variant of whereJsonOverlaps().
     * 
     * @param column 
     * @param value 
     * @returns 
     */
    public orWhereJsonOverlaps (column: string, value: DatabaseValue): this {
        return this.appendJsonCondition('OR', 'overlaps', column, { value })
    }

    /**
     * Adds a string starts-with clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereStartsWith<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.where({ [key]: { startsWith: value } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a string ends-with clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereEndsWith<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.where({ [key]: { endsWith: value } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a strongly-typed OR NOT IN where clause for a single attribute key.
     *
     * @param key
     * @param values
     * @returns
     */
    public orWhereNotIn<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        values: ModelAttributes<TModel>[TKey][]
    ): this {
        return this.orWhere({ [key]: { notIn: values } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a where clause and returns the first result.
     *
     * @param key
     * @param value
     * @returns
     */
    public async firstWhere<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: ModelAttributes<TModel>[TKey]
    ): Promise<TModel | null>

    /**
     * Adds a comparison where clause and returns the first result.
     *
     * @param key
     * @param operator
     * @param value
     * @returns
     */
    public async firstWhere<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        operator: '=' | '!=' | '>' | '>=' | '<' | '<=',
        value: ModelAttributes<TModel>[TKey]
    ): Promise<TModel | null>
    public async firstWhere (
        key: string,
        operatorOrValue: unknown,
        maybeValue?: unknown
    ): Promise<TModel | null> {
        const hasOperator = maybeValue !== undefined
        const operator = (hasOperator ? operatorOrValue : '=') as '=' | '!=' | '>' | '>=' | '<' | '<='
        const value = hasOperator ? maybeValue : operatorOrValue

        return this.clone().where(this.buildComparisonWhere(key, operator, value)).first()
    }

    private addLogicalWhere (operator: 'AND' | 'OR', where: QuerySchemaWhere<TDelegate>): this {
        const condition = this.tryBuildQueryCondition(where)
        if (!this.legacyWhere && condition) {
            if (!this.queryWhere) {
                this.queryWhere = condition

                return this
            }

            this.queryWhere = {
                type: 'group',
                operator: operator === 'AND' ? 'and' : 'or',
                conditions: [this.queryWhere, condition],
            }

            return this
        }

        const existingWhere = this.legacyWhere ?? this.toQuerySchemaWhere(this.queryWhere)
        this.queryWhere = undefined

        if (!existingWhere) {
            this.legacyWhere = where

            return this
        }

        this.legacyWhere = {
            [operator]: [existingWhere as Record<string, unknown>, where as Record<string, unknown>],
        } as QuerySchemaWhere<TDelegate>

        return this
    }

    private buildComparisonWhere (
        key: string,
        operator: '=' | '!=' | '>' | '>=' | '<' | '<=',
        value: unknown
    ): QuerySchemaWhere<TDelegate> {
        if (operator === '=')
            return { [key]: value } as QuerySchemaWhere<TDelegate>

        if (operator === '!=')
            return { [key]: { not: value } } as QuerySchemaWhere<TDelegate>

        if (operator === '>')
            return { [key]: { gt: value } } as QuerySchemaWhere<TDelegate>

        if (operator === '>=')
            return { [key]: { gte: value } } as QuerySchemaWhere<TDelegate>

        if (operator === '<')
            return { [key]: { lt: value } } as QuerySchemaWhere<TDelegate>

        return { [key]: { lte: value } } as QuerySchemaWhere<TDelegate>
    }

    private coerceDate (value: Date | string): Date {
        const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
        if (Number.isNaN(parsed.getTime()))
            throw new ArkormException('Invalid date value for date-based query helper.')

        return parsed
    }

    private normalizeTimeValue (value: Date | string): string {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime()))
                throw new ArkormException('Invalid date value for whereTime().')

            return value.toISOString().slice(11, 19)
        }

        const matched = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
        if (!matched)
            throw new ArkormException('whereTime() expects a Date or a time string in HH:mm[:ss] format.')

        const hour = Number(matched[1])
        const minute = Number(matched[2])
        const second = Number(matched[3] ?? 0)
        if (hour > 23 || minute > 59 || second > 59)
            throw new ArkormException('whereTime() received an invalid time value.')

        return `${matched[1]}:${matched[2]}:${String(second).padStart(2, '0')}`
    }

    private getUtcDayBounds (value = new Date()): [Date, Date] {
        const start = new Date(Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
        ))
        const end = new Date(start)
        end.setUTCDate(end.getUTCDate() + 1)

        return [start, end]
    }

    /**
     * Adds a strongly-typed equality where clause for a single attribute key.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereKey<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: ModelAttributes<TModel>[TKey]
    ): this {
        return this.where({ [key]: value } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds a strongly-typed IN where clause for a single attribute key.
     *
     * @param key
     * @param values
     * @returns
     */
    public whereIn<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        values: ModelAttributes<TModel>[TKey][]
    ): this {
        return this.where({ [key]: { in: values } } as QuerySchemaWhere<TDelegate>)
    }

    /**
     * Adds an orderBy clause to the query. This will overwrite any existing orderBy clause.
     * 
     * @param orderBy 
     * @returns 
     */
    public orderBy (orderBy: QuerySchemaOrderBy<TDelegate>): this {
        this.randomOrderEnabled = false
        const normalized = this.normalizeQueryOrderBy(orderBy)
        if (!normalized)
            throw new UnsupportedAdapterFeatureException('Order clauses must use Arkorm-normalizable column directions.', {
                operation: 'orderBy',
                model: this.model.name,
            })

        this.queryOrderBy = normalized

        return this
    }

    /**
     * Puts the query results in random order.
     *
     * @returns
     */
    public inRandomOrder (): this {
        this.randomOrderEnabled = true

        return this
    }

    /**
     * Removes existing order clauses and optionally applies a new one.
     *
     * @param column
     * @param direction
     * @returns
     */
    public reorder (column?: string, direction: 'asc' | 'desc' = 'asc'): this {
        this.queryOrderBy = undefined
        this.randomOrderEnabled = false

        if (!column)
            return this

        return this.orderBy({ [column]: direction } as QuerySchemaOrderBy<TDelegate>)
    }

    /**
     * Adds an orderBy descending clause for a timestamp-like column.
     *
     * @param column
     * @returns
     */
    public latest (column = 'createdAt'): this {
        return this.orderBy({ [column]: 'desc' } as QuerySchemaOrderBy<TDelegate>)
    }

    /**
     * Adds an orderBy ascending clause for a timestamp-like column.
     *
     * @param column
     * @returns
     */
    public oldest (column = 'createdAt'): this {
        return this.orderBy({ [column]: 'asc' } as QuerySchemaOrderBy<TDelegate>)
    }

    /**
     * Adds an include clause to the query. This will overwrite any existing include clause.
     * 
     * @param include 
     * @returns 
     */
    public include (include: QuerySchemaInclude<TDelegate>): this {
        const normalized = this.normalizeRelationLoads(include)
        if (normalized === null)
            throw new UnsupportedAdapterFeatureException('Include clauses could not be normalized into Arkorm relation load plans.', {
                operation: 'include',
                model: this.model.name,
                meta: {
                    feature: 'relationLoads',
                },
            })

        this.queryRelationLoads = normalized

        return this
    }

    /**
     * Adds eager loading for the specified relations. 
     * This will merge with any existing include clause.
     * 
     * @param relations 
     * @returns 
     */
    public with (relations: string | string[] | EagerLoadRelations<TModel>): this {
        const relationMap = this.normalizeWith(relations)

        Object.entries(relationMap).forEach(([name, constraint]) => {
            this.eagerLoads[name] = constraint
        })

        return this
    }

    /**
     * Add a relationship count/existence constraint.
     *
     * @param relation
     * @param operator
     * @param count
     * @param callback
     * @returns
     */
    public has (
        relation: string,
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<' = '>=',
        count = 1,
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): this {
        this.relationFilters.push({ relation, callback, operator, count, boolean: 'AND' })

        return this
    }

    /**
     * Add an OR relationship count/existence constraint.
     *
     * @param relation
     * @param operator
     * @param count
     * @returns
     */
    public orHas (
        relation: string,
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<' = '>=',
        count = 1
    ): this {
        this.relationFilters.push({ relation, operator, count, boolean: 'OR' })

        return this
    }

    /**
     * Add a relationship does-not-have constraint.
     *
     * @param relation
     * @param callback
     * @returns
     */
    public doesntHave (
        relation: string,
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): this {
        return this.has(relation, '<', 1, callback)
    }

    /**
     * Add an OR relationship does-not-have constraint.
     *
     * @param relation
     * @returns
     */
    public orDoesntHave (relation: string): this {
        return this.orHas(relation, '<', 1)
    }

    /**
     * Add a constrained relationship has clause.
     *
     * @param relation
     * @param callback
     * @param operator
     * @param count
     * @returns
     */
    public whereHas (
        relation: string,
        callback?: (query: QueryBuilder<any, any>) => unknown,
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<' = '>=',
        count = 1
    ): this {
        return this.has(relation, operator, count, callback)
    }

    /**
     * Add an OR constrained relationship has clause.
     *
     * @param relation
     * @param callback
     * @param operator
     * @param count
     * @returns
     */
    public orWhereHas (
        relation: string,
        callback?: (query: QueryBuilder<any, any>) => unknown,
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<' = '>=',
        count = 1
    ): this {
        this.relationFilters.push({ relation, callback, operator, count, boolean: 'OR' })

        return this
    }

    /**
     * Add a constrained relationship does-not-have clause.
     *
     * @param relation
     * @param callback
     * @returns
     */
    public whereDoesntHave (
        relation: string,
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): this {
        return this.whereHas(relation, callback, '<', 1)
    }

    /**
     * Add a constrained polymorphic relationship has clause.
     *
     * The current relationship metadata does not expose morph-to targets yet, so
     * this method delegates to whereHas while preserving the forward-compatible
     * API shape.
     *
     * @param relation
     * @param types
     * @param callback
     * @param operator
     * @param count
     * @returns
     */
    public whereHasMorph (
        relation: string,
        types: unknown | unknown[],
        callback?: (query: QueryBuilder<any, any>) => unknown,
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<' = '>=',
        count = 1
    ): this {
        void types

        return this.whereHas(relation, callback, operator, count)
    }

    /**
     * Add a constrained polymorphic relationship does-not-have clause.
     *
     * @param relation
     * @param types
     * @param callback
     * @returns
     */
    public whereDoesntHaveMorph (
        relation: string,
        types: unknown | unknown[],
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): this {
        void types

        return this.whereDoesntHave(relation, callback)
    }

    /**
     * Add an OR constrained relationship does-not-have clause.
     *
     * @param relation
     * @param callback
     * @returns
     */
    public orWhereDoesntHave (
        relation: string,
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): this {
        return this.orWhereHas(relation, callback, '<', 1)
    }

    /**
     * Add relationship count aggregate attributes.
     *
     * @param relations
     * @returns
     */
    public withCount (relations: RelationAggregateInput): this {
        return this.withRelationAggregate('count', relations)
    }

    /**
     * Add relationship existence aggregate attributes.
     *
     * @param relations
     * @returns
     */
    public withExists (relations: RelationAggregateInput): this {
        return this.withRelationAggregate('exists', relations)
    }

    /**
     * Add relationship sum aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withSum (relation: RelationAggregateInput, column: string): this {
        return this.withRelationAggregate('sum', relation, column)
    }

    /**
     * Add relationship average aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withAvg (relation: RelationAggregateInput, column: string): this {
        return this.withRelationAggregate('avg', relation, column)
    }

    /**
     * Add relationship minimum aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withMin (relation: RelationAggregateInput, column: string): this {
        return this.withRelationAggregate('min', relation, column)
    }

    /**
     * Add relationship maximum aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withMax (relation: RelationAggregateInput, column: string): this {
        return this.withRelationAggregate('max', relation, column)
    }

    /**
     * Includes soft-deleted records in the query results. 
     * This method is only applicable if the model has soft delete enabled.
     * 
     * @returns 
     */
    public withTrashed (): this {
        this.includeTrashed = true
        this.onlyTrashedRecords = false

        return this
    }

    /**
     * Limits the query results to only soft-deleted records. 
     * This method is only applicable if the model has soft delete enabled.
     * 
     * @returns 
     */
    public onlyTrashed (): this {
        this.onlyTrashedRecords = true
        this.includeTrashed = false

        return this
    }

    /**
     * Excludes soft-deleted records from the query results. 
     * This is the default behavior, but this method can be used to explicitly 
     * enforce it after using withTrashed or onlyTrashed.
     * 
     * @returns 
     */
    public withoutTrashed (): this {
        this.includeTrashed = false
        this.onlyTrashedRecords = false

        return this
    }

    /**
     * Applies a named scope to the query. A scope is a reusable query constraint
     * defined as a static method on the model. The scope method will look for a 
     * method with the name `scope{Name}` on the model's prototype. 
     * If found, it will call that method with the current query builder 
     * instance and any additional arguments provided.
     * 
     * @param name 
     * @param args 
     * @returns 
     */
    public scope (name: string, ...args: unknown[]): this {
        const methodName = `scope${name.charAt(0).toUpperCase()}${name.slice(1)}`
        const prototype = (this.model as unknown as { prototype?: Record<string, unknown> }).prototype
        const scope = prototype?.[methodName]
        if (typeof scope !== 'function')
            throw new ScopeNotDefinedException(`Scope [${name}] is not defined.`, {
                operation: 'scope',
                model: this.model.name,
                scope: name,
            })

        const scoped = scope.call(undefined, this, ...args)
        if (scoped && scoped !== this)
            return scoped as this

        return this
    }

    /**
     * Apply the callback when value is truthy.
     *
     * @param value
     * @param callback
     * @param defaultCallback
     * @returns
     */
    public when<TValue, TResult = this> (
        value: TValue | (() => TValue),
        callback: (query: this, value: TValue) => TResult,
        defaultCallback?: (query: this, value: TValue) => TResult
    ): this | TResult {
        const resolved = typeof value === 'function'
            ? (value as () => TValue)()
            : value

        if (resolved)
            return callback(this, resolved)

        if (defaultCallback)
            return defaultCallback(this, resolved)

        return this
    }

    /**
     * Apply the callback when value is falsy.
     *
     * @param value
     * @param callback
     * @param defaultCallback
     * @returns
     */
    public unless<TValue, TResult = this> (
        value: TValue | (() => TValue),
        callback: (query: this, value: TValue) => TResult,
        defaultCallback?: (query: this, value: TValue) => TResult
    ): this | TResult {
        const resolved = typeof value === 'function'
            ? (value as () => TValue)()
            : value

        if (!resolved)
            return callback(this, resolved)

        if (defaultCallback)
            return defaultCallback(this, resolved)

        return this
    }

    /**
     * Pass the query builder into a callback and return this.
     *
     * @param callback
     * @returns
     */
    public tap (callback: (query: this) => unknown): this {
        callback(this)

        return this
    }

    /**
     * Pass the query builder into a callback and return callback result.
     *
     * @param callback
     * @returns
     */
    public pipe<TResult> (callback: (query: this) => TResult): TResult {
        return callback(this)
    }

    /**
     * Adds a select clause to the query. This will overwrite any existing select clause.
     * 
     * @param select 
     * @returns 
     */
    public select (select: QuerySchemaSelect<TDelegate>): this {
        const normalized = this.normalizeQuerySelect(select)
        if (normalized === null)
            throw new UnsupportedAdapterFeatureException('Select clauses must use Arkorm-normalizable column projections.', {
                operation: 'select',
                model: this.model.name,
            })

        this.querySelect = normalized

        return this
    }

    /**
     * Appends columns or expressions to the existing select clause.
     *
     * @param select
     * @returns
     */
    public addSelect (select: QuerySchemaSelect<TDelegate>): this {
        const normalized = this.normalizeQuerySelect(select)
        if (normalized === null)
            throw new UnsupportedAdapterFeatureException('Select clauses must use Arkorm-normalizable column projections.', {
                operation: 'addSelect',
                model: this.model.name,
            })

        this.querySelect = [
            ...(this.querySelect ?? [{ column: '*', wildcard: true }]),
            ...normalized,
        ]

        return this
    }

    /**
     * Apply or remove DISTINCT from the select query.
     *
     * @param enabled
     * @returns
     */
    public distinct (enabled = true): this {
        this.queryDistinct = enabled

        return this
    }

    /**
     * Group query results by one or more model attributes.
     *
     * @param columns
     * @returns
     */
    public groupBy<TKey extends keyof ModelAttributes<TModel> & string> (
        columns: TKey[]
    ): this
    public groupBy<TKey extends keyof ModelAttributes<TModel> & string> (
        ...columns: TKey[]
    ): this
    public groupBy (...columns: Array<string | string[]>): this {
        const normalized = (Array.isArray(columns[0]) ? columns[0] : columns) as string[]
        if (normalized.length === 0)
            throw new QueryConstraintException('groupBy requires at least one column.', {
                operation: 'groupBy',
                model: this.model.name,
            })

        this.queryGroupBy = [...normalized]

        return this
    }

    private appendHavingCondition (boolean: 'AND' | 'OR', condition: QueryCondition): void {
        if (!this.queryHaving) {
            this.queryHaving = condition

            return
        }

        this.queryHaving = {
            type: 'group',
            operator: boolean === 'AND' ? 'and' : 'or',
            conditions: [this.queryHaving, condition],
        }
    }

    private buildHavingComparison (
        operatorOrValue: QueryScalarComparisonOperator | DatabaseValue,
        maybeValue: DatabaseValue | undefined,
        column: string,
    ): QueryComparisonCondition {
        const hasOperator = maybeValue !== undefined
        const operator = (hasOperator ? operatorOrValue : '=') as QueryScalarComparisonOperator
        const value = (hasOperator ? maybeValue : operatorOrValue) as DatabaseValue

        return { type: 'comparison', column, operator, value }
    }

    /**
     * Adds a HAVING clause to filter grouped rows. Accepts either
     * `having(column, value)` (defaulting to equality) or
     * `having(column, operator, value)`. Multiple calls combine with AND.
     *
     * @param column
     * @param operatorOrValue
     * @param maybeValue
     * @returns
     */
    public having (column: string, value: DatabaseValue): this
    public having (column: string, operator: QueryScalarComparisonOperator, value: DatabaseValue): this
    public having (
        column: string,
        operatorOrValue: QueryScalarComparisonOperator | DatabaseValue,
        maybeValue?: DatabaseValue
    ): this {
        this.appendHavingCondition('AND', this.buildHavingComparison(operatorOrValue, maybeValue, column))

        return this
    }

    /**
     * Adds an OR HAVING clause to filter grouped rows.
     *
     * @param column
     * @param operatorOrValue
     * @param maybeValue
     * @returns
     */
    public orHaving (column: string, value: DatabaseValue): this
    public orHaving (column: string, operator: QueryScalarComparisonOperator, value: DatabaseValue): this
    public orHaving (
        column: string,
        operatorOrValue: QueryScalarComparisonOperator | DatabaseValue,
        maybeValue?: DatabaseValue
    ): this {
        this.appendHavingCondition('OR', this.buildHavingComparison(operatorOrValue, maybeValue, column))

        return this
    }

    /**
     * Adds a raw HAVING clause, useful for filtering on aggregate expressions
     * such as `count(*)`. Combines with previous HAVING clauses using AND.
     *
     * @param sql
     * @param bindings
     * @returns
     */
    public havingRaw (sql: string, bindings: unknown[] = []): this {
        this.appendHavingCondition('AND', {
            type: 'raw',
            sql,
            bindings: bindings as DatabaseValue[],
        })

        return this
    }

    /**
     * Adds a raw OR HAVING clause.
     *
     * @param sql
     * @param bindings
     * @returns
     */
    public orHavingRaw (sql: string, bindings: unknown[] = []): this {
        this.appendHavingCondition('OR', {
            type: 'raw',
            sql,
            bindings: bindings as DatabaseValue[],
        })

        return this
    }

    /**
     * Adds a join clause to the query.
     *
     * The `first`/`second` arguments are treated as raw database identifiers, so
     * qualify them as `table.column` when needed. Pass a closure as `first` to
     * build a compound `on` condition through a {@link JoinClause}.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @param type     The join type (defaults to `inner`).
     * @returns
     */
    public join (
        table: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
        type: QueryJoinType = 'inner',
    ): this {
        return this.addJoin(type, table, first, operator, second)
    }

    /**
     * Adds an inner join clause to the query.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public innerJoin (
        table: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addJoin('inner', table, first, operator, second)
    }

    /**
     * Adds a left join clause to the query.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public leftJoin (
        table: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addJoin('left', table, first, operator, second)
    }

    /**
     * Adds a right join clause to the query.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public rightJoin (
        table: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addJoin('right', table, first, operator, second)
    }

    /**
     * Adds a cross join clause to the query.
     *
     * When a `first` column (or closure) is supplied the cross join is promoted
     * to an inner join with the given constraints, mirroring Laravel's behaviour.
     *
     * @param table The table (or aliased table) to join.
     * @param first Optional column or closure to constrain the join.
     * @returns
     */
    public crossJoin (table: string, first?: JoinOn): this {
        if (first === undefined)
            return this.addJoin('cross', table)

        return this.addJoin('inner', table, first)
    }

    /**
     * Adds a join clause that compares a column to a value.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The column being compared.
     * @param operator The comparison operator.
     * @param value    The value to compare against.
     * @param type     The join type (defaults to `inner`).
     * @returns
     */
    public joinWhere (
        table: string,
        first: string,
        operator: QueryComparisonOperator | string,
        value: DatabaseValue,
        type: QueryJoinType = 'inner',
    ): this {
        return this.addJoinWhere(type, table, first, operator, value)
    }

    /**
     * Adds a left join clause that compares a column to a value.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The column being compared.
     * @param operator The comparison operator.
     * @param value    The value to compare against.
     * @returns
     */
    public leftJoinWhere (
        table: string,
        first: string,
        operator: QueryComparisonOperator | string,
        value: DatabaseValue,
    ): this {
        return this.addJoinWhere('left', table, first, operator, value)
    }

    /**
     * Adds a right join clause that compares a column to a value.
     *
     * @param table    The table (or aliased table) to join.
     * @param first    The column being compared.
     * @param operator The comparison operator.
     * @param value    The value to compare against.
     * @returns
     */
    public rightJoinWhere (
        table: string,
        first: string,
        operator: QueryComparisonOperator | string,
        value: DatabaseValue,
    ): this {
        return this.addJoinWhere('right', table, first, operator, value)
    }

    /**
     * Adds a subquery join clause to the query.
     *
     * @param query    The subquery (a QueryBuilder instance or raw SQL string).
     * @param alias    The alias assigned to the subquery.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @param type     The join type (defaults to `inner`).
     * @returns
     */
    public joinSub (
        query: JoinSource,
        alias: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
        type: QueryJoinType = 'inner',
    ): this {
        return this.addJoinSub(type, query, alias, first, operator, second)
    }

    /**
     * Adds a subquery left join clause to the query.
     *
     * @param query    The subquery (a QueryBuilder instance or raw SQL string).
     * @param alias    The alias assigned to the subquery.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public leftJoinSub (
        query: JoinSource,
        alias: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addJoinSub('left', query, alias, first, operator, second)
    }

    /**
     * Adds a subquery right join clause to the query.
     *
     * @param query    The subquery (a QueryBuilder instance or raw SQL string).
     * @param alias    The alias assigned to the subquery.
     * @param first    The left-hand column or a closure receiving a JoinClause.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public rightJoinSub (
        query: JoinSource,
        alias: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addJoinSub('right', query, alias, first, operator, second)
    }

    /**
     * Adds a cross subquery join clause to the query.
     *
     * @param query The subquery (a QueryBuilder instance or raw SQL string).
     * @param alias The alias assigned to the subquery.
     * @returns
     */
    public crossJoinSub (query: JoinSource, alias: string): this {
        return this.addJoinSub('cross', query, alias)
    }

    /**
     * Adds a lateral join clause to the query.
     *
     * @param query The subquery (a QueryBuilder instance or raw SQL string).
     * @param alias The alias assigned to the subquery.
     * @param type  The join type (defaults to `inner`).
     * @returns
     */
    public joinLateral (query: JoinSource, alias: string, type: QueryJoinType = 'inner'): this {
        return this.addJoinSub(type, query, alias, undefined, undefined, undefined, true)
    }

    /**
     * Adds a lateral left join clause to the query.
     *
     * @param query The subquery (a QueryBuilder instance or raw SQL string).
     * @param alias The alias assigned to the subquery.
     * @returns
     */
    public leftJoinLateral (query: JoinSource, alias: string): this {
        return this.addJoinSub('left', query, alias, undefined, undefined, undefined, true)
    }

    /**
     * Builds a self-contained select specification used when this query is joined
     * as a subquery by another query builder.
     *
     * @returns
     */
    private buildJoinSubquerySpec (): SelectSpec<TModel> {
        const spec = this.tryBuildSelectSpec(this.buildWhere())
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Subquery join could not be compiled into an Arkorm select specification.', {
                operation: 'query.joinSub',
                model: this.model.name,
            })

        return spec
    }

    private guardJoinSupport (): void {
        if (!this.adapter?.capabilities?.joins)
            throw new UnsupportedAdapterFeatureException('Join clauses are not supported by the current adapter.', {
                operation: 'join',
                model: this.model.name,
                meta: {
                    feature: 'joins',
                },
            })
    }

    private pushJoin (join: QueryJoin): void {
        (this.queryJoins ??= []).push(join)
    }

    private resolveJoinConstraints (
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): QueryJoinConstraint[] {
        if (first === undefined)
            return []

        const clause = new JoinClause()
        if (typeof first === 'function')
            first(clause)
        else
            clause.on(first, operator, second)

        return clause.getConstraints()
    }

    private resolveJoinSource (query: JoinSource): Pick<QueryJoin, 'subquery' | 'subquerySql'> {
        if (typeof query === 'string')
            return { subquerySql: query }

        return { subquery: query.buildJoinSubquerySpec() as SelectSpec }
    }

    private addJoin (
        type: QueryJoinType,
        table: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        this.guardJoinSupport()
        this.pushJoin({
            type,
            table,
            constraints: this.resolveJoinConstraints(first, operator, second),
        })

        return this
    }

    private addJoinWhere (
        type: QueryJoinType,
        table: string,
        column: string,
        operator: QueryComparisonOperator | string,
        value: DatabaseValue,
    ): this {
        this.guardJoinSupport()
        const clause = new JoinClause()
        clause.where(column, operator, value)
        this.pushJoin({ type, table, constraints: clause.getConstraints() })

        return this
    }

    private addJoinSub (
        type: QueryJoinType,
        query: JoinSource,
        alias: string,
        first?: JoinOn,
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
        lateral = false,
    ): this {
        this.guardJoinSupport()
        this.pushJoin({
            type,
            alias,
            ...this.resolveJoinSource(query),
            ...(lateral ? { lateral: true } : {}),
            constraints: this.resolveJoinConstraints(first, operator, second),
        })

        return this
    }

    /**
     * Adds a skip clause to the query for pagination.
     * This will overwrite any existing skip clause.
     * 
     * @param skip 
     * @returns 
     */
    public skip (skip: number): this {
        this.offsetValue = skip

        return this
    }

    /**
     * Alias for skip.
     *
     * @param value
     * @returns
     */
    public offset (value: number): this {
        return this.skip(value)
    }

    /**
     * Adds a take clause to the query for pagination.
     * 
     * @param take 
     * @returns 
     */
    public take (take: number): this {
        this.limitValue = take

        return this
    }

    /**
     * Alias for take.
     *
     * @param value
     * @returns
     */
    public limit (value: number): this {
        return this.take(value)
    }

    /**
     * Returns a representation of the query that can be used for debugging or logging purposes.
     * 
     * @param operation 
     * @returns 
     */
    public inspect (
        operation: Extract<AdapterQueryOperation, 'select' | 'selectOne' | 'count' | 'exists'> = 'select'
    ): AdapterQueryInspection | null {
        const adapter = this.requireAdapter()
        if (typeof adapter.inspectQuery !== 'function')
            return null

        if (operation === 'count') {
            const spec = this.tryBuildAggregateSpec()
            if (!spec) {
                throw new UnsupportedAdapterFeatureException('Query shape could not be compiled into an Arkorm aggregate specification.', {
                    operation: 'query.inspect',
                    model: this.model.name,
                })
            }

            return adapter.inspectQuery({ operation, spec })
        }

        const spec = this.tryBuildSelectSpec(this.buildWhere())
        if (!spec) {
            throw new UnsupportedAdapterFeatureException('Query shape could not be compiled into an Arkorm select specification.', {
                operation: 'query.inspect',
                model: this.model.name,
            })
        }

        if (operation === 'select')
            return adapter.inspectQuery({ operation, spec })

        return adapter.inspectQuery({
            operation,
            spec: {
                ...spec,
                limit: spec.limit ?? 1,
            },
        })
    }

    /**
     * Sets offset/limit for a 1-based page.
     *
     * @param page
     * @param perPage
     * @returns
     */
    public forPage (page: number, perPage = 15): this {
        const currentPage = Math.max(1, page)
        const pageSize = Math.max(1, perPage)

        return this.skip((currentPage - 1) * pageSize).take(pageSize)
    }

    /**
     * Executes the query and returns the results as a collection of model instances.
     * 
     * @returns 
     */
    public async get (): Promise<ArkormCollection<TModel>> {
        const useAdapterRelationFeatures = this.canExecuteRelationFeaturesInAdapter()
        const useCompatibilityRelationFallback = this.shouldUseCompatibilityRelationFallback(useAdapterRelationFeatures)
        const relationCache: RelationResultCache = new WeakMap()
        const rows = await this.executeReadRows()
        const normalizedRows = this.randomOrderEnabled
            ? this.shuffleRows(rows as unknown[])
            : rows
        const models = await this.model.hydrateManyRetrieved(normalizedRows as Parameters<ModelStatic<TModel, TDelegate>['hydrateManyRetrieved']>[0])

        let filteredModels = models
        if (this.hasRelationFilters() && useCompatibilityRelationFallback) {
            if (this.hasOrRelationFilters() && this.hasBaseWhereConstraints()) {
                const baseIds = new Set(models
                    .map(model => this.getModelId(model))
                    .filter((id): id is string | number => id != null)
                )

                const allRows = await this.executeReadRows(this.buildSoftDeleteOnlyWhere(), true)
                const allModels = this.model.hydrateMany(allRows as Parameters<ModelStatic<TModel, TDelegate>['hydrateMany']>[0])

                filteredModels = await this.filterModelsByRelationConstraints(allModels, relationCache, baseIds)
            } else {
                filteredModels = await this.filterModelsByRelationConstraints(models, relationCache)
            }
        }

        if (this.hasRelationAggregates() && useCompatibilityRelationFallback)
            await this.applyRelationAggregates(filteredModels, relationCache)

        await this.eagerLoadModels(filteredModels)

        return new ArkormCollection(filteredModels)
    }

    /**
     * Executes the query and returns the first result as a model 
     * instance, or null if no results are found.
     * 
     * @returns 
     */
    public async first (): Promise<TModel | null> {
        if (this.shouldUseCompatibilityRelationFallback()) {
            const models = await this.get()

            return models.all()[0] ?? null
        }

        if (this.randomOrderEnabled) {
            const rows = await this.executeReadRows()
            if (rows.length === 0)
                return null

            const shuffledRows = this.shuffleRows(rows as unknown[])
            const row = shuffledRows[0]
            if (!row)
                return null

            const model = await this.model.hydrateRetrieved(row as Parameters<ModelStatic<TModel, TDelegate>['hydrateRetrieved']>[0])
            await this.eagerLoadModels([model])

            return model
        }

        const row = await this.executeReadRow()
        if (!row)
            return null

        const model = await this.model.hydrateRetrieved(row as Parameters<ModelStatic<TModel, TDelegate>['hydrateRetrieved']>[0])
        await this.eagerLoadModels([model])

        return model
    }

    /**
     * Executes the query and returns the first result as a model instance.
     * 
     * @returns 
     */
    public async firstOrFail (): Promise<TModel> {
        const model = await this.first()
        if (!model)
            throw new ModelNotFoundException(this.model.name, 'Record not found.')

        return model
    }

    /**
     * Returns the first record matching the given attributes or instantiates a
     * new, unpersisted model populated with the merged attributes and values.
     *
     * @param attributes
     * @param values
     * @returns
     */
    public async firstOrNew (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> = {}
    ): Promise<TModel> {
        const existing = await this.clone()
            .where(attributes as QuerySchemaWhere<TDelegate>)
            .first()
        if (existing)
            return existing

        const ModelConstructor = this.model as unknown as new (attrs: Record<string, unknown>) => TModel

        return new ModelConstructor({
            ...attributes,
            ...values,
        })
    }

    /**
     * Returns the first record matching the given attributes or creates and
     * persists a new record populated with the merged attributes and values.
     *
     * @param attributes
     * @param values
     * @returns
     */
    public async firstOrCreate (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> = {}
    ): Promise<TModel> {
        const existing = await this.clone()
            .where(attributes as QuerySchemaWhere<TDelegate>)
            .first()
        if (existing)
            return existing

        return await this.create({
            ...attributes,
            ...values,
        } as ModelCreateData<TModel, TDelegate>)
    }

    /**
     * Returns the first record matching the query, or the result of the
     * fallback callback when no record exists. An optional column list narrows
     * the selected columns before the lookup.
     *
     * @param columnsOrCallback
     * @param maybeCallback
     * @returns
     */
    public async firstOr<TResult> (callback: () => TResult | Promise<TResult>): Promise<TModel | TResult>
    public async firstOr<TResult> (columns: string[], callback: () => TResult | Promise<TResult>): Promise<TModel | TResult>
    public async firstOr<TResult> (
        columnsOrCallback: string[] | (() => TResult | Promise<TResult>),
        maybeCallback?: () => TResult | Promise<TResult>
    ): Promise<TModel | TResult> {
        const callback = typeof columnsOrCallback === 'function' ? columnsOrCallback : maybeCallback
        if (!callback)
            throw new QueryConstraintException('firstOr requires a fallback callback.', {
                operation: 'firstOr',
                model: this.model.name,
            })

        if (Array.isArray(columnsOrCallback) && columnsOrCallback.length > 0) {
            const select = columnsOrCallback.reduce<Record<string, true>>((all, column) => {
                all[column] = true

                return all
            }, {})
            this.select(select as Parameters<this['select']>[0])
        }

        const found = await this.first()
        if (found)
            return found

        return callback()
    }

    /**
     * Finds a record by a specific key and value. 
     * This is a convenience method that is equivalent to 
     * calling where({ [key]: value }).first(). 
     * 
     * @param value 
     * @param key 
     * @returns 
     */
    public async find<TKey extends keyof ModelAttributes<TModel> & string> (
        value: ModelAttributes<TModel>[TKey],
        key: TKey
    ): Promise<TModel | null>
    public async find (value: string | number, key?: string): Promise<TModel | null>
    public async find (value: unknown, key?: string): Promise<TModel | null> {
        const resolvedKey = key ?? this.model.getPrimaryKey()

        return this.where({ [resolvedKey]: value } as QuerySchemaWhere<TDelegate>).first()
    }

    /**
     * Find a related model by a specific key and value, applying relationship constraints, or 
     * throw an error if not found.
     * 
     * @param value 
     * @param key 
     */
    public async findOrFail<TKey extends keyof ModelAttributes<TModel> & string> (
        value: ModelAttributes<TModel>[TKey],
        key: TKey
    ): Promise<TModel>
    public async findOrFail (value: string | number, key?: string): Promise<TModel>
    public async findOrFail (value: unknown, key?: string): Promise<TModel> {
        const model = await this.find(value as never, key)
        if (!model)
            throw new ModelNotFoundException(this.model.name, 'Record not found.')

        return model
    }

    /**
     * Finds a record by id/key and returns callback result when not found.
     *
     * @param value
     * @param callback
     * @returns
     */
    public async findOr<TResult> (value: string | number, callback: () => TResult | Promise<TResult>): Promise<TModel | TResult>
    public async findOr<TResult> (
        value: string | number,
        key: string,
        callback: () => TResult | Promise<TResult>
    ): Promise<TModel | TResult>
    public async findOr<TResult> (
        value: string | number,
        keyOrCallback: string | (() => TResult | Promise<TResult>),
        maybeCallback?: () => TResult | Promise<TResult>
    ): Promise<TModel | TResult> {
        const key = typeof keyOrCallback === 'string' ? keyOrCallback : this.model.getPrimaryKey()
        const callback = typeof keyOrCallback === 'function' ? keyOrCallback : maybeCallback
        if (!callback)
            throw new QueryConstraintException('findOr requires a fallback callback.', {
                operation: 'findOr',
                model: this.model.name,
            })

        const found = await this.find(value, key)
        if (found)
            return found

        return callback()
    }

    /**
     * Returns a single column value from the first record.
     *
     * @param column
     * @returns
     */
    public async value<TKey extends keyof ModelAttributes<TModel> & string> (
        column: TKey
    ): Promise<ModelAttributes<TModel>[TKey] | null> {
        const row = await this.executeReadRow() as Record<string, unknown> | null
        if (!row)
            return null

        return (row[column] ?? null) as ModelAttributes<TModel>[TKey] | null
    }

    /**
     * Returns a single column value from the first record or throws.
     *
     * @param column
     * @returns
     */
    public async valueOrFail<TKey extends keyof ModelAttributes<TModel> & string> (
        column: TKey
    ): Promise<ModelAttributes<TModel>[TKey]> {
        const result = await this.value(column)
        if (result == null)
            throw new ModelNotFoundException(this.model.name, 'Record not found.')

        return result
    }

    /**
     * Returns a collection with values for the given column.
     *
     * @param column
     * @param key
     * @returns
     */
    public async pluck<TKey extends keyof ModelAttributes<TModel> & string> (
        column: TKey,
        key?: keyof ModelAttributes<TModel> & string
    ): Promise<ArkormCollection<ModelAttributes<TModel>[TKey]>> {
        const rows = await this.executeReadRows() as Record<string, unknown>[]

        if (!key)
            return new ArkormCollection(rows.map(row => row[column] as ModelAttributes<TModel>[TKey]))

        const keyedValues = rows
            .sort((leftRow, rightRow) => String(leftRow[key]).localeCompare(String(rightRow[key])))
            .map(row => row[column] as ModelAttributes<TModel>[TKey])

        return new ArkormCollection(keyedValues)
    }

    /**
     * Creates a new record with the specified data and returns it as a model instance.
     * 
     * @param data 
     * @returns 
     */
    public async create (data: ModelCreateData<TModel, TDelegate>): Promise<TModel> {
        const created = await this.executeInsertRow(data as QuerySchemaCreateData<TDelegate>)

        return this.model.hydrate(created as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }

    /**
     * Creates multiple records and returns hydrated model instances.
     *
     * @param values
     * @returns
     */
    public async createMany (values: ModelCreateData<TModel, TDelegate>[]): Promise<TModel[]> {
        if (values.length === 0)
            return []

        const created = await Promise.all(values.map(async value => await this.create(value)))

        return created
    }

    /**
     * Insert one or more records.
     *
     * @param values
     * @returns
     */
    public async insert (
        values: ModelCreateData<TModel, TDelegate> | ModelCreateData<TModel, TDelegate>[]
    ): Promise<boolean> {
        const payloads = this.normalizeInsertPayloads(values)
        if (payloads.length === 0)
            return true

        if (payloads.length === 1) {
            await this.executeInsertRow(payloads[0] as QuerySchemaCreateData<TDelegate>)

            return true
        }

        await this.executeInsertManyRows(payloads)

        return true
    }

    /**
     * Insert one or more records while ignoring insertion errors.
     *
     * @param values
     * @returns
     */
    public async insertOrIgnore (
        values: ModelCreateData<TModel, TDelegate> | ModelCreateData<TModel, TDelegate>[]
    ): Promise<number> {
        const payloads = this.normalizeInsertPayloads(values)
        if (payloads.length === 0)
            return 0

        return await this.executeInsertManyRows(payloads, true)
    }

    /**
     * Insert a record and return its primary key value.
     *
     * @param values
     * @param sequence
     * @returns
     */
    public async insertGetId (
        values: ModelCreateData<TModel, TDelegate>,
        sequence?: string | null
    ): Promise<unknown> {
        const created = await this.executeInsertRow(values as QuerySchemaCreateData<TDelegate>) as Record<string, unknown>
        const key = sequence ?? this.model.getPrimaryKey()
        if (!(key in created))
            throw new UniqueConstraintResolutionException(`Inserted record does not contain key [${key}].`, {
                operation: 'insertGetId',
                model: this.model.name,
                meta: {
                    key,
                },
            })

        return created[key]
    }

    /**
     * Insert records using values produced by another query/source.
     *
     * @param columns
     * @param query
     * @returns
     */
    public async insertUsing (
        columns: string[],
        query: unknown
    ): Promise<number> {
        const rows = await this.resolveInsertUsingRows(columns, query)
        if (rows.length === 0)
            return 0

        await this.insert(rows as ModelCreateData<TModel, TDelegate>[])

        return rows.length
    }

    /**
     * Insert records using values produced by another query/source while ignoring insertion errors.
     *
     * @param columns
     * @param query
     * @returns
     */
    public async insertOrIgnoreUsing (
        columns: string[],
        query: unknown
    ): Promise<number> {
        const rows = await this.resolveInsertUsingRows(columns, query)
        if (rows.length === 0)
            return 0

        return this.insertOrIgnore(rows as ModelCreateData<TModel, TDelegate>[])
    }

    /**
     * Updates records matching the current query constraints with the 
     * specified data and returns the updated record(s) as model instance(s).
     * 
     * @param data 
     * @returns 
     */
    public async update (data: ModelUpdateData<TModel, TDelegate>): Promise<TModel> {
        const where = this.buildWhere()
        if (!where)
            throw new QueryConstraintException('Update requires a where clause.', {
                operation: 'update',
                model: this.model.name,
            })

        const directSpec = this.tryBuildUpdateSpec(where, data as QuerySchemaUpdateData<TDelegate>)
        const adapter = this.requireAdapter()
        if (!this.isUniqueWhere(where as Record<string, unknown>) && directSpec && typeof adapter.updateFirst === 'function') {
            const updated = await adapter.updateFirst(directSpec)
            if (!updated)
                throw new ModelNotFoundException(this.model.name, 'Record not found for update operation.', {
                    operation: 'update',
                })

            return this.model.hydrate(updated as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
        }

        const uniqueWhere = await this.resolveUniqueWhere(where)
        const updated = await this.executeUpdateRow(uniqueWhere!, data as QuerySchemaUpdateData<TDelegate>)

        return this.model.hydrate(updated as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }

    /**
     * Update records using update-many semantics when available.
     *
     * @param data
     * @returns
     */
    public async updateFrom (data: ModelUpdateData<TModel, TDelegate>): Promise<number> {
        const where = this.buildWhere()
        if (!where)
            throw new QueryConstraintException('Update requires a where clause.', {
                operation: 'updateFrom',
                model: this.model.name,
            })

        return await this.executeUpdateManyRows(where, data as QuerySchemaUpdateData<TDelegate>)
    }

    /**
     * Insert a record when no match exists, otherwise update the matching record.
     *
     * @param attributes
     * @param values
     * @returns
     */
    public async updateOrInsert (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> | ((exists: boolean) => Record<string, unknown> | Promise<Record<string, unknown>>) = {}
    ): Promise<boolean> {
        if (typeof values !== 'function' && this.adapter?.capabilities?.upsert && typeof this.requireAdapter().upsert === 'function') {
            try {
                await this.executeUpsertRows([
                    {
                        ...attributes,
                        ...values,
                    },
                ], Object.keys(attributes), Object.keys(values))

                return true
            } catch (error) {
                if (!this.shouldFallbackUpdateOrInsertUpsert(error))
                    throw error
            }
        }

        const existing = await this.clone()
            .where(attributes as QuerySchemaWhere<TDelegate>)
            .first()

        const exists = existing != null
        const resolvedValues = typeof values === 'function'
            ? await values(exists)
            : values

        if (!exists) {
            await this.executeInsertRow({
                ...attributes,
                ...resolvedValues,
            } as QuerySchemaCreateData<TDelegate>)

            return true
        }

        const updated = await this.clone()
            .where(attributes as QuerySchemaWhere<TDelegate>)
            .update(resolvedValues as ModelUpdateData<TModel, TDelegate>)

        return updated != null
    }

    /**
     * Update the first record matching the given attributes, or create a new
     * record populated with the merged attributes and values when none exists.
     *
     * @param attributes
     * @param values
     * @returns
     */
    public async updateOrCreate (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> = {}
    ): Promise<TModel> {
        const existing = await this.clone()
            .where(attributes as QuerySchemaWhere<TDelegate>)
            .first()

        if (!existing)
            return await this.create({
                ...attributes,
                ...values,
            } as ModelCreateData<TModel, TDelegate>)

        if (Object.keys(values).length === 0)
            return existing

        return await this.clone()
            .where(attributes as QuerySchemaWhere<TDelegate>)
            .update(values as ModelUpdateData<TModel, TDelegate>)
    }

    private shouldFallbackUpdateOrInsertUpsert (error: unknown): boolean {
        if (!(error instanceof QueryExecutionException))
            return false

        const cause = error.cause as { code?: unknown, message?: unknown } | undefined
        const code = typeof cause?.code === 'string' ? cause.code : undefined
        const message = typeof cause?.message === 'string'
            ? cause.message
            : error.message

        return code === '42P10'
            || message.includes('there is no unique or exclusion constraint matching the ON CONFLICT specification')
    }

    /**
     * Insert new records or update existing records by one or more unique keys.
     *
     * @param values
     * @param uniqueBy
     * @param update
     * @returns
     */
    public async upsert (
        values: Array<Record<string, unknown>>,
        uniqueBy: string | string[],
        update: string[] | null = null
    ): Promise<number> {
        if (values.length === 0)
            return 0

        const uniqueKeys = Array.isArray(uniqueBy) ? uniqueBy : [uniqueBy]
        if (this.adapter?.capabilities?.upsert && typeof this.requireAdapter().upsert === 'function') {
            return await this.executeUpsertRows(values, uniqueKeys, update ?? undefined)
        }

        let affected = 0

        for (const row of values) {
            const attributes = uniqueKeys.reduce<Record<string, unknown>>((all, key) => {
                all[key] = row[key]

                return all
            }, {})
            const updatePayload = (update ?? Object.keys(row).filter(key => !uniqueKeys.includes(key)))
                .reduce<Record<string, unknown>>((all, key) => {
                    if (key in row)
                        all[key] = row[key]

                    return all
                }, {})

            await this.updateOrInsert(attributes, updatePayload)
            affected += 1
        }

        return affected
    }

    /**
     * Deletes the first record matching the current query constraints and returns
     * it as a hydrated model instance. Returns null when no record matches.
     * 
     * @returns 
     */
    public async delete (): Promise<TModel | null> {
        const where = this.buildWhere()
        if (!where)
            throw new QueryConstraintException('Delete requires a where clause.', {
                operation: 'delete',
                model: this.model.name,
            })

        const directSpec = this.tryBuildDeleteSpec(where)
        const adapter = this.requireAdapter()
        if (!this.isUniqueWhere(where as Record<string, unknown>) && directSpec && typeof adapter.deleteFirst === 'function') {
            const deleted = await adapter.deleteFirst(directSpec)
            if (!deleted)
                return null

            return this.hydrateDeleted(deleted as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
        }

        const uniqueWhere = await this.resolveUniqueWhere(where, false)
        if (!uniqueWhere)
            return null

        const deleted = await this.executeDeleteRow(uniqueWhere, false)
        if (!deleted)
            return null

        return this.hydrateDeleted(deleted as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }

    /**
     * Hydrate a row that was just deleted, marking the resulting model as no
     * longer existing in the database.
     *
     * @param attributes
     * @returns
     */
    private hydrateDeleted (attributes: Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0]): TModel {
        const model = this.model.hydrate(attributes)
            ; (model as unknown as { exists: boolean }).exists = false

        return model
    }

    /**
     * Deletes the first record matching the current query constraints and throws
     * when no record matches.
     *
     * @returns
     */
    public async deleteOrFail (): Promise<TModel> {
        const deleted = await this.delete()
        if (!deleted)
            throw new ModelNotFoundException(this.model.name, 'Record not found for delete operation.', {
                operation: 'delete',
            })

        return deleted
    }
    private tryBuildInsertSpec (values: QuerySchemaCreateData<TDelegate>): InsertSpec<TModel> {
        return {
            target: this.buildQueryTarget(),
            values: values as DatabaseRow,
        }
    }

    private tryBuildInsertManySpec (values: QuerySchemaCreateData<TDelegate>[]): InsertManySpec<TModel> {
        return {
            target: this.buildQueryTarget(),
            values: values as DatabaseRow[],
        }
    }

    private tryBuildUpsertSpec (
        values: Array<Record<string, unknown>>,
        uniqueBy: string[],
        updateColumns?: string[],
    ): UpsertSpec<TModel> {
        return {
            target: this.buildQueryTarget(),
            values: values as DatabaseRow[],
            uniqueBy,
            updateColumns,
        }
    }

    private tryBuildInsertOrIgnoreManySpec (values: QuerySchemaCreateData<TDelegate>[]): InsertManySpec<TModel> {
        return {
            ...this.tryBuildInsertManySpec(values),
            ignoreDuplicates: true,
        }
    }

    private tryBuildUpdateSpec (
        where: QuerySchemaWhere<TDelegate> | QuerySchemaUniqueWhere<TDelegate>,
        values: QuerySchemaUpdateData<TDelegate>
    ): UpdateSpec<TModel> | null {
        const condition = this.tryBuildQueryCondition(where)
        if (!condition)
            return null

        return {
            target: this.buildQueryTarget(),
            where: condition,
            values: values as DatabaseRow,
        }
    }

    private tryBuildUpdateManySpec (
        where: QuerySchemaWhere<TDelegate> | undefined,
        values: QuerySchemaUpdateData<TDelegate>
    ): UpdateManySpec<TModel> | null {
        const condition = this.tryBuildQueryCondition(where)
        if (condition === null)
            return null

        return {
            target: this.buildQueryTarget(),
            where: condition,
            values: values as DatabaseRow,
        }
    }

    private tryBuildDeleteSpec (where: QuerySchemaWhere<TDelegate> | QuerySchemaUniqueWhere<TDelegate>): DeleteSpec<TModel> | null {
        const condition = this.tryBuildQueryCondition(where)
        if (!condition)
            return null

        return {
            target: this.buildQueryTarget(),
            where: condition,
        }
    }

    /**
     * Counts the number of records matching the current query constraints.
     * 
     * @returns 
     */
    public async count (): Promise<number> {
        if (this.hasRelationFilters() && this.shouldUseCompatibilityRelationFallback())
            return (await this.get()).all().length

        return this.executeReadCount()
    }

    /**
     * Determines if any records exist for the current query constraints.
     *
     * @returns
     */
    public async exists (): Promise<boolean> {
        if (this.hasRelationFilters() && this.shouldUseCompatibilityRelationFallback())
            return (await this.count()) > 0

        return await this.executeReadExists()
    }

    /**
     * Determines if no records exist for the current query constraints.
     *
     * @returns
     */
    public async doesntExist (): Promise<boolean> {
        return !(await this.exists())
    }

    private normalizeInsertPayloads (
        values:
            | ModelCreateData<TModel, TDelegate>
            | ModelCreateData<TModel, TDelegate>[]
            | QuerySchemaCreateData<TDelegate>
            | QuerySchemaCreateData<TDelegate>[]
    ): QuerySchemaCreateData<TDelegate>[] {
        const payloads = Array.isArray(values)
            ? values as QuerySchemaCreateData<TDelegate>[]
            : [values as QuerySchemaCreateData<TDelegate>]
        const metadata = this.model.getModelMetadata()

        return payloads.map((payload) => {
            const nextPayload = { ...(payload as Record<string, unknown>) }
            const now = new Date()
            const primaryKeyValue = nextPayload[metadata.primaryKey]
            if (primaryKeyValue === undefined || primaryKeyValue === null) {
                const generated = PrimaryKeyGenerationPlanner.generate(metadata.primaryKeyGeneration)
                if (generated !== undefined)
                    nextPayload[metadata.primaryKey] = generated
            }

            for (const column of metadata.timestampColumns ?? []) {
                if (nextPayload[column.column] !== undefined && nextPayload[column.column] !== null)
                    continue

                if (column.default === 'now()' || column.updatedAt)
                    nextPayload[column.column] = now
            }

            return nextPayload as QuerySchemaCreateData<TDelegate>
        })
    }

    private normalizeUpdatePayload (values: QuerySchemaUpdateData<TDelegate>): QuerySchemaUpdateData<TDelegate> {
        const metadata = this.model.getModelMetadata()
        const nextPayload = { ...(values as Record<string, unknown>) }
        const now = new Date()

        for (const column of metadata.timestampColumns ?? []) {
            if (column.updatedAt)
                nextPayload[column.column] = now
        }

        return nextPayload as QuerySchemaUpdateData<TDelegate>
    }

    private resolveAffectedCount (result: unknown, fallback: number): number {
        if (typeof result === 'number')
            return result

        if (result && typeof result === 'object' && 'count' in result) {
            const candidate = (result as { count?: unknown }).count
            if (typeof candidate === 'number')
                return candidate
        }

        return fallback
    }

    private async resolveInsertUsingRows (
        columns: string[],
        query: unknown
    ): Promise<Record<string, unknown>[]> {
        const resolvedQuery = typeof query === 'function'
            ? await (query as () => unknown | Promise<unknown>)()
            : query

        const source = await this.resolveInsertUsingSource(resolvedQuery)

        return source.map((row) => {
            return columns.reduce<Record<string, unknown>>((record, column) => {
                record[column] = row[column]

                return record
            }, {})
        })
    }

    private async resolveInsertUsingSource (source: unknown): Promise<Record<string, unknown>[]> {
        if (source && typeof source === 'object') {
            const asBuilder = source as { get?: () => Promise<unknown> }
            if (typeof asBuilder.get === 'function') {
                const result = await asBuilder.get()
                const collection = result as { all?: () => unknown[] }
                if (typeof collection.all === 'function') {
                    return collection.all().map((item) => {
                        const asModel = item as { getRawAttributes?: () => Record<string, unknown> }
                        if (typeof asModel.getRawAttributes === 'function')
                            return asModel.getRawAttributes()

                        return item as Record<string, unknown>
                    })
                }
            }

            if (Array.isArray(source))
                return source as Record<string, unknown>[]
        }

        if (Array.isArray(source))
            return source as Record<string, unknown>[]

        throw new QueryConstraintException('insertUsing expects a query builder, array of records, or async resolver.', {
            operation: 'insertUsing',
            model: this.model.name,
        })
    }

    /**
     * Execute callback when no records exist.
     *
     * @param callback
     * @returns
     */
    public async existsOr<TResult> (callback: () => TResult | Promise<TResult>): Promise<boolean | TResult> {
        if (await this.exists())
            return true

        return callback()
    }

    /**
     * Execute callback when records exist.
     *
     * @param callback
     * @returns
     */
    public async doesntExistOr<TResult> (callback: () => TResult | Promise<TResult>): Promise<boolean | TResult> {
        if (await this.doesntExist())
            return true

        return callback()
    }

    /**
     * Returns minimum value for a column.
     *
     * @param column
     * @returns
     */
    public async min<TKey extends keyof ModelAttributes<TModel> & string> (
        column: TKey
    ): Promise<ModelAttributes<TModel>[TKey] | null> {
        const rows = await this.executeReadRows() as Record<string, unknown>[]
        if (rows.length === 0)
            return null

        const values = rows.map(row => row[column]).filter(value => value != null)
        if (values.length === 0)
            return null

        return values.reduce((minValue, currentValue) =>
            (currentValue as number | string | Date) < (minValue as number | string | Date)
                ? currentValue
                : minValue
        ) as ModelAttributes<TModel>[TKey]
    }

    /**
     * Returns maximum value for a column.
     *
     * @param column
     * @returns
     */
    public async max<TKey extends keyof ModelAttributes<TModel> & string> (
        column: TKey
    ): Promise<ModelAttributes<TModel>[TKey] | null> {
        const rows = await this.executeReadRows() as Record<string, unknown>[]
        if (rows.length === 0)
            return null

        const values = rows.map(row => row[column]).filter(value => value != null)
        if (values.length === 0)
            return null

        return values.reduce((maxValue, currentValue) =>
            (currentValue as number | string | Date) > (maxValue as number | string | Date)
                ? currentValue
                : maxValue
        ) as ModelAttributes<TModel>[TKey]
    }

    /**
     * Returns sum of numeric values for a column.
     *
     * @param column
     * @returns
     */
    public async sum<TKey extends keyof ModelAttributes<TModel> & string> (column: TKey): Promise<number> {
        const rows = await this.executeReadRows() as Record<string, unknown>[]

        return rows.reduce((total, row) => {
            const value = row[column]
            const numeric = typeof value === 'number' ? value : Number(value)

            return Number.isFinite(numeric) ? total + numeric : total
        }, 0)
    }

    /**
     * Returns average of numeric values for a column.
     *
     * @param column
     * @returns
     */
    public async avg<TKey extends keyof ModelAttributes<TModel> & string> (column: TKey): Promise<number | null> {
        const rows = await this.executeReadRows() as Record<string, unknown>[]
        const values = rows
            .map(row => {
                const value = row[column]

                return typeof value === 'number' ? value : Number(value)
            })
            .filter(value => Number.isFinite(value))

        if (values.length === 0)
            return null

        return values.reduce((total, value) => total + value, 0) / values.length
    }

    /**
     * Adds a raw where clause when supported by the adapter.
     *
     * @param sql
     * @param bindings
     * @returns
     */
    public whereRaw (sql: string, bindings: unknown[] = []): this {
        if (!this.adapter?.capabilities?.rawWhere)
            throw new UnsupportedAdapterFeatureException('Raw where clauses are not supported by the current adapter.', {
                operation: 'whereRaw',
                model: this.model.name,
                meta: {
                    feature: 'rawWhere',
                },
            })

        this.appendQueryCondition('AND', {
            type: 'raw',
            sql,
            bindings: bindings as DatabaseValue[],
        } as QueryRawCondition)

        return this
    }

    /**
     * Adds a raw OR where clause when supported by the adapter.
     *
     * @param sql
     * @param bindings
     * @returns
     */
    public orWhereRaw (sql: string, bindings: unknown[] = []): this {
        if (!this.adapter?.capabilities?.rawWhere)
            throw new UnsupportedAdapterFeatureException('Raw where clauses are not supported by the current adapter.', {
                operation: 'orWhereRaw',
                model: this.model.name,
                meta: {
                    feature: 'rawWhere',
                },
            })

        this.appendQueryCondition('OR', {
            type: 'raw',
            sql,
            bindings: bindings as DatabaseValue[],
        } as QueryRawCondition)

        return this
    }

    /**
    * Paginates the query results and returns a LengthAwarePaginator instance 
    * containing data and total-aware pagination metadata.
     * 
     * @param page 
     * @param perPage 
     * @param options
     * @returns 
     */
    public async paginate (
        perPage = 15,
        page: number | undefined = undefined,
        options: PaginationOptions = {}
    ): Promise<LengthAwarePaginator<TModel>> {
        const currentPage = this.resolvePaginationPage(page, options)

        if (this.shouldUseCompatibilityRelationFallback()) {
            const pageSize = Math.max(1, perPage)
            const all = await this.get()
            const rows = all.all()
            const start = (currentPage - 1) * pageSize
            const slice = new ArkormCollection(rows.slice(start, start + pageSize))

            return new LengthAwarePaginator(slice, rows.length, pageSize, currentPage, options)
        }

        const pageSize = Math.max(1, perPage)
        const total = await this.count()
        const items = await this.clone()
            .skip((currentPage - 1) * pageSize)
            .take(pageSize)
            .get()

        return new LengthAwarePaginator(items, total, pageSize, currentPage, options)
    }

    /**
     * Paginates results without calculating total row count.
     *
     * @param perPage
     * @param page
     * @returns
     */
    public async simplePaginate (
        perPage = 15,
        page: number | undefined = undefined,
        options: PaginationOptions = {}
    ): Promise<Paginator<TModel>> {
        const currentPage = this.resolvePaginationPage(page, options)

        if (this.shouldUseCompatibilityRelationFallback()) {
            const pageSize = Math.max(1, perPage)
            const all = await this.get()
            const rows = all.all()
            const start = (currentPage - 1) * pageSize
            const pageRows = rows.slice(start, start + pageSize)
            const hasMorePages = start + pageSize < rows.length

            return new Paginator(new ArkormCollection(pageRows), pageSize, currentPage, hasMorePages, options)
        }

        const pageSize = Math.max(1, perPage)
        const items = await this.clone()
            .skip((currentPage - 1) * pageSize)
            .take(pageSize + 1)
            .get()

        const hasMorePages = items.all().length > pageSize
        const data = hasMorePages
            ? new ArkormCollection(items.all().slice(0, pageSize))
            : items

        return new Paginator(data, pageSize, currentPage, hasMorePages, options)
    }

    /**
     * Creates a clone of the current query builder instance with the same state.
     * 
     * @returns 
     */
    public clone (): QueryBuilder<TModel, TDelegate> {
        const builder = new QueryBuilder<TModel, TDelegate>(this.model, this.adapter)
        builder.queryWhere = this.queryWhere
        builder.legacyWhere = this.legacyWhere
        builder.queryRelationLoads = this.queryRelationLoads
            ? this.cloneRelationLoads(this.queryRelationLoads)
            : undefined
        builder.queryOrderBy = this.queryOrderBy ? [...this.queryOrderBy] : undefined
        builder.querySelect = this.querySelect ? [...this.querySelect] : undefined
        builder.queryDistinct = this.queryDistinct
        builder.queryGroupBy = this.queryGroupBy ? [...this.queryGroupBy] : undefined
        builder.queryHaving = this.queryHaving
        builder.offsetValue = this.offsetValue
        builder.limitValue = this.limitValue
        builder.includeTrashed = this.includeTrashed
        builder.onlyTrashedRecords = this.onlyTrashedRecords
        builder.randomOrderEnabled = this.randomOrderEnabled
        this.relationFilters.forEach(filter => {
            builder.relationFilters.push({ ...filter })
        })
        this.relationAggregates.forEach(aggregate => {
            builder.relationAggregates.push({ ...aggregate })
        })
        Object.entries(this.eagerLoads).forEach(([key, value]) => {
            builder.eagerLoads[key] = value
        })

        return builder
    }

    /**
     * Normalizes the input for eager loading relations into a consistent format.
     * 
     * @param relations 
     * @returns 
     */
    private normalizeWith (
        relations: string | string[] | EagerLoadRelations<TModel>
    ): EagerLoadMap {
        if (typeof relations === 'string')
            return { [relations]: undefined }

        if (Array.isArray(relations)) {
            return relations.reduce<EagerLoadMap>((accumulator, relation) => {
                accumulator[relation] = undefined

                return accumulator
            }, {})
        }

        const relationEntries = Object.entries(
            relations as Record<string, true | EagerLoadConstraint | undefined>
        )

        return relationEntries.reduce<EagerLoadMap>((normalized, [relation, constraint]) => {
            normalized[relation] = constraint === true ? undefined : constraint

            return normalized
        }, {})
    }

    private withRelationAggregate (
        type: RelationAggregateType,
        relations: RelationAggregateInput,
        column?: string,
    ): this {
        this.normalizeRelationAggregateInput(relations).forEach(aggregate => {
            this.relationAggregates.push({ type, column, ...aggregate })
        })

        return this
    }

    private normalizeRelationAggregateInput (
        relations: RelationAggregateInput
    ): Array<{ relation: string, alias?: string, callback?: RelationAggregateConstraint }> {
        if (typeof relations === 'string')
            return [this.parseRelationAggregateName(relations)]

        if (Array.isArray(relations))
            return relations.map(relation => this.parseRelationAggregateName(relation))

        return Object.entries(relations).reduce<Array<{ relation: string, alias?: string, callback?: RelationAggregateConstraint }>>((normalized, [name, value]) => {
            if (value === false || value === undefined)
                return normalized

            const aggregate = this.parseRelationAggregateName(name)
            if (typeof value === 'function')
                aggregate.callback = value

            normalized.push(aggregate)

            return normalized
        }, [])
    }

    private parseRelationAggregateName (name: string): {
        relation: string,
        alias?: string,
        callback?: RelationAggregateConstraint,
    } {
        const match = name.match(/^(.+?)\s+as\s+(.+)$/i)
        if (!match)
            return { relation: name }

        return {
            relation: match[1].trim(),
            alias: match[2].trim(),
        }
    }

    private buildQueryTarget (): QueryTarget<TModel> {
        const metadata = this.model.getModelMetadata()

        return {
            model: this.model as unknown as ModelStatic<TModel, any>,
            modelName: this.model.name,
            table: metadata.table,
            primaryKey: metadata.primaryKey,
            primaryKeyGeneration: metadata.primaryKeyGeneration,
            timestampColumns: metadata.timestampColumns,
            columns: metadata.columns,
            softDelete: metadata.softDelete,
        }
    }

    private hasBaseWhereConstraints (): boolean {
        return this.queryWhere != null || this.legacyWhere != null
    }

    private normalizeQuerySelect (select: QuerySchemaSelect<TDelegate>): QuerySelectColumn[] | null {
        if (typeof select === 'string')
            return [{ column: select, raw: true }]

        if (Array.isArray(select)) {
            if (select.some(expression => typeof expression !== 'string'))
                return null

            return select.map(expression => ({ column: expression, raw: true }))
        }

        if (typeof select !== 'object' || !select)
            return null

        const entries = Object.entries(select as Record<string, unknown>)
        if (entries.some(([, value]) => value !== true
            && value !== false
            && value !== undefined
            && typeof value !== 'string'))
            return null

        const columns = entries
            .filter(([, value]) => value === true || typeof value === 'string')
            .map(([column, value]) => typeof value === 'string'
                ? { column, alias: value, raw: true }
                : { column })

        return columns.length > 0 ? columns : []
    }

    private normalizeQueryOrderBy (orderBy: QuerySchemaOrderBy<TDelegate>): QueryOrderBy[] | null {
        const clauses = (Array.isArray(orderBy)
            ? orderBy
            : [orderBy]) as Record<string, unknown>[]

        const normalized = clauses.reduce<QueryOrderBy[] | null>((accumulator, clause) => {
            if (!accumulator)
                return null

            if (!clause || typeof clause !== 'object' || Array.isArray(clause))
                return null

            const entries = Object.entries(clause as Record<string, unknown>)
            for (const [column, direction] of entries) {
                if (direction !== 'asc' && direction !== 'desc')
                    return null

                accumulator.push({ column, direction })
            }

            return accumulator
        }, [])

        return normalized
    }

    private cloneRelationLoads (plans: RelationLoadPlan[]): RelationLoadPlan[] {
        return plans.map((plan) => {
            return {
                relation: plan.relation,
                constraint: plan.constraint,
                softDeleteMode: plan.softDeleteMode,
                orderBy: plan.orderBy ? [...plan.orderBy] : undefined,
                limit: plan.limit,
                offset: plan.offset,
                columns: plan.columns ? [...plan.columns] : undefined,
                distinct: plan.distinct,
                groupBy: plan.groupBy ? [...plan.groupBy] : undefined,
                relationLoads: plan.relationLoads
                    ? this.cloneRelationLoads(plan.relationLoads)
                    : undefined,
            }
        })
    }

    private mergeRelationLoadPlans (
        primary?: RelationLoadPlan[],
        secondary?: RelationLoadPlan[],
    ): RelationLoadPlan[] | undefined {
        if ((!primary || primary.length === 0) && (!secondary || secondary.length === 0))
            return undefined

        const merged = new Map<string, RelationLoadPlan>()
        const appendPlans = (plans?: RelationLoadPlan[]) => {
            plans?.forEach((plan) => {
                const existing = merged.get(plan.relation)
                if (!existing) {
                    merged.set(plan.relation, {
                        relation: plan.relation,
                        constraint: plan.constraint,
                        softDeleteMode: plan.softDeleteMode,
                        orderBy: plan.orderBy ? [...plan.orderBy] : undefined,
                        limit: plan.limit,
                        offset: plan.offset,
                        columns: plan.columns ? [...plan.columns] : undefined,
                        distinct: plan.distinct,
                        groupBy: plan.groupBy ? [...plan.groupBy] : undefined,
                        relationLoads: plan.relationLoads ? this.cloneRelationLoads(plan.relationLoads) : undefined,
                    })

                    return
                }

                existing.constraint = plan.constraint ?? existing.constraint
                existing.softDeleteMode = plan.softDeleteMode ?? existing.softDeleteMode
                existing.orderBy = plan.orderBy ? [...plan.orderBy] : existing.orderBy
                existing.limit = plan.limit ?? existing.limit
                existing.offset = plan.offset ?? existing.offset
                existing.columns = plan.columns ? [...plan.columns] : existing.columns
                existing.distinct = plan.distinct ?? existing.distinct
                existing.groupBy = plan.groupBy ? [...plan.groupBy] : existing.groupBy
                existing.relationLoads = this.mergeRelationLoadPlans(existing.relationLoads, plan.relationLoads)
            })
        }

        appendPlans(primary)
        appendPlans(secondary)

        return [...merged.values()]
    }

    private relationLoadPlansToEagerLoadMap (plans: RelationLoadPlan[]): EagerLoadMap {
        return plans.reduce<EagerLoadMap>((all, plan) => {
            all[plan.relation] = (query: unknown) => {
                return (query as QueryBuilder<any, any>).applyRelationLoadPlan(plan)
            }

            return all
        }, {})
    }

    private getRelationLoadSoftDeleteMode (): SoftDeleteQueryMode | undefined {
        if (this.onlyTrashedRecords)
            return 'only'

        if (this.includeTrashed)
            return 'include'

        return undefined
    }

    public applyRelationLoadPlan (plan: RelationLoadPlan): this {
        if (plan.constraint) {
            const normalizedWhere = this.toQuerySchemaWhere(plan.constraint)
            if (!normalizedWhere) {
                throw new UnsupportedAdapterFeatureException('Relation load plan constraints could not be normalized back into query where syntax.', {
                    operation: 'relationLoads.applyPlan',
                    model: this.model.name,
                })
            }

            this.addLogicalWhere('AND', normalizedWhere as QuerySchemaWhere<TDelegate>)
        }

        if (plan.softDeleteMode === 'include') {
            this.includeTrashed = true
            this.onlyTrashedRecords = false
        } else if (plan.softDeleteMode === 'only') {
            this.includeTrashed = false
            this.onlyTrashedRecords = true
        }

        if (plan.orderBy)
            this.queryOrderBy = [...plan.orderBy]

        if (plan.columns)
            this.querySelect = [...plan.columns]

        this.queryDistinct = plan.distinct ?? false
        this.queryGroupBy = plan.groupBy ? [...plan.groupBy] : undefined

        if (plan.offset !== undefined)
            this.offsetValue = plan.offset

        if (plan.limit !== undefined)
            this.limitValue = plan.limit

        if (plan.relationLoads)
            this.with(this.relationLoadPlansToEagerLoadMap(plan.relationLoads))

        return this
    }

    public async loadIntoModels (models: TModel[]): Promise<void> {
        await this.eagerLoadModels(models)
    }

    /**
     * Attempts to build relation load plans for the adapter based on the eager loads specified in the query builder.
     * 
     * @returns an array of RelationLoadPlan if successful, or null if the eager loads contain constraints that cannot be represented in a way compatible with adapter-based loading.
     */
    private tryBuildAdapterRelationLoadPlans (): RelationLoadPlan[] | null {
        const entries = Object.entries(this.eagerLoads)
        if (entries.length === 0)
            return []

        type RelationLoadTreeNode = {
            constraint?: EagerLoadConstraint
            children: Map<string, RelationLoadTreeNode>
        }

        const tree = new Map<string, RelationLoadTreeNode>()

        for (const [path, constraint] of entries) {
            const segments = path
                .split('.')
                .map(segment => segment.trim())
                .filter(segment => segment.length > 0)

            if (segments.length === 0)
                continue

            let current = tree
            segments.forEach((segment, index) => {
                const existing = current.get(segment) ?? { constraint: undefined, children: new Map<string, RelationLoadTreeNode>() }
                if (index === segments.length - 1 && constraint)
                    existing.constraint = constraint

                current.set(segment, existing)
                current = existing.children
            })
        }

        const toPlans = (owner: ModelStatic<any, any>, nodes: Map<string, RelationLoadTreeNode>): RelationLoadPlan[] | null => {
            const plans: RelationLoadPlan[] = []

            for (const [relation, node] of nodes.entries()) {
                const metadata = owner.getRelationMetadata(relation)
                const relatedModel = metadata && 'relatedModel' in metadata
                    ? metadata.relatedModel
                    : undefined
                if (!relatedModel)
                    return null

                const relatedQuery = relatedModel.query()
                const constrained = node.constraint ? node.constraint(relatedQuery) : relatedQuery
                const normalizedQuery = constrained instanceof QueryBuilder
                    ? constrained as QueryBuilder<any, any>
                    : relatedQuery

                if (constrained && !(constrained instanceof QueryBuilder) && constrained !== relatedQuery)
                    return null

                if (normalizedQuery.randomOrderEnabled)
                    return null

                const callbackRelationLoads = normalizedQuery.tryBuildAdapterRelationLoadPlans()
                const childRelationLoads = node.children.size > 0
                    ? toPlans(relatedModel as ModelStatic<any, any>, node.children)
                    : []

                if (callbackRelationLoads === null || childRelationLoads === null)
                    return null

                const where = normalizedQuery.legacyWhere
                    ? normalizedQuery.tryBuildQueryCondition(normalizedQuery.legacyWhere as QuerySchemaWhere<any>)
                    : normalizedQuery.queryWhere

                if (where === null)
                    return null

                plans.push({
                    relation,
                    constraint: where ?? undefined,
                    softDeleteMode: normalizedQuery.getRelationLoadSoftDeleteMode(),
                    orderBy: normalizedQuery.queryOrderBy ? [...normalizedQuery.queryOrderBy] : undefined,
                    limit: normalizedQuery.limitValue,
                    offset: normalizedQuery.offsetValue,
                    columns: normalizedQuery.querySelect ? [...normalizedQuery.querySelect] : undefined,
                    distinct: normalizedQuery.queryDistinct || undefined,
                    groupBy: normalizedQuery.queryGroupBy ? [...normalizedQuery.queryGroupBy] : undefined,
                    relationLoads: this.mergeRelationLoadPlans(
                        normalizedQuery.queryRelationLoads ? this.cloneRelationLoads(normalizedQuery.queryRelationLoads) : undefined,
                        this.mergeRelationLoadPlans(callbackRelationLoads, childRelationLoads),
                    ),
                })
            }

            return plans
        }

        return toPlans(this.model as unknown as ModelStatic<any, any>, tree)
    }

    private async eagerLoadModels (models: TModel[]): Promise<void> {
        if (models.length === 0 || Object.keys(this.eagerLoads).length === 0)
            return

        const adapter = this.adapter
        const relationLoads = this.tryBuildAdapterRelationLoadPlans()
        if (adapter?.capabilities?.relationLoads === true && typeof adapter.loadRelations === 'function' && relationLoads !== null) {
            await adapter.loadRelations({
                target: this.buildQueryTarget(),
                models,
                relations: relationLoads,
            })

            return
        }

        await new SetBasedEagerLoader(
            models as unknown as Array<{
                getAttribute: (key: string) => unknown
                setLoadedRelation: (name: string, value: unknown) => void
            }>,
            this.eagerLoads,
        ).load()
    }

    private normalizeRelationLoadSelect (select: unknown): QuerySelectColumn[] | null {
        if (Array.isArray(select) || typeof select !== 'object' || !select)
            return null

        const entries = Object.entries(select as Record<string, unknown>)
        if (entries.some(([, value]) => value !== true && value !== false && value !== undefined))
            return null

        return entries
            .filter(([, value]) => value === true)
            .map(([column]) => ({ column }))
    }

    private normalizeRelationLoadOrderBy (orderBy: unknown): QueryOrderBy[] | null {
        const clauses = Array.isArray(orderBy)
            ? orderBy
            : [orderBy]

        const normalized: QueryOrderBy[] = []
        for (const clause of clauses) {
            if (!clause || typeof clause !== 'object' || Array.isArray(clause))
                return null

            for (const [column, direction] of Object.entries(clause as Record<string, unknown>)) {
                if (direction !== 'asc' && direction !== 'desc')
                    return null

                normalized.push({ column, direction })
            }
        }

        return normalized
    }

    private normalizeRelationLoads (include: unknown): RelationLoadPlan[] | null {
        if (Array.isArray(include) || typeof include !== 'object' || !include)
            return null

        const plans: RelationLoadPlan[] = []

        for (const [relation, value] of Object.entries(include as Record<string, unknown>)) {
            if (value === false || value === undefined)
                continue

            if (value === true) {
                plans.push({ relation })
                continue
            }

            if (!value || typeof value !== 'object' || Array.isArray(value))
                return null

            const options = value as Record<string, unknown>
            const constraint = options.where === undefined
                ? undefined
                : this.tryBuildQueryCondition(options.where)
            const orderBy = options.orderBy === undefined
                ? undefined
                : this.normalizeRelationLoadOrderBy(options.orderBy)
            const columns = options.select === undefined
                ? undefined
                : this.normalizeRelationLoadSelect(options.select)
            const relationLoads = options.include === undefined
                ? undefined
                : this.normalizeRelationLoads(options.include)

            if (constraint === null || orderBy === null || columns === null || relationLoads === null)
                return null

            if ((options.skip !== undefined && typeof options.skip !== 'number')
                || (options.take !== undefined && typeof options.take !== 'number'))
                return null

            plans.push({
                relation,
                constraint,
                orderBy,
                limit: options.take as number | undefined,
                offset: options.skip as number | undefined,
                columns,
                relationLoads,
            })
        }

        return plans
    }

    private appendQueryCondition (operator: 'AND' | 'OR', condition: QueryCondition): void {
        if (!this.queryWhere) {
            this.queryWhere = condition

            return
        }

        this.queryWhere = {
            type: 'group',
            operator: operator === 'AND' ? 'and' : 'or',
            conditions: [this.queryWhere, condition],
        }
    }

    private toQuerySchemaWhere (condition?: QueryCondition): QuerySchemaWhere<TDelegate> | undefined {
        if (!condition)
            return undefined

        if (condition.type === 'comparison') {
            if (condition.operator === 'is-null')
                return { [condition.column]: null } as QuerySchemaWhere<TDelegate>

            if (condition.operator === 'is-not-null')
                return { [condition.column]: { not: null } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === '=')
                return { [condition.column]: condition.value } as QuerySchemaWhere<TDelegate>

            if (condition.operator === '!=')
                return { [condition.column]: { not: condition.value } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === '>')
                return { [condition.column]: { gt: condition.value } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === '>=')
                return { [condition.column]: { gte: condition.value } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === '<')
                return { [condition.column]: { lt: condition.value } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === '<=')
                return { [condition.column]: { lte: condition.value } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === 'in')
                return { [condition.column]: { in: Array.isArray(condition.value) ? condition.value : [condition.value] } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === 'not-in')
                return { [condition.column]: { notIn: Array.isArray(condition.value) ? condition.value : [condition.value] } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === 'contains')
                return { [condition.column]: { contains: condition.value } } as QuerySchemaWhere<TDelegate>

            if (condition.operator === 'starts-with')
                return { [condition.column]: { startsWith: condition.value } } as QuerySchemaWhere<TDelegate>

            return { [condition.column]: { endsWith: condition.value } } as QuerySchemaWhere<TDelegate>
        }

        if (condition.type === 'group') {
            const conditions = condition.conditions
                .map(entry => this.toQuerySchemaWhere(entry))
                .filter((entry): entry is QuerySchemaWhere<TDelegate> => Boolean(entry))

            if (conditions.length === 0)
                return undefined

            return {
                [condition.operator === 'and' ? 'AND' : 'OR']: conditions as Record<string, unknown>[],
            } as QuerySchemaWhere<TDelegate>
        }

        if (condition.type === 'not') {
            const nested = this.toQuerySchemaWhere(condition.condition)
            if (!nested)
                return undefined

            return { NOT: nested } as unknown as QuerySchemaWhere<TDelegate>
        }

        return undefined
    }

    private buildSoftDeleteQueryCondition (): QueryCondition | undefined {
        const softDeleteConfig = this.model.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled || this.includeTrashed)
            return undefined

        return {
            type: 'comparison',
            column: softDeleteConfig.column,
            operator: this.onlyTrashedRecords ? 'is-not-null' : 'is-null',
        }
    }

    private buildQueryWhereCondition (softDeleteOnly = false): QueryCondition | undefined | null {
        if (this.legacyWhere) {
            const fallbackWhere = softDeleteOnly
                ? this.buildSoftDeleteOnlyWhere()
                : this.buildWhere()

            return this.tryBuildQueryCondition(fallbackWhere)
        }

        const softDeleteCondition = this.buildSoftDeleteQueryCondition()
        if (softDeleteOnly)
            return softDeleteCondition

        if (!this.queryWhere)
            return softDeleteCondition

        if (!softDeleteCondition)
            return this.queryWhere

        return {
            type: 'group',
            operator: 'and',
            conditions: [this.queryWhere, softDeleteCondition],
        }
    }

    private tryBuildQuerySelectColumns (): QuerySelectColumn[] | undefined | null {
        return this.querySelect
    }

    private tryBuildQueryOrderBy (): QueryOrderBy[] | undefined | null {
        return this.queryOrderBy
    }

    private tryBuildFieldCondition (column: string, value: unknown): QueryCondition | null {
        if (value === null)
            return { type: 'comparison', column, operator: 'is-null' }

        if (value instanceof Date || typeof value !== 'object')
            return { type: 'comparison', column, operator: '=', value: value as DatabaseValue }

        if (Array.isArray(value))
            return null

        const clause = value as Record<string, unknown>
        const conditions: QueryCondition[] = []

        for (const [operator, operand] of Object.entries(clause)) {
            if (operator === 'equals') {
                conditions.push({ type: 'comparison', column, operator: operand === null ? 'is-null' : '=', value: operand as DatabaseValue })
                continue
            }

            if (operator === 'not') {
                if (operand && typeof operand === 'object' && !Array.isArray(operand))
                    return null

                conditions.push({ type: 'comparison', column, operator: operand === null ? 'is-not-null' : '!=', value: operand as DatabaseValue })
                continue
            }

            if (operator === 'in' || operator === 'notIn') {
                if (!Array.isArray(operand))
                    return null

                conditions.push({
                    type: 'comparison',
                    column,
                    operator: operator === 'in' ? 'in' : 'not-in',
                    value: operand,
                })
                continue
            }

            if (operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte') {
                const comparison: QueryComparisonCondition = {
                    type: 'comparison',
                    column,
                    operator: operator === 'gt'
                        ? '>'
                        : operator === 'gte'
                            ? '>='
                            : operator === 'lt'
                                ? '<'
                                : '<=',
                    value: operand as DatabaseValue,
                }

                conditions.push(comparison)
                continue
            }

            if (operator === 'contains' || operator === 'startsWith' || operator === 'endsWith') {
                conditions.push({
                    type: 'comparison',
                    column,
                    operator: operator === 'startsWith'
                        ? 'starts-with'
                        : operator === 'endsWith'
                            ? 'ends-with'
                            : 'contains',
                    value: operand as DatabaseValue,
                })
                continue
            }

            return null
        }

        if (conditions.length === 0)
            return null

        return conditions.length === 1
            ? conditions[0] ?? null
            : { type: 'group', operator: 'and', conditions }
    }

    private tryBuildQueryCondition (where: unknown): QueryCondition | undefined | null {
        if (!where)
            return undefined

        if (Array.isArray(where) || typeof where !== 'object')
            return null

        const conditions: QueryCondition[] = []

        for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
            if (key === 'AND' || key === 'OR') {
                if (!Array.isArray(value))
                    return null

                const nested = value
                    .map(entry => this.tryBuildQueryCondition(entry))
                    .filter((entry): entry is QueryCondition => entry !== undefined)

                if (nested.some(entry => entry == null))
                    return null

                if (nested.length > 0) {
                    conditions.push({
                        type: 'group',
                        operator: key === 'AND' ? 'and' : 'or',
                        conditions: nested,
                    })
                }

                continue
            }

            if (key === 'NOT') {
                const nested = Array.isArray(value)
                    ? value
                        .map(entry => this.tryBuildQueryCondition(entry))
                        .filter((entry): entry is QueryCondition => entry !== undefined)
                    : [this.tryBuildQueryCondition(value)].filter((entry): entry is QueryCondition => entry !== undefined)

                if (nested.some(entry => entry == null))
                    return null

                if (nested.length === 0)
                    continue

                conditions.push({
                    type: 'not',
                    condition: nested.length === 1
                        ? nested[0] as QueryCondition
                        : { type: 'group', operator: 'and', conditions: nested },
                })
                continue
            }

            const condition = this.tryBuildFieldCondition(key, value)
            if (!condition)
                return null

            conditions.push(condition)
        }

        if (conditions.length === 0)
            return undefined

        return conditions.length === 1
            ? conditions[0] ?? undefined
            : { type: 'group', operator: 'and', conditions }
    }

    private tryBuildSelectSpec (
        where: QuerySchemaWhere<TDelegate> | undefined,
        softDeleteOnly = false,
    ): SelectSpec<TModel> | null {
        const columns = this.tryBuildQuerySelectColumns()
        const orderBy = this.tryBuildQueryOrderBy()
        const condition = this.buildQueryWhereCondition(softDeleteOnly)
        const relationFilters = this.tryBuildRelationFilterSpecs()
        const relationAggregates = this.tryBuildRelationAggregateSpecs()

        if (columns === null || orderBy === null || condition === null)
            return null

        if (this.hasRelationFilters() && this.canExecuteRelationFiltersInAdapter() && relationFilters === null)
            return null

        if (this.hasRelationAggregates() && this.canExecuteRelationAggregatesInAdapter() && relationAggregates === null)
            return null

        return {
            target: this.buildQueryTarget(),
            columns,
            distinct: this.queryDistinct || undefined,
            groupBy: this.queryGroupBy ? [...this.queryGroupBy] : undefined,
            having: this.queryHaving,
            joins: this.queryJoins ? [...this.queryJoins] : undefined,
            where: condition,
            orderBy,
            limit: this.limitValue,
            offset: this.offsetValue,
            relationLoads: this.queryRelationLoads,
            relationFilters: this.canExecuteRelationFiltersInAdapter() ? relationFilters ?? undefined : undefined,
            relationAggregates: this.canExecuteRelationAggregatesInAdapter() ? relationAggregates ?? undefined : undefined,
        }
    }

    private tryBuildAggregateSpec (): AggregateSpec<TModel> | null {
        const condition = this.buildQueryWhereCondition(false)
        const relationFilters = this.tryBuildRelationFilterSpecs()
        if (condition === null)
            return null

        if (this.hasRelationFilters() && this.canExecuteRelationFiltersInAdapter() && relationFilters === null)
            return null

        return {
            target: this.buildQueryTarget(),
            joins: this.queryJoins ? [...this.queryJoins] : undefined,
            where: condition,
            relationFilters: this.canExecuteRelationFiltersInAdapter() ? relationFilters ?? undefined : undefined,
            aggregate: { type: 'count' },
        }
    }

    private requireAdapter (): DatabaseAdapter {
        if (!this.adapter)
            throw new UnsupportedAdapterFeatureException('Query execution requires a configured database adapter.', {
                operation: 'query.execute',
                model: this.model.name,
                meta: {
                    feature: 'adapter',
                },
            })

        return this.adapter
    }

    private async executeReadRows (
        whereOverride?: QuerySchemaWhere<TDelegate>,
        useWhereOverride = false,
    ): Promise<DatabaseRow[]> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildSelectSpec(useWhereOverride ? whereOverride : this.buildWhere(), useWhereOverride)
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Query shape could not be compiled into an Arkorm select specification.', {
                operation: 'query.select',
                model: this.model.name,
            })

        return await adapter.select(spec)
    }

    private async executeReadRow (): Promise<DatabaseRow | null> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildSelectSpec(this.buildWhere())
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Query shape could not be compiled into an Arkorm select specification.', {
                operation: 'query.selectOne',
                model: this.model.name,
            })

        return await adapter.selectOne(spec)
    }

    private async executeReadCount (): Promise<number> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildAggregateSpec()
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Query shape could not be compiled into an Arkorm aggregate specification.', {
                operation: 'query.count',
                model: this.model.name,
            })

        return await adapter.count(spec)
    }

    private async executeReadExists (): Promise<boolean> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildSelectSpec(this.buildWhere())
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Query shape could not be compiled into an Arkorm select specification.', {
                operation: 'query.exists',
                model: this.model.name,
            })

        if (typeof adapter.exists === 'function')
            return await adapter.exists({ ...spec, limit: 1 })

        return (await adapter.selectOne({ ...spec, limit: 1 })) != null
    }
    private async executeInsertRow (values: QuerySchemaCreateData<TDelegate>): Promise<DatabaseRow> {
        const [payload] = this.normalizeInsertPayloads(values)

        return await this.requireAdapter().insert(this.tryBuildInsertSpec(payload))
    }

    private async executeInsertManyRows (
        values: QuerySchemaCreateData<TDelegate>[],
        ignoreDuplicates = false,
    ): Promise<number> {
        const adapter = this.requireAdapter()
        const payloads = this.normalizeInsertPayloads(values)

        if (typeof adapter.insertMany === 'function') {
            return await adapter.insertMany(
                ignoreDuplicates
                    ? this.tryBuildInsertOrIgnoreManySpec(payloads)
                    : this.tryBuildInsertManySpec(payloads)
            )
        }

        let inserted = 0
        for (const value of payloads) {
            try {
                await adapter.insert(this.tryBuildInsertSpec(value))
                inserted += 1
            } catch (error) {
                if (!ignoreDuplicates)
                    throw error
            }
        }

        return inserted
    }

    private async executeUpsertRows (
        values: Array<Record<string, unknown>>,
        uniqueBy: string[],
        updateColumns?: string[],
    ): Promise<number> {
        const adapter = this.requireAdapter()
        const payloads = this.normalizeInsertPayloads(values as QuerySchemaCreateData<TDelegate>[]) as Array<Record<string, unknown>>
        const timestampUpdateColumns = (this.model.getModelMetadata().timestampColumns ?? [])
            .filter(column => column.updatedAt)
            .map(column => column.column)
        const normalizedUpdateColumns = updateColumns
            ? Array.from(new Set([...updateColumns, ...timestampUpdateColumns]))
            : updateColumns

        if (typeof adapter.upsert !== 'function') {
            throw new UnsupportedAdapterFeatureException('Upsert is not supported by the current adapter.', {
                operation: 'query.upsert',
                model: this.model.name,
            })
        }

        return await adapter.upsert(this.tryBuildUpsertSpec(payloads, uniqueBy, normalizedUpdateColumns))
    }

    private async executeUpdateRow (
        where: QuerySchemaWhere<TDelegate> | QuerySchemaUniqueWhere<TDelegate>,
        values: QuerySchemaUpdateData<TDelegate>
    ): Promise<DatabaseRow> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildUpdateSpec(where, this.normalizeUpdatePayload(values))
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Update could not be compiled into an Arkorm update specification.', {
                operation: 'query.update',
                model: this.model.name,
            })

        const updated = await adapter.update(spec)
        if (!updated)
            throw new ModelNotFoundException(this.model.name, 'Record not found for update operation.', {
                operation: 'update',
            })

        return updated
    }

    private async executeUpdateManyRows (
        where: QuerySchemaWhere<TDelegate> | undefined,
        values: QuerySchemaUpdateData<TDelegate>
    ): Promise<number> {
        const adapter = this.requireAdapter()
        const normalizedValues = this.normalizeUpdatePayload(values)
        const spec = this.tryBuildUpdateManySpec(where, normalizedValues)
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Update-many could not be compiled into an Arkorm update specification.', {
                operation: 'query.updateMany',
                model: this.model.name,
            })

        if (typeof adapter.updateMany === 'function')
            return await adapter.updateMany(spec)

        const rows = await adapter.select({
            target: spec.target,
            where: spec.where,
        })

        let updated = 0
        for (const row of rows) {
            const rowWhere = this.tryBuildQueryCondition(row)
            if (!rowWhere)
                continue

            const result = await adapter.update({
                target: spec.target,
                where: rowWhere,
                values: normalizedValues as DatabaseRow,
            })
            if (result)
                updated += 1
        }

        return updated
    }

    private async executeDeleteRow (
        where: QuerySchemaWhere<TDelegate> | QuerySchemaUniqueWhere<TDelegate>,
        failIfMissing = true
    ): Promise<DatabaseRow | null> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildDeleteSpec(where)
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Delete could not be compiled into an Arkorm delete specification.', {
                operation: 'query.delete',
                model: this.model.name,
            })

        const deleted = await adapter.delete(spec)
        if (!deleted)
            return failIfMissing
                ? (() => {
                    throw new ModelNotFoundException(this.model.name, 'Record not found for delete operation.', {
                        operation: 'delete',
                    })
                })()
                : null

        return deleted
    }

    /**
     * Builds the where clause for the query, taking into account soft delete 
     * settings if applicable.
     * 
     * @returns 
     */
    private buildWhere (): QuerySchemaWhere<TDelegate> | undefined {
        const baseWhere = this.legacyWhere ?? this.toQuerySchemaWhere(this.queryWhere)
        const softDeleteConfig = this.model.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return baseWhere

        if (this.includeTrashed)
            return baseWhere

        const softDeleteClause = this.onlyTrashedRecords
            ? { [softDeleteConfig.column]: { not: null } }
            : { [softDeleteConfig.column]: null }

        if (!baseWhere)
            return softDeleteClause as QuerySchemaWhere<TDelegate>

        return {
            AND: [baseWhere as Record<string, unknown>, softDeleteClause],
        } as unknown as QuerySchemaWhere<TDelegate>
    }

    /**
     * Builds the arguments for the findMany delegate method, including the where clause.
     * 
     * @returns 
     */
    /**
     * Resolves a unique where clause for update and delete operations. 
     * 
     * @param where 
     * @returns 
     */
    private async resolveUniqueWhere (
        where: QuerySchemaWhere<TDelegate>,
        failIfMissing = true
    ): Promise<QuerySchemaUniqueWhere<TDelegate> | null> {
        if (this.isUniqueWhere(where as Record<string, unknown>))
            return where as unknown as QuerySchemaUniqueWhere<TDelegate>

        const condition = this.tryBuildQueryCondition(where)
        if (!condition)
            throw new UniqueConstraintResolutionException('Unable to resolve a unique identifier for update/delete operation from the current query shape.', {
                operation: 'resolveUniqueWhere',
                model: this.model.name,
                meta: {
                    where: where as Record<string, unknown>,
                },
            })

        const row = await this.requireAdapter().selectOne({
            target: this.buildQueryTarget(),
            columns: [{ column: this.model.getPrimaryKey() }],
            where: condition,
            limit: 1,
        }) as Record<string, unknown> | null

        if (!row)
            return failIfMissing
                ? (() => {
                    throw new ModelNotFoundException(this.model.name, 'Record not found for update/delete operation.', {
                        operation: 'resolveUniqueWhere',
                        meta: {
                            where: where as Record<string, unknown>,
                        },
                    })
                })()
                : null

        const primaryKey = this.model.getPrimaryKey()

        if (!Object.prototype.hasOwnProperty.call(row, primaryKey))
            throw new UniqueConstraintResolutionException(`Unable to resolve a unique identifier for update/delete operation. Include [${primaryKey}] in the query constraints.`, {
                operation: 'resolveUniqueWhere',
                model: this.model.name,
                meta: {
                    where: where as Record<string, unknown>,
                },
            })

        return { [primaryKey]: row[primaryKey] } as unknown as QuerySchemaUniqueWhere<TDelegate>
    }

    /**
     * Checks if the provided where clause is already a unique 
     * identifier (i.e., contains only an 'id' field).
     * 
     * @param where 
     * @returns 
     */
    private isUniqueWhere (where: Record<string, unknown>): boolean {
        const primaryKey = this.model.getPrimaryKey()

        return Object.keys(where).length === 1 && Object.prototype.hasOwnProperty.call(where, primaryKey)
    }

    private shuffleRows<TRow> (rows: TRow[]): TRow[] {
        const shuffled = [...rows]

        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1))
            const current = shuffled[index]
            shuffled[index] = shuffled[swapIndex] as TRow
            shuffled[swapIndex] = current as TRow
        }

        return shuffled
    }

    private hasRelationFilters (): boolean {
        return this.relationFilters.length > 0
    }

    private hasOrRelationFilters (): boolean {
        return this.relationFilters.some(filter => filter.boolean === 'OR')
    }

    private hasRelationAggregates (): boolean {
        return this.relationAggregates.length > 0
    }

    private canExecuteRelationFiltersInAdapter (): boolean {
        const adapter = this.adapter
        if (!this.hasRelationFilters())
            return false

        return adapter?.capabilities?.relationFilters === true
            && this.tryBuildRelationFilterSpecs() !== null
    }

    private canExecuteRelationAggregatesInAdapter (): boolean {
        const adapter = this.adapter
        if (!this.hasRelationAggregates())
            return false

        return adapter?.capabilities?.relationAggregates === true
            && this.tryBuildRelationAggregateSpecs() !== null
    }

    private canExecuteRelationFeaturesInAdapter (): boolean {
        const filtersSupported = !this.hasRelationFilters() || this.canExecuteRelationFiltersInAdapter()
        const aggregatesSupported = !this.hasRelationAggregates() || this.canExecuteRelationAggregatesInAdapter()

        return filtersSupported && aggregatesSupported
    }

    private shouldUseCompatibilityRelationFallback (useAdapterRelationFeatures = this.canExecuteRelationFeaturesInAdapter()): boolean {
        if ((!this.hasRelationFilters() && !this.hasRelationAggregates()) || useAdapterRelationFeatures)
            return false

        const adapter = this.adapter
        const sqlRelationFiltersRejected = this.hasUncompilableSqlRelationFilters(adapter)
        const sqlRelationAggregatesRejected = this.hasUncompilableSqlRelationAggregates(adapter)

        if (sqlRelationFiltersRejected || sqlRelationAggregatesRejected) {
            throw new UnsupportedAdapterFeatureException('Relation filters or aggregates could not be compiled into Arkorm adapter specifications for the current query shape.', {
                operation: 'query.relations',
                model: this.model.name,
                meta: {
                    relationFilters: this.hasRelationFilters(),
                    relationAggregates: this.hasRelationAggregates(),
                },
            })
        }

        return true
    }

    private hasUncompilableSqlRelationFilters (adapter?: DatabaseAdapter): boolean {
        if (!this.hasRelationFilters() || adapter?.capabilities?.relationFilters !== true)
            return false

        return this.relationFilters.some((filter) => {
            const metadata = this.model.getRelationMetadata(filter.relation)
            if (!this.isSqlRelationFeatureMetadata(metadata))
                return false

            return this.tryBuildRelationConstraintWhere(filter.relation, filter.callback) === null
        })
    }

    private hasUncompilableSqlRelationAggregates (adapter?: DatabaseAdapter): boolean {
        if (!this.hasRelationAggregates() || adapter?.capabilities?.relationAggregates !== true)
            return false

        return this.relationAggregates.some((aggregate) => {
            const metadata = this.model.getRelationMetadata(aggregate.relation)
            if (!this.isSqlRelationFeatureMetadata(metadata))
                return false

            return this.tryBuildRelationConstraintWhere(aggregate.relation, aggregate.callback) === null
        })
    }

    private tryBuildRelationFilterSpecs (): RelationFilterSpec[] | null {
        return this.relationFilters.reduce<RelationFilterSpec[] | null>((specs, filter) => {
            if (!specs)
                return null

            const metadata = this.model.getRelationMetadata(filter.relation)
            if (!this.isSqlRelationFeatureMetadata(metadata))
                return null

            const where = this.tryBuildRelationConstraintWhere(filter.relation, filter.callback)
            if (where === null)
                return null

            specs.push({
                relation: filter.relation,
                operator: filter.operator,
                count: filter.count,
                boolean: filter.boolean,
                where,
            })

            return specs
        }, [])
    }

    private tryBuildRelationAggregateSpecs (): RelationAggregateSpec[] | null {
        return this.relationAggregates.reduce<RelationAggregateSpec[] | null>((specs, aggregate) => {
            if (!specs)
                return null

            const metadata = this.model.getRelationMetadata(aggregate.relation)
            if (!this.isSqlRelationFeatureMetadata(metadata))
                return null

            const where = this.tryBuildRelationConstraintWhere(aggregate.relation, aggregate.callback)
            if (where === null)
                return null

            specs.push({
                relation: aggregate.relation,
                type: aggregate.type,
                column: aggregate.column,
                alias: this.buildAggregateAttributeKey(aggregate),
                where,
            })

            return specs
        }, [])
    }

    private tryBuildRelationConstraintWhere (
        relation: string,
        callback?: (query: QueryBuilder<any, any>) => unknown,
    ): QueryCondition | undefined | null {
        const metadata = this.model.getRelationMetadata(relation)
        if (!this.isSqlRelationFeatureMetadata(metadata))
            return null

        if (!metadata || !('relatedModel' in metadata))
            return null

        const relatedQuery = metadata.relatedModel.query()

        if (!relatedQuery) {
            return null
        }

        if (callback) {
            const constrained = callback(relatedQuery)
            if (constrained && constrained !== relatedQuery)
                return null
        }

        if (
            relatedQuery.hasRelationFilters()
            || relatedQuery.hasRelationAggregates()
            || relatedQuery.queryRelationLoads
            || relatedQuery.querySelect
            || relatedQuery.queryOrderBy
            || relatedQuery.queryDistinct
            || relatedQuery.queryGroupBy
            || relatedQuery.offsetValue !== undefined
            || relatedQuery.limitValue !== undefined
            || relatedQuery.randomOrderEnabled
        ) {
            return null
        }

        return relatedQuery.buildQueryWhereCondition(false)
    }

    private isSqlRelationFeatureMetadata (metadata: ReturnType<ModelStatic<TModel, TDelegate>['getRelationMetadata']>): boolean {
        if (!metadata)
            return false

        return metadata.type === 'hasMany'
            || metadata.type === 'hasOne'
            || metadata.type === 'belongsTo'
            || metadata.type === 'belongsToMany'
            || metadata.type === 'hasOneThrough'
            || metadata.type === 'hasManyThrough'
    }

    private async filterModelsByRelationConstraints (
        models: TModel[],
        relationCache: RelationResultCache,
        baseIds?: Set<string | number>
    ): Promise<TModel[]> {
        const evaluations = await Promise.all(models.map(async (model) => {
            let result: boolean | null = null
            if (baseIds)
                result = baseIds.has(this.getModelId(model) as string | number)

            for (const filter of this.relationFilters) {
                const relatedCount = await this.resolveRelatedCount(model, filter.relation, relationCache, filter.callback)
                const condition = this.compareCount(relatedCount, filter.operator, filter.count)

                if (result == null)
                    result = condition
                else
                    result = filter.boolean === 'AND'
                        ? result && condition
                        : result || condition
            }

            return { model, passes: result ?? true }
        }))

        return evaluations.filter(entry => entry.passes).map(entry => entry.model)
    }

    private getModelId (model: TModel): string | number | null {
        const readable = model as unknown as {
            getAttribute?: (key: string) => unknown
        }
        if (typeof readable.getAttribute !== 'function')
            return null

        const id = readable.getAttribute(this.model.getPrimaryKey())
        if (typeof id === 'number' || typeof id === 'string')
            return id

        return null
    }

    private buildSoftDeleteOnlyWhere (): QuerySchemaWhere<TDelegate> | undefined {
        const softDeleteConfig = this.model.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return undefined

        if (this.includeTrashed)
            return undefined

        const softDeleteClause = this.onlyTrashedRecords
            ? { [softDeleteConfig.column]: { not: null } }
            : { [softDeleteConfig.column]: null }

        return softDeleteClause as QuerySchemaWhere<TDelegate>
    }

    private async applyRelationAggregates (
        models: TModel[],
        relationCache?: RelationResultCache
    ): Promise<void> {
        const cache = relationCache ?? new WeakMap<object, Map<string, Map<unknown, Promise<RelationResult>>>>()
        await Promise.all(models.map(async (model) => {
            for (const aggregate of this.relationAggregates) {
                const results = await this.resolveRelatedResults(model, aggregate.relation, cache, aggregate.callback)
                const list = Array.isArray(results)
                    ? results
                    : results ? [results] : []

                const attributeKey = this.buildAggregateAttributeKey(aggregate)
                if (aggregate.type === 'count') {
                    this.assignAggregate(model, attributeKey, list.length)
                    continue
                }

                if (aggregate.type === 'exists') {
                    this.assignAggregate(model, attributeKey, list.length > 0)
                    continue
                }

                const values = list
                    .map(item => (item as { getAttribute: (key: string) => unknown }).getAttribute(aggregate.column as string))
                    .filter(value => value != null)

                if (aggregate.type === 'sum') {
                    const sum = values.reduce<number>((total, value) => {
                        const numeric = typeof value === 'number' ? value : Number(value)

                        return Number.isFinite(numeric) ? total + numeric : total
                    }, 0)
                    this.assignAggregate(model, attributeKey, sum)
                    continue
                }

                if (aggregate.type === 'avg') {
                    const numericValues = values
                        .map(value => typeof value === 'number' ? value : Number(value))
                        .filter(value => Number.isFinite(value))
                    const avg = numericValues.length === 0
                        ? null
                        : numericValues.reduce((total, value) => total + value, 0) / numericValues.length
                    this.assignAggregate(model, attributeKey, avg)
                    continue
                }

                if (aggregate.type === 'min') {
                    const min = values.length === 0
                        ? null
                        : values.reduce((left, right) =>
                            (right as number | string | Date) < (left as number | string | Date) ? right : left
                        )
                    this.assignAggregate(model, attributeKey, min)
                    continue
                }

                const max = values.length === 0
                    ? null
                    : values.reduce((left, right) =>
                        (right as number | string | Date) > (left as number | string | Date) ? right : left
                    )
                this.assignAggregate(model, attributeKey, max)
            }
        }))
    }

    private async resolveRelatedCount (
        model: TModel,
        relation: string,
        relationCache: RelationResultCache,
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): Promise<number> {
        const results = await this.resolveRelatedResults(model, relation, relationCache, callback)

        if (Array.isArray(results))
            return results.length

        return results ? 1 : 0
    }

    private async resolveRelatedResults (
        model: TModel,
        relation: string,
        relationCache: RelationResultCache,
        callback?: (query: QueryBuilder<any, any>) => unknown
    ): Promise<unknown[] | unknown | null> {
        const modelCacheKey = model as unknown as object
        const callbackCacheKey = callback ?? '__none__'

        let relationMap = relationCache.get(modelCacheKey)
        if (!relationMap) {
            relationMap = new Map()
            relationCache.set(modelCacheKey, relationMap)
        }

        let callbackMap = relationMap.get(relation)
        if (!callbackMap) {
            callbackMap = new Map()
            relationMap.set(relation, callbackMap)
        }

        const cached = callbackMap.get(callbackCacheKey)
        if (cached)
            return await cached

        const resolver = (async () => {
            const relationMethod = (model as Record<string, unknown>)[relation]
            if (typeof relationMethod !== 'function')
                throw new RelationResolutionException(`Relation [${relation}] is not defined on the model.`, {
                    operation: 'resolveRelatedResults',
                    model: this.model.name,
                    relation,
                })

            const relationInstance = relationMethod.call(model) as {
                constrain?: (constraint: (query: QueryBuilder<any, any>) => QueryBuilder<any, any> | void) => unknown
                get?: () => Promise<unknown>
                getResults?: () => Promise<unknown>
            }

            if (callback && typeof relationInstance.constrain === 'function') {
                relationInstance.constrain((query: QueryBuilder<any, any>) => {
                    const constrained = callback(query)

                    return (constrained as QueryBuilder<any, any> | void) ?? query
                })
            }

            if (typeof relationInstance.get === 'function') {
                const results = await relationInstance.get()

                if (results instanceof ArkormCollection)
                    return results.all()

                return results as unknown | null
            }

            if (typeof relationInstance.getResults === 'function') {
                const results = await relationInstance.getResults()

                if (results instanceof ArkormCollection)
                    return results.all()

                return results as unknown | null
            }

            throw new RelationResolutionException(`Relation [${relation}] does not support result resolution.`, {
                operation: 'resolveRelatedResults',
                model: this.model.name,
                relation,
            })
        })()

        callbackMap.set(callbackCacheKey, resolver)

        return await resolver
    }

    private compareCount (
        left: number,
        operator: '>=' | '>' | '=' | '!=' | '<=' | '<',
        right: number
    ): boolean {
        if (operator === '>=')
            return left >= right
        if (operator === '>')
            return left > right
        if (operator === '=')
            return left === right
        if (operator === '!=')
            return left !== right
        if (operator === '<=')
            return left <= right

        return left < right
    }

    private buildAggregateAttributeKey (aggregate: {
        type: RelationAggregateType
        relation: string
        column?: string
        alias?: string
    }): string {
        if (aggregate.alias)
            return aggregate.alias

        const relationName = aggregate.relation
        if (aggregate.type === 'count')
            return `${relationName}Count`
        if (aggregate.type === 'exists')
            return `${relationName}Exists`

        const columnName = aggregate.column
            ? `${aggregate.column.charAt(0).toUpperCase()}${aggregate.column.slice(1)}`
            : ''
        const aggregateType = `${aggregate.type.charAt(0).toUpperCase()}${aggregate.type.slice(1)}`

        return `${relationName}${aggregateType}${columnName}`
    }

    private assignAggregate (model: TModel, key: string, value: unknown): void {
        const assignable = model as unknown as {
            setAttribute?: (key: string, value: unknown) => unknown
        }

        if (typeof assignable.setAttribute === 'function') {
            assignable.setAttribute(key, value)

            return
        }

        ; (model as Record<string, unknown>)[key] = value
    }
}
