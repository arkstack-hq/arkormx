import { PrismaClient } from '@prisma/client'
import type { DatabaseAdapter } from './adapter'

export type CastType = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'array'

export interface CastHandler<T = unknown> {
    get: (value: unknown) => T
    set: (value: unknown) => unknown
}

export type CastDefinition = CastType | CastHandler

export type CastMap = Record<string, CastDefinition>


export type RuntimeClientLike = PrismaClient | Record<string, unknown>

export interface TransactionOptions {
    maxWait?: number
    timeout?: number
    isolationLevel?: string
}

export interface TransactionContext {
    client?: RuntimeClientLike
    adapter?: DatabaseAdapter
}

export type TransactionCallback<TResult = unknown> = (
    context: TransactionContext,
) => TResult | Promise<TResult>

export interface TransactionCapableClient {
    $transaction: <TResult>(
        callback: (client: RuntimeClientLike) => TResult | Promise<TResult>,
        options?: TransactionOptions,
    ) => Promise<TResult>
}

/**
 * @deprecated Use RuntimeClientLike instead.
 */
export type PrismaClientLike = RuntimeClientLike

/**
 * @deprecated Use TransactionOptions instead.
 */
export type PrismaTransactionOptions = TransactionOptions

/**
 * @deprecated Use TransactionContext instead.
 */
export type PrismaTransactionContext = TransactionContext

/**
 * @deprecated Use TransactionCallback instead.
 */
export type PrismaTransactionCallback<TResult = unknown> = TransactionCallback<TResult>

/**
 * @deprecated Use TransactionCapableClient instead.
 */
export type PrismaTransactionCapableClient = TransactionCapableClient

export type ClientResolver = RuntimeClientLike | (() => RuntimeClientLike)

export interface AdapterBindableModel {
    setAdapter: (adapter?: DatabaseAdapter) => void
}

export interface ArkormBootContext {
    client?: RuntimeClientLike
    /**
     * @deprecated Use client instead.
     */
    prisma?: RuntimeClientLike
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
export type ModelTableCase = 'camel' | 'snake' | 'kebab' | 'studly'

export interface ArkormConfig {
    /**
    * @property client Optional runtime client instance or resolver used for compatibility mode, CLI flows, and client-backed transactions.
    */
    client?: ClientResolver
    /**
    * @deprecated Use client instead.
    * @property prisma Optional Prisma client instance or resolver used for compatibility mode, CLI flows, and Prisma-backed transactions.
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
     * @property naming Naming strategy options for inferred model table names.
     */
    naming?: {
        /**
         * @property modelTableCase Case transformer applied to inferred table names.
         * Defaults to 'snake'.
         */
        modelTableCase?: ModelTableCase
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

export interface ModelQuerySchemaLike {
    findMany: (args?: any) => Promise<unknown[]>
    findFirst: (args?: any) => Promise<unknown | null>
    create: (args: any) => Promise<unknown>
    update: (args: any) => Promise<unknown>
    delete: (args: any) => Promise<unknown>
    count: (args?: any) => Promise<number>
}

/**
 * @deprecated Use ModelQuerySchemaLike instead.
 */
export type PrismaDelegateLike = ModelQuerySchemaLike

type FallbackIfUnknownOrNever<TValue, TFallback> =
    [TValue] extends [never]
    ? TFallback
    : unknown extends TValue
    ? TFallback
    : TValue

export type QuerySchemaFindManyArgs<TSchema extends ModelQuerySchemaLike> =
    FallbackIfUnknownOrNever<NonNullable<Parameters<TSchema['findMany']>[0]>, PrismaFindManyArgsLike>

export type QuerySchemaWhere<TSchema extends ModelQuerySchemaLike> =
    QuerySchemaFindManyArgs<TSchema> extends { where?: infer TWhere }
    ? FallbackIfUnknownOrNever<TWhere, PrismaLikeWhereInput>
    : PrismaLikeWhereInput

export type QuerySchemaInclude<TSchema extends ModelQuerySchemaLike> =
    QuerySchemaFindManyArgs<TSchema> extends { include?: infer TInclude }
    ? FallbackIfUnknownOrNever<TInclude, PrismaLikeInclude>
    : PrismaLikeInclude

export type QuerySchemaOrderBy<TSchema extends ModelQuerySchemaLike> =
    QuerySchemaFindManyArgs<TSchema> extends { orderBy?: infer TOrderBy }
    ? FallbackIfUnknownOrNever<TOrderBy, PrismaLikeOrderBy>
    : PrismaLikeOrderBy

export type QuerySchemaSelect<TSchema extends ModelQuerySchemaLike> =
    QuerySchemaFindManyArgs<TSchema> extends { select?: infer TSelect }
    ? FallbackIfUnknownOrNever<TSelect, PrismaLikeSelect>
    : PrismaLikeSelect

export type QuerySchemaCreateData<TSchema extends ModelQuerySchemaLike> =
    Parameters<TSchema['create']>[0] extends { data: infer TData }
    ? TData
    : Record<string, unknown>

export type QuerySchemaUpdateArgs<TSchema extends ModelQuerySchemaLike> = Parameters<TSchema['update']>[0]

export type QuerySchemaUpdateData<TSchema extends ModelQuerySchemaLike> =
    QuerySchemaUpdateArgs<TSchema> extends { data: infer TData }
    ? FallbackIfUnknownOrNever<TData, Record<string, unknown>>
    : Record<string, unknown>

export type QuerySchemaUniqueWhere<TSchema extends ModelQuerySchemaLike> =
    QuerySchemaUpdateArgs<TSchema> extends { where: infer TWhere }
    ? FallbackIfUnknownOrNever<TWhere, Record<string, unknown>>
    : Record<string, unknown>

export type QuerySchemaRow<TSchema extends ModelQuerySchemaLike> = Exclude<Awaited<ReturnType<TSchema['findFirst']>>, null>

export type QuerySchemaRows<TSchema extends ModelQuerySchemaLike> = Awaited<ReturnType<TSchema['findMany']>>

/**
 * @deprecated Use QuerySchemaFindManyArgs instead.
 */
export type DelegateFindManyArgs<TSchema extends ModelQuerySchemaLike> = QuerySchemaFindManyArgs<TSchema>

/**
 * @deprecated Use QuerySchemaWhere instead.
 */
export type DelegateWhere<TSchema extends ModelQuerySchemaLike> = QuerySchemaWhere<TSchema>

/**
 * @deprecated Use QuerySchemaInclude instead.
 */
export type DelegateInclude<TSchema extends ModelQuerySchemaLike> = QuerySchemaInclude<TSchema>

/**
 * @deprecated Use QuerySchemaOrderBy instead.
 */
export type DelegateOrderBy<TSchema extends ModelQuerySchemaLike> = QuerySchemaOrderBy<TSchema>

/**
 * @deprecated Use QuerySchemaSelect instead.
 */
export type DelegateSelect<TSchema extends ModelQuerySchemaLike> = QuerySchemaSelect<TSchema>

/**
 * @deprecated Use QuerySchemaCreateData instead.
 */
export type DelegateCreateData<TSchema extends ModelQuerySchemaLike> = QuerySchemaCreateData<TSchema>

/**
 * @deprecated Use QuerySchemaUpdateArgs instead.
 */
export type DelegateUpdateArgs<TSchema extends ModelQuerySchemaLike> = QuerySchemaUpdateArgs<TSchema>

/**
 * @deprecated Use QuerySchemaUpdateData instead.
 */
export type DelegateUpdateData<TSchema extends ModelQuerySchemaLike> = QuerySchemaUpdateData<TSchema>

/**
 * @deprecated Use QuerySchemaUniqueWhere instead.
 */
export type DelegateUniqueWhere<TSchema extends ModelQuerySchemaLike> = QuerySchemaUniqueWhere<TSchema>

/**
 * @deprecated Use QuerySchemaRow instead.
 */
export type DelegateRow<TSchema extends ModelQuerySchemaLike> = QuerySchemaRow<TSchema>

/**
 * @deprecated Use QuerySchemaRows instead.
 */
export type DelegateRows<TSchema extends ModelQuerySchemaLike> = QuerySchemaRows<TSchema>

export type Serializable = Record<string, unknown>
export * from './ModelStatic'