import type { AdapterQueryInspection, SoftDeleteConfig } from './core'
import type {
  AppliedMigrationsState,
  PrimaryKeyGeneration,
  SchemaOperation,
  TimestampColumnBehavior,
} from './migrations'

import type { ModelStatic } from './ModelStatic'
import type { ExpressionNode } from './expression'

export type DatabasePrimitive = string | number | boolean | bigint | Date | null

export type DatabaseValue = DatabasePrimitive | DatabaseRow | DatabaseValue[]

export type DatabaseRow = Record<string, unknown>

export type DatabaseRows = DatabaseRow[]

export type AdapterCapability =
  | 'transactions'
  | 'returning'
  | 'insertMany'
  | 'upsert'
  | 'updateMany'
  | 'deleteMany'
  | 'exists'
  | 'relationLoads'
  | 'relationAggregates'
  | 'relationFilters'
  | 'rawSelect'
  | 'rawWhere'
  | 'distinct'
  | 'groupBy'
  | 'joins'
  | 'expressions'

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

export type QueryScalarComparisonOperator = '=' | '!=' | '>' | '>=' | '<' | '<='

export type SortDirection = 'asc' | 'desc'

export type AggregateOperation = 'count' | 'exists' | 'sum' | 'avg' | 'min' | 'max'

export type SoftDeleteQueryMode = 'exclude' | 'include' | 'only'

export interface QueryTarget<TModel = unknown> {
  model?: ModelStatic<TModel, any>
  modelName?: string
  table?: string
  primaryKey?: string
  primaryKeyGeneration?: PrimaryKeyGeneration
  timestampColumns?: TimestampColumnBehavior[]
  columns?: Record<string, string>
  softDelete?: SoftDeleteConfig
  alias?: string
}

export interface QuerySelectColumn {
  column: string
  alias?: string
  raw?: boolean
  wildcard?: boolean
  /** A compiled expression projected in place of a physical column. */
  expression?: ExpressionNode
}

export interface QueryOrderBy {
  column: string
  direction: SortDirection
  /** Orders by a compiled expression instead of a physical column. */
  expression?: ExpressionNode
}

/**
 * A `GROUP BY` entry: either a logical column name (string) or a compiled
 * expression / raw fragment. The query builder resolves select-alias grouping to
 * the underlying expression before it reaches the adapter.
 */
export type QueryGroupByItem =
  | string
  | { alias: string }
  | { expression: ExpressionNode }
  | { raw: { sql: string; bindings?: DatabaseValue[] } }

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

export interface QueryColumnComparisonCondition {
  type: 'column-comparison'
  leftColumn: string
  operator: QueryScalarComparisonOperator
  rightColumn: string
}

export interface QueryTimeCondition {
  type: 'time'
  column: string
  operator: QueryScalarComparisonOperator
  value: string
}

export interface QueryDayCondition {
  type: 'day'
  column: string
  operator: QueryScalarComparisonOperator
  value: number
}

export interface QueryExistsCondition {
  type: 'exists'
  query: SelectSpec
}

export interface QueryFullTextCondition {
  type: 'full-text'
  columns: string[]
  value: string
  language?: string
}

export type QueryJsonConditionKind = 'contains' | 'contains-key' | 'length' | 'overlaps'

export interface QueryJsonCondition {
  type: 'json'
  kind: QueryJsonConditionKind
  column: string
  /** Nested JSON path segments below the base column (e.g. `data->meta->lang`). */
  path?: string[]
  /** Negates the predicate (doesntContain / doesntContainKey). */
  not?: boolean
  /** JSON value for `contains`/`overlaps`, or the integer length for `length`. */
  value?: DatabaseValue
  /** Comparison operator used by the `length` kind. */
  operator?: QueryScalarComparisonOperator
}

export interface RawQuerySpec {
  sql: string
  bindings?: DatabaseValue[]
}

/** A boolean-valued expression used directly as a predicate (where / having). */
export interface QueryExpressionCondition {
  type: 'expression'
  expression: ExpressionNode
}

export type QueryCondition =
  | QueryComparisonCondition
  | QueryColumnComparisonCondition
  | QueryTimeCondition
  | QueryDayCondition
  | QueryExistsCondition
  | QueryFullTextCondition
  | QueryJsonCondition
  | QueryExpressionCondition
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
  softDeleteMode?: SoftDeleteQueryMode
  orderBy?: QueryOrderBy[]
  limit?: number
  offset?: number
  columns?: QuerySelectColumn[]
  distinct?: boolean
  groupBy?: string[]
  relationLoads?: RelationLoadPlan[]
}

export type QueryJoinType = 'inner' | 'left' | 'right' | 'full' | 'cross'

export type QueryJoinBoolean = 'and' | 'or'

export interface QueryJoinColumnConstraint {
  type: 'column'
  boolean: QueryJoinBoolean
  first: string
  operator: QueryScalarComparisonOperator
  second: string
}

export interface QueryJoinValueConstraint {
  type: 'value'
  boolean: QueryJoinBoolean
  column: string
  operator: QueryComparisonOperator
  value?: DatabaseValue | DatabaseValue[]
}

export interface QueryJoinNullConstraint {
  type: 'null'
  boolean: QueryJoinBoolean
  column: string
  not: boolean
}

export interface QueryJoinRawConstraint {
  type: 'raw'
  boolean: QueryJoinBoolean
  sql: string
  bindings?: DatabaseValue[]
}

export interface QueryJoinNestedConstraint {
  type: 'nested'
  boolean: QueryJoinBoolean
  constraints: QueryJoinConstraint[]
}

export type QueryJoinConstraint =
  | QueryJoinColumnConstraint
  | QueryJoinValueConstraint
  | QueryJoinNullConstraint
  | QueryJoinRawConstraint
  | QueryJoinNestedConstraint

export interface QueryJoin {
  type: QueryJoinType
  table?: string
  alias?: string
  subquery?: SelectSpec
  subquerySql?: string
  lateral?: boolean
  constraints: QueryJoinConstraint[]
}

export interface SelectSpec<TModel = unknown> {
  target: QueryTarget<TModel>
  columns?: QuerySelectColumn[]
  distinct?: boolean
  groupBy?: QueryGroupByItem[]
  having?: QueryCondition
  joins?: QueryJoin[]
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

export interface UpsertSpec<TModel = unknown> {
  target: QueryTarget<TModel>
  values: DatabaseRow[]
  uniqueBy: string[]
  updateColumns?: string[]
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
  joins?: QueryJoin[]
  where?: QueryCondition
  relationFilters?: RelationFilterSpec[]
  aggregate: AggregateSelection
  softDeleteMode?: SoftDeleteQueryMode
}

export interface RelationLoadSpec<TModel = unknown> {
  target: QueryTarget<TModel>
  models: TModel[]
  relations: RelationLoadPlan[]
}

export type AdapterQueryOperation =
  | 'select'
  | 'selectOne'
  | 'count'
  | 'exists'
  | 'insert'
  | 'insertMany'
  | 'upsert'
  | 'update'
  | 'updateFirst'
  | 'updateMany'
  | 'delete'
  | 'deleteFirst'
  | 'deleteMany'

export type AdapterInspectionRequest<TModel = unknown> =
  | { operation: 'select'; spec: SelectSpec<TModel> }
  | { operation: 'selectOne'; spec: SelectSpec<TModel> }
  | { operation: 'count'; spec: AggregateSpec<TModel> }
  | { operation: 'exists'; spec: SelectSpec<TModel> }
  | { operation: 'insert'; spec: InsertSpec<TModel> }
  | { operation: 'insertMany'; spec: InsertManySpec<TModel> }
  | { operation: 'upsert'; spec: UpsertSpec<TModel> }
  | { operation: 'update'; spec: UpdateSpec<TModel> }
  | { operation: 'updateFirst'; spec: UpdateSpec<TModel> }
  | { operation: 'updateMany'; spec: UpdateManySpec<TModel> }
  | { operation: 'delete'; spec: DeleteSpec<TModel> }
  | { operation: 'deleteFirst'; spec: DeleteSpec<TModel> }
  | { operation: 'deleteMany'; spec: DeleteManySpec<TModel> }

export interface AdapterTransactionContext {
  isolationLevel?: string
  readOnly?: boolean
  maxWait?: number
  timeout?: number
}

export interface AdapterModelFieldStructure {
  name: string
  type: string
  nullable: boolean
}

export interface AdapterModelStructure {
  name?: string
  table: string
  fields: AdapterModelFieldStructure[]
}

export interface AdapterModelIntrospectionOptions {
  tables?: string[]
}

export interface AdapterDatabaseCreationResult {
  database?: string
  created: boolean
}

export interface DatabaseAdapter {
  readonly capabilities?: AdapterCapabilities
  select: <TModel = unknown>(spec: SelectSpec<TModel>) => Promise<DatabaseRows>
  selectOne: <TModel = unknown>(spec: SelectSpec<TModel>) => Promise<DatabaseRow | null>
  insert: <TModel = unknown>(spec: InsertSpec<TModel>) => Promise<DatabaseRow>
  insertMany?: <TModel = unknown>(spec: InsertManySpec<TModel>) => Promise<number>
  upsert?: <TModel = unknown>(spec: UpsertSpec<TModel>) => Promise<number>
  update: <TModel = unknown>(spec: UpdateSpec<TModel>) => Promise<DatabaseRow | null>
  updateFirst?: <TModel = unknown>(spec: UpdateSpec<TModel>) => Promise<DatabaseRow | null>
  updateMany?: <TModel = unknown>(spec: UpdateManySpec<TModel>) => Promise<number>
  delete: <TModel = unknown>(spec: DeleteSpec<TModel>) => Promise<DatabaseRow | null>
  deleteFirst?: <TModel = unknown>(spec: DeleteSpec<TModel>) => Promise<DatabaseRow | null>
  deleteMany?: <TModel = unknown>(spec: DeleteManySpec<TModel>) => Promise<number>
  count: <TModel = unknown>(spec: AggregateSpec<TModel>) => Promise<number>
  exists?: <TModel = unknown>(spec: SelectSpec<TModel>) => Promise<boolean>
  rawQuery?: <_TRow = unknown>(spec: RawQuerySpec) => Promise<DatabaseRows>
  loadRelations?: <TModel = unknown>(spec: RelationLoadSpec<TModel>) => Promise<void>
  inspectQuery?: <TModel = unknown>(
    request: AdapterInspectionRequest<TModel>,
  ) => AdapterQueryInspection | null
  introspectModels?: (
    options?: AdapterModelIntrospectionOptions,
  ) => Promise<AdapterModelStructure[]>
  executeSchemaOperations?: (operations: SchemaOperation[]) => Promise<void>
  resetDatabase?: () => Promise<void>
  createDatabaseFromError?: (error: unknown) => Promise<AdapterDatabaseCreationResult | null>
  readAppliedMigrationsState?: () => Promise<AppliedMigrationsState>
  writeAppliedMigrationsState?: (state: AppliedMigrationsState) => Promise<void>
  transaction: <TResult = unknown>(
    callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
    context?: AdapterTransactionContext,
  ) => Promise<TResult>
  /**
   * Releases any resources the adapter holds (connection pools, clients). Called
   * by short-lived processes such as the CLI so the event loop can drain and the
   * process exits promptly instead of waiting for pool idle timeouts.
   */
  dispose?: () => Promise<void>
}
