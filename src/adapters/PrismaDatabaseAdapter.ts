import type {
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

import { ArkormException } from '../Exceptions/ArkormException'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { inferDelegateName } from '../helpers/prisma'
import { isDelegateLike } from '../helpers/runtime-config'

export type PrismaDelegateNameMapping = Record<string, string>

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

    private resolveDelegate (target: QueryTarget<any>): PrismaDelegateLike {
        const candidates = this.unique([
            target.table ? this.mapping[target.table] : '',
            target.table ? this.normalizeCandidate(target.table) : '',
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

        throw new ArkormException('Prisma delegate could not be resolved for adapter target.', {
            code: 'DELEGATE_NOT_RESOLVED',
            operation: 'adapter.resolveDelegate',
            meta: {
                target,
                candidates,
            },
        })
    }

    public async select<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow[]> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.findMany(this.buildFindArgs(spec)) as DatabaseRow[]
    }

    public async selectOne<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow | null> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.findFirst(this.buildFindArgs(spec)) as DatabaseRow | null
    }

    public async insert<TModel = unknown> (spec: InsertSpec<TModel>): Promise<DatabaseRow> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.create({ data: spec.values }) as DatabaseRow
    }

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

    public async update<TModel = unknown> (spec: UpdateSpec<TModel>): Promise<DatabaseRow | null> {
        const delegate = this.resolveDelegate(spec.target)
        const where = this.toQueryWhere(spec.where)
        if (!where)
            return null

        return await delegate.update({ where, data: spec.values }) as DatabaseRow
    }

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

    public async delete<TModel = unknown> (spec: DeleteSpec<TModel>): Promise<DatabaseRow | null> {
        const delegate = this.resolveDelegate(spec.target)
        const where = this.toQueryWhere(spec.where)
        if (!where)
            return null

        return await delegate.delete({ where }) as DatabaseRow
    }

    public async deleteMany<TModel = unknown> (spec: DeleteManySpec<TModel>): Promise<number> {
        const delegate = this.resolveDelegate(spec.target)
        const where = this.toQueryWhere(spec.where)
        const rows = await delegate.findMany({ where }) as DatabaseRow[]

        await Promise.all(rows.map(async (row) => {
            await delegate.delete({ where: row })
        }))

        return rows.length
    }

    public async count<TModel = unknown> (spec: AggregateSpec<TModel>): Promise<number> {
        const delegate = this.resolveDelegate(spec.target)

        return await delegate.count({ where: this.toQueryWhere(spec.where) })
    }

    public async exists<TModel = unknown> (spec: SelectSpec<TModel>): Promise<boolean> {
        const row = await this.selectOne({
            ...spec,
            limit: 1,
        })

        return row != null
    }

    public async loadRelations<TModel = unknown> (_spec: RelationLoadSpec<TModel>): Promise<void> {
        throw new UnsupportedAdapterFeatureException('Relation batch loading is not supported by the Prisma compatibility adapter yet.', {
            operation: 'adapter.loadRelations',
            meta: {
                feature: 'relationLoads',
            },
        })
    }

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

export const createPrismaDatabaseAdapter = (
    prisma: PrismaClientLike,
    mapping: PrismaDelegateNameMapping = {},
): PrismaDatabaseAdapter => {
    return new PrismaDatabaseAdapter(prisma, mapping)
}

export const createPrismaCompatibilityAdapter = createPrismaDatabaseAdapter