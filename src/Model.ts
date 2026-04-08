import {
    BelongsToManyRelation,
    BelongsToRelation,
    HasManyRelation,
    HasManyThroughRelation,
    HasOneRelation,
    HasOneThroughRelation,
    MorphManyRelation,
    MorphOneRelation,
    MorphToManyRelation,
    Relation,
} from './relationship'
import { PrismaDatabaseAdapter, createPrismaCompatibilityAdapter } from './adapters/PrismaDatabaseAdapter'
import type { ModelFactory } from './database/factories'
import type { DatabaseAdapter } from './types/adapter'
import type {
    CastMap,
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
    getRuntimeAdapter,
    getRuntimePrismaClient,
    getUserConfig,
    isDelegateLike,
    runArkormTransaction,
} from './helpers/runtime-config'

import { DelegateForModelSchema, GlobalScope, ModelAttributesOf, ModelCreateData, ModelEventDispatcher, ModelEventHandlerConstructor, ModelEventListener, ModelEventName, ModelLifecycleState, ModelMetadata, ModelUpdateData, RelatedModelClass, RelationMetadata } from './types'
import { Attribute } from './Attribute'
import { getPersistedTableMetadata, resolvePersistedMetadataFeatures } from './helpers/column-mappings'
import { QueryBuilder } from './QueryBuilder'
import { resolveCast } from './casts'
import { str } from '@h3ravel/support'
import { ArkormException } from './Exceptions/ArkormException'
import { MissingDelegateException } from './Exceptions/MissingDelegateException'
import { SetBasedEagerLoader } from './relationship/SetBasedEagerLoader'

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
    private static readonly emittedDeprecationWarnings = new Set<string>()
    private static eventsSuppressed = 0

    protected static factoryClass?: new () => ModelFactory<any, any>
    protected static adapter?: DatabaseAdapter
    protected static client: Record<string, unknown>
    protected static delegate: string
    protected static table?: string
    protected static primaryKey = 'id'
    protected static columns: Record<string, string> = {}
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
    protected original: Record<string, unknown>
    protected changes: Record<string, unknown>
    protected readonly touchedAttributes: Set<string>

    public constructor(attributes: Record<string, unknown> = {}) {
        this.attributes = {}
        this.original = {}
        this.changes = {}
        this.touchedAttributes = new Set()
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

    private static emitDeprecationWarning (code: string, message: string): void {
        if (Model.emittedDeprecationWarnings.has(code))
            return

        Model.emittedDeprecationWarnings.add(code)
        process.emitWarning(message, {
            type: 'DeprecationWarning',
            code,
        })
    }

    /**
     * Set the Prisma client delegates for all models.
     *
     * @deprecated Use Model.setAdapter(createPrismaDatabaseAdapter(...)) or another
     * adapter-first bootstrap path instead.
     *
     * @param client
     */
    protected static setClient (
        client: Record<string, unknown>
    ): void {
        Model.emitDeprecationWarning(
            'ARKORM_SET_CLIENT_DEPRECATED',
            'Model.setClient() is deprecated and will be removed in Arkorm 3.0. Use Model.setAdapter(createPrismaDatabaseAdapter(...)) or another adapter-first setup path instead.'
        )

        this.client = client
    }

    public static setAdapter (adapter?: DatabaseAdapter): void {
        this.adapter = adapter
    }

    public static getTable (): string {
        return this.table || this.delegate || `${str(this.name).camel().plural()}`
    }

    public static getPrimaryKey (): string {
        return this.primaryKey || 'id'
    }

    public static getColumnMap (): Record<string, string> {
        const adapter = this.getAdapter()
        const shouldStrictlyValidatePersistedMappings = Boolean(adapter) && !(adapter instanceof PrismaDatabaseAdapter)
        const persistedMetadata = getPersistedTableMetadata(this.getTable(), {
            features: resolvePersistedMetadataFeatures(getUserConfig('features')),
            strict: shouldStrictlyValidatePersistedMappings,
        })

        return {
            ...persistedMetadata.columns,
            ...this.columns,
        }
    }

    public static getColumnName (attribute: string): string {
        return this.getColumnMap()[attribute] ?? attribute
    }

    public static getModelMetadata (): ModelMetadata {
        const adapter = this.getAdapter()
        const shouldStrictlyValidatePersistedMappings = Boolean(adapter) && !(adapter instanceof PrismaDatabaseAdapter)
        const persistedMetadata = getPersistedTableMetadata(this.getTable(), {
            features: resolvePersistedMetadataFeatures(getUserConfig('features')),
            strict: shouldStrictlyValidatePersistedMappings,
        })

        return {
            table: this.getTable(),
            primaryKey: this.getPrimaryKey(),
            columns: {
                ...persistedMetadata.columns,
                ...this.columns,
            },
            softDelete: this.getSoftDeleteConfig(),
            primaryKeyGeneration: persistedMetadata.primaryKeyGeneration?.column === this.getPrimaryKey()
                ? {
                    strategy: persistedMetadata.primaryKeyGeneration.strategy,
                    prismaDefault: persistedMetadata.primaryKeyGeneration.prismaDefault,
                    databaseDefault: persistedMetadata.primaryKeyGeneration.databaseDefault,
                    runtimeFactory: persistedMetadata.primaryKeyGeneration.runtimeFactory,
                }
                : undefined,
        }
    }

    public static getRelationMetadata (name: string): RelationMetadata | null {
        const resolver = (this.prototype as unknown as Record<string, unknown>)[name]
        if (typeof resolver !== 'function')
            return null

        const instance = new (this as unknown as new (attributes?: Record<string, unknown>) => Model)({})
        const relation = (resolver as (this: Model) => unknown).call(instance)
        if (!(relation instanceof Relation))
            return null

        return relation.getMetadata()
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

        const key = delegate || this.delegate || this.getTable()
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

    public static getAdapter (): DatabaseAdapter | undefined {
        ensureArkormConfigLoading()

        if (this.adapter)
            return this.adapter

        const runtimeAdapter = getRuntimeAdapter()
        if (runtimeAdapter)
            return runtimeAdapter

        const client = getActiveTransactionClient() ?? this.client ?? getRuntimePrismaClient()
        if (!client || typeof client !== 'object')
            return undefined

        return createPrismaCompatibilityAdapter(client)
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
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<
            TModel extends Model<infer TSchema, any> ? TSchema : Record<string, any>,
            TModel extends Model<any, infer TAttributes> ? TAttributes : Record<string, any>
        >
    > (
        this: TThis
    ): QueryBuilder<TModel, TDelegate> {
        Model.ensureModelBooted(this as unknown as typeof Model)

        const modelStatic = this as unknown as ModelStatic<TModel, TDelegate>

        let builder = new QueryBuilder<TModel, TDelegate>(
            modelStatic,
            modelStatic.getAdapter()
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
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<
            TModel extends Model<infer TSchema, any> ? TSchema : Record<string, any>,
            TModel extends Model<any, infer TAttributes> ? TAttributes : Record<string, any>
        >
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
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<
            TModel extends Model<infer TSchema, any> ? TSchema : Record<string, any>,
            TModel extends Model<any, infer TAttributes> ? TAttributes : Record<string, any>
        >
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
        TDelegate extends PrismaDelegateLike = DelegateForModelSchema<
            TModel extends Model<infer TSchema, any> ? TSchema : Record<string, any>,
            TModel extends Model<any, infer TAttributes> ? TAttributes : Record<string, any>
        >
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
        const model = new this(attributes)
            ; (model as unknown as Model).syncOriginal()
            ; (model as unknown as Model).syncChanges({})

        return model
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
        this.touchedAttributes.add(key)

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
        const constructor = this.constructor as unknown as ModelStatic<this>
        const primaryKey = constructor.getPrimaryKey()
        const identifier = this.getAttribute(primaryKey) as string | number | undefined
        const payload = this.getRawAttributes()
        const previousOriginal = this.getOriginal()
        if (identifier == null) {
            await Model.dispatchEvent(constructor as unknown as typeof Model, 'saving', this)
            await Model.dispatchEvent(constructor as unknown as typeof Model, 'creating', this)

            const model = await constructor.query().create(payload as ModelCreateData<this, PrismaDelegateLike>)
            this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)
            this.syncChanges(previousOriginal)
            this.syncOriginal()

            await Model.dispatchEvent(constructor as unknown as typeof Model, 'created', this)
            await Model.dispatchEvent(constructor as unknown as typeof Model, 'saved', this)

            return this
        }

        await Model.dispatchEvent(constructor as unknown as typeof Model, 'saving', this)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'updating', this)

        const model = await constructor.query().where({ [primaryKey]: identifier }).update(payload as ModelUpdateData<this, PrismaDelegateLike>)
        this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)
        this.syncChanges(previousOriginal)
        this.syncOriginal()

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
        const constructor = this.constructor as unknown as ModelStatic<this>
        const primaryKey = constructor.getPrimaryKey()
        const identifier = this.getAttribute(primaryKey)
        if (identifier == null)
            throw new ArkormException(primaryKey === 'id'
                ? 'Cannot delete a model without an id.'
                : `Cannot delete a model without a [${primaryKey}] value.`)

        const previousOriginal = this.getOriginal()
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleting', this)
        const softDeleteConfig = constructor.getSoftDeleteConfig()
        if (softDeleteConfig.enabled) {
            const model = await constructor.query()
                .where({ [primaryKey]: identifier })
                .update({ [softDeleteConfig.column]: new Date() } as ModelUpdateData<this, PrismaDelegateLike>)
            this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)
            this.syncChanges(previousOriginal)
            this.syncOriginal()

            await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleted', this)

            return this
        }

        const deleted = await constructor.query().where({ [primaryKey]: identifier }).delete()
        this.fill((deleted as unknown as Model).getRawAttributes() as Partial<TAttributes>)
        this.syncChanges(previousOriginal)
        this.syncOriginal()
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
        const constructor = this.constructor as unknown as ModelStatic<this>
        const primaryKey = constructor.getPrimaryKey()
        const identifier = this.getAttribute(primaryKey)
        if (identifier == null)
            throw new ArkormException(primaryKey === 'id'
                ? 'Cannot force delete a model without an id.'
                : `Cannot force delete a model without a [${primaryKey}] value.`)

        const previousOriginal = this.getOriginal()
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'forceDeleting', this)
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'deleting', this)

        const deleted = await constructor.query().withTrashed().where({ [primaryKey]: identifier }).delete()
        this.fill((deleted as unknown as Model).getRawAttributes() as Partial<TAttributes>)
        this.syncChanges(previousOriginal)
        this.syncOriginal()

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
        const constructor = this.constructor as unknown as ModelStatic<this>
        const primaryKey = constructor.getPrimaryKey()
        const identifier = this.getAttribute(primaryKey)
        if (identifier == null)
            throw new ArkormException(primaryKey === 'id'
                ? 'Cannot restore a model without an id.'
                : `Cannot restore a model without a [${primaryKey}] value.`)

        const softDeleteConfig = constructor.getSoftDeleteConfig()
        if (!softDeleteConfig.enabled)
            return this

        const previousOriginal = this.getOriginal()
        await Model.dispatchEvent(constructor as unknown as typeof Model, 'restoring', this)

        const model = await constructor.query().withTrashed()
            .where({ [primaryKey]: identifier })
            .update({ [softDeleteConfig.column]: null } as ModelUpdateData<this, PrismaDelegateLike>)
        this.fill((model as unknown as Model).getRawAttributes() as Partial<TAttributes>)
        this.syncChanges(previousOriginal)
        this.syncOriginal()

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

        await new SetBasedEagerLoader([
            this as unknown as {
                getAttribute: (key: string) => unknown
                setLoadedRelation: (name: string, value: unknown) => void
            },
        ], relationMap).load()

        return this
    }

    public setLoadedRelation (name: string, value: unknown): this {
        this.attributes[name] = value

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
     * Get the model's original persisted attributes.
     *
     * @returns
     */
    public getOriginal (): Partial<TAttributes>
    /**
     * @param key The attribute key to retrieve the original value for.
     */
    public getOriginal<TKey extends keyof TAttributes & string> (key: TKey): TAttributes[TKey] | undefined
    public getOriginal (key?: string): unknown {
        if (typeof key === 'string')
            return Model.cloneAttributeValue(this.original[key])

        return Object.entries(this.original).reduce<Record<string, unknown>>((all, [originalKey, value]) => {
            all[originalKey] = Model.cloneAttributeValue(value)

            return all
        }, {}) as Partial<TAttributes>
    }

    /**
     * Determine whether the model has unsaved attribute changes.
     *
     * @param keys
     * @returns
     */
    public isDirty (keys?: string | string[]): boolean {
        return Object.keys(this.getDirtyAttributes(keys)).length > 0
    }

    /**
     * Determine whether the model has no unsaved attribute changes.
     *
     * @param keys
     * @returns
     */
    public isClean (keys?: string | string[]): boolean {
        return !this.isDirty(keys)
    }

    /**
     * Determine whether the model changed during the last successful persistence operation.
     *
     * @param keys
     * @returns
     */
    public wasChanged (keys?: string | string[]): boolean {
        const keyList = this.normalizeAttributeKeys(keys)
        if (keyList.length === 0)
            return Object.keys(this.changes).length > 0

        return keyList.some(key => Object.prototype.hasOwnProperty.call(this.changes, key))
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

        const constructor = this.constructor as unknown as ModelStatic<this>
        const primaryKey = constructor.getPrimaryKey()
        const identifier = this.getAttribute(primaryKey)
        const otherIdentifier = model.getAttribute(primaryKey)

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
        localKey?: string
    ): HasOneRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new HasOneRelation<this, InstanceType<TRelatedClass>>(this, related, foreignKey, localKey ?? constructor.getPrimaryKey())
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
        localKey?: string
    ): HasManyRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new HasManyRelation<this, InstanceType<TRelatedClass>>(this, related, foreignKey, localKey ?? constructor.getPrimaryKey())
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
        ownerKey?: string
    ): BelongsToRelation<this, InstanceType<TRelatedClass>> {
        return new BelongsToRelation<this, InstanceType<TRelatedClass>>(this, related, foreignKey, ownerKey ?? related.getPrimaryKey())
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
        parentKey?: string,
        relatedKey?: string
    ): BelongsToManyRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new BelongsToManyRelation<this, InstanceType<TRelatedClass>>(
            this,
            related,
            throughDelegate,
            foreignPivotKey,
            relatedPivotKey,
            parentKey ?? constructor.getPrimaryKey(),
            relatedKey ?? related.getPrimaryKey(),
        )
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
        localKey?: string,
        secondLocalKey = 'id'
    ): HasOneThroughRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new HasOneThroughRelation(this, related, throughDelegate, firstKey, secondKey, localKey ?? constructor.getPrimaryKey(), secondLocalKey)
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
        localKey?: string,
        secondLocalKey = 'id'
    ): HasManyThroughRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new HasManyThroughRelation(this, related, throughDelegate, firstKey, secondKey, localKey ?? constructor.getPrimaryKey(), secondLocalKey)
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
        localKey?: string
    ): MorphOneRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new MorphOneRelation(this, related, morphName, localKey ?? constructor.getPrimaryKey())
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
        localKey?: string
    ): MorphManyRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new MorphManyRelation(this, related, morphName, localKey ?? constructor.getPrimaryKey())
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
        parentKey?: string,
        relatedKey?: string
    ): MorphToManyRelation<this, InstanceType<TRelatedClass>> {
        const constructor = this.constructor as unknown as typeof Model

        return new MorphToManyRelation(
            this,
            related,
            throughDelegate,
            morphName,
            relatedPivotKey,
            parentKey ?? constructor.getPrimaryKey(),
            relatedKey ?? related.getPrimaryKey(),
        )
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
     * Build a map of dirty attributes, optionally limited to specific keys.
     *
     * @param keys
     * @returns
     */
    private getDirtyAttributes (keys?: string | string[]): Record<string, unknown> {
        const requestedKeys = this.normalizeAttributeKeys(keys)
        const trackedKeys = requestedKeys.length > 0
            ? requestedKeys
            : Array.from(new Set([
                ...Object.keys(this.original),
                ...this.touchedAttributes,
            ]))

        return trackedKeys.reduce<Record<string, unknown>>((dirty, key) => {
            const currentValue = this.attributes[key]
            const originalValue = this.original[key]
            const hasCurrent = Object.prototype.hasOwnProperty.call(this.attributes, key)
            const hasOriginal = Object.prototype.hasOwnProperty.call(this.original, key)

            if (!hasCurrent && !hasOriginal)
                return dirty

            if (hasCurrent !== hasOriginal || !Model.areAttributeValuesEqual(currentValue, originalValue))
                dirty[key] = Model.cloneAttributeValue(currentValue)

            return dirty
        }, {})
    }

    /**
     * Normalize a key or key list for dirty/change lookups.
     *
     * @param keys
     * @returns
     */
    private normalizeAttributeKeys (keys?: string | string[]): string[] {
        if (typeof keys === 'undefined')
            return []

        return Array.isArray(keys) ? keys : [keys]
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
     * Clone an attribute value to keep snapshot state isolated from live mutations.
     *
     * @param value
     * @returns
     */
    private static cloneAttributeValue (value: unknown): unknown {
        if (value instanceof Date)
            return new Date(value.getTime())

        if (Array.isArray(value))
            return value.map(item => Model.cloneAttributeValue(item))

        if (value && typeof value === 'object') {
            return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((all, [key, nestedValue]) => {
                all[key] = Model.cloneAttributeValue(nestedValue)

                return all
            }, {})
        }

        return value
    }

    /**
     * Compare attribute values for dirty/change detection.
     *
     * @param left
     * @param right
     * @returns
     */
    private static areAttributeValuesEqual (left: unknown, right: unknown): boolean {
        if (left === right)
            return true

        if (left instanceof Date && right instanceof Date)
            return left.getTime() === right.getTime()

        if (Array.isArray(left) && Array.isArray(right)) {
            if (left.length !== right.length)
                return false

            return left.every((value, index) => Model.areAttributeValuesEqual(value, right[index]))
        }

        if (left && right && typeof left === 'object' && typeof right === 'object') {
            const leftEntries = Object.entries(left as Record<string, unknown>)
            const rightEntries = Object.entries(right as Record<string, unknown>)
            if (leftEntries.length !== rightEntries.length)
                return false

            return leftEntries.every(([key, value]) => {
                return Object.prototype.hasOwnProperty.call(right as Record<string, unknown>, key)
                    && Model.areAttributeValuesEqual(value, (right as Record<string, unknown>)[key])
            })
        }

        return false
    }

    /**
     * Sync the original snapshot to the model's current raw attributes.
     */
    private syncOriginal (): void {
        this.original = Object.entries(this.attributes).reduce<Record<string, unknown>>((all, [key, value]) => {
            all[key] = Model.cloneAttributeValue(value)

            return all
        }, {})
        this.touchedAttributes.clear()
    }

    /**
     * Sync the last-changed snapshot from a previous original state.
     *
     * @param previousOriginal
     */
    private syncChanges (previousOriginal: Record<string, unknown>): void {
        this.changes = Object.entries(this.getDirtyAttributes()).reduce<Record<string, unknown>>((all, [key, value]) => {
            if (!Object.prototype.hasOwnProperty.call(previousOriginal, key)
                || !Model.areAttributeValuesEqual(value, previousOriginal[key])) {
                all[key] = Model.cloneAttributeValue(value)
            }

            return all
        }, {})
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
