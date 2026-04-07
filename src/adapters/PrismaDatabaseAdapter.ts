import type {
    AdapterModelIntrospectionOptions,
    AdapterModelStructure,
    AdapterCapabilities,
    AdapterTransactionContext,
    AggregateSpec,
    DatabaseAdapter,
    DatabaseRow,
    DeleteManySpec,
    DeleteSpec,
    InsertManySpec,
    InsertSpec,
    QueryComparisonCondition,
    QueryCondition,
    QueryGroupCondition,
    QueryNotCondition,
    QueryOrderBy,
    QueryRawCondition,
    QuerySelectColumn,
    QueryTarget,
    RelationLoadPlan,
    RelationLoadSpec,
    SelectSpec,
    UpdateManySpec,
    UpdateSpec,
} from '../types/adapter'
import type {
    PrismaClientLike,
    PrismaDelegateLike,
    PrismaLikeInclude,
    PrismaLikeOrderBy,
    PrismaLikeSelect,
    PrismaLikeWhereInput,
} from '../types/core'

import { MissingDelegateException } from '../Exceptions/MissingDelegateException'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { inferDelegateName } from '../helpers/prisma'
import { isDelegateLike } from '../helpers/runtime-config'
import { str } from '@h3ravel/support'

export type PrismaDelegateNameMapping = Record<string, string>

/**
 * Database adapter implementation for Prisma, allowing Arkorm to execute queries using Prisma 
 * as the underlying query builder and executor.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 2.0.0-next.0
 */
export class PrismaDatabaseAdapter implements DatabaseAdapter {
    public readonly capabilities: AdapterCapabilities
    private readonly delegates: Record<string, PrismaDelegateLike>

    public constructor(
        private readonly prisma: PrismaClientLike,
        private readonly mapping: PrismaDelegateNameMapping = {},
    ) {
        this.delegates = Object.entries(prisma).reduce<Record<string, PrismaDelegateLike>>((accumulator, [key, value]) => {
            if (!isDelegateLike(value))
                return accumulator

            accumulator[key] = value

            return accumulator
        }, {})

        this.capabilities = {
            transactions: this.hasTransactionSupport(prisma),
            insertMany: Object.values(this.delegates).some(delegate => typeof (delegate as { createMany?: unknown }).createMany === 'function'),
            upsert: false,
            updateMany: Object.values(this.delegates).some(delegate => typeof (delegate as { updateMany?: unknown }).updateMany === 'function'),
            deleteMany: false,
            exists: true,
            relationLoads: false,
            relationAggregates: false,
            relationFilters: false,
            rawWhere: false,
            returning: false,
        }
    }

    private hasTransactionSupport (client: PrismaClientLike): client is PrismaClientLike & {
        $transaction: <TResult>(
            callback: (transactionClient: PrismaClientLike) => TResult | Promise<TResult>,
            options?: Record<string, unknown>,
        ) => Promise<TResult>
    } {
        return Boolean(client) && typeof (client as Record<string, unknown>).$transaction === 'function'
    }

    private normalizeCandidate (value: string): string {
        return value.trim()
    }

    private unique (values: string[]): string[] {
        return [...new Set(values.filter(Boolean))]
    }

    private runtimeModelTypeToTs (
        typeName: string,
        kind: string | undefined,
        enumValues: string[] | null,
    ): string {
        if (kind === 'enum' && enumValues && enumValues.length > 0)
            return enumValues.map(value => `'${value.replace(/'/g, '\\\'')}'`).join(' | ')

        switch (typeName) {
            case 'Int':
            case 'Float':
            case 'Decimal':
            case 'BigInt':
                return 'number'
            case 'Boolean':
                return 'boolean'
            case 'DateTime':
                return 'Date'
            case 'Json':
                return 'Record<string, unknown> | unknown[]'
            case 'Bytes':
                return 'Uint8Array'
            case 'String':
            case 'UUID':
                return 'string'
            default:
                return 'string'
        }
    }

    private getRuntimeDataModel (): {
        models?: Record<string, {
            dbName?: string | null
            fields?: Array<{
                name: string
                kind?: string
                type: string
                isList?: boolean
                isRequired?: boolean
            }>
        }>
        enums?: Record<string, {
            values?: Array<string | { name?: string }>
        }>
    } | null {
        const prismaRecord = this.prisma as Record<string, unknown>

        const runtimeDataModel = prismaRecord._runtimeDataModel as {
            models?: Record<string, unknown>
            enums?: Record<string, unknown>
        } | undefined

        if (runtimeDataModel && typeof runtimeDataModel === 'object')
            return runtimeDataModel as ReturnType<PrismaDatabaseAdapter['getRuntimeDataModel']>

        return null
    }

    private toQuerySelect (columns?: QuerySelectColumn[]): PrismaLikeSelect | undefined {
        if (!columns || columns.length === 0)
            return undefined

        return columns.reduce<PrismaLikeSelect>((select, column) => {
            select[column.column] = true

            return select
        }, {})
    }

    private toQueryOrderBy (orderBy?: QueryOrderBy[]): PrismaLikeOrderBy | undefined {
        if (!orderBy || orderBy.length === 0)
            return undefined

        return orderBy.map((entry) => ({ [entry.column]: entry.direction }))
    }

    private toComparisonWhere (condition: QueryComparisonCondition): PrismaLikeWhereInput {
        if (condition.operator === 'is-null')
            return { [condition.column]: null }

        if (condition.operator === 'is-not-null')
            return { [condition.column]: { not: null } }

        if (condition.operator === '=')
            return { [condition.column]: condition.value }

        if (condition.operator === '!=')
            return { [condition.column]: { not: condition.value } }

        if (condition.operator === '>')
            return { [condition.column]: { gt: condition.value } }

        if (condition.operator === '>=')
            return { [condition.column]: { gte: condition.value } }

        if (condition.operator === '<')
            return { [condition.column]: { lt: condition.value } }

        if (condition.operator === '<=')
            return { [condition.column]: { lte: condition.value } }

        if (condition.operator === 'in')
            return { [condition.column]: { in: Array.isArray(condition.value) ? condition.value : [condition.value] } }

        if (condition.operator === 'not-in')
            return { [condition.column]: { notIn: Array.isArray(condition.value) ? condition.value : [condition.value] } }

        if (condition.operator === 'contains')
            return { [condition.column]: { contains: condition.value } }

        if (condition.operator === 'starts-with')
            return { [condition.column]: { startsWith: condition.value } }

        return { [condition.column]: { endsWith: condition.value } }
    }

    private toQueryWhere (condition?: QueryCondition): PrismaLikeWhereInput | undefined {
        if (!condition)
            return undefined

        if (condition.type === 'comparison')
            return this.toComparisonWhere(condition)

        if (condition.type === 'group') {
            const group = condition as QueryGroupCondition
            const grouped = group.conditions
                .map(entry => this.toQueryWhere(entry))
                .filter((entry): entry is PrismaLikeWhereInput => Boolean(entry))

            if (grouped.length === 0)
                return undefined

            return group.operator === 'and'
                ? { AND: grouped }
                : { OR: grouped }
        }

        if (condition.type === 'not') {
            const notCondition = condition as QueryNotCondition
            const nested = this.toQueryWhere(notCondition.condition)
            if (!nested)
                return undefined

            return { NOT: nested }
        }

        throw new UnsupportedAdapterFeatureException('Raw where clauses are not supported by the Prisma compatibility adapter.', {
            operation: 'adapter.where',
            meta: {
                feature: 'rawWhere',
                sql: (condition as QueryRawCondition).sql,
            },
        })
    }

    private buildFindArgs (spec: SelectSpec<any>): {
        include?: PrismaLikeInclude
        where?: PrismaLikeWhereInput
        orderBy?: PrismaLikeOrderBy
        select?: PrismaLikeSelect
        skip?: number
        take?: number
    } {
        return {
            include: this.toQueryInclude(spec.relationLoads),
            where: this.toQueryWhere(spec.where),
            orderBy: this.toQueryOrderBy(spec.orderBy),
            select: this.toQuerySelect(spec.columns),
            skip: spec.offset,
            take: spec.limit,
        }
    }

    private toQueryInclude (relationLoads?: RelationLoadPlan[]): PrismaLikeInclude | undefined {
        if (!relationLoads || relationLoads.length === 0)
            return undefined

        return relationLoads.reduce<PrismaLikeInclude>((include, plan) => {
            const nestedInclude = this.toQueryInclude(plan.relationLoads)
            const nestedSelect = this.toQuerySelect(plan.columns)
            const nestedWhere = this.toQueryWhere(plan.constraint)
            const nestedOrderBy = this.toQueryOrderBy(plan.orderBy)

            if (!nestedInclude && !nestedSelect && !nestedWhere && !nestedOrderBy && plan.offset === undefined && plan.limit === undefined) {
                include[plan.relation] = true

                return include
            }

            include[plan.relation] = {
                where: nestedWhere,
                orderBy: nestedOrderBy,
                select: nestedSelect,
                include: nestedInclude,
                skip: plan.offset,
                take: plan.limit,
            }

            return include
        }, {})
    }

    public async introspectModels (options: AdapterModelIntrospectionOptions = {}): Promise<AdapterModelStructure[]> {
        const runtimeDataModel = this.getRuntimeDataModel()
        if (!runtimeDataModel?.models)
            return []

        const requestedTables = new Set(options.tables?.filter(Boolean) ?? [])
        const enums = runtimeDataModel.enums ?? {}

        return Object.entries(runtimeDataModel.models).flatMap(([name, model]) => {
            const table = model.dbName ?? `${str(name).camel().plural()}`
            if (requestedTables.size > 0 && !requestedTables.has(table))
                return []

            return [{
                name,
                table,
                fields: (model.fields ?? [])
                    .filter(field => field.kind !== 'object')
                    .map((field) => {
                        const enumValues = field.kind === 'enum'
                            ? ((enums[field.type]?.values ?? []) as Array<string | { name?: string }>).map(value => typeof value === 'string' ? value : value.name ?? '').filter(Boolean)
                            : null
                        const baseType = this.runtimeModelTypeToTs(field.type, field.kind, enumValues)

                        return {
                            name: field.name,
                            type: field.isList ? `Array<${baseType}>` : baseType,
                            nullable: field.isRequired === false,
                        }
                    }),
            }]
        })
    }

    private resolveDelegate (target: QueryTarget<any>): PrismaDelegateLike {
        const tableName = target.table ? this.normalizeCandidate(target.table) : ''
        const singularTableName = tableName ? `${str(tableName).singular()}` : ''
        const camelTableName = tableName ? `${str(tableName).camel()}` : ''
        const camelSingularTableName = tableName ? `${str(tableName).camel().singular()}` : ''

        const candidates = this.unique([
            target.table ? this.mapping[target.table] : '',
            tableName,
            singularTableName ? this.mapping[singularTableName] : '',
            singularTableName,
            camelTableName ? this.mapping[camelTableName] : '',
            camelTableName,
            camelSingularTableName ? this.mapping[camelSingularTableName] : '',
            camelSingularTableName,
            target.modelName ? this.mapping[target.modelName] : '',
            target.modelName ? this.normalizeCandidate(target.modelName) : '',
            target.modelName ? inferDelegateName(target.modelName) : '',
            target.modelName ? this.mapping[inferDelegateName(target.modelName)] : '',
        ])

        const resolved = candidates
            .map(candidate => this.delegates[candidate])
            .find(Boolean)

        if (resolved)
            return resolved

        throw new MissingDelegateException('Prisma delegate could not be resolved for adapter target.', {
            operation: 'getDelegate',
            model: target.modelName,
            delegate: target.table,
            meta: {
                target,
                candidates,
            },
        })
    }

    /**
     * @todo Implement relationLoads by performing separate queries and merging results 
     * in-memory, since Prisma does not support nested reads with constraints, ordering, or
     * pagination on related models as of now.
     * 
     * @param spec 
     * @returns 
     */
    public async select<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow[]> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.findMany(this.buildFindArgs(spec)) as DatabaseRow[]
    }

    /**
     * Selects a single record matching the specified criteria. 
     * 
     * @param spec 
     * @returns 
     */
    public async selectOne<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow | null> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.findFirst(this.buildFindArgs(spec)) as DatabaseRow | null
    }

    /**
     * Inserts a single record into the database and returns the created record.
     * 
     * @param spec 
     * @returns 
     */
    public async insert<TModel = unknown> (spec: InsertSpec<TModel>): Promise<DatabaseRow> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.create({ data: spec.values }) as DatabaseRow
    }

    /**
     * Inserts multiple records into the database. 
     * 
     * @param spec 
     * @returns 
     */
    public async insertMany<TModel = unknown> (spec: InsertManySpec<TModel>): Promise<number> {
        const delegate = this.resolveDelegate(spec.target) as PrismaDelegateLike & {
            createMany?: (args: { data: DatabaseRow[], skipDuplicates?: boolean }) => Promise<{ count?: number } | number>
        }

        if (typeof delegate.createMany === 'function') {
            const result = await delegate.createMany({
                data: spec.values,
                skipDuplicates: spec.ignoreDuplicates,
            })
            if (typeof result === 'number')
                return result

            return typeof result?.count === 'number' ? result.count : spec.values.length
        }

        let inserted = 0
        for (const values of spec.values) {
            try {
                await delegate.create({ data: values })
                inserted += 1
            } catch (error) {
                if (!spec.ignoreDuplicates)
                    throw error
            }
        }

        return spec.ignoreDuplicates ? inserted : spec.values.length
    }

    /**
     * Updates a single record matching the specified criteria and returns the updated record.
     * 
     * @param spec 
     * @returns 
     */
    public async update<TModel = unknown> (spec: UpdateSpec<TModel>): Promise<DatabaseRow | null> {
        const delegate = this.resolveDelegate(spec.target)
        const where = this.toQueryWhere(spec.where)
        if (!where)
            return null

        return await delegate.update({ where, data: spec.values }) as DatabaseRow
    }

    /**
     * Updates multiple records matching the specified criteria. 
     * 
     * @param spec 
     * @returns 
     */
    public async updateMany<TModel = unknown> (spec: UpdateManySpec<TModel>): Promise<number> {
        const delegate = this.resolveDelegate(spec.target) as PrismaDelegateLike & {
            updateMany?: (args: { where?: PrismaLikeWhereInput, data: DatabaseRow }) => Promise<{ count?: number } | number>
        }
        const where = this.toQueryWhere(spec.where)

        if (typeof delegate.updateMany === 'function') {
            const result = await delegate.updateMany({ where, data: spec.values })
            if (typeof result === 'number')
                return result

            return typeof result?.count === 'number' ? result.count : 0
        }

        const rows = await delegate.findMany({ where }) as DatabaseRow[]
        await Promise.all(rows.map(async (row) => {
            await delegate.update({ where: row, data: spec.values })
        }))

        return rows.length
    }

    /**
     * Deletes a single record matching the specified criteria and returns the deleted record.
     * 
     * @param spec 
     * @returns 
     */
    public async delete<TModel = unknown> (spec: DeleteSpec<TModel>): Promise<DatabaseRow | null> {
        const delegate = this.resolveDelegate(spec.target)
        const where = this.toQueryWhere(spec.where)
        if (!where)
            return null

        return await delegate.delete({ where }) as DatabaseRow
    }

    /**
     * Deletes multiple records matching the specified criteria. 
     * 
     * @param spec 
     * @returns 
     */
    public async deleteMany<TModel = unknown> (spec: DeleteManySpec<TModel>): Promise<number> {
        const delegate = this.resolveDelegate(spec.target)
        const where = this.toQueryWhere(spec.where)
        const rows = await delegate.findMany({ where }) as DatabaseRow[]

        await Promise.all(rows.map(async (row) => {
            await delegate.delete({ where: row })
        }))

        return rows.length
    }

    /**
     * Counts the number of records matching the specified criteria.
     * 
     * @param spec 
     * @returns 
     */
    public async count<TModel = unknown> (spec: AggregateSpec<TModel>): Promise<number> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.count({ where: this.toQueryWhere(spec.where) })
    }

    /**
     * Checks for the existence of records matching the specified criteria.
     * 
     * @param spec 
     * @returns 
     */
    public async exists<TModel = unknown> (spec: SelectSpec<TModel>): Promise<boolean> {
        const row = await this.selectOne({
            ...spec,
            limit: 1,
        })

        return row != null
    }

    /**
     * Loads related models for a batch of parent records based on the specified relation load plans.
     * 
     * @param _spec 
     */
    public async loadRelations<TModel = unknown> (_spec: RelationLoadSpec<TModel>): Promise<void> {
        throw new UnsupportedAdapterFeatureException('Relation batch loading is not supported by the Prisma compatibility adapter yet.', {
            operation: 'adapter.loadRelations',
            meta: {
                feature: 'relationLoads',
            },
        })
    }

    /**
     * Executes a series of database operations within a transaction. 
     * If the underlying Prisma client does not support transactions, an exception is thrown.
     * 
     * @param callback 
     * @param context 
     * @returns 
     */
    public async transaction<TResult = unknown> (
        callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
        context: AdapterTransactionContext = {},
    ): Promise<TResult> {
        if (!this.hasTransactionSupport(this.prisma)) {
            throw new UnsupportedAdapterFeatureException('Transactions are not supported by the Prisma compatibility adapter.', {
                operation: 'adapter.transaction',
                meta: {
                    feature: 'transactions',
                },
            })
        }

        return await this.prisma.$transaction(async (transactionClient: PrismaClientLike) => {
            const adapter = new PrismaDatabaseAdapter(transactionClient, this.mapping)

            return await callback(adapter)
        }, {
            isolationLevel: context.isolationLevel,
            maxWait: context.maxWait,
            timeout: context.timeout,
        })
    }
}

/**
 * Factory function to create a PrismaDatabaseAdapter instance with the given 
 * Prisma client and optional delegate name mapping.
 * 
 * @param prisma    The Prisma client instance to be used by the adapter.
 * @param mapping   Optional mapping of delegate names.
 * @returns         A new instance of PrismaDatabaseAdapter.
 */
export const createPrismaDatabaseAdapter = (
    prisma: PrismaClientLike,
    mapping: PrismaDelegateNameMapping = {},
): PrismaDatabaseAdapter => {
    return new PrismaDatabaseAdapter(prisma, mapping)
}

/**
 * Alias for createPrismaDatabaseAdapter to maintain backward compatibility with 
 * previous versions of Arkorm that exported the adapter factory under a different name.
 * 
 * @param prisma    The Prisma client instance to be used by the adapter.
 * @param mapping   Optional mapping of delegate names.
 * @returns         A new instance of PrismaDatabaseAdapter.
 */
export const createPrismaCompatibilityAdapter = createPrismaDatabaseAdapter