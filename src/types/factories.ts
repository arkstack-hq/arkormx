export type FactoryAttributes = Record<string, unknown>
export type MaybePromise<T> = T | Promise<T>

export interface FactoryModelConstructor<TModel> {
    new(attributes?: Record<string, unknown>): TModel
}

export type FactoryDefinition<TAttributes extends FactoryAttributes> = (sequence: number) => MaybePromise<TAttributes>

export type FactoryState<TAttributes extends FactoryAttributes> = (
    attributes: TAttributes,
    sequence: number
) => MaybePromise<TAttributes>
