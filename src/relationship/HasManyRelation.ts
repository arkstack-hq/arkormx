import { ModelStatic } from 'src/Model'
import { Relation } from './Relation'

export class HasManyRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly foreignKey: string,
        private readonly localKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated[]> {
        const localValue = this.parent.getAttribute(this.localKey)

        return this.related.query().where({ [this.foreignKey]: localValue }).get()
    }
}