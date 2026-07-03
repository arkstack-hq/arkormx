import type { DatabaseValue } from '../types/adapter'
import type { ExpressionNode } from '../types/expression'
import { Expression, expressionBuilder } from '../Expression'
import type { ExpressionBuilder } from '../Expression'
import { ArkormException } from '../Exceptions/ArkormException'

/**
 * The two ways to declare a generated column's expression: a raw SQL string, or a
 * factory that builds one with the expression builder.
 */
export type GeneratedColumnExpression = string | ((builder: ExpressionBuilder) => Expression)

/**
 * Resolves a generated-column expression into raw Postgres SQL. Generated columns
 * cannot carry bind parameters (they must be immutable), so literal values are
 * inlined and aggregates are rejected.
 */
export const resolveGeneratedExpression = (expression: GeneratedColumnExpression): string => {
  if (typeof expression === 'string') return expression

  const built = expression(expressionBuilder)

  return expressionNodeToSql(built.toExpressionNode())
}

const quoteIdentifier = (name: string): string =>
  name
    .split('.')
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join('.')

const quoteLiteral = (value: DatabaseValue): string => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return `'${value.toISOString()}'`

  return `'${String(value).replace(/'/g, "''")}'`
}

const BINARY_OPERATORS: Record<string, string> = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  like: 'like',
  ilike: 'ilike',
  'not-like': 'not like',
  'not-ilike': 'not ilike',
  and: 'and',
  or: 'or',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
}

const FUNCTION_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const jsonAccessorSql = (node: Extract<ExpressionNode, { kind: 'json' }>): string => {
  const base = `${quoteIdentifier(node.column)}::jsonb`

  let accessor: string
  if (node.path.length === 0) accessor = base
  else if (node.path.length === 1) accessor = `(${base} ->> ${quoteLiteral(node.path[0])})`
  else accessor = `(${base} #>> '{${node.path.join(',')}}'::text[])`

  if (node.cast === 'number') return `(${accessor})::numeric`
  if (node.cast === 'boolean') return `(${accessor})::boolean`

  return accessor
}

const expressionNodeToSql = (node: ExpressionNode): string => {
  switch (node.kind) {
    case 'column':
      return quoteIdentifier(node.name)

    case 'value':
      return quoteLiteral(node.value)

    case 'raw':
      return inlineRawSql(node.sql, node.bindings)

    case 'json':
      return jsonAccessorSql(node)

    case 'function': {
      if (!FUNCTION_NAME.test(node.name))
        throw new ArkormException(`Unsupported SQL function name [${node.name}].`)

      return `${node.name}(${node.args.map(expressionNodeToSql).join(', ')})`
    }

    case 'case': {
      const branches = node.cases
        .map(
          (branch) =>
            `when ${expressionNodeToSql(branch.when)} then ${expressionNodeToSql(branch.then)}`,
        )
        .join(' ')
      const elseClause = node.else ? ` else ${expressionNodeToSql(node.else)}` : ''

      return `case ${branches}${elseClause} end`
    }

    case 'binary': {
      const operator = BINARY_OPERATORS[node.operator]

      return `(${expressionNodeToSql(node.left)} ${operator} ${expressionNodeToSql(node.right)})`
    }

    case 'in': {
      const values = node.values.map(expressionNodeToSql).join(', ')

      return `(${expressionNodeToSql(node.operand)} ${node.not ? 'not in' : 'in'} (${values}))`
    }

    case 'null-check':
      return `(${expressionNodeToSql(node.operand)} is ${node.not ? 'not null' : 'null'})`

    case 'aggregate':
      throw new ArkormException('Aggregate expressions are not allowed in generated columns.')

    default: {
      const exhaustive: never = node

      throw new ArkormException(
        `Unsupported expression node [${(exhaustive as { kind?: string }).kind}].`,
      )
    }
  }
}

const inlineRawSql = (sql: string, bindings: DatabaseValue[]): string => {
  const segments = sql.split('?')

  if (segments.length !== bindings.length + 1)
    throw new ArkormException('Raw expression bindings do not match the number of placeholders.')

  return segments.reduce((accumulator, segment, index) => {
    const binding = index < bindings.length ? quoteLiteral(bindings[index]) : ''

    return accumulator + segment + binding
  }, '')
}
