import type { RelatedModelClass } from 'src/types'
import { SingleResultRelation } from './SingleResultRelation'

/**
 * Represents a "has one through" relationship, where the parent model is related 
 * to exactly one instance of the related model through an intermediate model.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasOneThroughRelation<TParent, TRelated> extends SingleResultRelation<TParent & { getAttribute: (key: string) => unknown }, TRelated> {
    public constructor(
        parent: TParent & { getAttribute: (key: string) => unknown },
        related: RelatedModelClass<TRelated>,
        private readonly throughDelegate: string,
        private readonly firstKey: string,
        private readonly secondKey: string,
        private readonly localKey: string,
        private readonly secondLocalKey: string,
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
        const intermediate = await this.related.getDelegate(this.throughDelegate).findFirst({ where: { [this.firstKey]: localValue } }) as Record<string, unknown> | null
        if (!intermediate)
            return this.resolveDefaultResult()

        const query = this.applyConstraint(this.related.query().where({ [this.secondKey]: intermediate[this.secondLocalKey] }))

        const result = await query.first()

        return result ?? this.resolveDefaultResult()
    }
}