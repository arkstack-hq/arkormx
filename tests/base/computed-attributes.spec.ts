import { type ExpressionBuilder, Model, UnsupportedAdapterFeatureException } from '../../src'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

class ComputedUser extends Model<'user'> {
  protected static override table = 'users'

  protected static override computed = {
    tier: (e: ExpressionBuilder) => e.caseWhen(e.col('isActive').eq(1), 'active').else('inactive'),
  }
}

describe('computed attributes (#15)', () => {
  beforeEach(() => {
    setupCoreRuntime()
  })

  it('resolves declarations to cached expression nodes', () => {
    const first = ComputedUser.getComputed()
    const second = ComputedUser.getComputed()

    expect(first.tier).toMatchObject({ kind: 'case' })
    expect(first).toBe(second)
  })

  it('returns an empty map for models without computed attributes', () => {
    class Plain extends Model {
      protected static override table = 'users'
    }

    expect(Plain.getComputed()).toEqual({})
  })

  it('expands to an expression the compatibility adapter rejects', async () => {
    await expect(
      ComputedUser.query().select({ tier: true }).get(),
    ).rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
  })
})
