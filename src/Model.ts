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
import type { ModelFactory } from './database/factories'
import type {
    CastMap,
    EagerLoadConstraint,
    EagerLoadMap,
    ModelStatic,
    PrismaClientLike,
    PrismaDelegateLike,
    PrismaTransactionOptions,
    Serializable,
    SoftDeleteConfig,
} from './types/core'
import {
    ensureArkormConfigLoading,
    getActiveTransactionClient,
    getRuntimePrismaClient,
    isDelegateLike,
    runArkormTransaction,
} from './helpers/runtime-config'

import { DelegateForModelSchema, GlobalScope, ModelAttributesOf, ModelEventDispatcher, ModelEventHandlerConstructor, ModelEventListener, ModelEventName, ModelLifecycleState, RelatedModelClass } from './types'
import { Attribute } from './Attribute'
import { QueryBuilder } from './QueryBuilder'
import { resolveCast } from './casts'
import { str } from '@h3ravel/support'
import { ArkormException } from './Exceptions/ArkormException'
import { MissingDelegateException } from './Exceptions/MissingDelegateException'

/**
 * Base model class that all models should extend. 
 * 
 * @template TModel The type of the model extending this base class.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export abstract class Model<
    TSchema extends PrismaDelegateLike | Record<string, unknown> | string = Record<string, any>,
    TAttributes extends Record<string, unknown> = ModelAttributesOf<TSchema>
> {
    private static readonly lifecycleStates = new WeakMap<Function, ModelLifecycleState>()
    private static eventsSuppressed = 0

    protected static factoryClass?: new () => ModelFactory<any, any>
    protected static client: Record<string, unknown>
    protected static delegate: string
    protected static softDeletes = false
    protected static deletedAtColumn = 'deletedAt'
    protected static globalScopes: Record<string, GlobalScope> = {}
    protected static eventListeners: Partial<Record<ModelEventName, ModelEventListener<any>[]>> = {}
    protected static dispatchesEvents: Partial<Record<ModelEventName, ModelEventDispatcher<any> | ModelEventDispatcher<any>[]>> = {}

    protected casts: CastMap = {}
    protected hidden: string[] = []
    protected visible: string[] = []
    protected appends: string[] = []

    protected readonly attributes: Record<string, unknown>

    public constructor(attributes: Record<string, unknown> = {}) {
        this.attributes = {}
        this.fill(attributes)

        return new Proxy(this, {
            get: (target, key, receiver) => {
                if (typeof key !== 'string')
                    return Reflect.get(target, key, receiver)

                const attributeMutator = target.resolveAttributeMutator(key)
                if (key in target && !attributeMutator)
                    return Reflect.get(target, key, receiver)

                return target.getAttribute(key)
            },
            set: (target, key, value, receiver) => {
                if (typeof key !== 'string')
                    return Reflect.set(target, key, value, receiver)

                const attributeMutator = target.resolveAttributeMutator(key)
                if (key in target && !attributeMutator)
                    return Reflect.set(target, key, value, receiver)

                target.setAttribute(key, value)

                return true
            },
        }) as this
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

    public static setFactory<TFactory extends ModelFactory<any, any>> (
        factoryClass: new () => TFactory
    ): void {
        this.factoryClass = factoryClass as unknown as new () => ModelFactory<any, any>
    }

    public static factory<TFactory extends ModelFactory<any, any>> (count?: number): TFactory {
        const factoryClass = this.factoryClass as (new () => TFactory) | undefined
        if (!factoryClass)
            throw new ArkormException(`Factory is not configured for model [${this.name}].`, {
                code: 'FACTORY_NOT_CONFIGURED',
                operation: 'factory',
                model: this.name,
            })

        const factory = new factoryClass()
        if (typeof count === 'number')
            factory.count(count)

        return factory
    }

    /**
     * Register a global scope for the model.
     *
     * @param name
     * @param scope
     */
    public static addGlobalScope (name: string, scope: GlobalScope): void {
        this.ensureOwnGlobalScopes()
        this.globalScopes[name] = scope
    }

    /**
     * Execute a callback without applying global scopes for the current model class.
     *
     * @param callback
     * @returns
     */
    public static async withoutGlobalScopes<T> (callback: () => T | Promise<T>): Promise<Awaited<T>> {
        const state = Model.getLifecycleState(this)
        state.globalScopesSuppressed += 1

        try {
            return await callback()
        } finally {
            state.globalScopesSuppressed = Math.max(0, state.globalScopesSuppressed - 1)
        }
    }

    /**
     * Remove a global scope by name.
     *
     * @param name
     */
    public static removeGlobalScope (name: string): void {
        this.ensureOwnGlobalScopes()
        delete this.globalScopes[name]
    }

    /**
     * Clear all global scopes for the model.
     */
    public static clearGlobalScopes (): void {
        this.globalScopes = {}
    }

    /**
     * Register an event listener for a model lifecycle event.
     *
     * @param event
     * @param listener
     */
    public static on<TModel extends Model = Model> (
        event: ModelEventName,
        listener: ModelEventListener<TModel>
    ): void {
        Model.ensureModelBooted(this as unknown as typeof Model)
        this.ensureOwnEventListeners()
        if (!this.eventListeners[event])
            this.eventListeners[event] = []

        this.eventListeners[event]?.push(listener as ModelEventListener<any>)
    }

    /**
     * Register a model lifecycle callback listener.
     *
     * @param event
     * @param listener
     */
    public static event<TModel extends Model = Model> (
        event: ModelEventName,
        listener: ModelEventListener<TModel>
    ): void {
        this.on(event, listener)
    }

    public static retrieved<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('retrieved', listener)
    }

    public static saving<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('saving', listener)
    }

    public static saved<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('saved', listener)
    }

    public static creating<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('creating', listener)
    }

    public static created<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('created', listener)
    }

    public static updating<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('updating', listener)
    }

    public static updated<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('updated', listener)
    }

    public static deleting<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('deleting', listener)
    }

    public static deleted<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('deleted', listener)
    }

    public static restoring<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('restoring', listener)
    }

    public static restored<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('restored', listener)
    }

    public static forceDeleting<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('forceDeleting', listener)
    }

    public static forceDeleted<TModel extends Model = Model> (listener: ModelEventListener<TModel>): void {
        this.event('forceDeleted', listener)
    }

    /**
     * Remove listeners for an event. If listener is omitted, all listeners for that event are removed.
     *
     * @param event
     * @param listener
     */
    public static off<TModel extends Model = Model> (
        event: ModelEventName,
        listener?: ModelEventListener<TModel>
    ): void {
        this.ensureOwnEventListeners()
        if (!listener) {
            delete this.eventListeners[event]

            return
        }

        this.eventListeners[event] = (this.eventListeners[event] || []).filter(
            registered => registered !== listener
        )
    }

    /**
     * Clears all event listeners for the model.
     */
    public static clearEventListeners (): void {
        this.eventListeners = {}
    }

    /**
     * Execute a callback while suppressing lifecycle events for all models.
     *
     * @param callback
     * @returns
     */
    public static async withoutEvents<T> (callback: () => T | Promise<T>): Promise<Awaited<T>> {
        Model.eventsSuppressed += 1

        try {
            return await callback()
        } finally {
            Model.eventsSuppressed = Math.max(0, Model.eventsSuppressed - 1)
        }
    }

    /**
     * Execute a callback within a transaction scope.
     * Nested calls reuse the active transaction client.
     *
     * @param callback
     * @param options
     * @returns
     */
    public static async transaction<T> (
        callback: (client: PrismaClientLike) => T | Promise<T>,
        options: PrismaTransactionOptions = {}
    ): Promise<Awaited<T>> {
        ensureArkormConfigLoading()

        return await runArkormTransaction(async (client) => {
            return await callback(client)
        }, options)
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

        const activeTransactionClient = getActiveTransactionClient()
        const runtimeClient = getRuntimePrismaClient()
        const sources = activeTransactionClient
            ? [activeTransactionClient, this.client, runtimeClient]
            : [this.client, runtimeClient]
        const resolved = candidates
            .flatMap(name => sources.map(source => source?.[name as never]))
            .find(candidate => isDelegateLike(candidate))

        if (!resolved)
            throw new MissingDelegateException(`Database delegate [${key}] is not configured.`, {
                operation: 'getDelegate',
                model: this.name,
                delegate: key,
                meta: {
                    candidates,
                },
            })

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
        Model.ensureModelBooted(this as unknown as typeof Model)

        let builder = new QueryBuilder<TModel, TDelegate>(
            (this as unknown as ModelStatic<TModel, TDelegate>).getDelegate(),
            this as unknown as ModelStatic<TModel, TDelegate>
        )

        const modelClass = this as unknown as typeof Model
        if (!Model.areGlobalScopesSuppressed(modelClass)) {
            modelClass.ensureOwnGlobalScopes()
            Object.values(modelClass.globalScopes).forEach((scope) => {
                const scoped = scope(builder as QueryBuilder<any, any>) as QueryBuilder<TModel, TDelegate> | void
                if (scoped && scoped !== builder)
                    builder = scoped
            })
        }

        return builder
    }

    /**
     * Boot hook for subclasses to register scopes or perform one-time setup.
     */
    protected static boot (): void {
    }

    /**
     * Booted hook for subclasses to register callbacks after boot logic runs.
     */
    protected static booted (): void {
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
     * Hydrate a model instance and dispatch the retrieved lifecycle event.
     *
     * @param this
     * @param attributes
     * @returns
     */
    public static async hydrateRetrieved<TModel> (
        this: ModelStatic<TModel, PrismaDelegateLike>,
        attributes: Record<string, unknown>
    ): Promise<TModel> {
        Model.ensureModelBooted(this as unknown as typeof Model)

        if (!Model.hasEventListeners(this as unknown as typeof Model, 'retrieved'))
            return this.hydrate(attributes)

        const model = this.hydrate(attributes)

        await Model.dispatchEvent(this as unknown as typeof Model, 'retrieved', model as unknown as Model)

        return model
    }

    /**
     * Hydrate multiple model instances and dispatch the retrieved lifecycle event for each.
     *
     * @param this
     * @param attributes
     * @returns
     */
    public static async hydrateManyRetrieved<TModel> (
        this: ModelStatic<TModel, PrismaDelegateLike>,
        attributes: Record<string, unknown>[]
    ): Promise<TModel[]> {
        Model.ensureModelBooted(this as unknown as typeof Model)

        if (!Model.hasEventListeners(this as unknown as typeof Model, 'retrieved'))
            return this.hydrateMany(attributes)

        const models = this.hydrateMany(attributes)

        await Promise.all(models.map(async (model: TModel) => {
            await Model.dispatchEvent(this as unknown as typeof Model, 'retrieved', model as unknown as Model)
        }))

        return models
    }

    /**
     * Fill the model's attributes from a plain object, using the 
     * setAttribute method to ensure that mutators and casts are applied. 
     * 
     * @param attributes 
     * @returns 
     */
    public fill (attributes: Partial<TAttributes>): this
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
    public getAttribute<TKey extends keyof TAttributes & string> (key: TKey): TAttributes[TKey]
    public getAttribute (key: string): unknown
    public getAttribute (key: string): unknown {
        const attributeMutator = this.resolveAttributeMutator(key)
        const mutator = this.resolveGetMutator(key)
        const cast = this.casts[key]
        let value = this.attributes[key]

        if (cast)
            value = resolveCast(cast).get(value)

        if (attributeMutator?.get)
            return attributeMutator.get.call(this, value)

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
    public setAttribute<TKey extends keyof TAttributes & string> (
        key: TKey,
        value: TAttributes[TKey]
    ): this
    public setAttribute (key: string, value: unknown): this
    public setAttribute (key: string, value: unknown): this {
        const attributeMutator = this.resolveAttributeMutator(key)
        const mutator = this.resolveSetMutator(key)
        const cast = this.casts[key]
        let resolved = value

        if (attributeMutator?.set)
            resolved = attributeMutator.set.call(this, resolved)
        else if (mutator)
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
            await Model.dispatchEvent(constructor as unknown as typeof Model, 'saving', this)
            await Model.dispatchEvent(constructor as unknown as typeof Model, 'creating', this)

            const model = await constructor.query().create(payload)
            this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)

            await Model.dispatchEvent(constructor as unknown as typeof Model, 'created', this)
            await Model.dispatchEvent(constructor as unknown as typeof Model, 'saved', this)

            return this
        }

        await Model.dispatchEvent(constructor as unknown as typeof Model, 'saving', this)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'updating', this)

        const model = await constructor.query().where({ id: identifier }).update(payload)
        this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)

        await Model.dispatchEvent(constructor as unknown as typeof Model, 'updated', this)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'saved', this)

        return this
    }

    /**
     * Save the model without dispatching lifecycle events.
     *
     * @returns
     */
    public async saveQuietly (): Promise<this> {
        return await Model.withoutEvents(() => this.save())
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
            throw new ArkormException('Cannot delete a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleting', this)
        const softDeleteConfig = constructor.getSoftDeleteConfig()
        if (softDeleteConfig.enabled) {
            const model = await constructor.query()
                .where({ id: identifier })
                .update({ [softDeleteConfig.column]: new Date() })
            this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)

            await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleted', this)

            return this
        }

        const deleted = await constructor.query().where({ id: identifier }).delete()
        this.fill((deleted as unknown as Model).getRawAttributes() as Partial<TAttributes>)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleted', this)

        return this
    }

    /**
     * Delete the model without dispatching lifecycle events.
     *
     * @returns
     */
    public async deleteQuietly (): Promise<this> {
        return await Model.withoutEvents(() => this.delete())
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
            throw new ArkormException('Cannot force delete a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'forceDeleting', this)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleting', this)

        const deleted = await constructor.query().withTrashed().where({ id: identifier }).delete()
        this.fill((deleted as unknown as Model).getRawAttributes() as Partial<TAttributes>)

        await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleted', this)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'forceDeleted', this)

        return this
    }

    /**
     * Force delete the model without dispatching lifecycle events.
     *
     * @returns
     */
    public async forceDeleteQuietly (): Promise<this> {
        return await Model.withoutEvents(() => this.forceDelete())
    }

    /**
     * Restore a soft-deleted model by setting the deleted at column to null.
     * 
     * @returns 
     */
    public async restore (): Promise<this> {
        const identifier = this.getAttribute('id')
        if (identifier == null)
            throw new ArkormException('Cannot restore a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>
        const softDeleteConfig = constructor.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return this

        await Model.dispatchEvent(constructor as unknown as typeof Model, 'restoring', this)

        const model = await constructor.query().withTrashed()
            .where({ id: identifier })
            .update({ [softDeleteConfig.column]: null })
        this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)

        await Model.dispatchEvent(constructor as unknown as typeof Model, 'restored', this)

        return this
    }

    /**
     * Restore the model without dispatching lifecycle events.
     *
     * @returns
     */
    public async restoreQuietly (): Promise<this> {
        return await Model.withoutEvents(() => this.restore())
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
    public getRawAttributes (): Partial<TAttributes> {
        return { ...this.attributes } as Partial<TAttributes>
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
     * Determine if another model represents the same persisted record.
     *
     * @param model
     * @returns
     */
    public is (model: unknown): boolean {
        if (!(model instanceof Model))
            return false

        if (this.constructor !== model.constructor)
            return false

        const identifier = this.getAttribute('id')
        const otherIdentifier = model.getAttribute('id')

        if (identifier == null || otherIdentifier == null)
            return false

        return identifier === otherIdentifier
    }

    /**
     * Determine if another model does not represent the same persisted record.
     *
     * @param model
     * @returns
     */
    public isNot (model: unknown): boolean {
        return !this.is(model)
    }

    /**
     * Determine if another model is the same in-memory instance.
     *
     * @param model
     * @returns
     */
    public isSame (model: unknown): boolean {
        return this === model
    }

    /**
     * Determine if another model is not the same in-memory instance.
     *
     * @param model
     * @returns
     */
    public isNotSame (model: unknown): boolean {
        return !this.isSame(model)
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
     * Resolve an Attribute object mutator method for a given key, if it exists.
     *
     * @param key
     * @returns
     */
    private resolveAttributeMutator (key: string): Attribute | null {
        if (key === 'constructor')
            return null

        const methodName = `${str(key).camel()}`
        const prototype = Object.getPrototypeOf(this) as Record<string, unknown> | null
        if (!prototype)
            return null

        const method = prototype[methodName]
        if (typeof method !== 'function')
            return null

        const baseMethod = (Model.prototype as unknown as Record<string, unknown>)[methodName]
        if (method === baseMethod)
            return null

        const resolved = (method as () => unknown).call(this)
        if (Attribute.isAttribute(resolved))
            return resolved

        return null
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
     * Ensures global scopes are own properties on subclass constructors.
     */
    private static ensureOwnGlobalScopes (): void {
        if (!Object.prototype.hasOwnProperty.call(this, 'globalScopes'))
            this.globalScopes = { ...(this.globalScopes || {}) }
    }

    /**
     * Ensures event listeners are own properties on subclass constructors.
     */
    private static ensureOwnEventListeners (): void {
        if (!Object.prototype.hasOwnProperty.call(this, 'eventListeners'))
            this.eventListeners = { ...(this.eventListeners || {}) }
    }

    /**
     * Resolve lifecycle state for the provided model class.
     *
     * @param modelClass
     * @returns
     */
    private static getLifecycleState (modelClass: typeof Model): ModelLifecycleState {
        const existing = Model.lifecycleStates.get(modelClass)
        if (existing)
            return existing

        const state: ModelLifecycleState = {
            booted: false,
            booting: false,
            globalScopesSuppressed: 0,
        }

        Model.lifecycleStates.set(modelClass, state)

        return state
    }

    /**
     * Ensure the target model class has executed its boot lifecycle.
     *
     * @param modelClass
     */
    private static ensureModelBooted (modelClass: typeof Model): void {
        const state = Model.getLifecycleState(modelClass)
        if (state.booted || state.booting)
            return

        state.booting = true

        try {
            const boot = modelClass.boot
            if (boot !== Model.boot)
                boot.call(modelClass)

            const booted = modelClass.booted
            if (booted !== Model.booted)
                booted.call(modelClass)

            state.booted = true
        } finally {
            state.booting = false
        }
    }

    /**
     * Determine if global scopes are currently suppressed for the model class.
     *
     * @param modelClass
     * @returns
     */
    private static areGlobalScopesSuppressed (modelClass: typeof Model): boolean {
        return Model.getLifecycleState(modelClass).globalScopesSuppressed > 0
    }

    /**
     * Resolve configured class-based event handlers for a lifecycle event.
     *
     * @param modelClass
     * @param event
     * @returns
     */
    private static resolveDispatchedEventListeners (
        modelClass: typeof Model,
        event: ModelEventName,
    ): ModelEventListener<any>[] {
        const configured = modelClass.dispatchesEvents[event]
        if (!configured)
            return []

        const entries = Array.isArray(configured) ? configured : [configured]

        return entries.map((entry) => {
            const handler = typeof entry === 'function'
                ? new (entry as ModelEventHandlerConstructor<any>)()
                : entry

            if (!handler || typeof handler.handle !== 'function') {
                throw new ArkormException(`Invalid event handler configured for [${modelClass.name}.${event}].`)
            }

            return async (model: Model) => {
                await handler.handle(model)
            }
        })
    }

    /**
     * Determine whether a lifecycle event has any registered listeners.
     *
     * @param modelClass
     * @param event
     * @returns
     */
    private static hasEventListeners (
        modelClass: typeof Model,
        event: ModelEventName,
    ): boolean {
        if (Model.eventsSuppressed > 0)
            return false

        modelClass.ensureOwnEventListeners()

        const registeredListeners = modelClass.eventListeners[event] || []
        if (registeredListeners.length > 0)
            return true

        const configuredDispatchers = modelClass.dispatchesEvents[event]
        if (!configuredDispatchers)
            return false

        return Array.isArray(configuredDispatchers)
            ? configuredDispatchers.length > 0
            : true
    }

    /**
     * Dispatches lifecycle events to registered listeners.
     *
     * @param modelClass
     * @param event
     * @param model
     */
    private static async dispatchEvent (
        modelClass: typeof Model,
        event: ModelEventName,
        model: Model
    ): Promise<void> {
        Model.ensureModelBooted(modelClass)
        if (!Model.hasEventListeners(modelClass, event))
            return

        const listeners = [
            ...Model.resolveDispatchedEventListeners(modelClass, event),
            ...(modelClass.eventListeners[event] || []),
        ]

        for (const listener of listeners)
            await listener(model)
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
