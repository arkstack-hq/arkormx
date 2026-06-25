import { Model, configureArkormRuntime } from '../../src'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCoreClient } from './helpers/core-fixtures'

/**
 * A non-idempotent cast: stores integer minor units, exposes major units.
 * Re-applying `set` to an already-stored value would multiply it again.
 */
class AsMoney {
  static get(value: unknown): number {
    return value !== null && value !== undefined ? Number(value) / 100 : 0
  }

  static set(value: unknown): number {
    return value !== null && value !== undefined ? Math.round(Number(value) * 100) : 0
  }
}

class Product extends Model<'user'> {
  declare id: number
  declare unitPrice: number

  protected static override table = 'users'
  protected override casts = { unitPrice: AsMoney } as unknown as Record<string, never>
}

describe('non-idempotent set-cast round-trips through save()', () => {
  beforeEach(() => {
    configureArkormRuntime(createCoreClient(), { naming: { case: 'camel' } })
  })

  it('reads major units immediately after save() without re-fetching', async () => {
    const product = new Product()
    product.fill({ unitPrice: 100 } as never)

    // Before save: stored as minor units, read back as major units.
    expect(product.getRawAttributes().unitPrice).toBe(10000)
    expect(product.getAttribute('unitPrice')).toBe(100)

    await product.save()

    // After save: the set-cast must not be applied a second time.
    expect(product.getRawAttributes().unitPrice).toBe(10000)
    expect(product.getAttribute('unitPrice')).toBe(100)
  })

  it('persists minor units to the database', async () => {
    const product = new Product()
    product.fill({ unitPrice: 100 } as never)
    await product.save()

    const fresh = await Product.query()
      .where({ id: product.getAttribute('id') } as never)
      .first()

    expect(fresh?.getRawAttributes().unitPrice).toBe(10000)
    expect(fresh?.getAttribute('unitPrice')).toBe(100)
  })

  it('does not re-cast on update either', async () => {
    const product = new Product()
    product.fill({ id: 4242, unitPrice: 100 } as never)
    await product.save()

    product.setAttribute('unitPrice', 250)
    await product.save()

    expect(product.getRawAttributes().unitPrice).toBe(25000)
    expect(product.getAttribute('unitPrice')).toBe(250)
  })
})
