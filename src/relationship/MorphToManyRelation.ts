import { ModelStatic } from 'src/Model'
import { Relation } from './Relation'

export class MorphToManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly throughDelegate: string,
        private readonly morphName: string,
        private readonly relatedPivotKey: string,
        private readonly parentKey: string,
        private readonly relatedKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated[]> {
        const parentValue = this.parent.getAttribute(this.parentKey)
        const morphType = (this.parent as { constructor: { name: string } }).constructor.name
        const pivots = await this.related.getDelegate(this.throughDelegate).findMany({
            where: {
                [`${this.morphName}Id`]: parentValue,
                [`${this.morphName}Type`]: morphType,
            },
        }) as Record<string, unknown>[]
        const ids = pivots.map(row => row[this.relatedPivotKey])

        return this.related.query().where({ [this.relatedKey]: { in: ids } }).get()
    }
}