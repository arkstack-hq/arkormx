export type FactoryAttributes = Record<string, unknown>
export type MaybePromise<T> = T | Promise<T>

export interface FactoryModelConstructor<TModel> {
  new (attributes?: Record<string, unknown>): TModel
  readonly name: string
  getPrimaryKey?: () => string
  getRelationMetadata?: (name: string) => unknown
  query?: () => {
    create: (attributes: Record<string, unknown>) => Promise<TModel>
  }
}

export interface FactoryRelationshipResolver {
  create: (overrides?: Record<string, unknown>) => Promise<unknown>
  getModelConstructor: () => FactoryModelConstructor<unknown>
}

export type FactoryAttributeResolver<TAttributes extends FactoryAttributes> = (
  attributes: TAttributes,
) => MaybePromise<unknown>

export type FactoryDefinitionAttributes<TAttributes extends FactoryAttributes> = {
  [TKey in keyof TAttributes]?:
    | TAttributes[TKey]
    | FactoryRelationshipResolver
    | FactoryAttributeResolver<TAttributes>
} & Record<string, unknown>

export type FactoryDefinition<TAttributes extends FactoryAttributes> = (
  sequence: number,
) => MaybePromise<FactoryDefinitionAttributes<TAttributes>>

export type FactoryState<TAttributes extends FactoryAttributes> = (
  attributes: TAttributes,
  sequence: number,
) => MaybePromise<FactoryDefinitionAttributes<TAttributes>>

export type FactoryCallback<TModel> = (model: TModel) => MaybePromise<void>
