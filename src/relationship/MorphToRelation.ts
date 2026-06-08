import type { MorphToRelationMetadata, RelatedModelClass } from '../types'

import { RelationResolutionException } from '../Exceptions/RelationResolutionException'
import type { QueryBuilder } from '../QueryBuilder'
import { getRegisteredModels } from '../helpers/runtime-registry'
import { awaitConfiguredModelsRegistration } from '../helpers/runtime-config'
import { Relation } from './Relation'

type MorphToParent = {
    getAttribute: (key: string) => unknown
}

/**
 * Defines the inverse side of a polymorphic one-to-one or one-to-many relationship.
 *
 * Related models are resolved from ArkORM's runtime model registry using the value
 * stored in the morph type column.
 *
 * @author Legacy (3m1n3nc3)
 * @since 2.6.0
 */
export class MorphToRelation<TParent, TRelated> extends Relation<TRelated> {
    public constructor(
        private readonly parent: TParent & MorphToParent,
        private readonly morphName: string,
        private readonly morphTypeColumn: string,
        private readonly morphIdColumn: string,
        private readonly ownerKey?: string,
        private readonly relatedModel?: RelatedModelClass<TRelated>,
    ) {
        super()
    }

    protected get related (): RelatedModelClass<TRelated> {
        return this.resolveRelatedModel()
    }

    /**
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        await awaitConfiguredModelsRegistration()

        const related = this.resolveRelatedModel()
        const resolvedOwnerKey = this.ownerKey ?? related.getPrimaryKey()
        const morphId = this.parent.getAttribute(this.morphIdColumn)

        return this.applyConstraint(related.query().where({ [resolvedOwnerKey]: morphId }))
    }

    public getMetadata (): MorphToRelationMetadata {
        return {
            type: 'morphTo',
            morphName: this.morphName,
            morphIdColumn: this.morphIdColumn,
            morphTypeColumn: this.morphTypeColumn,
            ownerKey: this.ownerKey,
        }
    }

    /**
     * Fetch the polymorphic parent model.
     *
     * @returns
     */
    public async getResults (): Promise<TRelated | null> {
        const morphType = this.parent.getAttribute(this.morphTypeColumn)
        const morphId = this.parent.getAttribute(this.morphIdColumn)
        if (morphType == null || morphId == null)
            return null

        return await (await this.getQuery()).first()
    }

    private resolveRelatedModel (): RelatedModelClass<TRelated> {
        const morphType = this.parent.getAttribute(this.morphTypeColumn)
        if (typeof morphType !== 'string' || morphType.trim().length === 0) {
            throw new RelationResolutionException(
                `Morph type column [${this.morphTypeColumn}] does not contain a model name.`,
                {
                    operation: 'morphTo',
                    relation: this.morphName,
                },
            )
        }

        const related = this.relatedModel?.name === morphType
            ? this.relatedModel
            : getRegisteredModels().find(model => model.name === morphType)
        if (!related) {
            throw new RelationResolutionException(
                `Morph model [${morphType}] is not registered. Register it with Arkorm.registerModels().`,
                {
                    operation: 'morphTo',
                    model: morphType,
                    relation: this.morphName,
                },
            )
        }

        return related as RelatedModelClass<TRelated>
    }
}
