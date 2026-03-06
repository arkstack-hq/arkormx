export type FactoryAttributes = Record<string, unknown>

export interface FactoryModelConstructor<TModel> {
    new(attributes?: Record<string, unknown>): TModel
}

export type FactoryDefinition<TAttributes extends FactoryAttributes> = (sequence: number) => TAttributes

export type FactoryState<TAttributes extends FactoryAttributes> = (
    attributes: TAttributes,
    sequence: number
) => TAttributes