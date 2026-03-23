import type { RelatedModelClass } from 'src/types'
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
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<TRelated | null> {
        const id = this.parent.getAttribute(this.localKey)
        const type = (this.parent as { constructor: { name: string } }).constructor.name
        const query = this.applyConstraint(this.related.query().where({ [`${this.morphName}Id`]: id, [`${this.morphName}Type`]: type }))

        const result = await query.first()

        return result ?? this.resolveDefaultResult()
    }
}