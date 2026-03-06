import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Represents a "has one" relationship between two models.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasOneRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly foreignKey: string,
        private readonly localKey: string,
    ) {
        super()
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<TRelated | null> {
        const localValue = this.parent.getAttribute(this.localKey)
        const query = this.applyConstraint(this.related.query().where({ [this.foreignKey]: localValue }))

        return query.first()
    }
}