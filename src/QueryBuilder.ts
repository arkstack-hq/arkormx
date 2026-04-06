import type {
    AggregateSpec,
    DatabaseAdapter,
    DatabaseRow,
    DatabaseValue,
    DelegateCreateData,
    DelegateInclude,
    DelegateOrderBy,
    DelegateSelect,
    DelegateUniqueWhere,
    DelegateUpdateData,
    DelegateWhere,
    DeleteSpec,
    EagerLoadConstraint,
    EagerLoadMap,
    InsertManySpec,
    InsertSpec,
    ModelAttributes,
    ModelStatic,
    PaginationOptions,
    PrismaDelegateLike,
    QueryComparisonCondition,
    QueryCondition,
    QueryOrderBy,
    QueryRawCondition,
    QuerySelectColumn,
    QueryTarget,
    RelationAggregateSpec,
    RelationFilterSpec,
    RelationLoadPlan,
    SelectSpec,
    UpdateManySpec,
    UpdateSpec,
} from './types'
import { LengthAwarePaginator, Paginator } from './Paginator'

import { ArkormCollection } from './Collection'
import { ArkormException } from './Exceptions/ArkormException'
import { ModelNotFoundException } from './Exceptions/ModelNotFoundException'
import { QueryConstraintException } from './Exceptions/QueryConstraintException'
import { RelationResolutionException } from './Exceptions/RelationResolutionException'
import { ScopeNotDefinedException } from './Exceptions/ScopeNotDefinedException'
import { SetBasedEagerLoader } from './relationship/SetBasedEagerLoader'
import { UniqueConstraintResolutionException } from './Exceptions/UniqueConstraintResolutionException'
import { UnsupportedAdapterFeatureException } from './Exceptions/UnsupportedAdapterFeatureException'
import { getRuntimePaginationCurrentPageResolver } from './helpers/runtime-config'

type RelationResult = unknown[] | unknown | null
type RelationResultCache = WeakMap<object, Map<string, Map<unknown, Promise<RelationResult>>>>

/**
 * The QueryBuilder class provides a fluent interface for building and 
 * executing database queries.
 * 
 * @template TModel The type of the model being queried.
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class QueryBuilder<TModel, TDelegate extends PrismaDelegateLike = PrismaDelegateLike> {
    private queryWhere?: QueryCondition
    private legacyWhere?: DelegateWhere<TDelegate>
    private queryRelationLoads?: RelationLoadPlan[]
    private queryOrderBy?: QueryOrderBy[]
    private querySelect?: QuerySelectColumn[]
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
        type: 'count' | 'exists' | 'sum' | 'avg' | 'min' | 'max'
        relation: string
        column?: string
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
     * @param where 
     * @returns 
     */
    public where (where: DelegateWhere<TDelegate>): this {
        return this.addLogicalWhere('AND', where)
    }

    /**
     * Adds an OR where clause to the query.
     *
     * @param where
     * @returns
     */
    public orWhere (where: DelegateWhere<TDelegate>): this {
        return this.addLogicalWhere('OR', where)
    }

    /**
     * Adds a NOT where clause to the query.
     *
     * @param where
     * @returns
     */
    public whereNot (where: DelegateWhere<TDelegate>): this {
        return this.where({ NOT: where } as unknown as DelegateWhere<TDelegate>)
    }

    /**
     * Adds an OR NOT where clause to the query.
     *
     * @param where
     * @returns
     */
    public orWhereNot (where: DelegateWhere<TDelegate>): this {
        return this.orWhere({ NOT: where } as unknown as DelegateWhere<TDelegate>)
    }

    /**
     * Adds a null check for a key.
     *
     * @param key
     * @returns
     */
    public whereNull<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: null } as DelegateWhere<TDelegate>)
    }

    /**
     * Adds a not-null check for a key.
     *
     * @param key
     * @returns
     */
    public whereNotNull<TKey extends keyof ModelAttributes<TModel> & string> (key: TKey): this {
        return this.where({ [key]: { not: null } } as DelegateWhere<TDelegate>)
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

        return this.where({ [key]: { gte: min, lte: max } } as DelegateWhere<TDelegate>)
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

        return this.where({ [key]: { gte: start, lt: end } } as DelegateWhere<TDelegate>)
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

        return this.where({ [key]: { gte: start, lt: end } } as DelegateWhere<TDelegate>)
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

        return this.where({ [key]: { gte: start, lt: end } } as DelegateWhere<TDelegate>)
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
        return this.where({ [key]: { not: value } } as DelegateWhere<TDelegate>)
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
        return this.orWhere({ [key]: { in: values } } as DelegateWhere<TDelegate>)
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
        return this.where({ [key]: { notIn: values } } as DelegateWhere<TDelegate>)
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
        return this.orWhere({ [key]: { notIn: values } } as DelegateWhere<TDelegate>)
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

    private addLogicalWhere (operator: 'AND' | 'OR', where: DelegateWhere<TDelegate>): this {
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

        const existingWhere = this.legacyWhere ?? this.toDelegateWhere(this.queryWhere)
        this.queryWhere = undefined

        if (!existingWhere) {
            this.legacyWhere = where

            return this
        }

        this.legacyWhere = {
            [operator]: [existingWhere as Record<string, unknown>, where as Record<string, unknown>],
        } as DelegateWhere<TDelegate>

        return this
    }

    private buildComparisonWhere (
        key: string,
        operator: '=' | '!=' | '>' | '>=' | '<' | '<=',
        value: unknown
    ): DelegateWhere<TDelegate> {
        if (operator === '=')
            return { [key]: value } as DelegateWhere<TDelegate>

        if (operator === '!=')
            return { [key]: { not: value } } as DelegateWhere<TDelegate>

        if (operator === '>')
            return { [key]: { gt: value } } as DelegateWhere<TDelegate>

        if (operator === '>=')
            return { [key]: { gte: value } } as DelegateWhere<TDelegate>

        if (operator === '<')
            return { [key]: { lt: value } } as DelegateWhere<TDelegate>

        return { [key]: { lte: value } } as DelegateWhere<TDelegate>
    }

    private coerceDate (value: Date | string): Date {
        const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
        if (Number.isNaN(parsed.getTime()))
            throw new ArkormException('Invalid date value for date-based query helper.')

        return parsed
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
        return this.where({ [key]: value } as DelegateWhere<TDelegate>)
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
        return this.where({ [key]: { in: values } } as DelegateWhere<TDelegate>)
    }

    /**
     * Adds an orderBy clause to the query. This will overwrite any existing orderBy clause.
     * 
     * @param orderBy 
     * @returns 
     */
    public orderBy (orderBy: DelegateOrderBy<TDelegate>): this {
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

        return this.orderBy({ [column]: direction } as DelegateOrderBy<TDelegate>)
    }

    /**
     * Adds an orderBy descending clause for a timestamp-like column.
     *
     * @param column
     * @returns
     */
    public latest (column = 'createdAt'): this {
        return this.orderBy({ [column]: 'desc' } as DelegateOrderBy<TDelegate>)
    }

    /**
     * Adds an orderBy ascending clause for a timestamp-like column.
     *
     * @param column
     * @returns
     */
    public oldest (column = 'createdAt'): this {
        return this.orderBy({ [column]: 'asc' } as DelegateOrderBy<TDelegate>)
    }

    /**
     * Adds an include clause to the query. This will overwrite any existing include clause.
     * 
     * @param include 
     * @returns 
     */
    public include (include: DelegateInclude<TDelegate>): this {
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
    public with (relations: string | string[] | Record<string, EagerLoadConstraint | undefined>): this {
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
    public withCount (relations: string | string[]): this {
        const names = Array.isArray(relations) ? relations : [relations]
        names.forEach(relation => {
            this.relationAggregates.push({ type: 'count', relation })
        })

        return this
    }

    /**
     * Add relationship existence aggregate attributes.
     *
     * @param relations
     * @returns
     */
    public withExists (relations: string | string[]): this {
        const names = Array.isArray(relations) ? relations : [relations]
        names.forEach(relation => {
            this.relationAggregates.push({ type: 'exists', relation })
        })

        return this
    }

    /**
     * Add relationship sum aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withSum (relation: string, column: string): this {
        this.relationAggregates.push({ type: 'sum', relation, column })

        return this
    }

    /**
     * Add relationship average aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withAvg (relation: string, column: string): this {
        this.relationAggregates.push({ type: 'avg', relation, column })

        return this
    }

    /**
     * Add relationship minimum aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withMin (relation: string, column: string): this {
        this.relationAggregates.push({ type: 'min', relation, column })

        return this
    }

    /**
     * Add relationship maximum aggregate attribute.
     *
     * @param relation
     * @param column
     * @returns
     */
    public withMax (relation: string, column: string): this {
        this.relationAggregates.push({ type: 'max', relation, column })

        return this
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
    public select (select: DelegateSelect<TDelegate>): this {
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
        const relationCache: RelationResultCache = new WeakMap()
        const rows = await this.executeReadRows()
        const normalizedRows = this.randomOrderEnabled
            ? this.shuffleRows(rows as unknown[])
            : rows
        const models = await this.model.hydrateManyRetrieved(normalizedRows as Parameters<ModelStatic<TModel, TDelegate>['hydrateManyRetrieved']>[0])

        let filteredModels = models
        if (this.hasRelationFilters() && !useAdapterRelationFeatures) {
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

        if (this.hasRelationAggregates() && !useAdapterRelationFeatures)
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
        if ((this.hasRelationFilters() || this.hasRelationAggregates()) && !this.canExecuteRelationFeaturesInAdapter()) {
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

        return this.where({ [resolvedKey]: value } as DelegateWhere<TDelegate>).first()
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
    public async create (data: DelegateCreateData<TDelegate>): Promise<TModel> {
        const created = await this.executeInsertRow(data)

        return this.model.hydrate(created as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }

    /**
     * Creates multiple records and returns hydrated model instances.
     *
     * @param values
     * @returns
     */
    public async createMany (values: DelegateCreateData<TDelegate>[]): Promise<TModel[]> {
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
        values: DelegateCreateData<TDelegate> | DelegateCreateData<TDelegate>[]
    ): Promise<boolean> {
        const payloads = this.normalizeInsertPayloads(values)
        if (payloads.length === 0)
            return true

        if (payloads.length === 1) {
            await this.executeInsertRow(payloads[0] as DelegateCreateData<TDelegate>)

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
        values: DelegateCreateData<TDelegate> | DelegateCreateData<TDelegate>[]
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
        values: DelegateCreateData<TDelegate>,
        sequence?: string | null
    ): Promise<unknown> {
        const created = await this.executeInsertRow(values) as Record<string, unknown>
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

        await this.insert(rows as DelegateCreateData<TDelegate>[])

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

        return this.insertOrIgnore(rows as DelegateCreateData<TDelegate>[])
    }

    /**
     * Updates records matching the current query constraints with the 
     * specified data and returns the updated record(s) as model instance(s).
     * 
     * @param data 
     * @returns 
     */
    public async update (data: DelegateUpdateData<TDelegate>): Promise<TModel> {
        const where = this.buildWhere()
        if (!where)
            throw new QueryConstraintException('Update requires a where clause.', {
                operation: 'update',
                model: this.model.name,
            })

        const uniqueWhere = await this.resolveUniqueWhere(where)
        const updated = await this.executeUpdateRow(uniqueWhere, data)

        return this.model.hydrate(updated as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }

    /**
     * Update records using update-many semantics when available.
     *
     * @param data
     * @returns
     */
    public async updateFrom (data: DelegateUpdateData<TDelegate>): Promise<number> {
        const where = this.buildWhere()
        if (!where)
            throw new QueryConstraintException('Update requires a where clause.', {
                operation: 'updateFrom',
                model: this.model.name,
            })

        return await this.executeUpdateManyRows(where, data)
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
        const existing = await this.clone().where(attributes as DelegateWhere<TDelegate>).first()
        const exists = existing != null
        const resolvedValues = typeof values === 'function'
            ? await values(exists)
            : values

        if (!exists) {
            await this.executeInsertRow({
                ...attributes,
                ...resolvedValues,
            } as DelegateCreateData<TDelegate>)

            return true
        }

        const updated = await this.clone().where(attributes as DelegateWhere<TDelegate>).update(resolvedValues as DelegateUpdateData<TDelegate>)

        return updated != null
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
     * Deletes records matching the current query constraints and returns 
     * the deleted record(s) as model instance(s).
     * 
     * @returns 
     */
    public async delete (): Promise<TModel> {
        const where = this.buildWhere()
        if (!where)
            throw new QueryConstraintException('Delete requires a where clause.', {
                operation: 'delete',
                model: this.model.name,
            })

        const uniqueWhere = await this.resolveUniqueWhere(where)
        const deleted = await this.executeDeleteRow(uniqueWhere)

        return this.model.hydrate(deleted as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }
    private tryBuildInsertSpec (values: DelegateCreateData<TDelegate>): InsertSpec<TModel> {
        return {
            target: this.buildQueryTarget(),
            values: values as DatabaseRow,
        }
    }

    private tryBuildInsertManySpec (values: DelegateCreateData<TDelegate>[]): InsertManySpec<TModel> {
        return {
            target: this.buildQueryTarget(),
            values: values as DatabaseRow[],
        }
    }

    private tryBuildInsertOrIgnoreManySpec (values: DelegateCreateData<TDelegate>[]): InsertManySpec<TModel> {
        return {
            ...this.tryBuildInsertManySpec(values),
            ignoreDuplicates: true,
        }
    }

    private tryBuildUpdateSpec (
        where: DelegateWhere<TDelegate> | DelegateUniqueWhere<TDelegate>,
        values: DelegateUpdateData<TDelegate>
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
        where: DelegateWhere<TDelegate> | undefined,
        values: DelegateUpdateData<TDelegate>
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

    private tryBuildDeleteSpec (where: DelegateWhere<TDelegate> | DelegateUniqueWhere<TDelegate>): DeleteSpec<TModel> | null {
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
        if (this.hasRelationFilters() && !this.canExecuteRelationFeaturesInAdapter())
            return (await this.get()).all().length

        return this.executeReadCount()
    }

    /**
     * Determines if any records exist for the current query constraints.
     *
     * @returns
     */
    public async exists (): Promise<boolean> {
        if (this.hasRelationFilters() && !this.canExecuteRelationFeaturesInAdapter())
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
        values: DelegateCreateData<TDelegate> | DelegateCreateData<TDelegate>[]
    ): DelegateCreateData<TDelegate>[] {
        if (Array.isArray(values))
            return values

        return [values]
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

        if ((this.hasRelationFilters() || this.hasRelationAggregates()) && !this.canExecuteRelationFeaturesInAdapter()) {
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

        if ((this.hasRelationFilters() || this.hasRelationAggregates()) && !this.canExecuteRelationFeaturesInAdapter()) {
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
        relations: string | string[] | Record<string, EagerLoadConstraint | undefined>
    ): EagerLoadMap {
        if (typeof relations === 'string')
            return { [relations]: undefined }

        if (Array.isArray(relations)) {
            return relations.reduce<EagerLoadMap>((accumulator, relation) => {
                accumulator[relation] = undefined

                return accumulator
            }, {})
        }

        return relations
    }

    private buildQueryTarget (): QueryTarget<TModel> {
        const metadata = this.model.getModelMetadata()

        return {
            model: this.model as unknown as ModelStatic<TModel, any>,
            modelName: this.model.name,
            table: metadata.table,
            primaryKey: metadata.primaryKey,
            columns: metadata.columns,
            softDelete: metadata.softDelete,
        }
    }

    private hasBaseWhereConstraints (): boolean {
        return this.queryWhere != null || this.legacyWhere != null
    }

    private normalizeQuerySelect (select: DelegateSelect<TDelegate>): QuerySelectColumn[] | null {
        if (Array.isArray(select) || typeof select !== 'object' || !select)
            return null

        const entries = Object.entries(select as Record<string, unknown>)
        if (entries.some(([, value]) => value !== true && value !== false && value !== undefined))
            return null

        const columns = entries
            .filter(([, value]) => value === true)
            .map(([column]) => ({ column }))

        return columns.length > 0 ? columns : []
    }

    private normalizeQueryOrderBy (orderBy: DelegateOrderBy<TDelegate>): QueryOrderBy[] | null {
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
                orderBy: plan.orderBy ? [...plan.orderBy] : undefined,
                limit: plan.limit,
                offset: plan.offset,
                columns: plan.columns ? [...plan.columns] : undefined,
                relationLoads: plan.relationLoads
                    ? this.cloneRelationLoads(plan.relationLoads)
                    : undefined,
            }
        })
    }

    private async eagerLoadModels (models: TModel[]): Promise<void> {
        if (models.length === 0 || Object.keys(this.eagerLoads).length === 0)
            return

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

    private toDelegateWhere (condition?: QueryCondition): DelegateWhere<TDelegate> | undefined {
        if (!condition)
            return undefined

        if (condition.type === 'comparison') {
            if (condition.operator === 'is-null')
                return { [condition.column]: null } as DelegateWhere<TDelegate>

            if (condition.operator === 'is-not-null')
                return { [condition.column]: { not: null } } as DelegateWhere<TDelegate>

            if (condition.operator === '=')
                return { [condition.column]: condition.value } as DelegateWhere<TDelegate>

            if (condition.operator === '!=')
                return { [condition.column]: { not: condition.value } } as DelegateWhere<TDelegate>

            if (condition.operator === '>')
                return { [condition.column]: { gt: condition.value } } as DelegateWhere<TDelegate>

            if (condition.operator === '>=')
                return { [condition.column]: { gte: condition.value } } as DelegateWhere<TDelegate>

            if (condition.operator === '<')
                return { [condition.column]: { lt: condition.value } } as DelegateWhere<TDelegate>

            if (condition.operator === '<=')
                return { [condition.column]: { lte: condition.value } } as DelegateWhere<TDelegate>

            if (condition.operator === 'in')
                return { [condition.column]: { in: Array.isArray(condition.value) ? condition.value : [condition.value] } } as DelegateWhere<TDelegate>

            if (condition.operator === 'not-in')
                return { [condition.column]: { notIn: Array.isArray(condition.value) ? condition.value : [condition.value] } } as DelegateWhere<TDelegate>

            if (condition.operator === 'contains')
                return { [condition.column]: { contains: condition.value } } as DelegateWhere<TDelegate>

            if (condition.operator === 'starts-with')
                return { [condition.column]: { startsWith: condition.value } } as DelegateWhere<TDelegate>

            return { [condition.column]: { endsWith: condition.value } } as DelegateWhere<TDelegate>
        }

        if (condition.type === 'group') {
            const conditions = condition.conditions
                .map(entry => this.toDelegateWhere(entry))
                .filter((entry): entry is DelegateWhere<TDelegate> => Boolean(entry))

            if (conditions.length === 0)
                return undefined

            return {
                [condition.operator === 'and' ? 'AND' : 'OR']: conditions as Record<string, unknown>[],
            } as DelegateWhere<TDelegate>
        }

        if (condition.type === 'not') {
            const nested = this.toDelegateWhere(condition.condition)
            if (!nested)
                return undefined

            return { NOT: nested } as unknown as DelegateWhere<TDelegate>
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
        where: DelegateWhere<TDelegate> | undefined,
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
        whereOverride?: DelegateWhere<TDelegate>,
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
    private async executeInsertRow (values: DelegateCreateData<TDelegate>): Promise<DatabaseRow> {
        return await this.requireAdapter().insert(this.tryBuildInsertSpec(values))
    }

    private async executeInsertManyRows (
        values: DelegateCreateData<TDelegate>[],
        ignoreDuplicates = false,
    ): Promise<number> {
        const adapter = this.requireAdapter()

        if (typeof adapter.insertMany === 'function') {
            return await adapter.insertMany(
                ignoreDuplicates
                    ? this.tryBuildInsertOrIgnoreManySpec(values)
                    : this.tryBuildInsertManySpec(values)
            )
        }

        let inserted = 0
        for (const value of values) {
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

    private async executeUpdateRow (
        where: DelegateWhere<TDelegate> | DelegateUniqueWhere<TDelegate>,
        values: DelegateUpdateData<TDelegate>
    ): Promise<DatabaseRow> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildUpdateSpec(where, values)
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
        where: DelegateWhere<TDelegate> | undefined,
        values: DelegateUpdateData<TDelegate>
    ): Promise<number> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildUpdateManySpec(where, values)
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
                values: spec.values,
            })
            if (result)
                updated += 1
        }

        return updated
    }

    private async executeDeleteRow (where: DelegateWhere<TDelegate> | DelegateUniqueWhere<TDelegate>): Promise<DatabaseRow> {
        const adapter = this.requireAdapter()
        const spec = this.tryBuildDeleteSpec(where)
        if (!spec)
            throw new UnsupportedAdapterFeatureException('Delete could not be compiled into an Arkorm delete specification.', {
                operation: 'query.delete',
                model: this.model.name,
            })

        const deleted = await adapter.delete(spec)
        if (!deleted)
            throw new ModelNotFoundException(this.model.name, 'Record not found for delete operation.', {
                operation: 'delete',
            })

        return deleted
    }

    /**
     * Builds the where clause for the query, taking into account soft delete 
     * settings if applicable.
     * 
     * @returns 
     */
    private buildWhere (): DelegateWhere<TDelegate> | undefined {
        const baseWhere = this.legacyWhere ?? this.toDelegateWhere(this.queryWhere)
        const softDeleteConfig = this.model.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return baseWhere

        if (this.includeTrashed)
            return baseWhere

        const softDeleteClause = this.onlyTrashedRecords
            ? { [softDeleteConfig.column]: { not: null } }
            : { [softDeleteConfig.column]: null }

        if (!baseWhere)
            return softDeleteClause as DelegateWhere<TDelegate>

        return {
            AND: [baseWhere as Record<string, unknown>, softDeleteClause],
        } as unknown as DelegateWhere<TDelegate>
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
        where: DelegateWhere<TDelegate>
    ): Promise<DelegateUniqueWhere<TDelegate>> {
        if (this.isUniqueWhere(where as Record<string, unknown>))
            return where as unknown as DelegateUniqueWhere<TDelegate>

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
            throw new ModelNotFoundException(this.model.name, 'Record not found for update/delete operation.', {
                operation: 'resolveUniqueWhere',
                meta: {
                    where: where as Record<string, unknown>,
                },
            })

        const primaryKey = this.model.getPrimaryKey()

        if (!Object.prototype.hasOwnProperty.call(row, primaryKey))
            throw new UniqueConstraintResolutionException(`Unable to resolve a unique identifier for update/delete operation. Include [${primaryKey}] in the query constraints.`, {
                operation: 'resolveUniqueWhere',
                model: this.model.name,
                meta: {
                    where: where as Record<string, unknown>,
                },
            })

        return { [primaryKey]: row[primaryKey] } as unknown as DelegateUniqueWhere<TDelegate>
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

            const where = this.tryBuildRelationConstraintWhere(aggregate.relation)
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

        const relatedQuery = metadata?.relatedModel.query()

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

    private buildSoftDeleteOnlyWhere (): DelegateWhere<TDelegate> | undefined {
        const softDeleteConfig = this.model.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return undefined

        if (this.includeTrashed)
            return undefined

        const softDeleteClause = this.onlyTrashedRecords
            ? { [softDeleteConfig.column]: { not: null } }
            : { [softDeleteConfig.column]: null }

        return softDeleteClause as DelegateWhere<TDelegate>
    }

    private async applyRelationAggregates (
        models: TModel[],
        relationCache?: RelationResultCache
    ): Promise<void> {
        const cache = relationCache ?? new WeakMap<object, Map<string, Map<unknown, Promise<RelationResult>>>>()
        await Promise.all(models.map(async (model) => {
            for (const aggregate of this.relationAggregates) {
                const results = await this.resolveRelatedResults(model, aggregate.relation, cache)
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
        type: 'count' | 'exists' | 'sum' | 'avg' | 'min' | 'max'
        relation: string
        column?: string
    }): string {
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