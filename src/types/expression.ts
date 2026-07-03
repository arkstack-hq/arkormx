import type { AggregateOperation, DatabaseValue } from './adapter'

/**
 * Serializable expression nodes produced by the expression builder (`col`, `val`,
 * `raw`, `caseWhen`, `coalesce`, `json`, aggregate helpers, …).
 *
 * The query builder stays adapter-agnostic: it stores these nodes on the query
 * spec and each {@link DatabaseAdapter} compiles (or rejects) them. Every node is
 * discriminated by its `kind`.
 */
export type ExpressionBinaryOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'like'
  | 'ilike'
  | 'not-like'
  | 'not-ilike'
  | 'and'
  | 'or'
  | '+'
  | '-'
  | '*'
  | '/'

export type ExpressionJsonCast = 'text' | 'number' | 'boolean'

export interface ColumnExpressionNode {
  kind: 'column'
  /** Logical model attribute, or a joined `table.column` reference. */
  name: string
}

export interface ValueExpressionNode {
  kind: 'value'
  value: DatabaseValue
}

export interface RawExpressionNode {
  kind: 'raw'
  sql: string
  bindings: DatabaseValue[]
}

export interface JsonExpressionNode {
  kind: 'json'
  column: string
  /** Path segments below the base column (`metadata->billType` => `['billType']`). */
  path: string[]
  /** Optional scalar cast applied to the extracted text value. */
  cast?: ExpressionJsonCast
}

export interface CaseExpressionBranch {
  when: ExpressionNode
  then: ExpressionNode
}

export interface CaseExpressionNode {
  kind: 'case'
  cases: CaseExpressionBranch[]
  else?: ExpressionNode
}

export interface FunctionExpressionNode {
  kind: 'function'
  name: string
  args: ExpressionNode[]
}

export interface BinaryExpressionNode {
  kind: 'binary'
  operator: ExpressionBinaryOperator
  left: ExpressionNode
  right: ExpressionNode
}

export interface InExpressionNode {
  kind: 'in'
  operand: ExpressionNode
  values: ExpressionNode[]
  not: boolean
}

export interface NullCheckExpressionNode {
  kind: 'null-check'
  operand: ExpressionNode
  not: boolean
}

export interface AggregateExpressionNode {
  kind: 'aggregate'
  fn: AggregateOperation
  /** Argument expression; omitted for `count(*)`. */
  arg?: ExpressionNode
  distinct?: boolean
  /** Boolean-valued predicate compiled to `FILTER (WHERE …)` on Postgres. */
  filter?: ExpressionNode
}

export type ExpressionNode =
  | ColumnExpressionNode
  | ValueExpressionNode
  | RawExpressionNode
  | JsonExpressionNode
  | CaseExpressionNode
  | FunctionExpressionNode
  | BinaryExpressionNode
  | InExpressionNode
  | NullCheckExpressionNode
  | AggregateExpressionNode
