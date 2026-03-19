import type {
    DelegateCreateData,
    DelegateFindManyArgs,
    DelegateInclude,
    DelegateOrderBy,
    DelegateRow,
    DelegateSelect,
    DelegateUniqueWhere,
    DelegateUpdateData,
    DelegateWhere,
    EagerLoadConstraint,
    EagerLoadMap,
    ModelAttributes,
    ModelStatic,
    PaginationOptions,
    PrismaDelegateLike,
    PrismaFindManyArgsLike
} from './types'
import { LengthAwarePaginator, Paginator } from './Paginator'

import { ArkormCollection } from './Collection'
import { ArkormException } from './Exceptions/ArkormException'
import { ModelNotFoundException } from './Exceptions/ModelNotFoundException'
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
    private readonly args: PrismaFindManyArgsLike = {}
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
     * @param delegate 
     * @param model 
     */
    public constructor(
        private readonly delegate: TDelegate,
        private readonly model: ModelStatic<TModel, TDelegate>,
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
        if (!this.args.where) {
            this.args.where = where

            return this
        }

        this.args.where = {
            [operator]: [this.args.where as Record<string, unknown>, where as Record<string, unknown>],
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
        this.args.orderBy = orderBy

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
        this.args.orderBy = undefined
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
        this.args.include = include

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
        const names = Object.keys(relationMap)
        this.args.include = {
            ...((this.args.include as Record<string, unknown>) || {}),
            ...names.reduce<Record<string, boolean>>((accumulator, name) => {
                accumulator[name] = true

                return accumulator
            }, {}),
        } as DelegateInclude<TDelegate>

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
            throw new ArkormException(`Scope [${name}] is not defined.`)

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
        this.args.select = select

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
        this.args.skip = skip

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
        this.args.take = take

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
        const relationCache: RelationResultCache = new WeakMap()
        const rows = await this.delegate.findMany(this.buildFindArgs())
        const normalizedRows = this.randomOrderEnabled
            ? this.shuffleRows(rows as unknown[])
            : rows
        const models = await this.model.hydrateManyRetrieved(normalizedRows as Parameters<ModelStatic<TModel, TDelegate>['hydrateManyRetrieved']>[0])

        let filteredModels = models
        if (this.hasRelationFilters()) {
            if (this.hasOrRelationFilters() && this.args.where) {
                const baseIds = new Set(models
                    .map(model => this.getModelId(model))
                    .filter((id): id is string | number => id != null)
                )

                const allRows = await this.delegate.findMany({
                    ...(this.args as DelegateFindManyArgs<TDelegate>),
                    where: this.buildSoftDeleteOnlyWhere(),
                } as DelegateFindManyArgs<TDelegate>)
                const allModels = this.model.hydrateMany(allRows as Parameters<ModelStatic<TModel, TDelegate>['hydrateMany']>[0])

                filteredModels = await this.filterModelsByRelationConstraints(allModels, relationCache, baseIds)
            } else {
                filteredModels = await this.filterModelsByRelationConstraints(models, relationCache)
            }
        }

        if (this.hasRelationAggregates())
            await this.applyRelationAggregates(filteredModels, relationCache)

        await Promise.all(filteredModels.map(async (model: TModel) => {
            const loadable = model as unknown as { load: (relations: EagerLoadMap) => Promise<void> }
            await loadable.load(this.eagerLoads)
        }))

        return new ArkormCollection(filteredModels)
    }

    /**
     * Executes the query and returns the first result as a model 
     * instance, or null if no results are found.
     * 
     * @returns 
     */
    public async first (): Promise<TModel | null> {
        if (this.hasRelationFilters() || this.hasRelationAggregates()) {
            const models = await this.get()

            return models.all()[0] ?? null
        }

        if (this.randomOrderEnabled) {
            const rows = await this.delegate.findMany(this.buildFindArgs())
            if (rows.length === 0)
                return null

            const shuffledRows = this.shuffleRows(rows as unknown[])
            const row = shuffledRows[0]
            if (!row)
                return null

            const model = await this.model.hydrateRetrieved(row as Parameters<ModelStatic<TModel, TDelegate>['hydrateRetrieved']>[0])
            const loadable = model as unknown as { load: (relations: EagerLoadMap) => Promise<void> }
            await loadable.load(this.eagerLoads)

            return model
        }

        const row = await this.delegate.findFirst(this.buildFindArgs())
        if (!row)
            return null

        const model = await this.model.hydrateRetrieved(row as Parameters<ModelStatic<TModel, TDelegate>['hydrateRetrieved']>[0])
        const loadable = model as unknown as { load: (relations: EagerLoadMap) => Promise<void> }
        await loadable.load(this.eagerLoads)

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
    public async find (value: unknown, key = 'id'): Promise<TModel | null> {
        return this.where({ [key]: value } as DelegateWhere<TDelegate>).first()
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
        const key = typeof keyOrCallback === 'string' ? keyOrCallback : 'id'
        const callback = typeof keyOrCallback === 'function' ? keyOrCallback : maybeCallback
        if (!callback)
            throw new ArkormException('findOr requires a fallback callback.')

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
        const row = await this.delegate.findFirst(this.buildFindArgs()) as Record<string, unknown> | null
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
        const rows = await this.delegate.findMany(this.buildFindArgs()) as Record<string, unknown>[]

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
        const created = await this.delegate.create({ data } as Parameters<TDelegate['create']>[0])

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

        const delegate = this.delegate as unknown as {
            createMany?: (args: { data: DelegateCreateData<TDelegate>[] }) => Promise<unknown>
        }

        if (typeof delegate.createMany === 'function') {
            await delegate.createMany({ data: payloads })

            return true
        }

        await Promise.all(payloads.map(async payload => {
            await this.delegate.create({ data: payload } as Parameters<TDelegate['create']>[0])
        }))

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

        const delegate = this.delegate as unknown as {
            createMany?: (args: { data: DelegateCreateData<TDelegate>[], skipDuplicates?: boolean }) => Promise<unknown>
        }

        if (typeof delegate.createMany === 'function') {
            const result = await delegate.createMany({
                data: payloads,
                skipDuplicates: true,
            })

            return this.resolveAffectedCount(result, payloads.length)
        }

        let inserted = 0
        for (const payload of payloads) {
            try {
                await this.delegate.create({ data: payload } as Parameters<TDelegate['create']>[0])
                inserted += 1
            } catch {
                continue
            }
        }

        return inserted
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
        const created = await this.delegate.create({ data: values } as Parameters<TDelegate['create']>[0]) as Record<string, unknown>
        const key = sequence ?? 'id'
        if (!(key in created))
            throw new ArkormException(`Inserted record does not contain key [${key}].`)

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
            throw new ArkormException('Update requires a where clause.')

        const uniqueWhere = await this.resolveUniqueWhere(where)
        const updated = await this.delegate.update({ where: uniqueWhere, data } as Parameters<TDelegate['update']>[0])

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
            throw new ArkormException('Update requires a where clause.')

        const delegate = this.delegate as unknown as {
            updateMany?: (args: { where: DelegateWhere<TDelegate>, data: DelegateUpdateData<TDelegate> }) => Promise<unknown>
        }

        if (typeof delegate.updateMany === 'function') {
            const result = await delegate.updateMany({ where, data })

            return this.resolveAffectedCount(result, 0)
        }

        await this.update(data)

        return 1
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
        const existing = await this.delegate.findFirst({ where: attributes } as Parameters<TDelegate['findFirst']>[0])
        const exists = existing != null
        const resolvedValues = typeof values === 'function'
            ? await values(exists)
            : values

        if (!exists) {
            await this.delegate.create({
                data: {
                    ...attributes,
                    ...resolvedValues,
                },
            } as Parameters<TDelegate['create']>[0])

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
            throw new ArkormException('Delete requires a where clause.')

        const uniqueWhere = await this.resolveUniqueWhere(where)
        const deleted = await this.delegate.delete({ where: uniqueWhere } as Parameters<TDelegate['delete']>[0])

        return this.model.hydrate(deleted as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
    }

    /**
     * Counts the number of records matching the current query constraints.
     * 
     * @returns 
     */
    public async count (): Promise<number> {
        if (this.hasRelationFilters())
            return (await this.get()).all().length

        return this.delegate.count({ where: this.buildWhere() })
    }

    /**
     * Determines if any records exist for the current query constraints.
     *
     * @returns
     */
    public async exists (): Promise<boolean> {
        if (this.hasRelationFilters())
            return (await this.count()) > 0

        const row = await this.delegate.findFirst(this.buildFindArgs())

        return row != null
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

        throw new ArkormException('insertUsing expects a query builder, array of records, or async resolver.')
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
        const rows = await this.delegate.findMany(this.buildFindArgs()) as Record<string, unknown>[]
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
        const rows = await this.delegate.findMany(this.buildFindArgs()) as Record<string, unknown>[]
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
        const rows = await this.delegate.findMany(this.buildFindArgs()) as Record<string, unknown>[]

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
        const rows = await this.delegate.findMany(this.buildFindArgs()) as Record<string, unknown>[]
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
        const delegate = this.delegate as unknown as {
            applyRawWhere?: (where: DelegateWhere<TDelegate> | undefined, sql: string, bindings: unknown[]) => DelegateWhere<TDelegate>
        }

        if (typeof delegate.applyRawWhere !== 'function')
            throw new ArkormException('Raw where clauses are not supported by the current adapter.')

        this.args.where = delegate.applyRawWhere(this.buildWhere(), sql, bindings)

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
        const delegate = this.delegate as unknown as {
            applyRawWhere?: (where: DelegateWhere<TDelegate> | undefined, sql: string, bindings: unknown[]) => DelegateWhere<TDelegate>
        }

        if (typeof delegate.applyRawWhere !== 'function')
            throw new ArkormException('Raw where clauses are not supported by the current adapter.')

        const rawWhere = delegate.applyRawWhere(undefined, sql, bindings)

        return this.orWhere(rawWhere)
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

        if (this.hasRelationFilters() || this.hasRelationAggregates()) {
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

        if (this.hasRelationFilters() || this.hasRelationAggregates()) {
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
        const builder = new QueryBuilder<TModel, TDelegate>(this.delegate, this.model)
        builder.args.where = this.args.where
        builder.args.include = this.args.include
        builder.args.orderBy = this.args.orderBy
        builder.args.select = this.args.select
        builder.args.skip = this.args.skip
        builder.args.take = this.args.take
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

    /**
     * Builds the where clause for the query, taking into account soft delete 
     * settings if applicable.
     * 
     * @returns 
     */
    private buildWhere (): DelegateWhere<TDelegate> | undefined {
        const softDeleteConfig = this.model.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return this.args.where as DelegateWhere<TDelegate> | undefined

        if (this.includeTrashed)
            return this.args.where as DelegateWhere<TDelegate> | undefined

        const softDeleteClause = this.onlyTrashedRecords
            ? { [softDeleteConfig.column]: { not: null } }
            : { [softDeleteConfig.column]: null }

        if (!this.args.where)
            return softDeleteClause as DelegateWhere<TDelegate>

        return {
            AND: [this.args.where as Record<string, unknown>, softDeleteClause],
        } as unknown as DelegateWhere<TDelegate>
    }

    /**
     * Builds the arguments for the findMany delegate method, including the where clause.
     * 
     * @returns 
     */
    private buildFindArgs (): DelegateFindManyArgs<TDelegate> {
        return {
            ...(this.args as DelegateFindManyArgs<TDelegate>),
            where: this.buildWhere(),
        }
    }

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

        const row = await this.delegate.findFirst({ where } as DelegateFindManyArgs<TDelegate>) as DelegateRow<TDelegate> | null
        if (!row)
            throw new ArkormException('Record not found for update/delete operation.')

        const record = row as Record<string, unknown>
        if (!Object.prototype.hasOwnProperty.call(record, 'id'))
            throw new ArkormException('Unable to resolve a unique identifier for update/delete operation. Include an id in the query constraints.')

        return { id: record.id } as unknown as DelegateUniqueWhere<TDelegate>
    }

    /**
     * Checks if the provided where clause is already a unique 
     * identifier (i.e., contains only an 'id' field).
     * 
     * @param where 
     * @returns 
     */
    private isUniqueWhere (where: Record<string, unknown>): boolean {
        return Object.keys(where).length === 1 && Object.prototype.hasOwnProperty.call(where, 'id')
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

        const id = readable.getAttribute('id')
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
                throw new ArkormException(`Relation [${relation}] is not defined on the model.`)

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

            throw new ArkormException(`Relation [${relation}] does not support result resolution.`)
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