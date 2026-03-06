import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Defines an inverse one-to-one or many relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class BelongsToRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly foreignKey: string,
        private readonly ownerKey: string,
    ) {
        super()
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<TRelated | null> {
        const foreignValue = this.parent.getAttribute(this.foreignKey)
        const query = this.applyConstraint(this.related.query().where({ [this.ownerKey]: foreignValue }))

        return query.first()
    }
}