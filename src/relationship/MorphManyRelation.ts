import type { MorphManyRelationMetadata, RelationshipModelStatic } from 'src/types'

import type { ArkormCollection } from 'src/Collection'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'

/**
 * Defines a polymorphic one-to-many relationship. 
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MorphManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly morphName: string,
        private readonly localKey: string,
    ) {
        super()
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

    public getMetadata (): MorphManyRelationMetadata {
        return {
            type: 'morphMany',
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
    public async getResults (): Promise<ArkormCollection<TRelated>> {
        const query = await this.getQuery()

        return query.get()
    }
}