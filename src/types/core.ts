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

export interface PrismaFindManyArgs {
    where?: Record<string, unknown>
    include?: Record<string, unknown>
    orderBy?: Record<string, unknown> | Record<string, unknown>[]
    select?: Record<string, unknown>
    skip?: number
    take?: number
}

export interface PrismaDelegateLike {
    findMany: (args?: PrismaFindManyArgs) => Promise<unknown[]>
    findFirst: (args?: PrismaFindManyArgs) => Promise<unknown | null>
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>
    update: (args: { where: Record<string, unknown>, data: Record<string, unknown> }) => Promise<unknown>
    delete: (args: { where: Record<string, unknown> }) => Promise<unknown>
    count: (args?: { where?: Record<string, unknown> }) => Promise<number>
}

export type Serializable = Record<string, unknown>