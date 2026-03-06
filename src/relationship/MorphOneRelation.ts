import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Defines a polymorphic one-to-one relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MorphOneRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly morphName: string,
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
        const id = this.parent.getAttribute(this.localKey)
        const type = (this.parent as { constructor: { name: string } }).constructor.name
        const query = this.applyConstraint(this.related.query().where({ [`${this.morphName}Id`]: id, [`${this.morphName}Type`]: type }))

        return query.first()
    }
}