import { ModelStatic } from 'src/Model'
import { Relation } from './Relation'

export class MorphManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly morphName: string,
        private readonly localKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated[]> {
        const id = this.parent.getAttribute(this.localKey)
        const type = (this.parent as { constructor: { name: string } }).constructor.name

        return this.related.query().where({ [`${this.morphName}Id`]: id, [`${this.morphName}Type`]: type }).get()
    }
}