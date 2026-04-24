import type { BelongsToRelationMetadata, RelatedModelClass } from 'src/types'

import type { QueryBuilder } from '../QueryBuilder'
import { SingleResultRelation } from './SingleResultRelation'

/**
 * Defines an inverse one-to-one or many relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class BelongsToRelation<TParent, TRelated> extends SingleResultRelation<TParent & { getAttribute: (key: string) => unknown }, TRelated> {
    public constructor(
        parent: TParent & { getAttribute: (key: string) => unknown },
        related: RelatedModelClass<TRelated>,
        private readonly foreignKey: string,
        private readonly ownerKey: string,
    ) {
        super(parent, related)
    }

    /**
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        const foreignValue = this.parent.getAttribute(this.foreignKey)

        return this.applyConstraint(this.related.query().where({ [this.ownerKey]: foreignValue }))
    }

    public getMetadata (): BelongsToRelationMetadata {
        return {
            type: 'belongsTo',
            relatedModel: this.related,
            foreignKey: this.foreignKey,
            ownerKey: this.ownerKey,
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