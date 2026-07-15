import type { MorphedByManyRelationMetadata, RelationshipModelStatic } from 'src/types'

import { ArkormCollection } from '../Collection'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'

/**
 * Defines the inverse side of a polymorphic many-to-many relationship.
 *
 * @author Legacy (3m1n3nc3)
 * @since 2.12.0
 */
export class MorphedByManyRelation<TParent, TRelated> extends Relation<TRelated> {
  public constructor(
    private readonly parent: TParent & { getAttribute: (key: string) => unknown },
    private readonly related: RelationshipModelStatic,
    private readonly throughTable: string,
    private readonly morphName: string,
    private readonly foreignPivotKey: string,
    private readonly morphTypeColumn: string,
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
  public async getQuery(): Promise<QueryBuilder<TRelated>> {
    const parentValue = this.parent.getAttribute(this.parentKey)
    const morphType = this.related.name
    const ids = await this.createRelationTableLoader().selectColumnValues({
      lookup: {
        table: this.throughTable,
        where: {
          type: 'group',
          operator: 'and',
          conditions: [
            {
              type: 'comparison',
              column: this.foreignPivotKey,
              operator: '=',
              value: parentValue as never,
            },
            {
              type: 'comparison',
              column: this.morphTypeColumn,
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

  public getMetadata(): MorphedByManyRelationMetadata {
    return {
      type: 'morphedByMany',
      relatedModel: this.related,
      throughTable: this.throughTable,
      morphName: this.morphName,
      foreignPivotKey: this.foreignPivotKey,
      morphTypeColumn: this.morphTypeColumn,
      relatedPivotKey: this.relatedPivotKey,
      parentKey: this.parentKey,
      relatedKey: this.relatedKey,
    }
  }

  /**
   * Fetch the related models.
   *
   * @returns
   */
  public async getResults(): Promise<ArkormCollection<TRelated>> {
    const query = await this.getQuery()

    return query.get()
  }
}
