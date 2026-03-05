import { QueryBuilder } from 'src/QueryBuilder'

export type RelationConstraint<TModel> = (query: QueryBuilder<TModel>) => QueryBuilder<TModel> | void

/**
 * Base class for all relationship types. Not meant to be used directly.
 * 
 * @author Legacy (3m1n3nc3)
 */
export abstract class Relation<TModel> {
    protected constraint: RelationConstraint<TModel> | null = null

    /**
     * Apply a constraint to the relationship query.
     * 
     * @param constraint The constraint function to apply to the query.
     * @returns The current relation instance.
     */
    public constrain (constraint: RelationConstraint<TModel>): this {
        this.constraint = constraint

        return this
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
     * Get the results of the relationship query.
     * 
     * @returns A promise that resolves to the related model(s) or null if not found.
     */
    public abstract getResults (): Promise<TModel | TModel[] | null>
}
