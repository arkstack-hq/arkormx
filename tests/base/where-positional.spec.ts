import { User } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

const ids = (models: { getAttribute(key: string): unknown }[]) =>
  models.map((model) => Number(model.getAttribute('id'))).sort((a, b) => a - b)

describe('positional where(column, [operator,] value)', () => {
  beforeEach(() => {
    setupCoreRuntime()
  })

  it('where(column, value) filters by equality', async () => {
    const users = await User.query().where('isActive', 1).get()
    expect(ids(users.all() as never)).toEqual([1])
  })

  it('where(column, operator, value) applies the operator', async () => {
    const greater = await User.query().where('id', '>', 1).get()
    expect(ids(greater.all() as never)).toEqual([2])

    const notEqual = await User.query().where('id', '!=', 1).get()
    expect(ids(notEqual.all() as never)).toEqual([2])
  })

  it('normalizes SQL operator aliases (<>, ==)', async () => {
    const notEqual = await User.query().where('id', '<>', 1).get()
    expect(ids(notEqual.all() as never)).toEqual([2])

    const equal = await User.query().where('id', '==', 1).get()
    expect(ids(equal.all() as never)).toEqual([1])
  })

  it('supports unary where(column, "is-null" | "is-not-null")', async () => {
    const withEmail = await User.query().where('email', 'is-not-null').get()
    expect(ids(withEmail.all() as never)).toEqual([1, 2])

    const noEmail = await User.query().where('email', 'is-null').get()
    expect(noEmail.all()).toHaveLength(0)
  })

  it('combines positional and object where clauses', async () => {
    const users = await User.query().where({ isActive: 1 }).where('id', '>', 0).get()
    expect(ids(users.all() as never)).toEqual([1])
  })

  it('orWhere(column, operator, value) combines with OR', async () => {
    const users = await User.query().where('id', 1).orWhere('id', '>=', 2).get()
    expect(ids(users.all() as never)).toEqual([1, 2])
  })
})
