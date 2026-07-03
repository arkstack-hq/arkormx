import { UnsupportedAdapterFeatureException, caseWhen, coalesce, col, sum, val } from '../../src'
import { User } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

describe('query expressions on the Prisma compatibility adapter', () => {
  beforeEach(() => {
    setupCoreRuntime()
  })

  it('builds immutable expression trees', () => {
    const base = col('amount')
    const derived = base.plus(1)

    expect(base.toExpressionNode()).toEqual({ kind: 'column', name: 'amount' })
    expect(derived.toExpressionNode()).toMatchObject({ kind: 'binary', operator: '+' })
  })

  it('coerces bare strings to columns in coalesce and values in comparisons', () => {
    expect(coalesce('a', 'b').toExpressionNode()).toMatchObject({
      kind: 'function',
      name: 'coalesce',
      args: [
        { kind: 'column', name: 'a' },
        { kind: 'column', name: 'b' },
      ],
    })

    expect(col('status').eq('active').toExpressionNode()).toMatchObject({
      kind: 'binary',
      operator: '=',
      right: { kind: 'value', value: 'active' },
    })
  })

  it('rejects expression select columns', async () => {
    await expect(
      User.query().select({ tier: caseWhen(col('isActive').eq(1), 'yes').else('no') }).get(),
    ).rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
  })

  it('rejects boolean expression where predicates', async () => {
    await expect(
      User.query().where(col('isActive').eq(1)).get(),
    ).rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
  })

  it('rejects aggregate expression selects', async () => {
    await expect(
      User.query().select({ total: sum('id') }).get(),
    ).rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
  })

  it('exposes the isExpression type guard', () => {
    expect(col('x') instanceof Object).toBe(true)
    expect(val(1).toExpressionNode()).toEqual({ kind: 'value', value: 1 })
  })
})
