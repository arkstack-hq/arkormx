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
    PrismaDelegateLike,
    PrismaFindManyArgsLike
} from './types'

import type { ModelStatic } from './types/core'
import { Paginator } from './Paginator'

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

    /**
     * Adds a where clause to the query. Multiple calls to where will combine 
     * the clauses with AND logic.
     * 
     * @param where 
     * @returns 
     */
    public where (where: DelegateWhere<TDelegate>): this {
        if (!this.args.where) {
            this.args.where = where

            return this
        }

        this.args.where = {
            AND: [this.args.where as Record<string, unknown>, where as Record<string, unknown>],
        } as DelegateWhere<TDelegate>

        return this
    }

    /**
     * Adds an orderBy clause to the query. This will overwrite any existing orderBy clause.
     * 
     * @param orderBy 
     * @returns 
     */
    public orderBy (orderBy: DelegateOrderBy<TDelegate>): this {
        this.args.orderBy = orderBy

        return this
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
            throw new Error(`Scope [${name}] is not defined.`)

        const scoped = scope.call(undefined, this, ...args)
        if (scoped && scoped !== this)
            return scoped as this

        return this
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
     * Executes the query and returns the results as an array of model instances.
     * 
     * @returns 
     */
    public async get (): Promise<TModel[]> {
        const rows = await this.delegate.findMany(this.buildFindArgs())
        const models = this.model.hydrateMany(rows as Parameters<ModelStatic<TModel, TDelegate>['hydrateMany']>[0])

        await Promise.all(models.map(async (model: TModel) => {
            const loadable = model as unknown as { load: (relations: EagerLoadMap) => Promise<void> }
            await loadable.load(this.eagerLoads)
        }))

        return models
    }

    /**
     * Executes the query and returns the first result as a model 
     * instance, or null if no results are found.
     * 
     * @returns 
     */
    public async first (): Promise<TModel | null> {
        const row = await this.delegate.findFirst(this.buildFindArgs())
        if (!row)
            return null

        const model = this.model.hydrate(row as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
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
            throw new Error('Record not found.')

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
    public async find (value: string | number, key = 'id'): Promise<TModel | null> {
        return this.where({ [key]: value } as DelegateWhere<TDelegate>).first()
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
     * Updates records matching the current query constraints with the 
     * specified data and returns the updated record(s) as model instance(s).
     * 
     * @param data 
     * @returns 
     */
    public async update (data: DelegateUpdateData<TDelegate>): Promise<TModel> {
        const where = this.buildWhere()
        if (!where)
            throw new Error('Update requires a where clause.')

        const uniqueWhere = await this.resolveUniqueWhere(where)
        const updated = await this.delegate.update({ where: uniqueWhere, data } as Parameters<TDelegate['update']>[0])

        return this.model.hydrate(updated as Parameters<ModelStatic<TModel, TDelegate>['hydrate']>[0])
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
            throw new Error('Delete requires a where clause.')

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
        return this.delegate.count({ where: this.buildWhere() })
    }

    /**
     * Paginates the query results and returns a Paginator instance containing 
     * the data and pagination metadata.
     * 
     * @param page 
     * @param perPage 
     * @returns 
     */
    public async paginate (page = 1, perPage = 15): Promise<Paginator<TModel>> {
        const currentPage = Math.max(1, page)
        const pageSize = Math.max(1, perPage)
        const total = await this.count()
        const items = await this.clone()
            .skip((currentPage - 1) * pageSize)
            .take(pageSize)
            .get()

        return new Paginator(items, total, pageSize, currentPage)
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
        } as DelegateWhere<TDelegate>
    }

    private buildFindArgs (): DelegateFindManyArgs<TDelegate> {
        return {
            ...(this.args as DelegateFindManyArgs<TDelegate>),
            where: this.buildWhere(),
        }
    }

    private async resolveUniqueWhere (where: DelegateWhere<TDelegate>): Promise<DelegateUniqueWhere<TDelegate>> {
        if (this.isUniqueWhere(where as Record<string, unknown>))
            return where as DelegateUniqueWhere<TDelegate>

        const row = await this.delegate.findFirst({ where } as DelegateFindManyArgs<TDelegate>) as DelegateRow<TDelegate> | null
        if (!row)
            throw new Error('Record not found for update/delete operation.')

        const record = row as Record<string, unknown>
        if (!Object.prototype.hasOwnProperty.call(record, 'id'))
            throw new Error('Unable to resolve a unique identifier for update/delete operation. Include an id in the query constraints.')

        return { id: record.id } as DelegateUniqueWhere<TDelegate>
    }

    private isUniqueWhere (where: Record<string, unknown>): boolean {
        return Object.keys(where).length === 1 && Object.prototype.hasOwnProperty.call(where, 'id')
    }
}