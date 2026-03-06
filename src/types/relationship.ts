import { QueryBuilder } from 'src/QueryBuilder'

export type RelationConstraint<TModel> = (
    query: QueryBuilder<TModel>
) => QueryBuilder<TModel> | void