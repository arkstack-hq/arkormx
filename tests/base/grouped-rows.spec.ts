import { UnsupportedAdapterFeatureException } from '../../src'
import { User } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

describe('grouped result rows (#14)', () => {
  beforeEach(() => {
    setupCoreRuntime()
  })

  it('getRows() returns plain rows without model hydration', async () => {
    const rows = await User.query().select({ id: true, email: true }).getRows<{
      id: number
      email: string
    }>()

    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0]).toHaveProperty('id')
    expect(rows[0]).not.toBeInstanceOf(User)
  })

  it('rejects Prisma-style groupBy on the compatibility adapter', async () => {
    await expect(User.query().groupBy({ by: ['isActive'], _count: true })).rejects.toBeInstanceOf(
      UnsupportedAdapterFeatureException,
    )
  })
})
