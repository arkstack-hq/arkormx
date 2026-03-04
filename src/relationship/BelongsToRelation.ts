import { ModelStatic } from 'src/Model'
import { Relation } from './Relation'

export class BelongsToRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: ModelStatic<TRelated>,
        private readonly foreignKey: string,
        private readonly ownerKey: string,
    ) {
        super()
    }

    public async getResults (): Promise<TRelated | null> {
        const foreignValue = this.parent.getAttribute(this.foreignKey)

        return this.related.query().where({ [this.ownerKey]: foreignValue }).first()
    }
}