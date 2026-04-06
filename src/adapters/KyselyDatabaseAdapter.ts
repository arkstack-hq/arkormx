import type { AccessMode, IsolationLevel, Kysely, RawBuilder, Transaction } from 'kysely'
import type {
    AdapterCapabilities,
    AdapterTransactionContext,
    AggregateSpec,
    DatabaseAdapter,
    DatabaseRow,
    DatabaseValue,
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
    RelationLoadSpec,
    SelectSpec,
    UpdateManySpec,
    UpdateSpec,
} from '../types/adapter'

import { ArkormException } from '../Exceptions/ArkormException'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { sql } from 'kysely'

type KyselyExecutor = Kysely<any> | Transaction<any>

export class KyselyDatabaseAdapter implements DatabaseAdapter {
    public readonly capabilities: AdapterCapabilities = {
        transactions: true,
        returning: true,
        insertMany: true,
        updateMany: true,
        deleteMany: true,
        exists: true,
        relationLoads: false,
        relationAggregates: false,
        relationFilters: false,
        rawWhere: false,
    }

    public constructor(
        private readonly db: KyselyExecutor,
    ) { }

    private resolveTable (target: QueryTarget<any>): string {
        if (target.table && target.table.trim().length > 0)
            return target.table

        throw new ArkormException('Kysely adapter requires a concrete target table.', {
            operation: 'adapter.table',
            model: target.modelName,
            meta: {
                target,
            },
        })
    }

    private resolvePrimaryKey (target: QueryTarget<any>): string {
        return this.mapColumn(target, target.primaryKey || 'id')
    }

    private mapColumn (target: QueryTarget<any>, column: string): string {
        return target.columns?.[column] ?? column
    }

    private reverseColumnMap (target: QueryTarget<any>): Record<string, string> {
        return Object.entries(target.columns ?? {}).reduce<Record<string, string>>((all, [attribute, column]) => {
            all[column] = attribute

            return all
        }, {})
    }

    private mapRow (target: QueryTarget<any>, row: Record<string, unknown> | undefined | null): DatabaseRow | null {
        if (!row)
            return null

        const reverseMap = this.reverseColumnMap(target)

        return Object.entries(row).reduce<DatabaseRow>((mapped, [key, value]) => {
            mapped[reverseMap[key] ?? key] = value

            return mapped
        }, {})
    }

    private mapRows (target: QueryTarget<any>, rows: Record<string, unknown>[]): DatabaseRow[] {
        return rows.map(row => this.mapRow(target, row) as DatabaseRow)
    }

    private mapValues (target: QueryTarget<any>, values: DatabaseRow): DatabaseRow {
        return Object.entries(values).reduce<DatabaseRow>((mapped, [key, value]) => {
            mapped[this.mapColumn(target, key)] = value

            return mapped
        }, {})
    }

    private buildSelectList (target: QueryTarget<any>, columns?: QuerySelectColumn[]): RawBuilder<unknown> {
        if (!columns || columns.length === 0)
            return sql.raw('*')

        return sql.join(columns.map(({ column, alias }) => {
            const mappedColumn = this.mapColumn(target, column)
            const resultAlias = alias ?? column

            if (mappedColumn === resultAlias)
                return sql.ref(mappedColumn)

            return sql`${sql.ref(mappedColumn)} as ${sql.id(resultAlias)}`
        }))
    }

    private buildOrderBy (target: QueryTarget<any>, orderBy?: QueryOrderBy[]): RawBuilder<unknown> {
        if (!orderBy || orderBy.length === 0)
            return sql``

        return sql` order by ${sql.join(orderBy.map(({ column, direction }) => {
            return sql`${sql.ref(this.mapColumn(target, column))} ${sql.raw(direction === 'desc' ? 'desc' : 'asc')}`
        }), sql`, `)}`
    }

    private buildConditionValueList (value: DatabaseValue | DatabaseValue[] | undefined): unknown[] {
        if (Array.isArray(value))
            return value

        return typeof value === 'undefined' ? [] : [value]
    }

    private buildComparisonCondition (target: QueryTarget<any>, condition: QueryComparisonCondition): RawBuilder<boolean> {
        const column = sql.ref(this.mapColumn(target, condition.column))

        if (condition.operator === 'is-null')
            return sql<boolean>`${column} is null`

        if (condition.operator === 'is-not-null')
            return sql<boolean>`${column} is not null`

        if (condition.operator === 'in') {
            const values = this.buildConditionValueList(condition.value)
            if (values.length === 0)
                return sql<boolean>`1 = 0`

            return sql<boolean>`${column} in (${sql.join(values)})`
        }

        if (condition.operator === 'not-in') {
            const values = this.buildConditionValueList(condition.value)
            if (values.length === 0)
                return sql<boolean>`1 = 1`

            return sql<boolean>`${column} not in (${sql.join(values)})`
        }

        if (condition.operator === 'contains')
            return sql<boolean>`${column} like ${`%${String(condition.value ?? '')}%`}`

        if (condition.operator === 'starts-with')
            return sql<boolean>`${column} like ${`${String(condition.value ?? '')}%`}`

        if (condition.operator === 'ends-with')
            return sql<boolean>`${column} like ${`%${String(condition.value ?? '')}`}`

        const operator = condition.operator === '!='
            ? sql.raw('!=')
            : sql.raw(condition.operator)

        return sql<boolean>`${column} ${operator} ${condition.value}`
    }

    private buildWhereCondition (target: QueryTarget<any>, condition?: QueryCondition): RawBuilder<boolean> {
        if (!condition)
            return sql<boolean>`1 = 1`

        if (condition.type === 'comparison')
            return this.buildComparisonCondition(target, condition)

        if (condition.type === 'group') {
            const group = condition as QueryGroupCondition
            const conditions: RawBuilder<boolean>[] = group.conditions.map((entry): RawBuilder<boolean> => {
                return this.buildWhereCondition(target, entry)
            })

            if (conditions.length === 0)
                return sql<boolean>`1 = 1`

            const separator = group.operator === 'or'
                ? sql` or `
                : sql` and `

            return sql<boolean>`(${sql.join(conditions, separator)})`
        }

        if (condition.type === 'not') {
            const notCondition = condition as QueryNotCondition

            return sql<boolean>`not (${this.buildWhereCondition(target, notCondition.condition)})`
        }

        throw new UnsupportedAdapterFeatureException('Raw where clauses are not supported by the Kysely adapter.', {
            operation: 'adapter.where',
            meta: {
                feature: 'rawWhere',
                sql: (condition as QueryRawCondition).sql,
            },
        })
    }

    private buildWhereClause (target: QueryTarget<any>, condition?: QueryCondition): RawBuilder<unknown> {
        if (!condition)
            return sql``

        return sql` where ${this.buildWhereCondition(target, condition)}`
    }

    private buildPaginationClause (spec: SelectSpec<any>): RawBuilder<unknown> {
        const clauses: RawBuilder<unknown>[] = []

        if (typeof spec.limit === 'number')
            clauses.push(sql` limit ${spec.limit}`)

        if (typeof spec.offset === 'number')
            clauses.push(sql` offset ${spec.offset}`)

        if (clauses.length === 0)
            return sql``

        return sql.join(clauses, sql``)
    }

    private assertNoRelationLoads (spec: SelectSpec<any> | RelationLoadSpec<any>) {
        if ('relationLoads' in spec && spec.relationLoads && spec.relationLoads.length > 0) {
            throw new UnsupportedAdapterFeatureException('Kysely adapter relation-load execution is planned for a later phase.', {
                operation: 'adapter.relationLoads',
                meta: {
                    feature: 'relationLoads',
                },
            })
        }
    }

    public async select<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow[]> {
        this.assertNoRelationLoads(spec)

        const result = await sql<Record<string, unknown>>`
            select ${this.buildSelectList(spec.target, spec.columns)}
            from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            ${this.buildOrderBy(spec.target, spec.orderBy)}
            ${this.buildPaginationClause(spec)}
        `.execute(this.db)

        return this.mapRows(spec.target, result.rows as unknown as Record<string, unknown>[])
    }

    public async selectOne<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow | null> {
        const rows = await this.select({
            ...spec,
            limit: spec.limit ?? 1,
        })

        return rows[0] ?? null
    }

    public async insert<TModel = unknown> (spec: InsertSpec<TModel>): Promise<DatabaseRow> {
        const values = this.mapValues(spec.target, spec.values)
        const columns = Object.keys(values)

        const result = columns.length === 0
            ? await sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))}
                default values
                returning *
            `.execute(this.db)
            : await sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))} (${sql.join(columns.map(column => sql.id(column)), sql`, `)})
                values (${sql.join(columns.map(column => values[column]), sql`, `)})
                returning *
            `.execute(this.db)

        return this.mapRow(spec.target, result.rows[0] as unknown as Record<string, unknown>) as DatabaseRow
    }

    public async insertMany<TModel = unknown> (spec: InsertManySpec<TModel>): Promise<number> {
        if (spec.values.length === 0)
            return 0

        const rows = spec.values.map(row => this.mapValues(spec.target, row))
        const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))))

        if (columns.length === 0) {
            const result = await sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))}
                default values
                ${spec.ignoreDuplicates ? sql` on conflict do nothing` : sql``}
                returning ${sql.id(this.resolvePrimaryKey(spec.target))}
            `.execute(this.db)

            return result.rows.length
        }

        const values = sql.join(rows.map(row => {
            return sql`(${sql.join(columns.map(column => row[column] ?? null), sql`, `)})`
        }), sql`, `)

        const result = await sql<Record<string, unknown>>`
            insert into ${sql.table(this.resolveTable(spec.target))} (${sql.join(columns.map(column => sql.id(column)), sql`, `)})
            values ${values}
            ${spec.ignoreDuplicates ? sql` on conflict do nothing` : sql``}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `.execute(this.db)

        return result.rows.length
    }

    public async update<TModel = unknown> (spec: UpdateSpec<TModel>): Promise<DatabaseRow | null> {
        const values = this.mapValues(spec.target, spec.values)
        const assignments = Object.entries(values).map(([column, value]) => {
            return sql`${sql.id(column)} = ${value}`
        })

        if (assignments.length === 0)
            return await this.selectOne({ target: spec.target, where: spec.where, limit: 1 })

        const result = await sql<Record<string, unknown>>`
            update ${sql.table(this.resolveTable(spec.target))}
            set ${sql.join(assignments, sql`, `)}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning *
        `.execute(this.db)

        return this.mapRow(spec.target, result.rows[0] as unknown as Record<string, unknown>)
    }

    public async updateMany<TModel = unknown> (spec: UpdateManySpec<TModel>): Promise<number> {
        const values = this.mapValues(spec.target, spec.values)
        const assignments = Object.entries(values).map(([column, value]) => {
            return sql`${sql.id(column)} = ${value}`
        })

        if (assignments.length === 0)
            return 0

        const result = await sql<Record<string, unknown>>`
            update ${sql.table(this.resolveTable(spec.target))}
            set ${sql.join(assignments, sql`, `)}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `.execute(this.db)

        return result.rows.length
    }

    public async delete<TModel = unknown> (spec: DeleteSpec<TModel>): Promise<DatabaseRow | null> {
        const result = await sql<Record<string, unknown>>`
            delete from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning *
        `.execute(this.db)

        return this.mapRow(spec.target, result.rows[0] as unknown as Record<string, unknown>)
    }

    public async deleteMany<TModel = unknown> (spec: DeleteManySpec<TModel>): Promise<number> {
        const result = await sql<Record<string, unknown>>`
            delete from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `.execute(this.db)

        return result.rows.length
    }

    public async count<TModel = unknown> (spec: AggregateSpec<TModel>): Promise<number> {
        const result = await sql<{ count: number | string }>`
            select count(*)::int as count
            from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
        `.execute(this.db)

        return Number((result.rows[0] as { count?: number | string } | undefined)?.count ?? 0)
    }

    public async exists<TModel = unknown> (spec: SelectSpec<TModel>): Promise<boolean> {
        const result = await sql<{ exists: boolean }>`
            select exists(
                select 1
                from ${sql.table(this.resolveTable(spec.target))}
                ${this.buildWhereClause(spec.target, spec.where)}
                limit 1
            ) as exists
        `.execute(this.db)

        return Boolean((result.rows[0] as { exists?: boolean } | undefined)?.exists)
    }

    public async transaction<TResult = unknown> (
        callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
        context: AdapterTransactionContext = {},
    ): Promise<TResult> {
        let transactionBuilder = this.db.transaction()

        if (context.readOnly !== undefined) {
            transactionBuilder = transactionBuilder.setAccessMode(
                context.readOnly ? 'read only' as AccessMode : 'read write' as AccessMode
            )
        }

        if (context.isolationLevel) {
            transactionBuilder = transactionBuilder.setIsolationLevel(
                context.isolationLevel as IsolationLevel
            )
        }

        return await transactionBuilder.execute(async (transaction) => {
            return await callback(new KyselyDatabaseAdapter(transaction))
        })
    }
}

export const createKyselyAdapter = (
    db: KyselyExecutor,
): KyselyDatabaseAdapter => {
    return new KyselyDatabaseAdapter(db)
}