import type { ModelStatic } from './ModelStatic'

export type DatabasePrimitive = string | number | boolean | bigint | Date | null

export type DatabaseValue =
    | DatabasePrimitive
    | DatabaseRow
    | DatabaseValue[]

export type DatabaseRow = Record<string, unknown>

export type DatabaseRows = DatabaseRow[]

export type AdapterCapability =
    | 'transactions'
    | 'returning'
    | 'insertMany'
    | 'updateMany'
    | 'deleteMany'
    | 'exists'
    | 'relationLoads'
    | 'relationAggregates'
    | 'relationFilters'
    | 'rawWhere'

export type AdapterCapabilities = Partial<Record<AdapterCapability, boolean>>

export type QueryLogicalOperator = 'and' | 'or'

export type QueryComparisonOperator =
    | '='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'in'
    | 'not-in'
    | 'contains'
    | 'starts-with'
    | 'ends-with'
    | 'is-null'
    | 'is-not-null'

export type SortDirection = 'asc' | 'desc'

export type AggregateOperation = 'count' | 'exists' | 'sum' | 'avg' | 'min' | 'max'

export type SoftDeleteQueryMode = 'exclude' | 'include' | 'only'

export interface QueryTarget<TModel = unknown> {
    model?: ModelStatic<TModel, any>
    modelName?: string
    table?: string
    alias?: string
}

export interface QuerySelectColumn {
    column: string
    alias?: string
}

export interface QueryOrderBy {
    column: string
    direction: SortDirection
}

export interface QueryComparisonCondition {
    type: 'comparison'
    column: string
    operator: QueryComparisonOperator
    value?: DatabaseValue | DatabaseValue[]
}

export interface QueryGroupCondition {
    type: 'group'
    operator: QueryLogicalOperator
    conditions: QueryCondition[]
}

export interface QueryNotCondition {
    type: 'not'
    condition: QueryCondition
}

export interface QueryRawCondition {
    type: 'raw'
    sql: string
    bindings?: DatabaseValue[]
}

export type QueryCondition =
    | QueryComparisonCondition
    | QueryGroupCondition
    | QueryNotCondition
    | QueryRawCondition

export interface AggregateSelection {
    type: AggregateOperation
    column?: string
    alias?: string
}

export interface RelationAggregateSpec {
    relation: string
    type: AggregateOperation
    column?: string
    alias?: string
    where?: QueryCondition
}

export interface RelationFilterSpec {
    relation: string
    operator: '>=' | '>' | '=' | '!=' | '<=' | '<'
    count: number
    boolean?: 'AND' | 'OR'
    where?: QueryCondition
}

export interface RelationLoadPlan {
    relation: string
    constraint?: QueryCondition
    orderBy?: QueryOrderBy[]
    limit?: number
    offset?: number
}

export interface SelectSpec<TModel = unknown> {
    target: QueryTarget<TModel>
    columns?: QuerySelectColumn[]
    where?: QueryCondition
    orderBy?: QueryOrderBy[]
    limit?: number
    offset?: number
    softDeleteMode?: SoftDeleteQueryMode
    relationLoads?: RelationLoadPlan[]
    relationAggregates?: RelationAggregateSpec[]
    relationFilters?: RelationFilterSpec[]
    aggregates?: AggregateSelection[]
}

export interface InsertSpec<TModel = unknown> {
    target: QueryTarget<TModel>
    values: DatabaseRow
    returning?: QuerySelectColumn[]
}

export interface InsertManySpec<TModel = unknown> {
    target: QueryTarget<TModel>
    values: DatabaseRow[]
    ignoreDuplicates?: boolean
}

export interface UpdateSpec<TModel = unknown> {
    target: QueryTarget<TModel>
    where: QueryCondition
    values: DatabaseRow
    returning?: QuerySelectColumn[]
}

export interface UpdateManySpec<TModel = unknown> {
    target: QueryTarget<TModel>
    where?: QueryCondition
    values: DatabaseRow
}

export interface DeleteSpec<TModel = unknown> {
    target: QueryTarget<TModel>
    where: QueryCondition
    returning?: QuerySelectColumn[]
}

export interface DeleteManySpec<TModel = unknown> {
    target: QueryTarget<TModel>
    where?: QueryCondition
}

export interface AggregateSpec<TModel = unknown> {
    target: QueryTarget<TModel>
    where?: QueryCondition
    aggregate: AggregateSelection
    softDeleteMode?: SoftDeleteQueryMode
}

export interface RelationLoadSpec<TModel = unknown> {
    target: QueryTarget<TModel>
    models: TModel[]
    relations: RelationLoadPlan[]
}

export interface AdapterTransactionContext {
    isolationLevel?: string
    readOnly?: boolean
    maxWait?: number
    timeout?: number
}

export interface DatabaseAdapter {
    readonly capabilities?: AdapterCapabilities
    select: <TModel = unknown>(spec: SelectSpec<TModel>) => Promise<DatabaseRows>
    selectOne: <TModel = unknown>(spec: SelectSpec<TModel>) => Promise<DatabaseRow | null>
    insert: <TModel = unknown>(spec: InsertSpec<TModel>) => Promise<DatabaseRow>
    insertMany?: <TModel = unknown>(spec: InsertManySpec<TModel>) => Promise<number>
    update: <TModel = unknown>(spec: UpdateSpec<TModel>) => Promise<DatabaseRow | null>
    updateMany?: <TModel = unknown>(spec: UpdateManySpec<TModel>) => Promise<number>
    delete: <TModel = unknown>(spec: DeleteSpec<TModel>) => Promise<DatabaseRow | null>
    deleteMany?: <TModel = unknown>(spec: DeleteManySpec<TModel>) => Promise<number>
    count: <TModel = unknown>(spec: AggregateSpec<TModel>) => Promise<number>
    exists?: <TModel = unknown>(spec: SelectSpec<TModel>) => Promise<boolean>
    loadRelations?: <TModel = unknown>(spec: RelationLoadSpec<TModel>) => Promise<void>
    transaction: <TResult = unknown>(
        callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
        context?: AdapterTransactionContext,
    ) => Promise<TResult>
}