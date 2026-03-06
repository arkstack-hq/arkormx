import {
    BelongsToManyRelation,
    BelongsToRelation,
    HasManyRelation,
    HasManyThroughRelation,
    HasOneRelation,
    HasOneThroughRelation,
    MorphManyRelation,
    MorphOneRelation,
    MorphToManyRelation
} from './relationship'
import type { CastMap, EagerLoadConstraint, EagerLoadMap, ModelStatic, PrismaDelegateLike, RelationshipModelStatic, Serializable, SoftDeleteConfig } from './types/core'
import { ensureArkormConfigLoading, getRuntimePrismaClient, isDelegateLike } from './helpers/runtime-config'

import { DelegateForModelSchema, ModelAttributesOf } from './types'
import { QueryBuilder } from './QueryBuilder'
import { resolveCast } from './casts'
import { str } from '@h3ravel/support'

type RelatedModelClass<TInstance = unknown> =
    (abstract new (attributes?: Record<string, unknown>) => TInstance)
    & RelationshipModelStatic

/**
 * Base model class that all models should extend. 
 * 
 * @template TModel The type of the model extending this base class.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export abstract class Model<TSchema extends PrismaDelegateLike | Record<string, unknown> | string = Record<string, any>> {
    protected static client: Record<string, unknown>
    protected static delegate: string
    protected static softDeletes = false
    protected static deletedAtColumn = 'deletedAt'

    protected casts: CastMap = {}
    protected hidden: string[] = []
    protected visible: string[] = []
    protected appends: string[] = []

    protected readonly attributes: Record<string, unknown>

    public constructor(attributes: Record<string, unknown> = {}) {
        this.attributes = {}
        this.fill(attributes)
    }

    /**
     * Set the Prisma client delegates for all models. 
     * 
     * @param client 
     */
    protected static setClient (
        client: Record<string, unknown>
    ): void {
        this.client = client
    }

    /**
     * Get the Prisma delegate for the model. 
     * If a delegate name is provided, it will attempt to resolve that delegate. 
     * Otherwise, it will attempt to resolve a delegate based on the model's name or 
     * the static `delegate` property.
     * 
     * @param delegate 
     * @returns 
     */
    public static getDelegate<TDelegate extends PrismaDelegateLike = PrismaDelegateLike> (
        delegate?: string
    ): TDelegate {
        ensureArkormConfigLoading()

        const key = delegate || this.delegate || `${str(this.name).camel().plural()}`
        const candidates = [
            key,
            `${str(key).camel()}`,
            `${str(key).singular()}`,
            `${str(key).camel().singular()}`,
        ]

        const runtimeClient = getRuntimePrismaClient()
        const resolved = candidates
            .map(name => this.client?.[name] ?? runtimeClient?.[name])
            .find(candidate => isDelegateLike(candidate))

        if (!resolved)
            throw new Error(`Database delegate [${key}] is not configured.`)

        return resolved as TDelegate
    }

    /**
     * Get a new query builder instance for the model.
     * 
     * @param this 
     * @returns 
     */
    public static query<
        TThis extends abstract new (attributes?: Record<string, unknown>) => Model<any>,
        TModel extends InstanceType<TThis> = InstanceType<TThis>,
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<TModel extends Model<infer TSchema> ? TSchema : Record<string, any>>
    > (
        this: TThis
    ): QueryBuilder<TModel, TDelegate> {
        return new QueryBuilder<TModel, TDelegate>(
            (this as unknown as ModelStatic<TModel, TDelegate>).getDelegate(),
            this as unknown as ModelStatic<TModel, TDelegate>
        )
    }

    /**
     * Get a query builder instance that includes soft-deleted records.
     * 
     * @param this 
     * @returns 
     */
    public static withTrashed<
        TThis extends abstract new (attributes?: Record<string, unknown>) => Model<any>,
        TModel extends InstanceType<TThis> = InstanceType<TThis>,
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<TModel extends Model<infer TSchema> ? TSchema : Record<string, any>>
    > (
        this: TThis
    ): QueryBuilder<TModel, TDelegate> {
        return (this as unknown as ModelStatic<TModel, TDelegate>).query().withTrashed() as QueryBuilder<TModel, TDelegate>
    }

    /**
     * Get a query builder instance that only includes soft-deleted records.
     * 
     * @param this 
     * @returns 
     */
    public static onlyTrashed<
        TThis extends abstract new (attributes?: Record<string, unknown>) => Model<any>,
        TModel extends InstanceType<TThis> = InstanceType<TThis>,
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<TModel extends Model<infer TSchema> ? TSchema : Record<string, any>>
    > (
        this: TThis
    ): QueryBuilder<TModel, TDelegate> {
        return (this as unknown as ModelStatic<TModel, TDelegate>).query().onlyTrashed() as QueryBuilder<TModel, TDelegate>
    }

    /**
     * Get a query builder instance that excludes soft-deleted records. 
     * This is the default behavior of the query builder, but this method can be used 
     * to explicitly specify it after using `withTrashed` or `onlyTrashed`.
     * 
     * @param this 
     * @param name 
     * @param args 
     * @returns 
     */
    public static scope<
        TThis extends abstract new (attributes?: Record<string, unknown>) => Model<any>,
        TModel extends InstanceType<TThis> = InstanceType<TThis>,
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<TModel extends Model<infer TSchema> ? TSchema : Record<string, any>>
    > (
        this: TThis,
        name: string, ...args: unknown[]
    ): QueryBuilder<TModel, TDelegate> {
        return (this as unknown as ModelStatic<TModel, TDelegate>).query().scope(name, ...args) as QueryBuilder<TModel, TDelegate>
    }

    /**
     * Get the soft delete configuration for the model, including whether 
     * soft deletes are enabled and the name of the deleted at column.
     * 
     * @returns 
     */
    public static getSoftDeleteConfig (): SoftDeleteConfig {
        return {
            enabled: this.softDeletes,
            column: this.deletedAtColumn,
        }
    }

    /**
     * Hydrate a model instance from a plain object of attributes. 
     * 
     * @param this 
     * @param attributes 
     * @returns 
     */
    public static hydrate<TModel> (
        this: new (attributes: Record<string, unknown>) => TModel,
        attributes: Record<string, unknown>
    ): TModel {
        return new this(attributes)
    }

    /**
     * Hydrate multiple model instances from an array of plain objects of attributes.
     * 
     * @param this 
     * @param attributes 
     * @returns 
     */
    public static hydrateMany<TModel> (
        this: new (attributes: Record<string, unknown>) => TModel,
        attributes: Record<string, unknown>[]
    ): TModel[] {
        return attributes.map(attribute => new this(attribute))
    }

    /**
     * Fill the model's attributes from a plain object, using the 
     * setAttribute method to ensure that mutators and casts are applied. 
     * 
     * @param attributes 
     * @returns 
     */
    public fill (attributes: Partial<ModelAttributesOf<TSchema>>): this
    public fill (attributes: Record<string, unknown>): this
    public fill (attributes: Record<string, unknown>): this {
        Object.entries(attributes).forEach(([key, value]) => {
            this.setAttribute(key, value)
        })

        return this
    }

    /**
     * Get the value of an attribute, applying any get mutators or casts if defined.
     * 
     * @param key 
     * @returns 
     */
    public getAttribute<TKey extends keyof ModelAttributesOf<TSchema> & string> (key: TKey): ModelAttributesOf<TSchema>[TKey]
    public getAttribute (key: string): unknown
    public getAttribute (key: string): unknown {
        const mutator = this.resolveGetMutator(key)
        const cast = this.casts[key]
        let value = this.attributes[key]

        if (cast)
            value = resolveCast(cast).get(value)

        if (mutator)
            return mutator.call(this, value)

        return value
    }

    /**
     * Set the value of an attribute, applying any set mutators or casts if defined.
     * 
     * @param key 
     * @param value 
     * @returns 
     */
    public setAttribute<TKey extends keyof ModelAttributesOf<TSchema> & string> (
        key: TKey,
        value: ModelAttributesOf<TSchema>[TKey]
    ): this
    public setAttribute (key: string, value: unknown): this
    public setAttribute (key: string, value: unknown): this {
        const mutator = this.resolveSetMutator(key)
        const cast = this.casts[key]
        let resolved = value

        if (mutator)
            resolved = mutator.call(this, resolved)

        if (cast)
            resolved = resolveCast(cast).set(resolved)

        this.attributes[key] = resolved

        return this
    }

    /**
     * Save the model to the database. 
     * If the model has an identifier (id), it will perform an update. 
     * Otherwise, it will perform a create.
     * 
     * @returns 
     */
    public async save (): Promise<this> {
        const identifier = this.getAttribute('id') as string | number | undefined
        const payload = this.getRawAttributes()

        const constructor = this.constructor as unknown as ModelStatic<this>
        if (identifier == null) {
            const model = await constructor.query().create(payload)
            this.fill((model as unknown as Model).getRawAttributes() as Partial<ModelAttributesOf<TSchema>>)

            return this
        }

        const model = await constructor.query().where({ id: identifier }).update(payload)
        this.fill((model as unknown as Model).getRawAttributes() as Partial<ModelAttributesOf<TSchema>>)

        return this
    }

    /**
     * Delete the model from the database. 
     * If soft deletes are enabled, it will perform a soft delete by 
     * setting the deleted at column to the current date. 
     * Otherwise, it will perform a hard delete.
     * 
     * @returns 
     */
    public async delete (): Promise<this> {
        const identifier = this.getAttribute('id')
        if (identifier == null)
            throw new Error('Cannot delete a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>
        const softDeleteConfig = constructor.getSoftDeleteConfig()
        if (softDeleteConfig.enabled) {
            const model = await constructor.query()
                .where({ id: identifier })
                .update({ [softDeleteConfig.column]: new Date() })
            this.fill((model as unknown as Model).getRawAttributes() as Partial<ModelAttributesOf<TSchema>>)

            return this
        }

        return constructor.query().where({ id: identifier }).delete()
    }

    /**
     * Permanently delete the model from the database, regardless of whether soft 
     * deletes are enabled.
     * 
     * @returns 
     */
    public async forceDelete (): Promise<this> {
        const identifier = this.getAttribute('id')
        if (identifier == null)
            throw new Error('Cannot force delete a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>

        return constructor.query().withTrashed().where({ id: identifier }).delete()
    }

    /**
     * Restore a soft-deleted model by setting the deleted at column to null.
     * 
     * @returns 
     */
    public async restore (): Promise<this> {
        const identifier = this.getAttribute('id')
        if (identifier == null)
            throw new Error('Cannot restore a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>
        const softDeleteConfig = constructor.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return this

        const model = await constructor.query().withTrashed()
            .where({ id: identifier })
            .update({ [softDeleteConfig.column]: null })
        this.fill((model as unknown as Model).getRawAttributes() as Partial<ModelAttributesOf<TSchema>>)

        return this
    }

    /**
     * Load related models onto the current model instance.
     * 
     * @param relations 
     * @returns 
     */
    public async load (relations: string | string[] | EagerLoadMap): Promise<this> {
        const relationMap = this.normalizeRelationMap(relations)

        await Promise.all(Object.entries(relationMap).map(async ([name, constraint]) => {
            const resolver = (this as unknown as Record<string, unknown>)[name]
            if (typeof resolver !== 'function')
                return

            const relation = (resolver as () => { constrain: (constraint: EagerLoadConstraint) => unknown, getResults: () => Promise<unknown> }).call(this)
            if (constraint)
                relation.constrain(constraint)

            const results = await relation.getResults()
            this.attributes[name] = results
        }))

        return this
    }

    /**
     * Get the raw attributes of the model without applying any mutators or casts.
     * 
     * @returns 
     */
    public getRawAttributes (): Partial<ModelAttributesOf<TSchema>> {
        return { ...this.attributes } as Partial<ModelAttributesOf<TSchema>>
    }

    /**
     * Convert the model instance to a plain object, applying visibility 
     * rules, appends, and mutators.
     * 
     * @returns 
     */
    public toObject (): Serializable {
        const keys = this.visible.length > 0
            ? this.visible
            : Object.keys(this.attributes).filter(key => !this.hidden.includes(key))

        const object = keys.reduce<Serializable>((accumulator, key) => {
            let value: unknown = this.getAttribute(key as string)
            if (value instanceof Date)
                value = value.toISOString()

            accumulator[key] = value

            return accumulator
        }, {})

        this.appends.forEach((attribute) => {
            object[attribute] = this.getAttribute(attribute)
        })

        return object
    }

    /**
     * Convert the model instance to JSON by first converting it to a plain object.
     * 
     * @returns 
     */
    public toJSON (): Serializable {
        return this.toObject()
    }

    /**
     * Define a has one relationship.
     * 
     * @param related 
     * @param foreignKey 
     * @param localKey 
     * @returns 
     */
    protected hasOne<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        foreignKey: string,
        localKey = 'id'
    ): HasOneRelation<this, InstanceType<TRelatedClass>> {
        return new HasOneRelation<this, InstanceType<TRelatedClass>>(this, related, foreignKey, localKey)
    }

    /**
     * Define a has many relationship.
     * 
     * @param related 
     * @param foreignKey 
     * @param localKey 
     * @returns 
     */
    protected hasMany<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        foreignKey: string,
        localKey = 'id'
    ): HasManyRelation<this, InstanceType<TRelatedClass>> {
        return new HasManyRelation<this, InstanceType<TRelatedClass>>(this, related, foreignKey, localKey)
    }

    /**
     * Define a belongs to relationship.
     * 
     * @param related 
     * @param foreignKey 
     * @param ownerKey 
     * @returns 
     */
    protected belongsTo<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        foreignKey: string,
        ownerKey = 'id'
    ): BelongsToRelation<this, InstanceType<TRelatedClass>> {
        return new BelongsToRelation<this, InstanceType<TRelatedClass>>(this, related, foreignKey, ownerKey)
    }

    /**
     * Define a belongs to many relationship.
     * 
     * @param related 
     * @param throughDelegate 
     * @param foreignPivotKey 
     * @param relatedPivotKey 
     * @param parentKey 
     * @param relatedKey 
     * @returns 
     */
    protected belongsToMany<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        throughDelegate: string,
        foreignPivotKey: string,
        relatedPivotKey: string,
        parentKey = 'id',
        relatedKey = 'id'
    ): BelongsToManyRelation<this, InstanceType<TRelatedClass>> {
        return new BelongsToManyRelation<this, InstanceType<TRelatedClass>>(this, related, throughDelegate, foreignPivotKey, relatedPivotKey, parentKey, relatedKey)
    }

    /**
     * Define a has one through relationship.
     * 
     * @param related 
     * @param throughDelegate 
     * @param firstKey 
     * @param secondKey 
     * @param localKey 
     * @param secondLocalKey 
     * @returns 
     */
    protected hasOneThrough<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        throughDelegate: string,
        firstKey: string,
        secondKey: string,
        localKey = 'id',
        secondLocalKey = 'id'
    ): HasOneThroughRelation<this, InstanceType<TRelatedClass>> {
        return new HasOneThroughRelation(this, related, throughDelegate, firstKey, secondKey, localKey, secondLocalKey)
    }

    /**
     * Define a has many through relationship.
     * 
     * @param related 
     * @param throughDelegate 
     * @param firstKey 
     * @param secondKey 
     * @param localKey 
     * @param secondLocalKey 
     * @returns 
     */
    protected hasManyThrough<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        throughDelegate: string,
        firstKey: string,
        secondKey: string,
        localKey = 'id',
        secondLocalKey = 'id'
    ): HasManyThroughRelation<this, InstanceType<TRelatedClass>> {
        return new HasManyThroughRelation(this, related, throughDelegate, firstKey, secondKey, localKey, secondLocalKey)
    }

    /**
     * Define a polymorphic one to one relationship.
     * 
     * @param related 
     * @param morphName 
     * @param localKey 
     * @returns 
     */
    protected morphOne<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        morphName: string,
        localKey = 'id'
    ): MorphOneRelation<this, InstanceType<TRelatedClass>> {
        return new MorphOneRelation(this, related, morphName, localKey)
    }

    /**
     * Define a polymorphic one to many relationship.
     * 
     * @param related 
     * @param morphName 
     * @param localKey 
     * @returns 
     */
    protected morphMany<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        morphName: string,
        localKey = 'id'
    ): MorphManyRelation<this, InstanceType<TRelatedClass>> {
        return new MorphManyRelation(this, related, morphName, localKey)
    }

    /**
     * Define a polymorphic many to many relationship.
     * 
     * @param related 
     * @param throughDelegate 
     * @param morphName 
     * @param relatedPivotKey 
     * @param parentKey 
     * @param relatedKey 
     * @returns 
     */
    protected morphToMany<TRelatedClass extends RelatedModelClass> (
        related: TRelatedClass,
        throughDelegate: string,
        morphName: string,
        relatedPivotKey: string,
        parentKey = 'id',
        relatedKey = 'id'
    ): MorphToManyRelation<this, InstanceType<TRelatedClass>> {
        return new MorphToManyRelation(this, related, throughDelegate, morphName, relatedPivotKey, parentKey, relatedKey)
    }

    /**
     * Resolve a get mutator method for a given attribute key, if it exists.
     * 
     * @param key 
     * @returns 
     */
    private resolveGetMutator (key: string): ((value: unknown) => unknown) | null {
        const methodName = `get${str(key).studly()}Attribute`
        const method = (this as unknown as Record<string, unknown>)[methodName]

        return typeof method === 'function' ? method as (value: unknown) => unknown : null
    }

    /**
     * Resolve a set mutator method for a given attribute key, if it exists.
     * 
     * @param key 
     * @returns 
     */
    private resolveSetMutator (key: string): ((value: unknown) => unknown) | null {
        const methodName = `set${str(key).studly()}Attribute`
        const method = (this as unknown as Record<string, unknown>)[methodName]

        return typeof method === 'function' ? method as (value: unknown) => unknown : null
    }

    /**
     * Normalize the relation map for eager loading.
     * 
     * @param relations 
     * @returns 
     */
    private normalizeRelationMap (
        relations: string | string[] | EagerLoadMap
    ): EagerLoadMap {
        if (typeof relations === 'string')
            return { [relations]: undefined }

        if (Array.isArray(relations)) {
            return relations.reduce<EagerLoadMap>((accumulator, relation) => {
                accumulator[relation] = undefined

                return accumulator
            }, {})
        }

        return relations
    }
}