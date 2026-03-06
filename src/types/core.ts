export type CastType = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'array'

export interface CastHandler<T = unknown> {
    get: (value: unknown) => T
    set: (value: unknown) => unknown
}

export type CastDefinition = CastType | CastHandler

export type CastMap = Record<string, CastDefinition>

export interface PaginationMeta {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    from: number | null
    to: number | null
}

export interface SimplePaginationMeta {
    perPage: number
    currentPage: number
    from: number | null
    to: number | null
    hasMorePages: boolean
}

export interface PaginationOptions {
    path?: string
    query?: Record<string, string | number | boolean | null | undefined>
    fragment?: string
    pageName?: string
}

export interface PaginationURLDriver {
    getPageName: () => string
    url: (page: number) => string
}

export type PaginationURLDriverFactory = (options: PaginationOptions) => PaginationURLDriver

export interface PrismaFindManyArgsLike {
    where?: unknown
    include?: unknown
    orderBy?: unknown
    select?: unknown
    skip?: number
    take?: number
}

export type EagerLoadConstraint = (query: unknown) => unknown

export type EagerLoadMap = Record<string, EagerLoadConstraint | undefined>

export interface SoftDeleteConfig {
    enabled: boolean
    column: string
}

export interface PrismaDelegateLike {
    findMany: (args?: any) => Promise<unknown[]>
    findFirst: (args?: any) => Promise<unknown | null>
    create: (args: any) => Promise<unknown>
    update: (args: any) => Promise<unknown>
    delete: (args: any) => Promise<unknown>
    count: (args?: any) => Promise<number>
}

type FallbackIfUnknownOrNever<TValue, TFallback> =
    [TValue] extends [never]
    ? TFallback
    : unknown extends TValue
    ? TFallback
    : TValue

export type DelegateFindManyArgs<TDelegate extends PrismaDelegateLike> =
    FallbackIfUnknownOrNever<NonNullable<Parameters<TDelegate['findMany']>[0]>, PrismaFindManyArgsLike>

export type DelegateWhere<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { where?: infer TWhere }
    ? FallbackIfUnknownOrNever<TWhere, Record<string, unknown>>
    : Record<string, unknown>

export type DelegateInclude<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { include?: infer TInclude }
    ? FallbackIfUnknownOrNever<TInclude, Record<string, unknown>>
    : Record<string, unknown>

export type DelegateOrderBy<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { orderBy?: infer TOrderBy }
    ? FallbackIfUnknownOrNever<TOrderBy, Record<string, unknown> | Record<string, unknown>[]>
    : Record<string, unknown> | Record<string, unknown>[]

export type DelegateSelect<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { select?: infer TSelect }
    ? FallbackIfUnknownOrNever<TSelect, Record<string, unknown>>
    : Record<string, unknown>

export type DelegateCreateData<TDelegate extends PrismaDelegateLike> =
    Parameters<TDelegate['create']>[0] extends { data: infer TData }
    ? TData
    : Record<string, unknown>

export type DelegateUpdateArgs<TDelegate extends PrismaDelegateLike> = Parameters<TDelegate['update']>[0]

export type DelegateUpdateData<TDelegate extends PrismaDelegateLike> =
    DelegateUpdateArgs<TDelegate> extends { data: infer TData }
    ? FallbackIfUnknownOrNever<TData, Record<string, unknown>>
    : Record<string, unknown>

export type DelegateUniqueWhere<TDelegate extends PrismaDelegateLike> =
    DelegateUpdateArgs<TDelegate> extends { where: infer TWhere }
    ? FallbackIfUnknownOrNever<TWhere, Record<string, unknown>>
    : Record<string, unknown>

export type DelegateRow<TDelegate extends PrismaDelegateLike> = Exclude<Awaited<ReturnType<TDelegate['findFirst']>>, null>

export type DelegateRows<TDelegate extends PrismaDelegateLike> = Awaited<ReturnType<TDelegate['findMany']>>

export type Serializable = Record<string, unknown>
export * from './ModelStatic'