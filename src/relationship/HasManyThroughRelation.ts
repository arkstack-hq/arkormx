import type { ArkormCollection } from 'src/Collection'
import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Defines a has-many-through relationship, which provides a convenient way to access 
 * distant relations via an intermediate relation. 
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class HasManyThroughRelation<TParent, TRelated> extends Relation<TRelated> {
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
    public async getResults (): Promise<ArkormCollection<TRelated>> {
        const localValue = this.parent.getAttribute(this.localKey)
        const intermediates = await this.related.getDelegate(this.throughDelegate).findMany({ where: { [this.firstKey]: localValue } }) as Record<string, unknown>[]
        const keys = intermediates.map(row => row[this.secondLocalKey])
        const query = this.applyConstraint(this.related.query().where({ [this.secondKey]: { in: keys } }))

        return query.get()
    }
}