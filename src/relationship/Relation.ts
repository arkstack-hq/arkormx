import type { DatabaseAdapter, ModelAttributes } from '../types'

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

    protected createRelationTableLoader (): RelationTableLoader {
        return new RelationTableLoader(this.getRelationAdapter())
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
     * Get the results of the relationship query.
     * 
     * @returns A promise that resolves to the related model(s) or null if not found.
     */
    public abstract getResults (): Promise<TModel | ArkormCollection<TModel> | null>
}
