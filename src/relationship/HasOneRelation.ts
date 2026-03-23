import type { RelatedModelClass } from 'src/types'
import { SingleResultRelation } from './SingleResultRelation'

/**
 * Represents a "has one" relationship between two models.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasOneRelation<TParent, TRelated> extends SingleResultRelation<TParent & { getAttribute: (key: string) => unknown }, TRelated> {
    public constructor(
        parent: TParent & { getAttribute: (key: string) => unknown },
        related: RelatedModelClass<TRelated>,
        private readonly foreignKey: string,
        private readonly localKey: string,
    ) {
        super(parent, related)
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<TRelated | null> {
        const localValue = this.parent.getAttribute(this.localKey)
        const query = this.applyConstraint(this.related.query().where({ [this.foreignKey]: localValue }))

        const result = await query.first()

        return result ?? this.resolveDefaultResult()
    }
}