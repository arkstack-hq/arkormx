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
    RelationAggregateSpec,
    RelationFilterSpec,
    RelationLoadSpec,
    SelectSpec,
    UpdateManySpec,
    UpdateSpec,
} from '../types/adapter'
import type { BelongsToRelationMetadata, HasManyRelationMetadata, HasOneRelationMetadata, ModelStatic } from '../types'

import { ArkormException } from '../Exceptions/ArkormException'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { sql } from 'kysely'

type KyselyExecutor = Kysely<any> | Transaction<any>
type KyselyTableMapping = Record<string, string>
type DirectRelationMetadata = HasManyRelationMetadata | HasOneRelationMetadata | BelongsToRelationMetadata

/**
 * Database adapter implementation for Kysely, allowing Arkorm to execute queries using Kysely 
 * as the underlying query builder and executor.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 2.0.0-next.0
 */
export class KyselyDatabaseAdapter implements DatabaseAdapter {
    public readonly capabilities: AdapterCapabilities = {
        transactions: true,
        returning: true,
        insertMany: true,
        updateMany: true,
        deleteMany: true,
        exists: true,
        relationLoads: false,
        relationAggregates: true,
        relationFilters: true,
        rawWhere: false,
    }

    public constructor(
        private readonly db: KyselyExecutor,
        private readonly mapping: KyselyTableMapping = {},
    ) { }

    private resolveTable (target: QueryTarget<any>): string {
        if (target.table && target.table.trim().length > 0)
            return this.mapping[target.table] ?? target.table

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

    private buildColumnReference (table: string, column: string): RawBuilder<unknown> {
        return sql`${sql.table(table)}.${sql.id(column)}`
    }

    private buildRelatedTargetFromRelation (target: QueryTarget<any>, relation: string): {
        metadata: DirectRelationMetadata
        relatedTarget: QueryTarget<any>
    } {
        const metadata = target.model?.getRelationMetadata(relation)
        if (!metadata)
            throw new UnsupportedAdapterFeatureException(`Relation [${relation}] could not be resolved for SQL-backed relation execution.`, {
                operation: 'adapter.relation.metadata',
                model: target.modelName,
                relation,
            })

        if (metadata.type !== 'hasMany' && metadata.type !== 'hasOne' && metadata.type !== 'belongsTo') {
            throw new UnsupportedAdapterFeatureException(`Relation [${relation}] is not supported for SQL-backed relation execution by the Kysely adapter yet.`, {
                operation: 'adapter.relation.metadata',
                model: target.modelName,
                relation,
                meta: {
                    feature: 'relationFilters',
                    relationType: metadata.type,
                },
            })
        }

        const relatedMetadata = metadata.relatedModel.getModelMetadata()

        return {
            metadata,
            relatedTarget: {
                model: metadata.relatedModel as unknown as ModelStatic<any, any>,
                modelName: metadata.relatedModel.name,
                table: relatedMetadata.table,
                primaryKey: relatedMetadata.primaryKey,
                columns: relatedMetadata.columns,
                softDelete: relatedMetadata.softDelete,
            },
        }
    }

    private buildRelatedJoinCondition (
        outerTarget: QueryTarget<any>,
        relation: string,
    ): { relatedTarget: QueryTarget<any>, condition: RawBuilder<boolean> } {
        const { metadata, relatedTarget } = this.buildRelatedTargetFromRelation(outerTarget, relation)
        const outerTable = this.resolveTable(outerTarget)
        const relatedTable = this.resolveTable(relatedTarget)

        if (metadata.type === 'hasMany' || metadata.type === 'hasOne') {
            return {
                relatedTarget,
                condition: sql<boolean>`
                    ${this.buildColumnReference(relatedTable, this.mapColumn(relatedTarget, metadata.foreignKey))}
                    =
                    ${this.buildColumnReference(outerTable, this.mapColumn(outerTarget, metadata.localKey))}
                `,
            }
        }

        return {
            relatedTarget,
            condition: sql<boolean>`
                ${this.buildColumnReference(relatedTable, this.mapColumn(relatedTarget, metadata.ownerKey))}
                =
                ${this.buildColumnReference(outerTable, this.mapColumn(outerTarget, metadata.foreignKey))}
            `,
        }
    }

    private combineConditions (conditions: Array<RawBuilder<boolean> | null | undefined>): RawBuilder<boolean> {
        const filtered = conditions.filter((condition): condition is RawBuilder<boolean> => Boolean(condition))
        if (filtered.length === 0)
            return sql<boolean>`1 = 1`

        if (filtered.length === 1)
            return filtered[0] as RawBuilder<boolean>

        return sql<boolean>`(${sql.join(filtered, sql` and `)})`
    }

    private buildRelationFilterExpression (target: QueryTarget<any>, filter: RelationFilterSpec): RawBuilder<boolean> {
        const { relatedTarget, condition } = this.buildRelatedJoinCondition(target, filter.relation)
        const relatedTable = this.resolveTable(relatedTarget)
        const whereCondition = this.combineConditions([
            condition,
            filter.where ? this.buildWhereCondition(relatedTarget, filter.where) : undefined,
        ])
        const operator = filter.operator === '!=' ? sql.raw('!=') : sql.raw(filter.operator)

        return sql<boolean>`(
            select count(*)::int
            from ${sql.table(relatedTable)}
            where ${whereCondition}
        ) ${operator} ${filter.count}`
    }

    private buildRelationFilterCondition (target: QueryTarget<any>, relationFilters?: RelationFilterSpec[]): RawBuilder<boolean> {
        if (!relationFilters || relationFilters.length === 0)
            return sql<boolean>`1 = 1`

        let expression: RawBuilder<boolean> | null = null
        relationFilters.forEach((filter) => {
            const next = this.buildRelationFilterExpression(target, filter)
            if (!expression) {
                expression = next

                return
            }

            expression = filter.boolean === 'OR'
                ? sql<boolean>`(${expression} or ${next})`
                : sql<boolean>`(${expression} and ${next})`
        })

        return expression ?? sql<boolean>`1 = 1`
    }

    private buildRelationAggregateSelectList (target: QueryTarget<any>, relationAggregates?: RelationAggregateSpec[]): RawBuilder<unknown> {
        if (!relationAggregates || relationAggregates.length === 0)
            return sql``

        return sql.join(relationAggregates.map((aggregate) => {
            const { relatedTarget, condition } = this.buildRelatedJoinCondition(target, aggregate.relation)
            const relatedTable = this.resolveTable(relatedTarget)
            const whereCondition = this.combineConditions([
                condition,
                aggregate.where ? this.buildWhereCondition(relatedTarget, aggregate.where) : undefined,
            ])

            if (aggregate.type === 'exists') {
                return sql`, exists(
                    select 1
                    from ${sql.table(relatedTable)}
                    where ${whereCondition}
                ) as ${sql.id(aggregate.alias ?? `${aggregate.relation}Exists`)}`
            }

            const selectedColumn = aggregate.column
                ? this.buildColumnReference(relatedTable, this.mapColumn(relatedTarget, aggregate.column))
                : sql.raw('*')
            const aggregateExpression = aggregate.type === 'count'
                ? sql`count(*)::int`
                : aggregate.type === 'sum'
                    ? sql`sum(${selectedColumn})::double precision`
                    : aggregate.type === 'avg'
                        ? sql`avg(${selectedColumn})::double precision`
                        : aggregate.type === 'min'
                            ? sql`min(${selectedColumn})`
                            : sql`max(${selectedColumn})`

            return sql`, (
                select ${aggregateExpression}
                from ${sql.table(relatedTable)}
                where ${whereCondition}
            ) as ${sql.id(aggregate.alias ?? `${aggregate.relation}${aggregate.type}`)}`
        }), sql``)
    }

    private buildCombinedWhereClause (
        target: QueryTarget<any>,
        condition?: QueryCondition,
        relationFilters?: RelationFilterSpec[],
    ): RawBuilder<unknown> {
        const combined = this.combineConditions([
            condition ? this.buildWhereCondition(target, condition) : undefined,
            relationFilters && relationFilters.length > 0 ? this.buildRelationFilterCondition(target, relationFilters) : undefined,
        ])

        if (!condition && (!relationFilters || relationFilters.length === 0))
            return sql``

        return sql` where ${combined}`
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

    /**
     * Selects records from the database matching the specified criteria and returns 
     * them as an array of database rows.
     * 
     * @param spec  The specification defining the selection criteria.
     * @returns     A promise that resolves to an array of database rows.
     */
    public async select<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow[]> {
        this.assertNoRelationLoads(spec)

        const result = await sql<Record<string, unknown>>`
            select ${this.buildSelectList(spec.target, spec.columns)}
            ${this.buildRelationAggregateSelectList(spec.target, spec.relationAggregates)}
            from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildCombinedWhereClause(spec.target, spec.where, spec.relationFilters)}
            ${this.buildOrderBy(spec.target, spec.orderBy)}
            ${this.buildPaginationClause(spec)}
        `.execute(this.db)

        return this.mapRows(spec.target, result.rows as unknown as Record<string, unknown>[])
    }

    /**
     * Selects a single record from the database matching the specified criteria and returns it as 
     * a database row. If multiple records match the criteria, only the first one is returned. 
     * If no records match, null is returned.
     * 
     * @param spec  The specification defining the selection criteria.
     * @returns     A promise that resolves to a database row or null if no records match.
     */
    public async selectOne<TModel = unknown> (spec: SelectSpec<TModel>): Promise<DatabaseRow | null> {
        const rows = await this.select({
            ...spec,
            limit: spec.limit ?? 1,
        })

        return rows[0] ?? null
    }

    /**
     * Inserts a new record into the database with the specified values and returns the 
     * inserted record as a database row.
     * 
     * @param spec 
     * @returns 
     */
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

    /**
     * Inserts multiple records into the database with the specified values and returns the number 
     * of records successfully inserted. 
     * 
     * @param spec  The specification defining the values to be inserted.
     * @returns     A promise that resolves to the number of records successfully inserted.
     */
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

    /**
     * Updates records in the database matching the specified criteria with the given values 
     * and returns the updated record as a database row. 
     * 
     * @param spec  The specification defining the update criteria and values.
     * @returns     A promise that resolves to the updated record as a database row, or null if no records match the criteria.  
     */
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

    /**
     * Updates multiple records in the database matching the specified criteria with the 
     * given values and returns the number of records successfully updated.
     * 
     * @param spec  The specification defining the update criteria and values.
     * @returns     A promise that resolves to the number of records successfully updated.
     */
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

    /**
     * Deletes records from the database matching the specified criteria and returns the 
     * deleted record as a database row.
     * 
     * @param spec  The specification defining the delete criteria.
     * @returns     A promise that resolves to the deleted record as a database row, or null if no records match the criteria.
     */
    public async delete<TModel = unknown> (spec: DeleteSpec<TModel>): Promise<DatabaseRow | null> {
        const result = await sql<Record<string, unknown>>`
            delete from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning *
        `.execute(this.db)

        return this.mapRow(spec.target, result.rows[0] as unknown as Record<string, unknown>)
    }

    /**
     * Deletes multiple records from the database matching the specified criteria and 
     * returns the number of records successfully deleted.
     * 
     * @param spec  The specification defining the delete criteria.
     * @returns     A promise that resolves to the number of records successfully deleted.
     */
    public async deleteMany<TModel = unknown> (spec: DeleteManySpec<TModel>): Promise<number> {
        const result = await sql<Record<string, unknown>>`
            delete from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `.execute(this.db)

        return result.rows.length
    }

    /**
     * Counts the number of records in the database matching the specified criteria and returns 
     * the count as a number.
     * 
     * @param spec  The specification defining the count criteria.
     * @returns     A promise that resolves to the number of records matching the criteria.
     */
    public async count<TModel = unknown> (spec: AggregateSpec<TModel>): Promise<number> {
        const result = await sql<{ count: number | string }>`
            select count(*)::int as count
            from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildCombinedWhereClause(spec.target, spec.where, spec.relationFilters)}
        `.execute(this.db)

        return Number((result.rows[0] as { count?: number | string } | undefined)?.count ?? 0)
    }

    /**
     * Checks for the existence of records matching the specified criteria.
     * 
     * @param spec  The specification defining the existence criteria.
     * @returns     A promise that resolves to a boolean indicating whether any records match the criteria.
     */
    public async exists<TModel = unknown> (spec: SelectSpec<TModel>): Promise<boolean> {
        const result = await sql<{ exists: boolean }>`
            select exists(
                select 1
                from ${sql.table(this.resolveTable(spec.target))}
                ${this.buildCombinedWhereClause(spec.target, spec.where, spec.relationFilters)}
                limit 1
            ) as exists
        `.execute(this.db)

        return Boolean((result.rows[0] as { exists?: boolean } | undefined)?.exists)
    }

    /**
     * Executes a series of database operations within a transaction. 
     * The provided callback function is called with a new instance of the 
     * KyselyDatabaseAdapter that is bound to the transaction context.
     * 
     * @param callback  The callback function containing the database operations to be executed within the transaction.
     * @param context   The transaction context specifying options such as read-only mode and isolation level.
     * @returns         A promise that resolves to the result of the callback function.
     */
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
            return await callback(new KyselyDatabaseAdapter(transaction, this.mapping))
        })
    }
}

/**
 * Factory function to create a KyselyDatabaseAdapter instance with the given Kysely executor 
 * and optional table name mapping.
 * 
 * @param db        The Kysely executor to be used by the adapter.
 * @param mapping   Optional table name mapping for the adapter.
 * @returns         A new instance of KyselyDatabaseAdapter.   
 */
export const createKyselyAdapter = (
    db: KyselyExecutor,
    mapping: KyselyTableMapping = {},
): KyselyDatabaseAdapter => {
    return new KyselyDatabaseAdapter(db, mapping)
}