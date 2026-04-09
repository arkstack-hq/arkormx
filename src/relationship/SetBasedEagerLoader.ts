import type { DatabaseAdapter, DatabaseRow, EagerLoadConstraint, EagerLoadMap, RelationMetadata } from '../types'

import { ArkormCollection } from '../Collection'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'
import { RelationTableLoader } from './RelationTableLoader'

type EagerLoadableModel = {
    getAttribute: (key: string) => unknown
    setLoadedRelation: (name: string, value: unknown) => void
}

type RawAttributeReadable = {
    getRawAttributes: () => Record<string, unknown>
    setAttribute: (key: string, value: unknown) => unknown
    getAttribute: (key: string) => unknown
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

    /**
     * Performs eager loading of all specified relationships for the set of models. 
     * 
     * @returns 
     */
    public async load (): Promise<void> {
        if (this.models.length === 0)
            return

        await Promise.all(Object.entries(this.relations).map(async ([name, constraint]) => {
            await this.loadRelation(name, constraint)
        }))
    }

    /**
     * Loads a specific relationship for the set of models based on the relationship name 
     * and an optional constraint.
     * 
     * @param name          The name of the relationship to load.
     * @param constraint    An optional constraint to apply to the query.
     * @returns             A promise that resolves when the relationship is loaded.
     */
    private async loadRelation (name: string, constraint?: EagerLoadConstraint): Promise<void> {
        const resolver = this.resolveRelationResolver(name)
        if (!resolver)
            return

        const metadata = resolver.call(this.models[0]).getMetadata()

        switch (metadata.type) {
            case 'belongsTo':
                await this.loadBelongsTo(name, resolver, metadata, constraint)

                return
            case 'belongsToMany':
                await this.loadBelongsToMany(name, metadata, constraint)

                return
            case 'hasMany':
                await this.loadHasMany(name, metadata, constraint)

                return
            case 'hasOne':
                await this.loadHasOne(name, resolver, metadata, constraint)

                return
            case 'hasManyThrough':
                await this.loadHasManyThrough(name, metadata, constraint)

                return
            case 'hasOneThrough':
                await this.loadHasOneThrough(name, resolver, metadata, constraint)

                return
            default:
                await this.loadIndividually(name, resolver, constraint)
        }
    }

    /**
     * Resolves the relation resolver function for a given relationship name by inspecting 
     * the first model in the set.
     * 
     * @param name  The name of the relationship to resolve.
     * @returns     The relation resolver function or null if not found.
     */
    private resolveRelationResolver (name: string): RelationResolver | null {
        const resolver = (this.models[0] as Record<string, unknown>)[name]

        if (typeof resolver !== 'function')
            return null

        return resolver as RelationResolver
    }

    /**
     * Loads a "belongs to" relationship for the set of models.
     * 
     * @param name          The name of the relationship to load.
     * @param resolver      The relation resolver function.
     * @param metadata      The metadata for the relationship.
     * @param constraint    An optional constraint to apply to the query.
     * @returns             A promise that resolves when the relationship is loaded.
     */
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

    /**
     * Loads a "has many" relationship for the set of models. 
     * 
     * @param name 
     * @param metadata 
     * @param constraint 
     * @returns 
     */
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

    /**
     * Loads a "belongs to many" relationship for the set of models. 
     * 
     * @param name 
     * @param metadata 
     * @param constraint 
     * @returns 
     */
    private async loadBelongsToMany (
        name: string,
        metadata: Extract<RelationMetadata, { type: 'belongsToMany' }>,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        const parentKeys = this.collectUniqueKeys(model => model.getAttribute(metadata.parentKey))
        if (parentKeys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, new ArkormCollection([]))
            })

            return
        }

        const pivotRows = await this.createRelationTableLoader().selectRows({
            table: metadata.throughTable,
            where: this.buildBelongsToManyPivotWhere(metadata, parentKeys),
            columns: this.getBelongsToManyPivotColumns(metadata).map(column => ({ column })),
        })

        const relatedIds = this.collectUniqueRowValues(pivotRows, metadata.relatedPivotKey)
        if (relatedIds.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, new ArkormCollection([]))
            })

            return
        }

        let query = metadata.relatedModel.query()
            .whereIn(metadata.relatedKey as never, relatedIds as never[])

        query = this.applyConstraint(query, constraint)

        const relatedModels = (await query.get()).all()
        const relatedByKey = new Map<string, unknown>()

        relatedModels.forEach(related => {
            const relatedValue = this.readModelAttribute(related, metadata.relatedKey)
            if (relatedValue == null)
                return

            relatedByKey.set(this.toLookupKey(relatedValue), related)
        })

        const relatedKeysByParent = new Map<string, unknown[]>()
        const pivotByParentAndRelated = new Map<string, DatabaseRow>()
        pivotRows.forEach((row: DatabaseRow) => {
            const parentValue = row[metadata.foreignPivotKey]
            const relatedValue = row[metadata.relatedPivotKey]
            if (parentValue == null || relatedValue == null)
                return

            const bucket = relatedKeysByParent.get(this.toLookupKey(parentValue)) ?? []
            bucket.push(relatedValue)
            relatedKeysByParent.set(this.toLookupKey(parentValue), bucket)
            pivotByParentAndRelated.set(`${this.toLookupKey(parentValue)}:${this.toLookupKey(relatedValue)}`, row)
        })

        this.models.forEach(model => {
            const parentValue = model.getAttribute(metadata.parentKey)
            const relatedValues = parentValue == null
                ? []
                : relatedKeysByParent.get(this.toLookupKey(parentValue)) ?? []
            const related = relatedValues.reduce<unknown[]>((all, relatedValue) => {
                const candidate = relatedByKey.get(this.toLookupKey(relatedValue))
                if (candidate)
                    all.push(this.attachBelongsToManyPivot(metadata, candidate, pivotByParentAndRelated.get(`${this.toLookupKey(parentValue)}:${this.toLookupKey(relatedValue)}`)))

                return all
            }, [])

            model.setLoadedRelation(name, new ArkormCollection(related))
        })
    }

    private buildBelongsToManyPivotWhere (
        metadata: Extract<RelationMetadata, { type: 'belongsToMany' }>,
        parentKeys: unknown[],
    ) {
        const baseCondition = {
            type: 'comparison' as const,
            column: metadata.foreignPivotKey,
            operator: 'in' as const,
            value: parentKeys as never[],
        }

        if (!metadata.pivotWhere)
            return baseCondition

        return {
            type: 'group' as const,
            operator: 'and' as const,
            conditions: [baseCondition, metadata.pivotWhere],
        }
    }

    private getBelongsToManyPivotColumns (
        metadata: Extract<RelationMetadata, { type: 'belongsToMany' }>,
    ): string[] {
        return [
            metadata.foreignPivotKey,
            metadata.relatedPivotKey,
            ...(metadata.pivotColumns ?? []),
        ].filter((column, index, all) => all.indexOf(column) === index)
    }

    private shouldAttachBelongsToManyPivot (
        metadata: Extract<RelationMetadata, { type: 'belongsToMany' }>,
    ): boolean {
        return Boolean(metadata.pivotModel)
            || Boolean(metadata.pivotCreatedAtColumn)
            || Boolean(metadata.pivotUpdatedAtColumn)
            || (metadata.pivotColumns?.length ?? 0) > 0
            || Boolean(metadata.pivotAccessor)
    }

    private createBelongsToManyPivotRecord (
        metadata: Extract<RelationMetadata, { type: 'belongsToMany' }>,
        row: DatabaseRow,
    ): unknown {
        const attributes = this.getBelongsToManyPivotColumns(metadata).reduce<Record<string, unknown>>((all, column) => {
            all[column] = row[column]

            return all
        }, {})

        if (!metadata.pivotModel)
            return attributes

        if (typeof metadata.pivotModel.hydrate === 'function')
            return metadata.pivotModel.hydrate(attributes)

        return new metadata.pivotModel(attributes)
    }

    private attachBelongsToManyPivot (
        metadata: Extract<RelationMetadata, { type: 'belongsToMany' }>,
        related: unknown,
        row?: DatabaseRow,
    ): unknown {
        if (!row || !this.shouldAttachBelongsToManyPivot(metadata))
            return related

        const rawReader = related as RawAttributeReadable
        if (typeof rawReader.getRawAttributes !== 'function' || typeof rawReader.setAttribute !== 'function')
            return related

        const cloned = metadata.relatedModel.hydrate(rawReader.getRawAttributes()) as RawAttributeReadable
        cloned.setAttribute(metadata.pivotAccessor ?? 'pivot', this.createBelongsToManyPivotRecord(metadata, row))

        return cloned
    }

    /**
     * Loads a "belongs to many" relationship for the set of models.
     * 
     * @param name 
     * @param resolver 
     * @param metadata 
     * @param constraint 
     * @returns 
     */
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

    /**
     * Loads a "has many through" relationship for the set of models.
     * 
     * @param name 
     * @param metadata 
     * @param constraint 
     * @returns 
     */
    private async loadHasManyThrough (
        name: string,
        metadata: Extract<RelationMetadata, { type: 'hasManyThrough' }>,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        const parentKeys = this.collectUniqueKeys(model => model.getAttribute(metadata.localKey))
        if (parentKeys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, new ArkormCollection([]))
            })

            return
        }

        const throughRows = await this.createRelationTableLoader().selectRows({
            table: metadata.throughTable,
            where: {
                type: 'comparison',
                column: metadata.firstKey,
                operator: 'in',
                value: parentKeys as never[],
            },
        })

        const intermediateKeys = this.collectUniqueRowValues(throughRows, metadata.secondLocalKey)
        if (intermediateKeys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, new ArkormCollection([]))
            })

            return
        }

        let query = metadata.relatedModel.query()
            .whereIn(metadata.secondKey as never, intermediateKeys as never[])

        query = this.applyConstraint(query, constraint)

        const relatedModels = (await query.get()).all()
        const relatedByIntermediate = new Map<string, unknown[]>()

        relatedModels.forEach(related => {
            const relatedValue = this.readModelAttribute(related, metadata.secondKey)
            if (relatedValue == null)
                return

            const bucket = relatedByIntermediate.get(this.toLookupKey(relatedValue)) ?? []
            bucket.push(related)
            relatedByIntermediate.set(this.toLookupKey(relatedValue), bucket)
        })

        const intermediateByParent = new Map<string, unknown[]>()
        throughRows.forEach((row: DatabaseRow) => {
            const parentValue = row[metadata.firstKey]
            const intermediateValue = row[metadata.secondLocalKey]
            if (parentValue == null || intermediateValue == null)
                return

            const bucket = intermediateByParent.get(this.toLookupKey(parentValue)) ?? []
            bucket.push(intermediateValue)
            intermediateByParent.set(this.toLookupKey(parentValue), bucket)
        })

        this.models.forEach(model => {
            const parentValue = model.getAttribute(metadata.localKey)
            const related = (parentValue == null
                ? []
                : intermediateByParent.get(this.toLookupKey(parentValue)) ?? [])
                .flatMap(intermediateValue => relatedByIntermediate.get(this.toLookupKey(intermediateValue)) ?? [])

            model.setLoadedRelation(name, new ArkormCollection(related))
        })
    }

    /**
     * Loads a "has one through" relationship for the set of models.
     * 
     * @param name 
     * @param resolver 
     * @param metadata 
     * @param constraint 
     * @returns 
     */
    private async loadHasOneThrough (
        name: string,
        resolver: RelationResolver,
        metadata: Extract<RelationMetadata, { type: 'hasOneThrough' }>,
        constraint?: EagerLoadConstraint,
    ): Promise<void> {
        const parentKeys = this.collectUniqueKeys(model => model.getAttribute(metadata.localKey))
        if (parentKeys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, this.resolveSingleDefault(resolver, model))
            })

            return
        }

        const throughRows = await this.createRelationTableLoader().selectRows({
            table: metadata.throughTable,
            where: {
                type: 'comparison',
                column: metadata.firstKey,
                operator: 'in',
                value: parentKeys as never[],
            },
        })

        const intermediateKeys = this.collectUniqueRowValues(throughRows, metadata.secondLocalKey)
        if (intermediateKeys.length === 0) {
            this.models.forEach(model => {
                model.setLoadedRelation(name, this.resolveSingleDefault(resolver, model))
            })

            return
        }

        let query = metadata.relatedModel.query()
            .whereIn(metadata.secondKey as never, intermediateKeys as never[])

        query = this.applyConstraint(query, constraint)

        const relatedModels = (await query.get()).all()
        const relatedByIntermediate = new Map<string, unknown>()

        relatedModels.forEach(related => {
            const relatedValue = this.readModelAttribute(related, metadata.secondKey)
            if (relatedValue == null)
                return

            const lookupKey = this.toLookupKey(relatedValue)
            if (!relatedByIntermediate.has(lookupKey))
                relatedByIntermediate.set(lookupKey, related)
        })

        const intermediateByParent = new Map<string, unknown>()
        throughRows.forEach((row: DatabaseRow) => {
            const parentValue = row[metadata.firstKey]
            const intermediateValue = row[metadata.secondLocalKey]
            if (parentValue == null || intermediateValue == null)
                return

            const lookupKey = this.toLookupKey(parentValue)
            if (!intermediateByParent.has(lookupKey))
                intermediateByParent.set(lookupKey, intermediateValue)
        })

        this.models.forEach(model => {
            const parentValue = model.getAttribute(metadata.localKey)
            const intermediateValue = parentValue == null
                ? undefined
                : intermediateByParent.get(this.toLookupKey(parentValue))
            const relationValue = intermediateValue == null
                ? undefined
                : relatedByIntermediate.get(this.toLookupKey(intermediateValue))

            model.setLoadedRelation(name, relationValue ?? this.resolveSingleDefault(resolver, model))
        })
    }

    /**
     * Fallback method to load relationships individually for each model when the 
     * relationship type is not supported for set-based loading.
     * 
     * @param name 
     * @param resolver 
     * @param constraint 
     */
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

    /**
     * Applies an eager load constraint to a query if provided.
     * 
     * @param query 
     * @param constraint 
     * @returns 
     */
    private applyConstraint<TModel> (
        query: QueryBuilder<TModel>,
        constraint?: EagerLoadConstraint,
    ): QueryBuilder<TModel> {
        if (!constraint)
            return query

        const constrained = constraint(query)

        return (constrained ?? query) as QueryBuilder<TModel>
    }

    /**
     * Collects unique values from the set of models based on a resolver function, which 
     * is used to extract the value from each model.
     * 
     * @param resolve   A function that takes a model and returns the value to be collected.
     * @returns         An array of unique values.
     */
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

    /**
     * Collects unique values from an array of database rows based on a specified key, which 
     * is used to extract the value from each row.
     * 
     * @param rows  An array of database rows.
     * @param key   The key to extract values from each row.
     * @returns     An array of unique values.
     */
    private collectUniqueRowValues (rows: Array<Record<string, unknown>>, key: string): unknown[] {
        const seen = new Set<string>()
        const values: unknown[] = []

        rows.forEach(row => {
            const value = row[key]
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

    /**
     * Loads a "belongs to many" relationship for the set of models.
     * 
     * @returns 
     */
    private createRelationTableLoader (): RelationTableLoader {
        return new RelationTableLoader(this.resolveAdapter())
    }

    /**
     * Loads a "belongs to many" relationship for the set of models.
     * 
     * @returns 
     */
    private resolveAdapter (): DatabaseAdapter {
        const firstModel = this.models[0] as Record<string, unknown>
        const adapter = (firstModel.constructor as { getAdapter?: () => unknown }).getAdapter?.()

        if (!adapter)
            throw new Error('Set-based eager loading requires a configured adapter.')

        return adapter as DatabaseAdapter
    }

    /**
     * Reads an attribute value from a model using the getAttribute method, which is used 
     * to access model attributes in a way that is compatible with Arkorm's internal model structure.
     * 
     * @param model The model to read the attribute from.
     * @param key The name of the attribute to read.
     * @returns 
     */
    private readModelAttribute (model: unknown, key: string): unknown {
        return (model as { getAttribute?: (attribute: string) => unknown }).getAttribute?.(key)
    }

    /**
     * Resolves the default result for a relationship when no related models are found. 
     * 
     * @param resolver 
     * @param model 
     * @returns 
     */
    private resolveSingleDefault (resolver: RelationResolver, model: EagerLoadableModel): unknown {
        const relation = resolver.call(model) as Relation<unknown> & { resolveDefaultResult?: () => unknown }

        return relation.resolveDefaultResult?.() ?? null
    }

    /**
     * Generates a unique lookup key for a given value, which is used to store and retrieve 
     * values in maps during the eager loading process.
     * 
     * @param value     The value to generate a lookup key for.
     * @returns         A unique string representing the value.
     */
    private toLookupKey (value: unknown): string {
        if (value instanceof Date)
            return `date:${value.toISOString()}`

        return `${typeof value}:${String(value)}`
    }
}