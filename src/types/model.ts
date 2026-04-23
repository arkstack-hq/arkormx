import { ModelQuerySchemaLike, PrismaLikeInclude, PrismaLikeScalarFilter, PrismaLikeSelect, PrismaLikeSortOrder, QuerySchemaCreateData, QuerySchemaRow, QuerySchemaUpdateData, RelationshipModelStatic } from './core'

import { Model } from 'src/Model'
import type { PrismaClient } from '@prisma/client'
import { QueryBuilder } from 'src'

type LowercaseString<T extends string> = Lowercase<T>
type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {}
type ConventionalAutoManagedKeys = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'

type SingularKey<T extends string> =
    LowercaseString<T> extends `${infer Base}s`
    ? Base
    : LowercaseString<T>

type PluralKey<T extends string> = `${SingularKey<T>}s`

type PrismaClientDelegates = {
    [TKey in keyof PrismaClient as PrismaClient[TKey] extends ModelQuerySchemaLike ? TKey : never]: PrismaClient[TKey]
}

type DelegateFromPrismaClient<TKey extends string> =
    LowercaseString<TKey> extends keyof PrismaClientDelegates
    ? PrismaClientDelegates[LowercaseString<TKey>]
    : SingularKey<TKey> extends keyof PrismaClientDelegates
    ? PrismaClientDelegates[SingularKey<TKey>]
    : PluralKey<TKey> extends keyof PrismaClientDelegates
    ? PrismaClientDelegates[PluralKey<TKey>]
    : never

type AttributeScalarFilter<TValue> = Omit<PrismaLikeScalarFilter, 'equals' | 'not' | 'in' | 'notIn' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'startsWith' | 'endsWith'> & {
    equals?: TValue
    not?: TValue | AttributeScalarFilter<TValue>
    in?: TValue[]
    notIn?: TValue[]
    lt?: TValue
    lte?: TValue
    gt?: TValue
    gte?: TValue
    contains?: Extract<TValue, string>
    startsWith?: Extract<TValue, string>
    endsWith?: Extract<TValue, string>
}

export type AttributeWhereInput<TAttributes extends Record<string, unknown>> = {
    AND?: AttributeWhereInput<TAttributes>[]
    OR?: AttributeWhereInput<TAttributes>[]
    NOT?: AttributeWhereInput<TAttributes> | AttributeWhereInput<TAttributes>[]
} & {
    [TKey in keyof TAttributes]?: TAttributes[TKey] | AttributeScalarFilter<NonNullable<TAttributes[TKey]>> | null
}

export type AttributeOrderBy<TAttributes extends Record<string, unknown>> =
    | Partial<Record<keyof TAttributes & string, PrismaLikeSortOrder>>
    | Array<Partial<Record<keyof TAttributes & string, PrismaLikeSortOrder>>>

export type AttributeSelect<TAttributes extends Record<string, unknown>> = {
    [TKey in keyof TAttributes]?: boolean
}

type RequiredCreateKeys<TAttributes extends Record<string, unknown>> = Exclude<{
    [TKey in keyof TAttributes]-?: undefined extends TAttributes[TKey]
    ? never
    : null extends TAttributes[TKey]
    ? never
    : TKey
}[keyof TAttributes], ConventionalAutoManagedKeys>

type AtLeastOne<TValue extends Record<string, unknown>> = {
    [TKey in keyof TValue]-?: Required<Pick<TValue, TKey>> & Partial<Omit<TValue, TKey>>
}[keyof TValue]

export type AttributeCreateInput<TAttributes extends Record<string, unknown>> = Simplify<
    Pick<TAttributes, RequiredCreateKeys<TAttributes>>
    & Partial<Omit<TAttributes, RequiredCreateKeys<TAttributes>>>
>

export type AttributeUpdateInput<TAttributes extends Record<string, unknown>> = AtLeastOne<Partial<TAttributes>>

export interface AttributeQuerySchema<TAttributes extends Record<string, unknown>> extends ModelQuerySchemaLike {
    findMany: (args?: {
        where?: AttributeWhereInput<TAttributes>
        include?: PrismaLikeInclude
        orderBy?: AttributeOrderBy<TAttributes>
        select?: AttributeSelect<TAttributes>
        skip?: number
        take?: number
    }) => Promise<TAttributes[]>
    findFirst: (args?: {
        where?: AttributeWhereInput<TAttributes>
        include?: PrismaLikeInclude
        orderBy?: AttributeOrderBy<TAttributes>
        select?: AttributeSelect<TAttributes>
        skip?: number
        take?: number
    }) => Promise<TAttributes | null>
    create: (args: {
        data: AttributeCreateInput<TAttributes>
        select?: PrismaLikeSelect
    }) => Promise<TAttributes>
    update: (args: {
        where: Partial<TAttributes>
        data: AttributeUpdateInput<TAttributes>
        select?: PrismaLikeSelect
    }) => Promise<TAttributes>
    delete: (args: {
        where: Partial<TAttributes>
        select?: PrismaLikeSelect
    }) => Promise<TAttributes>
    count: (args?: {
        where?: AttributeWhereInput<TAttributes>
    }) => Promise<number>
}

export type QuerySchemaForModel<
    TSchema extends ModelQuerySchemaLike | Record<string, unknown> | string,
    TAttributes extends Record<string, unknown> = ModelAttributesOf<TSchema>
> =
    TSchema extends ModelQuerySchemaLike
    ? TSchema
    : TSchema extends string
    ? DelegateFromPrismaClient<TSchema> extends ModelQuerySchemaLike
    ? DelegateFromPrismaClient<TSchema>
    : ModelQuerySchemaLike
    : AttributeQuerySchema<TAttributes>

/**
 * @deprecated Use AttributeQuerySchema instead.
 */
export interface AttributeSchemaDelegate<TAttributes extends Record<string, unknown>> extends AttributeQuerySchema<TAttributes> {}

/**
 * @deprecated Use QuerySchemaForModel instead.
 */
export type DelegateForModelSchema<
    TSchema extends ModelQuerySchemaLike | Record<string, unknown> | string,
    TAttributes extends Record<string, unknown> = ModelAttributesOf<TSchema>
> = QuerySchemaForModel<TSchema, TAttributes>

export type ModelAttributesOf<TSchema extends ModelQuerySchemaLike | Record<string, unknown> | string> =
    TSchema extends ModelQuerySchemaLike
    ? QuerySchemaRow<TSchema> extends Record<string, unknown>
    ? QuerySchemaRow<TSchema>
    : Record<string, any>
    : TSchema extends string
    ? DelegateFromPrismaClient<TSchema> extends ModelQuerySchemaLike
    ? QuerySchemaRow<DelegateFromPrismaClient<TSchema>> extends Record<string, unknown>
    ? QuerySchemaRow<DelegateFromPrismaClient<TSchema>>
    : Record<string, any>
    : Record<string, any>
    : TSchema extends Record<string, unknown>
    ? TSchema
    : Record<string, any>

export type ModelAttributes<TModel> = TModel extends Model<any, infer TAttributes>
    ? TAttributes
    : Record<string, any>

type BaseModelInstance = Model<any, any>

export type ModelDeclaredAttributeKey<TModel> = {
    [TKey in keyof TModel & string]: TKey extends keyof BaseModelInstance
        ? never
        : TModel[TKey] extends (...args: any[]) => any
            ? never
            : TKey
}[keyof TModel & string]

type RelationshipResultProvider<TResult = unknown> = {
    getResults: (...args: any[]) => Promise<TResult>
}

export type ModelRelationshipKey<TModel> = {
    [TKey in keyof TModel & string]: TKey extends keyof BaseModelInstance
        ? never
        : TModel[TKey] extends (...args: any[]) => infer TReturn
        ? Parameters<TModel[TKey]> extends []
            ? TReturn extends RelationshipResultProvider<any>
                ? TKey
                : never
            : never
        : never
}[keyof TModel & string]

export type ModelRelationshipResult<
    TModel,
    TKey extends ModelRelationshipKey<TModel>,
> = TModel[TKey] extends (...args: any[]) => infer TReturn
    ? TReturn extends RelationshipResultProvider<infer TResult>
        ? TResult
        : never
    : never

export type ModelAttributeValue<
    TModel,
    TAttributes extends Record<string, unknown>,
    TKey extends string,
> = TKey extends ModelRelationshipKey<TModel>
    ? ModelRelationshipResult<TModel, TKey>
    : TKey extends ModelDeclaredAttributeKey<TModel>
        ? TModel[TKey]
        : TKey extends keyof TAttributes & string
            ? TAttributes[TKey]
            : unknown

export type ModelCreateData<TModel, TDelegate extends ModelQuerySchemaLike> =
    TModel extends Model<any, infer TAttributes>
    ? TDelegate extends AttributeQuerySchema<TAttributes>
    ? AttributeCreateInput<TAttributes>
    : QuerySchemaCreateData<TDelegate>
    : QuerySchemaCreateData<TDelegate>

export type ModelUpdateData<TModel, TDelegate extends ModelQuerySchemaLike> =
    TModel extends Model<any, infer TAttributes>
    ? TDelegate extends AttributeQuerySchema<TAttributes>
    ? AttributeUpdateInput<TAttributes>
    : QuerySchemaUpdateData<TDelegate>
    : QuerySchemaUpdateData<TDelegate>



export type RelatedModelClass<TInstance = unknown> =
    (abstract new (attributes?: Record<string, unknown>) => TInstance)
    & RelationshipModelStatic

export type GlobalScope = (query: QueryBuilder<any, any>) => QueryBuilder<any, any> | void
export type ModelEventName =
    | 'retrieved'
    | 'saving'
    | 'saved'
    | 'creating'
    | 'created'
    | 'updating'
    | 'updated'
    | 'deleting'
    | 'deleted'
    | 'restoring'
    | 'restored'
    | 'forceDeleting'
    | 'forceDeleted'
export type ModelEventListener<TModel extends Model = Model> = (model: TModel) => void | Promise<void>
export type ModelEventHandler<TModel extends Model = Model> = {
    handle: (model: TModel) => void | Promise<void>
}
export type ModelEventHandlerConstructor<TModel extends Model = Model> = new () => ModelEventHandler<TModel>
export type ModelEventDispatcher<TModel extends Model = Model> =
    | ModelEventHandler<TModel>
    | ModelEventHandlerConstructor<TModel>

export type ModelLifecycleState = {
    booted: boolean
    booting: boolean
    globalScopesSuppressed: number
}