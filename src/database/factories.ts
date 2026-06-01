import type { FactoryAttributes, FactoryDefinition, FactoryModelConstructor, FactoryState, MaybePromise, ModelAttributes } from 'src/types'

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

    protected abstract model: FactoryModelConstructor<TModel>
    protected abstract definition (sequence: number): MaybePromise<TAttributes>

    /**
     * Set the number of models to create.
     * 
     * @param amount 
     * @returns 
     */
    public count (amount: number): this {
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
    public state (resolver: FactoryState<TAttributes>): this {
        this.states.push(resolver)

        return this
    }

    /**
     * Create a new model instance without saving it to the database.
     * 
     * @param overrides 
     * @returns 
     */
    public make (overrides: Partial<TAttributes> = {}): TModel {
        const attributes = this.buildAttributes(overrides)

        return new this.model(attributes as Record<string, unknown>)
    }

    /**
     * Create a new model instance from an async factory definition without
     * saving it to the database.
     *
     * @param overrides
     * @returns
     */
    public async makeAsync (overrides: Partial<TAttributes> = {}): Promise<TModel> {
        const attributes = await this.buildAttributesAsync(overrides)

        return new this.model(attributes as Record<string, unknown>)
    }

    /**
     * Create multiple model instances without saving them to the database.
     * 
     * @param amount 
     * @param overrides 
     * @returns 
     */
    public makeMany (amount = this.amount, overrides: Partial<TAttributes> = {}): TModel[] {
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
    public async makeManyAsync (amount = this.amount, overrides: Partial<TAttributes> = {}): Promise<TModel[]> {
        const total = Math.max(1, Math.floor(amount))
        const models: TModel[] = []

        for (let index = 0; index < total; index++)
            models.push(await this.makeAsync(overrides))

        return models
    }

    /**
     * Create a new model instance and save it to the database.
     * 
     * @param overrides 
     * @returns 
     */
    public async create (overrides: Partial<TAttributes> = {}): Promise<TModel> {
        const model = await this.makeAsync(overrides) as TModel & { save?: () => Promise<TModel> }
        if (typeof model.save !== 'function')
            throw new Error('Factory model does not support save().')

        return await model.save()
    }

    /**
     * Create multiple model instances and save them to the database.
     * 
     * @param amount 
     * @param overrides 
     * @returns 
     */
    public async createMany (amount = this.amount, overrides: Partial<TAttributes> = {}): Promise<TModel[]> {
        const models = await this.makeManyAsync(amount, overrides) as (TModel & { save?: () => Promise<TModel> })[]

        return await Promise.all(models.map(async (model) => {
            if (typeof model.save !== 'function')
                throw new Error('Factory model does not support save().')

            return await model.save()
        }))
    }

    /**
     * Build the attributes for a model instance, applying the factory 
     * definition and any defined states, and merging in any overrides.
     * 
     * @param overrides 
     * @returns 
     */
    private buildAttributes (overrides: Partial<TAttributes>): TAttributes {
        const sequence = this.sequence
        this.sequence += 1

        let resolved = this.definition(sequence)
        if (ModelFactory.isPromiseLike(resolved)) {
            this.sequence = sequence
            throw new Error('This factory has an async definition. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.')
        }

        for (const state of this.states) {
            resolved = state(resolved, sequence)
            if (ModelFactory.isPromiseLike(resolved)) {
                this.sequence = sequence
                throw new Error('This factory has an async state. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.')
            }
        }

        return {
            ...resolved,
            ...overrides,
        }
    }

    /**
     * Build attributes for async and sync factory definitions.
     *
     * @param overrides
     * @returns
     */
    private async buildAttributesAsync (overrides: Partial<TAttributes>): Promise<TAttributes> {
        const sequence = this.sequence
        this.sequence += 1

        let resolved = await this.definition(sequence)
        for (const state of this.states)
            resolved = await state(resolved, sequence)

        return {
            ...resolved,
            ...overrides,
        }
    }

    private static isPromiseLike<T> (value: MaybePromise<T>): value is Promise<T> {
        return typeof (value as { then?: unknown })?.then === 'function'
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
export class InlineFactory<
    TModel,
    TAttributes extends FactoryAttributes,
> extends ModelFactory<TModel, TAttributes> {
    protected model: FactoryModelConstructor<TModel>

    public constructor(
        model: FactoryModelConstructor<TModel>,
        private readonly resolver: FactoryDefinition<TAttributes>
    ) {
        super()
        this.model = model
    }

    protected definition (sequence: number): MaybePromise<TAttributes> {
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
> (
    model: FactoryModelConstructor<TModel>,
    definition: FactoryDefinition<TAttributes>
): ModelFactory<TModel, TAttributes> => {
    return new InlineFactory<TModel, TAttributes>(model, definition)
}
