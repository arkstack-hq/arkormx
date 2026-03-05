import { ModelStatic } from 'src/types'
import { Relation } from './Relation'

export class BelongsToManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly throughDelegate: string,
        private readonly foreignPivotKey: string,
        private readonly relatedPivotKey: string,
        private readonly parentKey: string,
        private readonly relatedKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated[]> {
        const parentValue = this.parent.getAttribute(this.parentKey)
        const pivotRows = await this.related.getDelegate(this.throughDelegate).findMany({
            where: { [this.foreignPivotKey]: parentValue },
        }) as Record<string, unknown>[]
        const ids = pivotRows.map(row => row[this.relatedPivotKey])
        const query = this.applyConstraint(this.related.query().where({ [this.relatedKey]: { in: ids } }))

        return query.get()
    }
}