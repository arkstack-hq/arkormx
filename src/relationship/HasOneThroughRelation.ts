import type { HasOneThroughRelationMetadata, RelatedModelClass } from 'src/types'

import type { QueryBuilder } from '../QueryBuilder'
import { SingleResultRelation } from './SingleResultRelation'

/**
 * Represents a "has one through" relationship, where the parent model is related 
 * to exactly one instance of the related model through an intermediate model.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasOneThroughRelation<TParent, TRelated> extends SingleResultRelation<TParent & { getAttribute: (key: string) => unknown }, TRelated> {
    public constructor(
        parent: TParent & { getAttribute: (key: string) => unknown },
        related: RelatedModelClass<TRelated>,
        private readonly throughTable: string,
        private readonly firstKey: string,
        private readonly secondKey: string,
        private readonly localKey: string,
        private readonly secondLocalKey: string,
    ) {
        super(parent, related)
    }

    /**
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        const localValue = this.parent.getAttribute(this.localKey)
        const intermediateKey = await this.createRelationTableLoader().selectColumnValue({
            lookup: {
                table: this.throughTable,
                where: {
                    type: 'comparison',
                    column: this.firstKey,
                    operator: '=',
                    value: localValue as never,
                },
            },
            column: this.secondLocalKey,
        })

        if (intermediateKey == null)
            return this.applyConstraint(this.related.query().where({ [this.secondKey]: { in: [] } }))

        return this.applyConstraint(this.related.query().where({ [this.secondKey]: intermediateKey }))
    }

    public getMetadata (): HasOneThroughRelationMetadata {
        return {
            type: 'hasOneThrough',
            relatedModel: this.related,
            throughTable: this.throughTable,
            firstKey: this.firstKey,
            secondKey: this.secondKey,
            localKey: this.localKey,
            secondLocalKey: this.secondLocalKey,
        }
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<TRelated | null> {
        const query = await this.getQuery()

        const result = await query.first()

        return result ?? this.resolveDefaultResult()
    }
}