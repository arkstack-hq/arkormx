import { ArkormCollection } from '../Collection'
import type { QueryBuilder } from '../QueryBuilder'
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
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        const parentValue = this.parent.getAttribute(this.parentKey)
        const morphType = (this.parent as { constructor: { name: string } }).constructor.name
        const ids = await this.createRelationTableLoader().selectColumnValues({
            lookup: {
                table: this.throughDelegate,
                where: {
                    type: 'group',
                    operator: 'and',
                    conditions: [
                        {
                            type: 'comparison',
                            column: `${this.morphName}Id`,
                            operator: '=',
                            value: parentValue as never,
                        },
                        {
                            type: 'comparison',
                            column: `${this.morphName}Type`,
                            operator: '=',
                            value: morphType,
                        },
                    ],
                },
            },
            column: this.relatedPivotKey,
        })

        return this.applyConstraint(this.related.query().where({ [this.relatedKey]: { in: ids } }))
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