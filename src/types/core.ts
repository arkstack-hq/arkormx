import { PrismaClient } from '@prisma/client'
import type { DatabaseAdapter } from './adapter'

export type CastType = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'array'

export interface CastHandler<T = unknown> {
    get: (value: unknown) => T
    set: (value: unknown) => unknown
}

export type CastDefinition = CastType | CastHandler

export type CastMap = Record<string, CastDefinition>


export type PrismaClientLike = PrismaClient | Record<string, unknown>

export interface PrismaTransactionOptions {
    maxWait?: number
    timeout?: number
    isolationLevel?: string
}

export type PrismaTransactionCallback<TResult = unknown> = (
    client: PrismaClientLike,
) => TResult | Promise<TResult>

export interface PrismaTransactionCapableClient {
    $transaction: <TResult>(
        callback: PrismaTransactionCallback<TResult>,
        options?: PrismaTransactionOptions,
    ) => Promise<TResult>
}

export type ClientResolver = PrismaClientLike | (() => PrismaClientLike)

export interface AdapterBindableModel {
    setAdapter: (adapter?: DatabaseAdapter) => void
}

export interface ArkormBootContext {
    prisma?: PrismaClientLike
    bindAdapter: (adapter: DatabaseAdapter, models: AdapterBindableModel[]) => DatabaseAdapter
}

export interface AdapterQueryInspection {
    adapter: string
    operation: string
    target?: string
    sql?: string
    parameters?: ReadonlyArray<unknown>
    detail?: Record<string, unknown>
}

export interface ArkormDebugEvent {
    type: 'query'
    phase: 'before' | 'after' | 'error'
    adapter: string
    operation: string
    target?: string
    inspection?: AdapterQueryInspection | null
    meta?: Record<string, unknown>
    durationMs?: number
    error?: unknown
}

export type ArkormDebugHandler = (event: ArkormDebugEvent) => void

export interface ArkormConfig {
    /**
     * @property prisma Optional Prisma client instance or resolver used for compatibility, CLI flows, and Prisma-backed transactions.
     */
    prisma?: ClientResolver
    /**
     * @property adapter Optional global adapter applied automatically to models that do not define a model-specific adapter.
     */
    adapter?: DatabaseAdapter
    /**
     * @property boot Optional synchronous runtime boot hook for central adapter binding.
     */
    boot?: (context: ArkormBootContext) => void
    /**
     * @property debug Optional runtime query debugging. `true` logs through Arkorm's default logger;
     * a callback receives structured debug events for custom handling.
     */
    debug?: boolean | ArkormDebugHandler
    /**
     * @property pagination Configuration options related to pagination behavior and URL generation.
     */
    pagination?: {
        urlDriver?: PaginationURLDriverFactory
        resolveCurrentPage?: PaginationCurrentPageResolver
    }
    /**
     * @property features Optional feature flags for persisted non-Prisma runtime metadata.
     */
    features?: {
        /**
         * @property persistedColumnMappings Persist migration-defined column mappings for non-Prisma adapters.
         * Defaults to true.
         */
        persistedColumnMappings?: boolean
        /**
         * @property persistedEnums Persist migration-defined enum values for non-Prisma adapters.
         * Defaults to true.
         */
        persistedEnums?: boolean
    }
    /**
     * @property paths Optional custom paths for various generated files.
     */
    paths?: {
        /**
         * @property stubs Optional custom path for stub files used in code generation.
         */
        stubs?: string
        /**
         * @property seeders Optional custom path for seeder files.
         */
        seeders?: string
        /**
         * @property models Optional custom path for model files.
         */
        models?: string
        /**
         * @property migrations Optional custom path for migration files.
         */
        migrations?: string
        /**
         * @property factories Optional custom path for factory files.
         */
        factories?: string
        /**
         * @property buildOutput Optional custom path for the development output directory.
         */
        buildOutput?: string
    }
    /**
     * @property outputExt Optional file extension for generated files, either 'ts' or 'js'.
     */
    outputExt?: 'ts' | 'js'
}

export interface GetUserConfig {
    /**
     * Get the user-provided ArkORM configuration.
     */
    (): Partial<ArkormConfig>
    /**
     * Get a specific user configuration value
     * @param key Optional specific configuration key to retrieve
     */
    <K extends keyof ArkormConfig> (key: K): Partial<ArkormConfig>[K]
}

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

export type PaginationCurrentPageResolver = (
    pageName: string,
    options: PaginationOptions,
) => number | undefined

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

export type PrismaLikeSortOrder = 'asc' | 'desc'

export interface PrismaLikeScalarFilter {
    equals?: unknown
    not?: unknown | PrismaLikeScalarFilter
    in?: unknown[]
    notIn?: unknown[]
    lt?: unknown
    lte?: unknown
    gt?: unknown
    gte?: unknown
    contains?: string
    startsWith?: string
    endsWith?: string
}

export interface PrismaLikeWhereInput {
    AND?: PrismaLikeWhereInput[]
    OR?: PrismaLikeWhereInput[]
    NOT?: PrismaLikeWhereInput | PrismaLikeWhereInput[]
    [key: string]: unknown
}

export type PrismaLikeOrderBy =
    | Record<string, PrismaLikeSortOrder>
    | Record<string, PrismaLikeSortOrder>[]

export interface PrismaLikeSelect {
    [key: string]: boolean | {
        select?: PrismaLikeSelect
        include?: PrismaLikeInclude
    }
}

export interface PrismaLikeInclude {
    [key: string]: boolean | {
        where?: PrismaLikeWhereInput
        orderBy?: PrismaLikeOrderBy
        select?: PrismaLikeSelect
        include?: PrismaLikeInclude
        skip?: number
        take?: number
    }
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
    ? FallbackIfUnknownOrNever<TWhere, PrismaLikeWhereInput>
    : PrismaLikeWhereInput

export type DelegateInclude<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { include?: infer TInclude }
    ? FallbackIfUnknownOrNever<TInclude, PrismaLikeInclude>
    : PrismaLikeInclude

export type DelegateOrderBy<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { orderBy?: infer TOrderBy }
    ? FallbackIfUnknownOrNever<TOrderBy, PrismaLikeOrderBy>
    : PrismaLikeOrderBy

export type DelegateSelect<TDelegate extends PrismaDelegateLike> =
    DelegateFindManyArgs<TDelegate> extends { select?: infer TSelect }
    ? FallbackIfUnknownOrNever<TSelect, PrismaLikeSelect>
    : PrismaLikeSelect

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