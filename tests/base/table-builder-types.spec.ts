import { describe, expect, it } from 'vitest'

import { TableBuilder } from '../../src'
import { buildFieldLine, resolvePrismaType } from '../../src/helpers/migrations'

const findColumn = (table: TableBuilder, name: string) =>
  table.getColumns().find((column) => column.name === name)

describe('TableBuilder decimal/dateTime columns', () => {
  it('defines a decimal column with default precision and scale', () => {
    const table = new TableBuilder()
    table.decimal('price')

    expect(findColumn(table, 'price')).toMatchObject({
      type: 'decimal',
      precision: 8,
      scale: 2,
    })
  })

  it('defines a decimal column with explicit precision, scale, and options', () => {
    const table = new TableBuilder()
    table.decimal('balance', 18, 6, { nullable: true }).map('account_balance')

    expect(findColumn(table, 'balance')).toMatchObject({
      type: 'decimal',
      precision: 18,
      scale: 6,
      nullable: true,
      map: 'account_balance',
    })
  })

  it('defines a dateTime column', () => {
    const table = new TableBuilder()
    table.dateTime('publishedAt', { nullable: true })

    expect(findColumn(table, 'publishedAt')).toMatchObject({
      type: 'dateTime',
      nullable: true,
    })
  })
})

describe('Prisma schema generation for new types', () => {
  it('maps decimal and dateTime to Prisma scalar types', () => {
    expect(resolvePrismaType({ name: 'price', type: 'decimal' })).toBe('Decimal')
    expect(resolvePrismaType({ name: 'publishedAt', type: 'dateTime' })).toBe('DateTime')
  })

  it('emits a @db.Decimal native attribute for decimal columns', () => {
    const line = buildFieldLine({ name: 'price', type: 'decimal', precision: 12, scale: 4 })
    expect(line).toContain('price Decimal')
    expect(line).toContain('@db.Decimal(12, 4)')
  })

  it('defaults decimal precision and scale when omitted', () => {
    const line = buildFieldLine({ name: 'price', type: 'decimal' })
    expect(line).toContain('@db.Decimal(8, 2)')
  })

  it('emits DateTime for dateTime columns', () => {
    const line = buildFieldLine({ name: 'publishedAt', type: 'dateTime', nullable: true })
    expect(line).toContain('publishedAt DateTime?')
  })
})
