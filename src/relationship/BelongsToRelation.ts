import type { RelatedModelClass } from 'src/types'
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
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<TRelated | null> {
        const foreignValue = this.parent.getAttribute(this.foreignKey)
        const query = this.applyConstraint(this.related.query().where({ [this.ownerKey]: foreignValue }))

        const result = await query.first()

        return result ?? this.resolveDefaultResult()
    }
}