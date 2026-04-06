import type { EagerLoadConstraint, EagerLoadMap, RelationMetadata } from '../types'

import { ArkormCollection } from '../Collection'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'

type EagerLoadableModel = {
    getAttribute: (key: string) => unknown
    setLoadedRelation: (name: string, value: unknown) => void
}

type RelationResolver = (this: EagerLoadableModel) => Relation<unknown>

/**
 * Utility class responsible for performing set-based eager loading of relationships for 
 * a collection of models.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 2.0.0-next.2
 */
export class SetBasedEagerLoader {
    public constructor(
        private readonly models: EagerLoadableModel[],
        private readonly relations: EagerLoadMap,
    ) { }

    public async load (): Promise<void> {
        if (this.models.length === 0)
            return

        await Promise.all(Object.entries(this.relations).map(async ([name, constraint]) => {
            await this.loadRelation(name, constraint)
        }))
    }

    private async loadRelation (name: string, constraint?: EagerLoadConstraint): Promise<void> {
        const resolver = this.resolveRelationResolver(name)
        if (!resolver)
            return

        const metadata = resolver.call(this.models[0]).getMetadata()

        switch (metadata.type) {
            case 'belongsTo':
                await this.loadBelongsTo(name, resolver, metadata, constraint)

                return
            case 'hasMany':
                await this.loadHasMany(name, metadata, constraint)

                return
            case 'hasOne':
                await this.loadHasOne(name, resolver, metadata, constraint)

                return
            default:
                await this.loadIndividually(name, resolver, constraint)
        }
    }

    private resolveRelationResolver (name: string): RelationResolver | null {
        const resolver = (this.models[0] as Record<string, unknown>)[name]

        if (typeof resolver !== 'function')
            return null

        return resolver as RelationResolver
    }

    private async loadBelongsTo (
        name: string,
        resolver: RelationResolver,
        metadata: Extract<RelationMetadata, { type: 'belongsTo' }>,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        const keys = this.collectUniqueKeys(model => model.getAttribute(metadata.foreignKey))
        if (keys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, this.resolveSingleDefault(resolver, model))
            })

            return
        }

        let query = metadata.relatedModel.query()
            .whereIn(metadata.ownerKey as never, keys as never[])

        query = this.applyConstraint(query, constraint)

        const relatedModels = (await query.get()).all()
        const relatedByOwnerKey = new Map<string, unknown>()

        relatedModels.forEach(related => {
            const value = this.readModelAttribute(related, metadata.ownerKey)
            if (value == null)
                return

            const lookupKey = this.toLookupKey(value)
            if (!relatedByOwnerKey.has(lookupKey))
                relatedByOwnerKey.set(lookupKey, related)
        })

        this.models.forEach(model => {
            const foreignValue = model.getAttribute(metadata.foreignKey)
            const relationValue = foreignValue == null
                ? undefined
                : relatedByOwnerKey.get(this.toLookupKey(foreignValue))

            model.setLoadedRelation(name, relationValue ?? this.resolveSingleDefault(resolver, model))
        })
    }

    private async loadHasMany (
        name: string,
        metadata: Extract<RelationMetadata, { type: 'hasMany' }>,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        const keys = this.collectUniqueKeys(model => model.getAttribute(metadata.localKey))
        if (keys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, new ArkormCollection([]))
            })

            return
        }

        let query = metadata.relatedModel.query()
            .whereIn(metadata.foreignKey as never, keys as never[])

        query = this.applyConstraint(query, constraint)

        const relatedModels = (await query.get()).all()
        const relatedByForeignKey = new Map<string, unknown[]>()

        relatedModels.forEach(related => {
            const value = this.readModelAttribute(related, metadata.foreignKey)
            if (value == null)
                return

            const lookupKey = this.toLookupKey(value)
            const bucket = relatedByForeignKey.get(lookupKey) ?? []
            bucket.push(related)
            relatedByForeignKey.set(lookupKey, bucket)
        })

        this.models.forEach(model => {
            const localValue = model.getAttribute(metadata.localKey)
            const related = localValue == null
                ? []
                : relatedByForeignKey.get(this.toLookupKey(localValue)) ?? []

            model.setLoadedRelation(name, new ArkormCollection(related))
        })
    }

    private async loadHasOne (
        name: string,
        resolver: RelationResolver,
        metadata: Extract<RelationMetadata, { type: 'hasOne' }>,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        const keys = this.collectUniqueKeys(model => model.getAttribute(metadata.localKey))
        if (keys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, this.resolveSingleDefault(resolver, model))
            })

            return
        }

        let query = metadata.relatedModel.query()
            .whereIn(metadata.foreignKey as never, keys as never[])

        query = this.applyConstraint(query, constraint)

        const relatedModels = (await query.get()).all()
        const relatedByForeignKey = new Map<string, unknown>()

        relatedModels.forEach(related => {
            const value = this.readModelAttribute(related, metadata.foreignKey)
            if (value == null)
                return

            const lookupKey = this.toLookupKey(value)
            if (!relatedByForeignKey.has(lookupKey))
                relatedByForeignKey.set(lookupKey, related)
        })

        this.models.forEach(model => {
            const localValue = model.getAttribute(metadata.localKey)
            const relationValue = localValue == null
                ? undefined
                : relatedByForeignKey.get(this.toLookupKey(localValue))

            model.setLoadedRelation(name, relationValue ?? this.resolveSingleDefault(resolver, model))
        })
    }

    private async loadIndividually (
        name: string,
        resolver: RelationResolver,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        await Promise.all(this.models.map(async model => {
            const relation = resolver.call(model)
            if (constraint) {
                relation.constrain(
                    constraint as (query: QueryBuilder<unknown>) => QueryBuilder<unknown> | void,
                )
            }

            model.setLoadedRelation(name, await relation.getResults())
        }))
    }

    private applyConstraint<TModel> (
        query: QueryBuilder<TModel>,
        constraint?: EagerLoadConstraint,
    ): QueryBuilder<TModel> {
        if (!constraint)
            return query

        const constrained = constraint(query)

        return (constrained ?? query) as QueryBuilder<TModel>
    }

    private collectUniqueKeys (resolve: (model: EagerLoadableModel) => unknown): unknown[] {
        const seen = new Set<string>()
        const values: unknown[] = []

        this.models.forEach(model => {
            const value = resolve(model)
            if (value == null)
                return

            const lookupKey = this.toLookupKey(value)
            if (seen.has(lookupKey))
                return

            seen.add(lookupKey)
            values.push(value)
        })

        return values
    }

    private readModelAttribute (model: unknown, key: string): unknown {
        return (model as { getAttribute?: (attribute: string) => unknown }).getAttribute?.(key)
    }

    private resolveSingleDefault (resolver: RelationResolver, model: EagerLoadableModel): unknown {
        const relation = resolver.call(model) as Relation<unknown> & { resolveDefaultResult?: () => unknown }

        return relation.resolveDefaultResult?.() ?? null
    }

    private toLookupKey (value: unknown): string {
        if (value instanceof Date)
            return `date:${value.toISOString()}`

        return `${typeof value}:${String(value)}`
    }
}