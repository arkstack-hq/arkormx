import { SchemaBuilder, applyOperationsToPrismaSchema, resolveGeneratedExpression } from '../../src'
import type { SchemaTableCreateOperation } from '../../src'
import { describe, expect, it } from 'vitest'

describe('generated columns (#16)', () => {
  it('records a string-form generated column on the schema operation', () => {
    const schema = new SchemaBuilder()
    schema.createTable('invoices', (table) => {
      table.integer('amount')
      table.generated('amount_cents', '"amount" * 100', { type: 'integer' })
    })

    const [operation] = schema.getOperations() as SchemaTableCreateOperation[]
    const generated = operation.columns.find((column) => column.name === 'amount_cents')

    expect(generated).toMatchObject({
      type: 'integer',
      generatedExpression: '"amount" * 100',
      generatedStored: true,
    })
  })

  it('compiles the expression-builder form to raw SQL', () => {
    const schema = new SchemaBuilder()
    schema.createTable('line_items', (table) => {
      table.generated('total', (e) => e.col('price').times(e.col('quantity')), { type: 'integer' })
    })

    const [operation] = schema.getOperations() as SchemaTableCreateOperation[]
    const generated = operation.columns.find((column) => column.name === 'total')

    expect(generated?.generatedExpression).toBe('("price" * "quantity")')
  })

  it('inlines literals and JSON extraction with no bind parameters', () => {
    const sql = resolveGeneratedExpression((e) =>
      e.caseWhen(e.json('metadata', 'kind').in(['airtime', 'data']), 'airtime_data').else('other'),
    )

    expect(sql).toBe(
      "case when ((\"metadata\"::jsonb ->> 'kind') in ('airtime', 'data')) then 'airtime_data' else 'other' end",
    )
  })

  it('rejects aggregates in generated expressions', () => {
    expect(() => resolveGeneratedExpression((e) => e.sum('amount'))).toThrow()
  })

  it('emits a Prisma dbgenerated default in the schema', () => {
    const schema = new SchemaBuilder()
    schema.createTable('carts', (table) => {
      table.integer('price')
      table.generated('doubled', '"price" * 2', { type: 'integer' })
    })

    const output = applyOperationsToPrismaSchema('', schema.getOperations())

    expect(output).toContain('doubled Int @default(dbgenerated("\\"price\\" * 2"))')
  })
})
