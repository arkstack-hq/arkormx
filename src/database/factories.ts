import type {
  FactoryAttributes,
  FactoryCallback,
  FactoryDefinition,
  FactoryDefinitionAttributes,
  FactoryModelConstructor,
  FactoryRelationshipResolver,
  FactoryState,
  MaybePromise,
  ModelAttributes,
} from '../types'

import { Model } from '../Model'
import { str } from '@h3ravel/support'

/**
 * Base class for defining model factories.
 * Not meant to be used directly.
 *
 * @template TModel The type of model the factory creates.
 * @template TAttributes The type of attributes used to create the model.
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export abstract class ModelFactory<
  TModel,
  TAttributes extends FactoryAttributes = Partial<ModelAttributes<TModel>>,
> {
  private amount = 1
  private sequence = 0
  private states: FactoryState<TAttributes>[] = []
  private configured = false
  private afterMakingCallbacks: FactoryCallback<TModel>[] = []
  private afterCreatingCallbacks: FactoryCallback<TModel>[] = []
  private hasRelations: Array<{ factory: ModelFactory<any, any>; relationship?: string }> = []
  private forRelations: Array<{ related: ModelFactory<any, any> | Model; relationship?: string }> =
    []
  private attachedRelations: Array<{
    related: ModelFactory<any, any> | Model | Model[]
    pivot: Record<string, unknown>
    relationship?: string
  }> = []
  private recyclePool = new Map<FactoryModelConstructor<unknown>, Model[]>()
  private recycleOffsets = new Map<FactoryModelConstructor<unknown>, number>()
  private injectedModel?: FactoryModelConstructor<TModel>

  protected model?: FactoryModelConstructor<TModel>
  protected abstract definition(
    sequence: number,
  ): MaybePromise<FactoryDefinitionAttributes<TAttributes>>

  /**
   * Configure states and lifecycle callbacks for each new factory instance.
   */
  protected configure(): void {}

  /**
   * Supply the model constructor that this factory should create.
   *
   * Model.factory() calls this automatically, allowing a factory referenced by
   * a model's factoryClass to use a type-only model import and avoid a runtime
   * model -> factory -> model cycle. Directly instantiated factories may call
   * this method explicitly or continue defining the protected model property.
   *
   * @param model
   * @returns
   */
  public setModel(model: FactoryModelConstructor<TModel>): this {
    this.injectedModel = model

    return this
  }

  /**
   * Set the number of models to create.
   *
   * @param amount
   * @returns
   */
  public count(amount: number): this {
    this.ensureConfigured()
    this.amount = Math.max(1, Math.floor(amount))

    return this
  }

  /**
   * Define a state transformation for the factory.
   * States are applied in the order they were defined.
   *
   * @param resolver A function that takes the current attributes and sequence number, and returns the transformed attributes.
   * @returns The factory instance for chaining.
   */
  public state(resolver: FactoryState<TAttributes>): this {
    this.ensureConfigured()
    this.states.push(resolver)

    return this
  }

  /**
   * Register a callback that runs after a model is made.
   *
   * @param callback
   * @returns
   */
  public afterMaking(callback: FactoryCallback<TModel>): this {
    this.ensureConfigured()
    this.afterMakingCallbacks.push(callback)

    return this
  }

  /**
   * Register a callback that runs after a model is persisted.
   *
   * @param callback
   * @returns
   */
  public afterCreating(callback: FactoryCallback<TModel>): this {
    this.ensureConfigured()
    this.afterCreatingCallbacks.push(callback)

    return this
  }

  /**
   * Create a new model instance without saving it to the database.
   *
   * @param overrides
   * @returns
   */
  public make(overrides: Partial<TAttributes> = {}): TModel {
    this.ensureConfigured()
    const attributes = this.buildAttributes(overrides)
    const ModelConstructor = this.getModelConstructor()
    const model = new ModelConstructor(attributes as Record<string, unknown>)
    this.runCallbacksSync(this.afterMakingCallbacks, model, 'afterMaking')

    return model
  }

  /**
   * Create a new model instance from an async factory definition without
   * saving it to the database.
   *
   * @param overrides
   * @returns
   */
  public async makeAsync(overrides: Partial<TAttributes> = {}): Promise<TModel> {
    this.ensureConfigured()
    const attributes = await this.buildAttributesAsync(overrides)
    const ModelConstructor = this.getModelConstructor()
    const model = new ModelConstructor(attributes as Record<string, unknown>)
    await this.runCallbacks(this.afterMakingCallbacks, model)

    return model
  }

  /**
   * Create multiple model instances without saving them to the database.
   *
   * @param amount
   * @param overrides
   * @returns
   */
  public makeMany(amount = this.amount, overrides: Partial<TAttributes> = {}): TModel[] {
    const total = Math.max(1, Math.floor(amount))

    return Array.from({ length: total }, () => this.make(overrides))
  }

  /**
   * Create multiple model instances from async factory definitions without
   * saving them to the database.
   *
   * @param amount
   * @param overrides
   * @returns
   */
  public async makeManyAsync(
    amount = this.amount,
    overrides: Partial<TAttributes> = {},
  ): Promise<TModel[]> {
    const total = Math.max(1, Math.floor(amount))
    const models: TModel[] = []

    for (let index = 0; index < total; index++) models.push(await this.makeAsync(overrides))

    return models
  }

  /**
   * Create a new model instance and save it to the database.
   *
   * @param overrides
   * @returns
   */
  public async create(overrides: Partial<TAttributes> = {}): Promise<TModel> {
    return await this.createPersisted(overrides)
  }

  /**
   * Create multiple model instances and save them to the database.
   *
   * @param amount
   * @param overrides
   * @returns
   */
  public async createMany(
    amount = this.amount,
    overrides: Partial<TAttributes> = {},
  ): Promise<TModel[]> {
    this.ensureConfigured()
    const total = Math.max(1, Math.floor(amount))
    const models: TModel[] = []

    for (let index = 0; index < total; index++) models.push(await this.create(overrides))

    return models
  }

  /**
   * Create related models through a has-one or has-many relationship.
   *
   * @param factory
   * @param relationship
   * @returns
   */
  public has<F extends ModelFactory<any, any>>(factory: F, relationship?: string): this {
    this.ensureConfigured()
    this.hasRelations.push({ factory, relationship })

    return this
  }

  /**
   * Associate the created model with a parent model or factory.
   *
   * @param related
   * @param relationship
   * @returns
   */
  public for(related: ModelFactory<any, any> | Model, relationship?: string): this {
    this.ensureConfigured()
    this.forRelations.push({ related, relationship })

    return this
  }

  /**
   * Create or reuse related models and attach them through a many-to-many relationship.
   *
   * @param related
   * @param pivot
   * @param relationship
   * @returns
   */
  public hasAttached(
    related: ModelFactory<any, any> | Model | Model[],
    pivot: Record<string, unknown> = {},
    relationship?: string,
  ): this {
    this.ensureConfigured()
    this.attachedRelations.push({ related, pivot, relationship })

    return this
  }

  /**
   * Reuse existing models when resolving factory-backed relationships.
   *
   * @param models
   * @returns
   */
  public recycle(models: Model | Model[] | { all: () => Model[] }): this {
    this.ensureConfigured()
    const items = Array.isArray(models) ? models : 'all' in models ? models.all() : [models]

    items.forEach((model) => {
      const constructor = model.constructor as FactoryModelConstructor<unknown>
      const existing = this.recyclePool.get(constructor) ?? []
      if (!existing.includes(model)) existing.push(model)
      this.recyclePool.set(constructor, existing)
    })

    return this
  }

  /**
   * Get the model contgructor
   *
   * @returns
   */
  public getModelConstructor(): FactoryModelConstructor<TModel> {
    const model = this.injectedModel ?? this.model
    if (!model)
      throw new Error(
        'Factory model is not configured. Use Model.factory(), call factory.setModel(Model), or define the protected model property.',
      )

    return model
  }

  /**
   * Build the attributes for a model instance, applying the factory
   * definition and any defined states, and merging in any overrides.
   *
   * @param overrides
   * @returns
   */
  private buildAttributes(overrides: Partial<TAttributes>): TAttributes {
    const sequence = this.sequence
    this.sequence += 1

    let resolved = this.definition(sequence)
    if (ModelFactory.isPromiseLike(resolved)) {
      this.sequence = sequence
      throw new Error(
        'This factory has an async definition. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.',
      )
    }

    for (const state of this.states) {
      resolved = state(resolved as TAttributes, sequence)
      if (ModelFactory.isPromiseLike(resolved)) {
        this.sequence = sequence
        throw new Error(
          'This factory has an async state. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.',
        )
      }
    }

    const attributes = {
      ...resolved,
      ...overrides,
    } as FactoryDefinitionAttributes<TAttributes>

    return this.resolveAttributesSync(this.applyBelongsToRelationshipsSync(attributes))
  }

  /**
   * Build attributes for async and sync factory definitions.
   *
   * @param overrides
   * @returns
   */
  private async buildAttributesAsync(overrides: Partial<TAttributes>): Promise<TAttributes> {
    const sequence = this.sequence
    this.sequence += 1

    let resolved = await this.definition(sequence)
    for (const state of this.states) resolved = await state(resolved as TAttributes, sequence)

    const attributes = {
      ...resolved,
      ...overrides,
    } as FactoryDefinitionAttributes<TAttributes>

    return await this.resolveAttributesAsync(await this.applyBelongsToRelationships(attributes))
  }

  private ensureConfigured(): void {
    if (this.configured) return

    this.configured = true
    this.configure()
  }

  private resolveAttributesSync(attributes: FactoryDefinitionAttributes<TAttributes>): TAttributes {
    const resolved: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(attributes)) {
      if (ModelFactory.isFactory(value))
        throw new Error(
          'This factory definition creates a related model. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.',
        )

      const next =
        typeof value === 'function'
          ? (value as (attributes: TAttributes) => unknown)(resolved as TAttributes)
          : value

      if (ModelFactory.isPromiseLike(next))
        throw new Error(
          'This factory has an async attribute resolver. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.',
        )

      resolved[key] = next
    }

    return resolved as TAttributes
  }

  private async resolveAttributesAsync(
    attributes: FactoryDefinitionAttributes<TAttributes>,
  ): Promise<TAttributes> {
    const resolved: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(attributes)) {
      if (ModelFactory.isFactory(value)) {
        resolved[key] = await this.resolveFactoryKey(value as ModelFactory<any, any>)
        continue
      }

      resolved[key] =
        typeof value === 'function'
          ? await (value as (attributes: TAttributes) => MaybePromise<unknown>)(
              resolved as TAttributes,
            )
          : value
    }

    return resolved as TAttributes
  }

  private applyBelongsToRelationshipsSync(
    attributes: FactoryDefinitionAttributes<TAttributes>,
  ): FactoryDefinitionAttributes<TAttributes> {
    return this.forRelations.reduce<FactoryDefinitionAttributes<TAttributes>>(
      (resolved, relation) => {
        if (relation.related instanceof Model)
          return this.mergeBelongsToAttribute(resolved, relation.related, relation.relationship)

        throw new Error(
          'This factory creates a parent model. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.',
        )
      },
      attributes,
    )
  }

  private async applyBelongsToRelationships(
    attributes: FactoryDefinitionAttributes<TAttributes>,
  ): Promise<FactoryDefinitionAttributes<TAttributes>> {
    let resolved = attributes

    for (const relation of this.forRelations) {
      const related =
        relation.related instanceof Model
          ? relation.related
          : await this.resolveFactoryModel(relation.related)

      resolved = this.mergeBelongsToAttribute(resolved, related, relation.relationship)
    }

    return resolved
  }

  private mergeBelongsToAttribute(
    attributes: FactoryDefinitionAttributes<TAttributes>,
    related: Model,
    relationship?: string,
  ): FactoryDefinitionAttributes<TAttributes> {
    const relationName = relationship ?? `${str(related.constructor.name).camel().singular()}`
    const model = this.getModelConstructor()
    const metadata = model.getRelationMetadata?.(relationName) as {
      type?: string
      foreignKey?: string
      ownerKey?: string
    } | null

    if (metadata?.type !== 'belongsTo' || !metadata.foreignKey || !metadata.ownerKey)
      throw new Error(
        `Factory relationship [${relationName}] is not a belongsTo relation on [${model.name}].`,
      )

    return {
      ...attributes,
      [metadata.foreignKey]: related.getAttribute(metadata.ownerKey),
    }
  }

  private async createPersisted(
    overrides: Partial<TAttributes>,
    persist?: (model: TModel) => Promise<TModel>,
  ): Promise<TModel> {
    const model = await this.makeAsync(overrides)
    const persisted = persist ? await persist(model) : await this.saveModel(model)

    await this.createHasRelations(persisted)
    await this.createAttachedRelations(persisted)
    await this.runCallbacks(this.afterCreatingCallbacks, persisted)

    return persisted
  }

  private async saveModel(model: TModel): Promise<TModel> {
    const saveable = model as TModel & {
      getAttribute?: (key: string) => unknown
      getRawAttributes?: () => Record<string, unknown>
      save?: () => Promise<TModel>
    }
    const constructor = model?.constructor as FactoryModelConstructor<TModel>
    const primaryKey = constructor.getPrimaryKey?.() ?? 'id'
    const identifier = saveable.getAttribute?.(primaryKey)

    if (identifier != null && constructor.query && saveable.getRawAttributes) {
      return await constructor.query().create(saveable.getRawAttributes())
    }

    if (typeof saveable.save !== 'function')
      throw new Error('Factory model does not support save().')

    return await saveable.save()
  }

  private async createHasRelations(model: TModel): Promise<void> {
    for (const definition of this.hasRelations) {
      const relationship =
        definition.relationship ??
        `${str(definition.factory.getModelConstructor().name).camel().plural()}`
      const relation = this.resolveRelation(model, relationship)
      const overrides = relation.getFactoryCreationAttributes()

      definition.factory.inheritRecyclePool(this.recyclePool)
      for (let index = 0; index < definition.factory.amount; index++) {
        await definition.factory.createPersisted(
          overrides,
          async (related) => await relation.save(related),
        )
      }
    }
  }

  private async createAttachedRelations(model: TModel): Promise<void> {
    for (const definition of this.attachedRelations) {
      const factory = definition.related instanceof ModelFactory ? definition.related : null
      const relatedModels = factory
        ? await factory.inheritRecyclePool(this.recyclePool).createMany()
        : Array.isArray(definition.related)
          ? definition.related
          : [definition.related]
      const relatedName = factory?.getModelConstructor().name ?? relatedModels[0]?.constructor.name
      const relationship =
        definition.relationship ??
        `${str(relatedName ?? '')
          .camel()
          .plural()}`
      const relation = this.resolveRelation(model, relationship)

      if (typeof relation.attach !== 'function')
        throw new Error(`Factory relationship [${relationship}] does not support attach().`)

      await relation.attach(relatedModels, definition.pivot)
    }
  }

  private resolveRelation(
    model: TModel,
    relationship: string,
  ): {
    save: (related: unknown) => Promise<unknown>
    getFactoryCreationAttributes: () => Record<string, unknown>
    attach?: (related: unknown, pivot?: Record<string, unknown>) => Promise<number>
  } {
    const resolver = (model as Record<string, unknown>)[relationship]
    if (typeof resolver !== 'function')
      throw new Error(
        `Factory relationship [${relationship}] is not defined on [${this.getModelConstructor().name}].`,
      )

    return resolver.call(model) as {
      save: (related: unknown) => Promise<unknown>
      getFactoryCreationAttributes: () => Record<string, unknown>
      attach?: (related: unknown, pivot?: Record<string, unknown>) => Promise<number>
    }
  }

  private async resolveFactoryKey(factory: ModelFactory<any, any>): Promise<unknown> {
    const model = await this.resolveFactoryModel(factory)
    const constructor = model.constructor as FactoryModelConstructor<unknown>
    const primaryKey = constructor.getPrimaryKey?.() ?? 'id'

    return model.getAttribute(primaryKey)
  }

  private async resolveFactoryModel(factory: ModelFactory<any, any>): Promise<Model> {
    factory.inheritRecyclePool(this.recyclePool)
    const recycled = factory.takeRecycledModel()

    return recycled ?? ((await factory.create()) as Model)
  }

  private inheritRecyclePool(pool: Map<FactoryModelConstructor<unknown>, Model[]>): this {
    pool.forEach((models, constructor) => {
      const existing = this.recyclePool.get(constructor) ?? []
      const inherited = models.filter((model) => !existing.includes(model))
      this.recyclePool.set(constructor, [...existing, ...inherited])
    })

    return this
  }

  private takeRecycledModel(): Model | null {
    const constructor = this.getModelConstructor() as FactoryModelConstructor<unknown>
    const models = this.recyclePool.get(constructor)
    if (!models || models.length === 0) return null

    const offset = this.recycleOffsets.get(constructor) ?? 0
    this.recycleOffsets.set(constructor, offset + 1)

    return models[offset % models.length] ?? null
  }

  private runCallbacksSync(
    callbacks: FactoryCallback<TModel>[],
    model: TModel,
    callbackName: string,
  ): void {
    callbacks.forEach((callback) => {
      const result = callback(model)
      if (ModelFactory.isPromiseLike(result))
        throw new Error(
          `Factory ${callbackName} callback is async. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.`,
        )
    })
  }

  private async runCallbacks(callbacks: FactoryCallback<TModel>[], model: TModel): Promise<void> {
    for (const callback of callbacks) await callback(model)
  }

  private static isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
    return typeof (value as { then?: unknown })?.then === 'function'
  }

  private static isFactory(value: unknown): value is FactoryRelationshipResolver {
    return value instanceof ModelFactory
  }
}

/**
 * A helper class for defining factories using an inline definition
 * function, without needing to create a separate factory class.
 *
 * @template TModel
 * @template TAttributes
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class InlineFactory<TModel, TAttributes extends FactoryAttributes> extends ModelFactory<
  TModel,
  TAttributes
> {
  protected model: FactoryModelConstructor<TModel>

  public constructor(
    model: FactoryModelConstructor<TModel>,
    private readonly resolver: FactoryDefinition<TAttributes>,
  ) {
    super()
    this.model = model
  }

  protected definition(sequence: number): MaybePromise<FactoryDefinitionAttributes<TAttributes>> {
    return this.resolver(sequence)
  }
}

/**
 * Define a factory for a given model using an inline definition function.
 *
 * @template TModel         The type of model the factory creates.
 * @template TAttributes    The type of attributes used to create the model.
 * @param model             The model constructor.
 * @param definition        The factory definition function.
 * @returns                 A new instance of the model factory.
 */
export const defineFactory = <
  TModel,
  TAttributes extends FactoryAttributes = Partial<ModelAttributes<TModel>>,
>(
  model: FactoryModelConstructor<TModel>,
  definition: FactoryDefinition<TAttributes>,
): ModelFactory<TModel, TAttributes> => {
  return new InlineFactory<TModel, TAttributes>(model, definition)
}
