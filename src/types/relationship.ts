import { ModelAttributes } from './model'
import { QueryBuilder } from 'src/QueryBuilder'

export type RelationConstraint<TModel> = (
    query: QueryBuilder<TModel>
) => QueryBuilder<TModel> | void


export type RelationDefaultValue<TParent, TRelated> =
    | Partial<ModelAttributes<TRelated>>
    | TRelated
    | ((parent: TParent) => Partial<ModelAttributes<TRelated>> | TRelated)

export type RelationDefaultResolver<TParent, TRelated> = (
    parent: TParent,
) => Partial<ModelAttributes<TRelated>> | TRelated
