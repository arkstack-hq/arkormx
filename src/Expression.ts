import type { AggregateOperation, DatabaseValue, QueryScalarComparisonOperator } from './types/adapter'
import type {
  CaseExpressionBranch,
  ExpressionBinaryOperator,
  ExpressionJsonCast,
  ExpressionNode,
} from './types/expression'

/**
 * A composable SQL expression. Instances are immutable — every operator returns a
 * new expression — and are accepted by `select`, `where`, `groupBy`, `orderBy`,
 * `having`, and the aggregate helpers. Adapters compile the underlying node tree.
 */
export abstract class Expression {
  /** 
   * Serializes this expression to an adapter-compilable {@link ExpressionNode}. 
   */
  abstract toExpressionNode(): ExpressionNode

  /** 
   * Type guard for values that came out of the expression builder. 
   */
  static isExpression(value: unknown): value is Expression {
    return value instanceof Expression
  }

  eq(value: unknown): Expression {
    return binary('=', this, coerceValue(value))
  }

  ne(value: unknown): Expression {
    return binary('!=', this, coerceValue(value))
  }

  gt(value: unknown): Expression {
    return binary('>', this, coerceValue(value))
  }

  gte(value: unknown): Expression {
    return binary('>=', this, coerceValue(value))
  }

  lt(value: unknown): Expression {
    return binary('<', this, coerceValue(value))
  }

  lte(value: unknown): Expression {
    return binary('<=', this, coerceValue(value))
  }

  like(value: unknown): Expression {
    return binary('like', this, coerceValue(value))
  }

  ilike(value: unknown): Expression {
    return binary('ilike', this, coerceValue(value))
  }

  notLike(value: unknown): Expression {
    return binary('not-like', this, coerceValue(value))
  }

  notIlike(value: unknown): Expression {
    return binary('not-ilike', this, coerceValue(value))
  }

  in(values: readonly unknown[]): Expression {
    return new NodeExpression({
      kind: 'in',
      operand: this.toExpressionNode(),
      values: values.map((value) => coerceValue(value).toExpressionNode()),
      not: false,
    })
  }

  notIn(values: readonly unknown[]): Expression {
    return new NodeExpression({
      kind: 'in',
      operand: this.toExpressionNode(),
      values: values.map((value) => coerceValue(value).toExpressionNode()),
      not: true,
    })
  }

  isNull(): Expression {
    return new NodeExpression({ kind: 'null-check', operand: this.toExpressionNode(), not: false })
  }

  isNotNull(): Expression {
    return new NodeExpression({ kind: 'null-check', operand: this.toExpressionNode(), not: true })
  }

  and(other: Expression): Expression {
    return binary('and', this, other)
  }

  or(other: Expression): Expression {
    return binary('or', this, other)
  }

  plus(value: unknown): Expression {
    return binary('+', this, coerceValue(value))
  }

  minus(value: unknown): Expression {
    return binary('-', this, coerceValue(value))
  }

  times(value: unknown): Expression {
    return binary('*', this, coerceValue(value))
  }

  dividedBy(value: unknown): Expression {
    return binary('/', this, coerceValue(value))
  }
}

/** 
 * Concrete expression backed by a pre-built node. 
 */
class NodeExpression extends Expression {
  constructor(private readonly node: ExpressionNode) {
    super()
  }

  toExpressionNode(): ExpressionNode {
    return this.node
  }
}

/** 
 * Fluent `CASE … WHEN … THEN … ELSE … END` builder. Immutable.
 */
export class CaseExpression extends Expression {
  constructor(
    private readonly branches: CaseBranch[],
    private readonly elseExpr?: Expression,
  ) {
    super()
  }

  when(condition: Expression, result: unknown): CaseExpression {
    return new CaseExpression(
      [...this.branches, { when: condition, then: coerceValue(result) }],
      this.elseExpr,
    )
  }

  else(result: unknown): CaseExpression {
    return new CaseExpression(this.branches, coerceValue(result))
  }

  toExpressionNode(): ExpressionNode {
    const cases: CaseExpressionBranch[] = this.branches.map((branch) => ({
      when: branch.when.toExpressionNode(),
      then: branch.then.toExpressionNode(),
    }))

    return { kind: 'case', cases, else: this.elseExpr?.toExpressionNode() }
  }
}

interface CaseBranch {
  when: Expression
  then: Expression
}

/** 
 * JSON-path value extraction (`metadata ->> 'billType'`), with optional casts. 
 */
export class JsonExpression extends Expression {
  constructor(
    private readonly column: string,
    private readonly path: string[],
    private readonly castTo?: ExpressionJsonCast,
  ) {
    super()
  }

  asText(): JsonExpression {
    return new JsonExpression(this.column, this.path, 'text')
  }

  asNumber(): JsonExpression {
    return new JsonExpression(this.column, this.path, 'number')
  }

  asBoolean(): JsonExpression {
    return new JsonExpression(this.column, this.path, 'boolean')
  }

  toExpressionNode(): ExpressionNode {
    return { kind: 'json', column: this.column, path: this.path, cast: this.castTo }
  }
}

/** 
 * Aggregate expression (`sum`, `count`, `avg`, `min`, `max`) with optional filter. 
 */
export class AggregateExpression extends Expression {
  constructor(
    private readonly fn: AggregateOperation,
    private readonly arg?: Expression,
    private readonly options: { distinct?: boolean; filterExpr?: Expression } = {},
  ) {
    super()
  }

  /** 
   * Restricts the aggregate to rows matching `predicate` (`FILTER (WHERE …)`). 
   */
  filter(predicate: Expression): AggregateExpression {
    return new AggregateExpression(this.fn, this.arg, { ...this.options, filterExpr: predicate })
  }

  distinct(): AggregateExpression {
    return new AggregateExpression(this.fn, this.arg, { ...this.options, distinct: true })
  }

  toExpressionNode(): ExpressionNode {
    return {
      kind: 'aggregate',
      fn: this.fn,
      arg: this.arg?.toExpressionNode(),
      distinct: this.options.distinct,
      filter: this.options.filterExpr?.toExpressionNode(),
    }
  }
}

const binary = (
  operator: ExpressionBinaryOperator,
  left: Expression,
  right: Expression,
): Expression =>
  new NodeExpression({
    kind: 'binary',
    operator,
    left: left.toExpressionNode(),
    right: right.toExpressionNode(),
  })

/** 
 * Coerces a raw value into a bound-literal expression; passes expressions through. 
 */
const coerceValue = (value: unknown): Expression => {
  if (value instanceof Expression) return value

  return new NodeExpression({ kind: 'value', value: value as DatabaseValue })
}

/** 
 * Coerces a bare string into a column reference; passes expressions through. 
 */
const coerceColumn = (value: unknown): Expression => {
  if (value instanceof Expression) return value

  if (typeof value === 'string') return col(value)

  return coerceValue(value)
}

// -- factory functions ---------------------------------------------------------

/**
 * Rebuilds an {@link Expression} around an already-serialized node.
 */
export const fromExpressionNode = (node: ExpressionNode): Expression => new NodeExpression(node)

/**
 * A typed column reference. Supports joined `table.column` syntax.
 */
export const col = (name: string): Expression => new NodeExpression({ kind: 'column', name })

/** 
 * A bound literal value (parameterized, never interpolated). 
 */
export const val = (value: DatabaseValue): Expression => new NodeExpression({ kind: 'value', value })

/** 
 * Raw SQL escape hatch with positional `?` bindings. 
 */
export const raw = (sql: string, bindings: DatabaseValue[] = []): Expression =>
  new NodeExpression({ kind: 'raw', sql, bindings })

/** 
 * Starts a `CASE WHEN condition THEN result` expression. 
 */
export const caseWhen = (condition: Expression, result: unknown): CaseExpression =>
  new CaseExpression([{ when: condition, then: coerceValue(result) }])

/** 
 * `COALESCE(a, b, …)` — first non-null argument. Bare strings are columns. 
 */
export const coalesce = (...args: unknown[]): Expression =>
  new NodeExpression({
    kind: 'function',
    name: 'coalesce',
    args: args.map((arg) => coerceColumn(arg).toExpressionNode()),
  })

/** 
 * An arbitrary SQL function call. Bare-string arguments are treated as columns. 
 */
export const fn = (name: string, ...args: unknown[]): Expression =>
  new NodeExpression({
    kind: 'function',
    name,
    args: args.map((arg) => coerceColumn(arg).toExpressionNode()),
  })

/** 
 * JSON value extraction: `json('metadata', 'billType')` => `metadata ->> 'billType'`. 
 */
export const json = (column: string, ...path: Array<string | number>): JsonExpression =>
  new JsonExpression(column, path.map(String))

/** 
 * `SUM(expr)`; a bare-string argument is treated as a column. 
 */
export const sum = (arg: unknown): AggregateExpression =>
  new AggregateExpression('sum', coerceColumn(arg))

/** 
 * `AVG(expr)`; a bare-string argument is treated as a column. 
 */
export const avg = (arg: unknown): AggregateExpression =>
  new AggregateExpression('avg', coerceColumn(arg))

/** 
 * `MIN(expr)`; a bare-string argument is treated as a column. 
 */
export const min = (arg: unknown): AggregateExpression =>
  new AggregateExpression('min', coerceColumn(arg))

/** 
 * `MAX(expr)`; a bare-string argument is treated as a column. 
 */
export const max = (arg: unknown): AggregateExpression =>
  new AggregateExpression('max', coerceColumn(arg))

/** 
 * `COUNT(expr)` — or `COUNT(*)` when called without an argument. 
 */
export const count = (arg?: unknown): AggregateExpression =>
  new AggregateExpression('count', arg === undefined ? undefined : coerceColumn(arg))

const EXPRESSION_OPERATORS: Record<string, ExpressionBinaryOperator> = {
  '=': '=',
  '==': '=',
  '!=': '!=',
  '<>': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  like: 'like',
  ilike: 'ilike',
  'not like': 'not-like',
  'not ilike': 'not-ilike',
}

/**
 * Builds a comparison predicate: `where('createdAt', '>=', boundary)`. Handy as an
 * inline predicate for `caseWhen`, `having`, and aggregate `.filter(…)`.
 */
export const where = (
  column: string,
  operator: QueryScalarComparisonOperator | 'like' | 'ilike' | 'not like' | 'not ilike' | '<>' | '==',
  value: unknown,
): Expression => {
  const normalized = EXPRESSION_OPERATORS[operator]

  if (!normalized) {
    throw new Error(`Unsupported expression operator [${operator}].`)
  }

  return binary(normalized, col(column), coerceValue(value))
}

/**
 * The expression-builder namespace passed to `static computed` factories, so a
 * model can declare a virtual attribute as `category: (e) => e.coalesce(…)`.
 */
export const expressionBuilder = {
  col,
  val,
  raw,
  caseWhen,
  coalesce,
  fn,
  json,
  sum,
  avg,
  min,
  max,
  count,
  where,
} as const

export type ExpressionBuilder = typeof expressionBuilder
