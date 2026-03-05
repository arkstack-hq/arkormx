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

export type DelegateFindManyArgs<TDelegate extends PrismaDelegateLike> =
    NonNullable<Parameters<TDelegate['findMany']>[0]>

export type DelegateWhere<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { where?: infer TWhere }
    ? TWhere
    : Record<string, unknown>

export type DelegateInclude<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { include?: infer TInclude }
    ? TInclude
    : Record<string, unknown>

export type DelegateOrderBy<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { orderBy?: infer TOrderBy }
    ? TOrderBy
    : Record<string, unknown> | Record<string, unknown>[]

export type DelegateSelect<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { select?: infer TSelect }
    ? TSelect
    : Record<string, unknown>

export type DelegateCreateData<TDelegate extends PrismaDelegateLike> =
    Parameters<TDelegate['create']>[0] extends { data: infer TData }
    ? TData
    : Record<string, unknown>

export type DelegateUpdateArgs<TDelegate extends PrismaDelegateLike> = Parameters<TDelegate['update']>[0]

export type DelegateUpdateData<TDelegate extends PrismaDelegateLike> =
    DelegateUpdateArgs<TDelegate> extends { data: infer TData }
    ? TData
    : Record<string, unknown>

export type DelegateUniqueWhere<TDelegate extends PrismaDelegateLike> =
    DelegateUpdateArgs<TDelegate> extends { where: infer TWhere }
    ? TWhere
    : Record<string, unknown>

export type DelegateRow<TDelegate extends PrismaDelegateLike> = Exclude<Awaited<ReturnType<TDelegate['findFirst']>>, null>

export type DelegateRows<TDelegate extends PrismaDelegateLike> = Awaited<ReturnType<TDelegate['findMany']>>

export type Serializable = Record<string, unknown>
export * from './ModelStatic'