import type { MorphOneRelationMetadata, RelatedModelClass } from 'src/types'

import type { QueryBuilder } from '../QueryBuilder'
import { SingleResultRelation } from './SingleResultRelation'

/**
 * Defines a polymorphic one-to-one relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MorphOneRelation<TParent, TRelated> extends SingleResultRelation<TParent & { getAttribute: (key: string) => unknown }, TRelated> {
    public constructor(
        parent: TParent & { getAttribute: (key: string) => unknown },
        related: RelatedModelClass<TRelated>,
        private readonly morphName: string,
        private readonly localKey: string,
    ) {
        super(parent, related)
    }

    /**
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        const id = this.parent.getAttribute(this.localKey)
        const type = (this.parent as { constructor: { name: string } }).constructor.name

        return this.applyConstraint(this.related.query().where({ [`${this.morphName}Id`]: id, [`${this.morphName}Type`]: type }))
    }

    public getMetadata (): MorphOneRelationMetadata {
        return {
            type: 'morphOne',
            relatedModel: this.related,
            morphName: this.morphName,
            morphIdColumn: `${this.morphName}Id`,
            morphTypeColumn: `${this.morphName}Type`,
            localKey: this.localKey,
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