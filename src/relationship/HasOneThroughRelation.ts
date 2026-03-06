import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Represents a "has one through" relationship, where the parent model is related 
 * to exactly one instance of the related model through an intermediate model.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasOneThroughRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly throughDelegate: string,
        private readonly firstKey: string,
        private readonly secondKey: string,
        private readonly localKey: string,
        private readonly secondLocalKey: string,
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
        const intermediate = await this.related.getDelegate(this.throughDelegate).findFirst({ where: { [this.firstKey]: localValue } }) as Record<string, unknown> | null
        if (!intermediate)
            return null

        const query = this.applyConstraint(this.related.query().where({ [this.secondKey]: intermediate[this.secondLocalKey] }))

        return query.first()
    }
}