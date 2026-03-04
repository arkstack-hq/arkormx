import { ModelStatic } from 'src/Model'
import { Relation } from './Relation'

export class HasManyThroughRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly throughDelegate: string,
        private readonly firstKey: string,
        private readonly secondKey: string,
        private readonly localKey: string,
        private readonly secondLocalKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated[]> {
        const localValue = this.parent.getAttribute(this.localKey)
        const intermediates = await this.related.getDelegate(this.throughDelegate).findMany({ where: { [this.firstKey]: localValue } }) as Record<string, unknown>[]
        const keys = intermediates.map(row => row[this.secondLocalKey])

        return this.related.query().where({ [this.secondKey]: { in: keys } }).get()
    }
}