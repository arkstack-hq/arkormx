import { describe, expectTypeOf, it } from 'vitest'

import { Model } from '../../src'
import type { AttributeCreateInput, AttributeUpdateInput } from '../../src/types'

type ProductAttributes = {
    id: number
    name: string
    price: number
    isActive: boolean
    metadata: Record<string, unknown> | null
}

class Product extends Model<ProductAttributes> { }

describe('adapter-first typing', () => {
    it('infers attribute access types from the model generic', () => {
        const product = new Product()

        expectTypeOf(product.getAttribute('id')).toEqualTypeOf<number>()
        expectTypeOf(product.getAttribute('name')).toEqualTypeOf<string>()
        expectTypeOf(product.getAttribute('metadata')).toEqualTypeOf<Record<string, unknown> | null>()

        product.setAttribute('name', 'Desk')
        product.setAttribute('price', 99)
    })

    it('infers query helper payloads from the model generic', () => {
        const query = Product.query()

        query.whereKey('name', 'Desk')
        query.whereKey('price', 99)

        type CreatePayload = Parameters<typeof query.create>[0]
        type UpdatePayload = Parameters<typeof query.updateFrom>[0]

        const validCreateInput = {
            name: 'Desk',
            price: 99,
            isActive: true,
        } satisfies CreatePayload

        const validUpdateInput = {
            price: 109,
        } satisfies UpdatePayload

        expectTypeOf(validCreateInput).toMatchTypeOf<AttributeCreateInput<ProductAttributes>>()
        expectTypeOf(validUpdateInput).toMatchTypeOf<AttributeUpdateInput<ProductAttributes>>()
    })
})