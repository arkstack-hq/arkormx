import type { DatabaseAdapter, ModelAttributes, PaginationOptions, RelationMetadata } from '../types'
import type { LengthAwarePaginator, Paginator } from '../Paginator'

import { ArkormCollection } from '../Collection'
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

    protected getRelationAdapter (): DatabaseAdapter {
        const model = this.getRelatedModel()
        const adapter = model.getAdapter()

        if (!adapter) {
            throw new UnsupportedAdapterFeatureException('Relationship resolution requires a configured adapter.', {
                operation: 'relation.adapter',
            })
        }

        return adapter
    }

    protected getRelatedModel (): { getAdapter: () => DatabaseAdapter | undefined, query: () => QueryBuilder<TModel> } {
        return (this as unknown as {
            related: { getAdapter: () => DatabaseAdapter | undefined, query: () => QueryBuilder<TModel> }
        }).related
    }

    protected getRelatedModelConstructor (): {
        hydrate: (attributes: Record<string, unknown>) => TModel
        query: () => QueryBuilder<TModel>
        getPrimaryKey: () => string
    } {
        return (this as unknown as {
            related: {
                hydrate: (attributes: Record<string, unknown>) => TModel
                query: () => QueryBuilder<TModel>
                getPrimaryKey: () => string
            }
        }).related
    }

    protected createRelationTableLoader (): RelationTableLoader {
        return new RelationTableLoader(this.getRelationAdapter())
    }

    protected getCreationAttributes (): Record<string, unknown> {
        return {}
    }

    protected mergeCreationAttributes (attributes: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            ...attributes,
            ...this.getCreationAttributes(),
        }
    }

    protected applyCreationAttributesToModel (model: TModel): TModel {
        const attributes = this.getCreationAttributes()
        const fillable = model as TModel & {
            fill?: (attributes: Record<string, unknown>) => TModel
            setAttribute?: (key: string, value: unknown) => TModel
        }

        if (Object.keys(attributes).length === 0)
            return model

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
    public constrain (constraint: RelationConstraint<TModel>): this {
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
    public where (where: Parameters<QueryBuilder<TModel>['where']>[0]): this {
        return this.constrain(query => query.where(where))
    }

    /**
     * Add a strongly-typed where key clause to the relationship query.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereKey<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: ModelAttributes<TModel>[TKey]
    ): this {
        return this.constrain(query => query.whereKey(key, value))
    }

    /**
     * Add a strongly-typed where in clause to the relationship query.
     *
     * @param key
     * @param values
     * @returns
     */
    public whereIn<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        values: ModelAttributes<TModel>[TKey][]
    ): this {
        return this.constrain(query => query.whereIn(key, values))
    }

    /**
     * Add a string contains clause to the relationship query.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereLike<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.constrain(query => query.whereLike(key, value))
    }

    /**
     * Add a string starts-with clause to the relationship query.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereStartsWith<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.constrain(query => query.whereStartsWith(key, value))
    }

    /**
     * Add a string ends-with clause to the relationship query.
     *
     * @param key
     * @param value
     * @returns
     */
    public whereEndsWith<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: Extract<ModelAttributes<TModel>[TKey], string>
    ): this {
        return this.constrain(query => query.whereEndsWith(key, value))
    }

    /**
     * Add an order by clause to the relationship query.
     *
     * @param orderBy
     * @returns
     */
    public orderBy (orderBy: Parameters<QueryBuilder<TModel>['orderBy']>[0]): this {
        return this.constrain(query => query.orderBy(orderBy))
    }

    /**
     * Add an include clause to the relationship query.
     *
     * @param include
     * @returns
     */
    public include (include: Parameters<QueryBuilder<TModel>['include']>[0]): this {
        return this.constrain(query => query.include(include))
    }

    /**
     * Add eager loading relations to the relationship query.
     *
     * @param relations
     * @returns
     */
    public with (relations: Parameters<QueryBuilder<TModel>['with']>[0]): this {
        return this.constrain(query => query.with(relations))
    }

    /**
     * Add a select clause to the relationship query.
     *
     * @param select
     * @returns
     */
    public select (select: Parameters<QueryBuilder<TModel>['select']>[0]): this {
        return this.constrain(query => query.select(select))
    }

    /**
     * Add a skip clause to the relationship query.
     *
     * @param skip
     * @returns
     */
    public skip (skip: number): this {
        return this.constrain(query => query.skip(skip))
    }

    /**
     * Add a take clause to the relationship query.
     *
     * @param take
     * @returns
     */
    public take (take: number): this {
        return this.constrain(query => query.take(take))
    }

    /**
     * Include soft-deleted records in the relationship query.
     *
     * @returns
     */
    public withTrashed (): this {
        return this.constrain(query => query.withTrashed())
    }

    /**
     * Limit relationship query to only soft-deleted records.
     *
     * @returns
     */
    public onlyTrashed (): this {
        return this.constrain(query => query.onlyTrashed())
    }

    /**
     * Exclude soft-deleted records from the relationship query.
     *
     * @returns
     */
    public withoutTrashed (): this {
        return this.constrain(query => query.withoutTrashed())
    }

    /**
     * Apply a scope to the relationship query.
     *
     * @param name
     * @param args
     * @returns
     */
    public scope (name: string, ...args: unknown[]): this {
        return this.constrain(query => query.scope(name, ...args))
    }

    /**
     * Apply the defined constraint to the given query, if any.
     * 
     * @param query The query builder instance to apply the constraint to.
     * 
     * @returns The query builder instance with the constraint applied, if any.
     */
    protected applyConstraint (query: QueryBuilder<TModel>): QueryBuilder<TModel> {
        if (!this.constraint)
            return query

        const constrained = this.constraint(query)

        return constrained ?? query
    }

    public abstract getMetadata (): RelationMetadata

    /**
     * Build the underlying query for the relationship.
     *
     * @returns
     */
    public abstract getQuery (): Promise<QueryBuilder<TModel>>

    /**
     * Execute the relationship query and return relation results.
     *
     * @returns
     */
    public async get (): Promise<TModel | ArkormCollection<TModel> | null> {
        return this.getResults()
    }

    /**
     * Execute the relationship query and return the first related model.
     *
     * @returns
     */
    public async first (): Promise<TModel | null> {
        const results = await this.getResults()

        if (results instanceof ArkormCollection)
            return (results.all()[0] ?? null) as TModel | null

        return results
    }

    /**
     * Execute the relationship query and return the first related model or throw an error if not found.
     * 
     * @returns 
     */
    public async firstOrFail (): Promise<TModel> {
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
    public async firstOr<TResult> (callback: () => TResult | Promise<TResult>): Promise<TModel | TResult> {
        const result = await this.first()
        if (result)
            return result

        return callback()
    }

    /**
     * Execute the relationship query with an additional where clause and return the first 
     * related model or null if not found.
     * 
     * @param key 
     * @param value 
     */
    public async firstWhere<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        value: ModelAttributes<TModel>[TKey]
    ): Promise<TModel | null>
    public async firstWhere<TKey extends keyof ModelAttributes<TModel> & string> (
        key: TKey,
        operator: '=' | '!=' | '>' | '>=' | '<' | '<=',
        value: ModelAttributes<TModel>[TKey]
    ): Promise<TModel | null>
    public async firstWhere (key: string, operatorOrValue: unknown, maybeValue?: unknown): Promise<TModel | null> {
        const query = await this.getQuery()

        return maybeValue === undefined
            ? query.firstWhere(key, operatorOrValue as never)
            : query.firstWhere(key, operatorOrValue as never, maybeValue as never)
    }

    /**
     * Count records that match the relationship query.
     *
     * @returns
     */
    public async count (): Promise<number> {
        const query = await this.getQuery()

        return query.count()
    }

    /**
     * Determine whether the relationship query has any matching records.
     *
     * @returns
     */
    public async exists (): Promise<boolean> {
        const query = await this.getQuery()

        return query.exists()
    }

    /**
     * Determine whether the relationship query has no matching records.
     *
     * @returns
     */
    public async doesntExist (): Promise<boolean> {
        return !(await this.exists())
    }

    /**
     * Create a new instance of the related model with the given attributes and 
     * relationship creation attributes applied, but do not save it.
     * 
     * @param attributes 
     * @returns 
     */
    public make (attributes: Record<string, unknown> = {}): TModel {
        return this.getRelatedModelConstructor().hydrate(this.mergeCreationAttributes(attributes))
    }

    /**
     * Create new instances of the related model with the given attributes and relationship 
     * creation attributes applied, but do not save them.
     * 
     * @param attributes 
     * @returns 
     */
    public makeMany (attributes: Record<string, unknown>[] = []): TModel[] {
        return attributes.map(item => this.make(item))
    }

    /**
     * Create a new instance of the related model with the given attributes and relationship 
     * creation attributes applied, and save it to the database.
     * 
     * @param attributes 
     * @returns 
     */
    public async create (attributes: Record<string, unknown> = {}): Promise<TModel> {
        return await this.getRelatedModelConstructor().query().create(this.mergeCreationAttributes(attributes) as never)
    }

    /**
     * Create new instances of the related model with the given attributes and relationship 
     * creation attributes applied, and save them to the database.
     * 
     * @param values 
     * @returns 
     */
    public async createMany (values: Record<string, unknown>[] = []): Promise<TModel[]> {
        if (values.length === 0)
            return []

        return await Promise.all(values.map(async value => await this.create(value)))
    }

    /**
     * Save the given model instance by applying relationship creation attributes and calling save() on it.
     * 
     * @param model 
     * @returns 
     */
    public async save (model: TModel): Promise<TModel> {
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
            if (!this.shouldCreateAfterSaveMiss(error))
                throw error

            const attributes = typeof saveable.getRawAttributes === 'function'
                ? saveable.getRawAttributes()
                : {}

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
    public async saveQuietly (model: TModel): Promise<TModel> {
        const saveable = this.applyCreationAttributesToModel(model) as TModel & {
            getRawAttributes?: () => Record<string, unknown>
            save?: () => Promise<TModel>
            saveQuietly?: () => Promise<TModel>
        }

        if (typeof saveable.saveQuietly === 'function') {
            try {
                return await saveable.saveQuietly()
            } catch (error) {
                if (!this.shouldCreateAfterSaveMiss(error))
                    throw error

                const attributes = typeof saveable.getRawAttributes === 'function'
                    ? saveable.getRawAttributes()
                    : {}

                return await this.create(attributes)
            }
        }

        if (typeof saveable.save === 'function')
            return await saveable.save()

        throw new UnsupportedAdapterFeatureException('Related model does not support saveQuietly().', {
            operation: 'relation.saveQuietly',
        })
    }

    private shouldCreateAfterSaveMiss (error: unknown): boolean {
        return error instanceof Error
            && (error.name === 'ModelNotFoundException' || error.message.includes('Record not found'))
    }

    /**
     * Create new instances of the related model with the given attributes and 
     * relationship * creation attributes applied, and save them to the database.
     * 
     * @param models 
     * @returns 
     */
    public async saveMany (models: TModel[] = []): Promise<TModel[]> {
        return await Promise.all(models.map(async model => await this.save(model)))
    }

    /**
     * Create new instances of the related model with the given attributes and relationship 
     * creation attributes applied, and save them to the database.
     * 
     * @param models 
     * @returns 
     */
    public async saveManyQuietly (models: TModel[] = []): Promise<TModel[]> {
        return await Promise.all(models.map(async model => await this.saveQuietly(model)))
    }

    /**
     * Find a related model by a specific key and value, applying relationship constraints.
     * 
     * @param value 
     * @param key 
     */
    public async find<TKey extends keyof ModelAttributes<TModel> & string> (
        value: ModelAttributes<TModel>[TKey],
        key: TKey
    ): Promise<TModel | null>
    public async find (value: string | number, key?: string): Promise<TModel | null>
    public async find (value: unknown, key?: string): Promise<TModel | null> {
        const query = await this.getQuery()

        return query.find(value as never, key as never)
    }

    /**
     * Find related models by a specific key and array of values, applying relationship constraints.
     * 
     * @param values 
     * @param key 
     */
    public async findMany<TKey extends keyof ModelAttributes<TModel> & string> (
        values: ModelAttributes<TModel>[TKey][],
        key: TKey
    ): Promise<ArkormCollection<TModel>>
    public async findMany (values: Array<string | number>, key?: string): Promise<ArkormCollection<TModel>>
    public async findMany (values: unknown[], key?: string): Promise<ArkormCollection<TModel>> {
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
    public async findOrFail<TKey extends keyof ModelAttributes<TModel> & string> (
        value: ModelAttributes<TModel>[TKey],
        key: TKey
    ): Promise<TModel>
    public async findOrFail (value: string | number, key?: string): Promise<TModel>
    public async findOrFail (value: unknown, key?: string): Promise<TModel> {
        const found = await this.find(value as never, key as never)
        if (found)
            return found

        const query = await this.getQuery()

        return query.where({ [key ?? this.getRelatedModelConstructor().getPrimaryKey()]: value } as never).firstOrFail()
    }

    /**
     * Find the first related model by a specific key and value, or create a new instance if not found.
     * 
     * @param attributes 
     * @param values 
     * @returns 
     */
    public async firstOrNew (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> = {}
    ): Promise<TModel> {
        const query = await this.getQuery()
        const found = await query.clone().where(attributes as never).first()
        if (found)
            return found

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
    public async firstOrCreate (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> = {}
    ): Promise<TModel> {
        const query = await this.getQuery()
        const found = await query.clone().where(attributes as never).first()
        if (found)
            return found

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
    public async updateOrCreate (
        attributes: Record<string, unknown>,
        values: Record<string, unknown> = {}
    ): Promise<TModel> {
        const query = await this.getQuery()
        const found = await query.clone().where(attributes as never).first()
        if (!found)
            return await this.create({ ...attributes, ...values })

        const updatable = found as TModel & {
            fill?: (attributes: Record<string, unknown>) => TModel
            save?: () => Promise<TModel>
        }

        if (typeof updatable.fill === 'function' && typeof updatable.save === 'function')
            return await (updatable.fill(values) as any).save()

        return await query.clone().where(attributes as never).update(values as never)
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
    public async upsert (
        values: Array<Record<string, unknown>>,
        uniqueBy: string | string[],
        update: string[] | null = null
    ): Promise<number> {
        const query = await this.getQuery()

        return await query.upsert(values.map(value => this.mergeCreationAttributes(value)), uniqueBy, update)
    }

    /**
     * Paginate the relationship query results.
     * 
     * @param perPage 
     * @param page 
     * @param options 
     * @returns 
     */
    public async paginate (
        perPage = 15,
        page?: number,
        options: PaginationOptions = {}
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
    public async simplePaginate (
        perPage = 15,
        page?: number,
        options: PaginationOptions = {}
    ): Promise<Paginator<TModel>> {
        const query = await this.getQuery()

        return query.simplePaginate(perPage, page, options)
    }

    /**
     * Get the results of the relationship query.
     * 
     * @returns A promise that resolves to the related model(s) or null if not found.
     */
    public abstract getResults (): Promise<TModel | ArkormCollection<TModel> | null>
}
