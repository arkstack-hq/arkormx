import { ModelStatic } from 'src/types'
import { Relation } from './Relation'

export class HasOneRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly foreignKey: string,
        private readonly localKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated | null> {
        const localValue = this.parent.getAttribute(this.localKey)
        const query = this.applyConstraint(this.related.query().where({ [this.foreignKey]: localValue }))

        return query.first()
    }
}