import type { BelongsToManyRelationMetadata, RelationshipModelStatic } from 'src/types'

import { ArkormCollection } from '../Collection'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'

/**
 * Defines a many-to-many relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class BelongsToManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly throughDelegate: string,
        private readonly foreignPivotKey: string,
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
        const ids = await this.createRelationTableLoader().selectColumnValues({
            lookup: {
                table: this.throughDelegate,
                where: {
                    type: 'comparison',
                    column: this.foreignPivotKey,
                    operator: '=',
                    value: parentValue as never,
                },
            },
            column: this.relatedPivotKey,
        })

        return this.applyConstraint(this.related.query().where({ [this.relatedKey]: { in: ids } }))
    }

    public getMetadata (): BelongsToManyRelationMetadata {
        return {
            type: 'belongsToMany',
            relatedModel: this.related,
            throughTable: this.throughDelegate,
            foreignPivotKey: this.foreignPivotKey,
            relatedPivotKey: this.relatedPivotKey,
            parentKey: this.parentKey,
            relatedKey: this.relatedKey,
        }
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