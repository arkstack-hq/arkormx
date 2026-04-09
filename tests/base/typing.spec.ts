import { describe, expectTypeOf, it } from 'vitest'

import { ArkormCollection, Model } from '../../src'
import type { AttributeCreateInput, AttributeUpdateInput } from '../../src/types'

type ProductAttributes = {
    id: number
    name: string
    price: number
    isActive: boolean
    metadata: Record<string, unknown> | null
}

class Product extends Model<ProductAttributes> { }

class DeclaredUser extends Model {
    declare id: number
    declare name: string
    declare metadata: Record<string, unknown> | null
}

class TypedProfile extends Model {
    declare id: number
    declare userId: number
}

class TypedPost extends Model {
    declare id: number
    declare authorId: number
    declare title: string
}

class DeclaredUserWithRelations extends Model {
    declare id: number
    declare name: string

    profile () {
        return this.hasOne(TypedProfile, 'userId', 'id')
    }

    posts () {
        return this.hasMany(TypedPost, 'authorId', 'id')
    }
}

describe('adapter-first typing', () => {
    it('infers attribute access types from the model generic', () => {
        const product = new Product()

        expectTypeOf(product.getAttribute('id')).toEqualTypeOf<number>()
        expectTypeOf(product.getAttribute('name')).toEqualTypeOf<string>()
        expectTypeOf(product.getAttribute('metadata')).toEqualTypeOf<Record<string, unknown> | null>()

        product.setAttribute('name', 'Desk')
        product.setAttribute('price', 99)
    })

    it('infers attribute access types from declared model properties', () => {
        const user = new DeclaredUser()

        expectTypeOf(user.getAttribute('id')).toEqualTypeOf<number>()
        expectTypeOf(user.getAttribute('name')).toEqualTypeOf<string>()
        expectTypeOf(user.getAttribute('metadata')).toEqualTypeOf<Record<string, unknown> | null>()

        user.setAttribute('name', 'Jane')
        user.setAttribute('metadata', { tier: 'pro' })
    })

    it('infers eager-loaded relationship payloads from relationship methods', () => {
        const user = new DeclaredUserWithRelations()

        expectTypeOf(user.getAttribute('profile')).toEqualTypeOf<TypedProfile | null>()
        expectTypeOf(user.getAttribute('posts')).toEqualTypeOf<ArkormCollection<TypedPost>>()

        user.setAttribute('profile', new TypedProfile())
        user.setAttribute('posts', new ArkormCollection<TypedPost>([]))
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