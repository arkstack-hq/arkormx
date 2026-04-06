import { ArkormCollection } from '../Collection'
import type { QueryBuilder } from '../QueryBuilder'
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
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        const localValue = this.parent.getAttribute(this.localKey)
        const intermediates = await this.selectRelationRows({
            table: this.throughDelegate,
            where: {
                type: 'comparison',
                column: this.firstKey,
                operator: '=',
                value: localValue as never,
            },
        }) as Record<string, unknown>[]
        const keys = intermediates.map(row => row[this.secondLocalKey])

        return this.applyConstraint(this.related.query().where({ [this.secondKey]: { in: keys } }))
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<ArkormCollection<TRelated>> {
        const query = await this.getQuery()

        return query.get()
    }
}