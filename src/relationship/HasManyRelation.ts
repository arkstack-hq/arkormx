import type { ArkormCollection } from 'src/Collection'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Defines a one-to-many relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly foreignKey: string,
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
        const localValue = this.parent.getAttribute(this.localKey)

        return this.applyConstraint(this.related.query().where({ [this.foreignKey]: localValue }))
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