import { DelegateRow, PrismaDelegateLike } from './core'

import { Model } from 'src/Model'
import type { PrismaClient } from '@prisma/client'

type LowercaseString<T extends string> = Lowercase<T>

type SingularKey<T extends string> =
    LowercaseString<T> extends `${infer Base}s`
    ? Base
    : LowercaseString<T>

type PluralKey<T extends string> = `${SingularKey<T>}s`

type PrismaClientDelegates = {
    [TKey in keyof PrismaClient as PrismaClient[TKey] extends PrismaDelegateLike ? TKey : never]: PrismaClient[TKey]
}

type DelegateFromPrismaClient<TKey extends string> =
    LowercaseString<TKey> extends keyof PrismaClientDelegates
    ? PrismaClientDelegates[LowercaseString<TKey>]
    : SingularKey<TKey> extends keyof PrismaClientDelegates
    ? PrismaClientDelegates[SingularKey<TKey>]
    : PluralKey<TKey> extends keyof PrismaClientDelegates
    ? PrismaClientDelegates[PluralKey<TKey>]
    : never

export type DelegateForModelSchema<TSchema extends PrismaDelegateLike | Record<string, unknown> | string> =
    TSchema extends PrismaDelegateLike
    ? TSchema
    : TSchema extends string
    ? DelegateFromPrismaClient<TSchema> extends PrismaDelegateLike
    ? DelegateFromPrismaClient<TSchema>
    : PrismaDelegateLike
    : PrismaDelegateLike

export type ModelAttributesOf<TSchema extends PrismaDelegateLike | Record<string, unknown> | string> =
    TSchema extends PrismaDelegateLike
    ? DelegateRow<TSchema> extends Record<string, unknown>
    ? DelegateRow<TSchema>
    : Record<string, any>
    : TSchema extends string
    ? DelegateFromPrismaClient<TSchema> extends PrismaDelegateLike
    ? DelegateRow<DelegateFromPrismaClient<TSchema>> extends Record<string, unknown>
    ? DelegateRow<DelegateFromPrismaClient<TSchema>>
    : Record<string, any>
    : Record<string, any>
    : TSchema extends Record<string, unknown>
    ? TSchema
    : Record<string, any>

export type ModelAttributes<TModel> = TModel extends Model<infer TSchema>
    ? ModelAttributesOf<TSchema>
    : Record<string, any>
