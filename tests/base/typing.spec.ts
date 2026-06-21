import { describe, expectTypeOf, it } from 'vitest'

import { ArkormCollection, Model } from '../../src'
import type { AttributeCreateInput, AttributeUpdateInput } from '../../src/types'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type ProductAttributes = {
  id: number
  name: string
  price: number
  isActive: boolean
  metadata: Record<string, unknown> | null
}

class Product extends Model<ProductAttributes> {}

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
  declare createdAt: Date
}

class DeclaredUserWithRelations extends Model {
  declare id: number
  declare name: string

  profile() {
    return this.hasOne(TypedProfile, 'userId', 'id')
  }

  posts() {
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

  it('infers eager-load constraint builders from relationship methods', () => {
    DeclaredUserWithRelations.query().with({
      profile: (query) => {
        expectTypeOf<ReturnType<typeof query.first>>().toEqualTypeOf<Promise<TypedProfile | null>>()

        return query.whereKey('userId', 1)
      },
      posts: (query) => {
        expectTypeOf<ReturnType<typeof query.first>>().toEqualTypeOf<Promise<TypedPost | null>>()

        return query.latest().limit(5)
      },
    })

    // @ts-expect-error Eager-load keys must reference a relationship method.
    DeclaredUserWithRelations.query().with({ missing: true })

    type LoadInput = Parameters<DeclaredUserWithRelations['load']>[0]
    type LoadMissingInput = Parameters<DeclaredUserWithRelations['loadMissing']>[0]

    const loadRelations: LoadInput = {
      profile: (query) => query.whereKey('userId', 1),
      posts: (query) => {
        expectTypeOf<ReturnType<typeof query.first>>().toEqualTypeOf<Promise<TypedPost | null>>()

        return query.latest().limit(5)
      },
    }
    const missingRelations: LoadMissingInput = {
      profile: (query) => {
        expectTypeOf<ReturnType<typeof query.first>>().toEqualTypeOf<Promise<TypedProfile | null>>()

        return query.whereKey('userId', 1)
      },
    }

    expectTypeOf(loadRelations).toMatchTypeOf<LoadInput>()
    expectTypeOf(missingRelations).toMatchTypeOf<LoadMissingInput>()
  })

  it('preserves related model query types on relation methods', () => {
    const relation = new DeclaredUserWithRelations().posts()

    type WhereInput = Parameters<typeof relation.where>[0]
    type OrderByInput = Parameters<typeof relation.orderBy>[0]
    type IncludeInput = Parameters<typeof relation.include>[0]
    type SelectInput = Parameters<typeof relation.select>[0]

    expectTypeOf<IsAny<WhereInput>>().toEqualTypeOf<false>()
    expectTypeOf<IsAny<OrderByInput>>().toEqualTypeOf<false>()
    expectTypeOf<IsAny<IncludeInput>>().toEqualTypeOf<false>()
    expectTypeOf<IsAny<SelectInput>>().toEqualTypeOf<false>()

    relation
      .where({ title: { contains: 'ArkORM' } })
      .orWhere({ authorId: 1 })
      .whereNot({ title: 'Draft' })
      .whereNull('title')
      .whereBetween('id', [1, 10])
      .whereKey('authorId', 1)
      .whereKeyNot('authorId', 2)
      .whereIn('id', [1, 2])
      .whereNotIn('id', [3])
      .whereTime('createdAt', '>=', '09:30')
      .whereDay('createdAt', 9)
      .wherePast('createdAt')
      .whereToday('createdAt')
      .whereColumn('id', '>', 'authorId')
      .whereFullText('title', 'ArkORM')
      .whereExists((query) => query.whereColumn('id', 'authorId'))
      .orderBy({ title: 'asc' })
      .select({ id: true, title: true })
      .addSelect('authorId')
      .distinct()
      .groupBy('authorId', 'title')
      .offset(5)
      .limit(10)
      .forPage(2, 10)

    // @ts-expect-error Related model keys must be suggested and validated.
    relation.whereKey('missing', 1)
    // @ts-expect-error Related model attribute values must be validated.
    relation.whereKey('authorId', '1')
    // @ts-expect-error Unknown related model fields are rejected.
    relation.where({ missing: true })
    // @ts-expect-error Unknown related model order fields are rejected.
    relation.orderBy({ missing: 'asc' })
    // @ts-expect-error Unknown related model group fields are rejected.
    relation.groupBy('missing')
  })

  it('infers query helper payloads from the model generic', () => {
    const query = Product.query()
    const _withTrashedQuery = Product.withTrashed()
    const _onlyTrashedQuery = Product.onlyTrashed()

    expectTypeOf<ReturnType<typeof query.first>>().toEqualTypeOf<Promise<Product | null>>()
    expectTypeOf<ReturnType<typeof query.firstOrFail>>().toEqualTypeOf<Promise<Product>>()
    expectTypeOf<ReturnType<typeof query.get>>().toEqualTypeOf<Promise<ArkormCollection<Product>>>()
    expectTypeOf<ReturnType<typeof _withTrashedQuery.firstOrFail>>().toEqualTypeOf<
      Promise<Product>
    >()
    expectTypeOf<ReturnType<typeof _onlyTrashedQuery.firstOrFail>>().toEqualTypeOf<
      Promise<Product>
    >()

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
