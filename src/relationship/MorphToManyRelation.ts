import { ArkormCollection } from '../Collection'
import { Relation } from './Relation'
import type { RelationshipModelStatic } from 'src/types'

/**
 * Defines a polymorphic many-to-many relationship.  
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MorphToManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly throughDelegate: string,
        private readonly morphName: string,
        private readonly relatedPivotKey: string,
        private readonly parentKey: string,
        private readonly relatedKey: string,
    ) {
        super()
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<ArkormCollection<TRelated>> {
        const parentValue = this.parent.getAttribute(this.parentKey)
        const morphType = (this.parent as { constructor: { name: string } }).constructor.name
        const pivots = await this.related.getDelegate(this.throughDelegate).findMany({
            where: {
                [`${this.morphName}Id`]: parentValue,
                [`${this.morphName}Type`]: morphType,
            },
        }) as Record<string, unknown>[]
        const ids = pivots.map(row => row[this.relatedPivotKey])
        if (ids.length === 0)
            return new ArkormCollection([])

        const query = this.applyConstraint(this.related.query().where({ [this.relatedKey]: { in: ids } }))

        return query.get()
    }
}