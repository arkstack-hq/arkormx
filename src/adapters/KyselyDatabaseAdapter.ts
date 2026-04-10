import type { AccessMode, IsolationLevel, Kysely, RawBuilder, Transaction } from 'kysely'
import type {
    AdapterCapabilities,
    AdapterInspectionRequest,
    AdapterModelIntrospectionOptions,
    AdapterModelStructure,
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
    UpsertSpec,
} from '../types/adapter'
import type {
    AdapterQueryInspection,
    BelongsToManyRelationMetadata,
    BelongsToRelationMetadata,
    HasManyRelationMetadata,
    HasManyThroughRelationMetadata,
    HasOneRelationMetadata,
    HasOneThroughRelationMetadata,
    ModelStatic,
} from '../types'
import type { AppliedMigrationsState, SchemaColumn, SchemaForeignKey, SchemaIndex, SchemaOperation } from '../types/migrations'

import { ArkormException } from '../Exceptions/ArkormException'
import { QueryExecutionException } from '../Exceptions/QueryExecutionException'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { emitRuntimeDebugEvent } from '../helpers/runtime-config'
import { sql } from 'kysely'
import { str } from '@h3ravel/support'

type KyselyExecutor = Kysely<any> | Transaction<any>
type KyselyTableMapping = Record<string, string>
type ThroughRelationMetadata = HasOneThroughRelationMetadata | HasManyThroughRelationMetadata
type SqlRelationMetadata = HasManyRelationMetadata | HasOneRelationMetadata | BelongsToRelationMetadata | BelongsToManyRelationMetadata | ThroughRelationMetadata

/**
 * Database adapter implementation for Kysely, allowing Arkorm to execute queries using Kysely 
 * as the underlying query builder and executor.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 2.0.0-next.0
 */
export class KyselyDatabaseAdapter implements DatabaseAdapter {
    private static readonly migrationStateTable = 'arkormx_migrations'
    private static readonly migrationRunTable = 'arkormx_migration_runs'

    public readonly capabilities: AdapterCapabilities = {
        transactions: true,
        returning: true,
        insertMany: true,
        upsert: true,
        updateMany: true,
        deleteMany: true,
        exists: true,
        relationLoads: false,
        relationAggregates: true,
        relationFilters: true,
        rawWhere: true,
    }

    public constructor(
        private readonly db: KyselyExecutor,
        private readonly mapping: KyselyTableMapping = {},
    ) { }

    private quoteIdentifier (value: string): string {
        return `"${value.replace(/"/g, '""')}"`
    }

    private quoteLiteral (value: unknown): string {
        if (value == null)
            return 'null'

        if (typeof value === 'number' || typeof value === 'bigint')
            return String(value)

        if (typeof value === 'boolean')
            return value ? 'true' : 'false'

        if (value instanceof Date)
            return `'${value.toISOString().replace(/'/g, '\'\'')}'`

        return `'${String(value).replace(/'/g, '\'\'')}'`
    }

    private async executeRawStatement (statement: string, executor: KyselyExecutor = this.db): Promise<void> {
        await sql.raw(statement).execute(executor)
    }

    private resolveSchemaColumnName (columnName: string, columns: SchemaColumn[] = []): string {
        const matched = columns.find(column => column.name === columnName)

        return matched?.map ?? columnName
    }

    private resolveSchemaIndexName (table: string, index: SchemaIndex): string {
        if (typeof index.name === 'string' && index.name.trim().length > 0)
            return index.name

        return `${table}_${index.columns.join('_')}_idx`
    }

    private resolveSchemaForeignKeyName (table: string, foreignKey: SchemaForeignKey): string {
        return `${table}_${foreignKey.column}_fkey`
    }

    private resolveSchemaEnumName (table: string, column: SchemaColumn): string {
        return column.enumName ?? `${table}_${column.name}_enum`
    }

    private resolveSchemaColumnType (table: string, column: SchemaColumn): string {
        if (column.type === 'id')
            return 'integer'
        if (column.type === 'uuid')
            return 'uuid'
        if (column.type === 'enum')
            return this.quoteIdentifier(this.resolveSchemaEnumName(table, column))
        if (column.type === 'string')
            return 'varchar(255)'
        if (column.type === 'text')
            return 'text'
        if (column.type === 'integer')
            return 'integer'
        if (column.type === 'bigInteger')
            return 'bigint'
        if (column.type === 'float')
            return 'double precision'
        if (column.type === 'boolean')
            return 'boolean'
        if (column.type === 'json')
            return 'jsonb'
        if (column.type === 'date')
            return 'date'

        return 'timestamptz'
    }

    private resolveSchemaColumnDefault (column: SchemaColumn): string | null {
        if (column.primaryKeyGeneration?.databaseDefault)
            return column.primaryKeyGeneration.databaseDefault

        const value = column.default ?? (column.updatedAt ? 'now()' : undefined)

        if (value === undefined)
            return null

        if (value === 'now()')
            return 'now()'

        return this.quoteLiteral(value)
    }

    private shouldUseIdentity (column: SchemaColumn): boolean {
        if (column.autoIncrement === false)
            return false

        if (column.type === 'id')
            return column.default === undefined

        return column.autoIncrement === true
    }

    private buildSchemaColumnDefinition (table: string, column: SchemaColumn): string {
        const parts = [
            this.quoteIdentifier(column.map ?? column.name),
            this.resolveSchemaColumnType(table, column),
        ]

        if (this.shouldUseIdentity(column))
            parts.push('generated by default as identity')

        const defaultValue = this.resolveSchemaColumnDefault(column)
        if (defaultValue && !this.shouldUseIdentity(column))
            parts.push(`default ${defaultValue}`)

        if (column.primary)
            parts.push('primary key')
        else if (column.unique)
            parts.push('unique')

        if (!column.nullable && !column.primary)
            parts.push('not null')

        return parts.join(' ')
    }

    private buildSchemaForeignKeyConstraint (table: string, foreignKey: SchemaForeignKey, columns: SchemaColumn[] = []): string {
        const localColumn = this.resolveSchemaColumnName(foreignKey.column, columns)
        const referencedTable = this.resolveMappedTable(foreignKey.referencesTable)
        const action = foreignKey.onDelete
            ? ` on delete ${foreignKey.onDelete === 'setNull'
                ? 'set null'
                : foreignKey.onDelete === 'setDefault'
                    ? 'set default'
                    : foreignKey.onDelete}`
            : ''

        return `constraint ${this.quoteIdentifier(this.resolveSchemaForeignKeyName(table, foreignKey))} foreign key (${this.quoteIdentifier(localColumn)}) references ${this.quoteIdentifier(referencedTable)} (${this.quoteIdentifier(foreignKey.referencesColumn)})${action}`
    }

    private buildSchemaIndexStatement (table: string, index: SchemaIndex, columns: SchemaColumn[] = []): string {
        const mappedColumns = index.columns.map((column: string) => this.quoteIdentifier(this.resolveSchemaColumnName(column, columns))).join(', ')

        return `create index if not exists ${this.quoteIdentifier(this.resolveSchemaIndexName(table, index))} on ${this.quoteIdentifier(table)} (${mappedColumns})`
    }

    private async ensureEnumTypes (table: string, columns: SchemaColumn[], executor: KyselyExecutor = this.db): Promise<void> {
        for (const column of columns) {
            if (column.type !== 'enum')
                continue

            const enumName = this.resolveSchemaEnumName(table, column)
            const existsResult = await sql<{ exists: boolean }>`
                select exists(
                    select 1
                    from pg_type
                    where typname = ${enumName}
                ) as exists
            `.execute(executor)

            if ((existsResult.rows[0] as { exists?: boolean } | undefined)?.exists)
                continue

            const values = column.enumValues ?? []
            if (values.length === 0)
                throw new ArkormException(`Enum column [${column.name}] requires enum values for database-backed migrations.`)

            await this.executeRawStatement(
                `create type ${this.quoteIdentifier(enumName)} as enum (${values.map((value: string) => this.quoteLiteral(value)).join(', ')})`,
                executor,
            )
        }
    }

    private async executeCreateTableOperation (operation: Extract<SchemaOperation, { type: 'createTable' }>, executor: KyselyExecutor): Promise<void> {
        const table = this.resolveMappedTable(operation.table)
        await this.ensureEnumTypes(table, operation.columns, executor)

        const columnDefinitions = operation.columns.map((column: SchemaColumn) => this.buildSchemaColumnDefinition(table, column))
        const foreignKeys = (operation.foreignKeys ?? []).map((foreignKey: SchemaForeignKey) => this.buildSchemaForeignKeyConstraint(table, foreignKey, operation.columns))
        const definitions = [...columnDefinitions, ...foreignKeys].join(', ')

        await this.executeRawStatement(`create table if not exists ${this.quoteIdentifier(table)} (${definitions})`, executor)

        for (const index of operation.indexes ?? [])
            await this.executeRawStatement(this.buildSchemaIndexStatement(table, index, operation.columns), executor)
    }

    private async executeAlterTableOperation (operation: Extract<SchemaOperation, { type: 'alterTable' }>, executor: KyselyExecutor): Promise<void> {
        const table = this.resolveMappedTable(operation.table)
        await this.ensureEnumTypes(table, operation.addColumns, executor)

        for (const column of operation.addColumns) {
            await this.executeRawStatement(
                `alter table ${this.quoteIdentifier(table)} add column if not exists ${this.buildSchemaColumnDefinition(table, column)}`,
                executor,
            )
        }

        for (const column of operation.dropColumns) {
            await this.executeRawStatement(
                `alter table ${this.quoteIdentifier(table)} drop column if exists ${this.quoteIdentifier(column)}`,
                executor,
            )
        }

        for (const foreignKey of operation.addForeignKeys ?? []) {
            await this.executeRawStatement(
                `alter table ${this.quoteIdentifier(table)} add ${this.buildSchemaForeignKeyConstraint(table, foreignKey, operation.addColumns)}`,
                executor,
            )
        }

        for (const index of operation.addIndexes ?? [])
            await this.executeRawStatement(this.buildSchemaIndexStatement(table, index, operation.addColumns), executor)
    }

    private async executeDropTableOperation (operation: Extract<SchemaOperation, { type: 'dropTable' }>, executor: KyselyExecutor): Promise<void> {
        const table = this.resolveMappedTable(operation.table)

        await this.executeRawStatement(`drop table if exists ${this.quoteIdentifier(table)} cascade`, executor)
    }

    private async ensureMigrationStateTables (executor: KyselyExecutor = this.db): Promise<void> {
        await this.executeRawStatement(`
            create table if not exists ${this.quoteIdentifier(KyselyDatabaseAdapter.migrationStateTable)} (
                id text primary key,
                file text not null,
                class_name text not null,
                applied_at timestamptz not null,
                checksum text null
            )
        `, executor)

        await this.executeRawStatement(`
            create table if not exists ${this.quoteIdentifier(KyselyDatabaseAdapter.migrationRunTable)} (
                id text primary key,
                applied_at timestamptz not null,
                migration_ids jsonb not null
            )
        `, executor)
    }

    private async writeAppliedMigrationsStateInternal (state: AppliedMigrationsState, executor: KyselyExecutor): Promise<void> {
        await this.ensureMigrationStateTables(executor)
        await this.executeRawStatement(`delete from ${this.quoteIdentifier(KyselyDatabaseAdapter.migrationRunTable)}`, executor)
        await this.executeRawStatement(`delete from ${this.quoteIdentifier(KyselyDatabaseAdapter.migrationStateTable)}`, executor)

        for (const migration of state.migrations) {
            await sql`
                insert into ${sql.table(KyselyDatabaseAdapter.migrationStateTable)} (id, file, class_name, applied_at, checksum)
                values (${migration.id}, ${migration.file}, ${migration.className}, ${migration.appliedAt}, ${migration.checksum ?? null})
            `.execute(executor)
        }

        for (const run of (state.runs ?? [])) {
            await sql`
                insert into ${sql.table(KyselyDatabaseAdapter.migrationRunTable)} (id, applied_at, migration_ids)
                values (${run.id}, ${run.appliedAt}, cast(${JSON.stringify(run.migrationIds)} as jsonb))
            `.execute(executor)
        }
    }

    private async resetDatabaseInternal (executor: KyselyExecutor): Promise<void> {
        const tablesResult = await sql<{
            table_name: string
            table_schema: string
        }>`
            select table_name, table_schema
            from information_schema.tables
            where table_schema = current_schema()
              and table_type = 'BASE TABLE'
            order by table_name asc
        `.execute(executor)

        for (const row of tablesResult.rows) {
            await this.executeRawStatement(
                `drop table if exists ${this.quoteIdentifier(row.table_schema)}.${this.quoteIdentifier(row.table_name)} cascade`,
                executor,
            )
        }

        const enumTypesResult = await sql<{
            enum_name: string
            enum_schema: string
        }>`
            select t.typname as enum_name, n.nspname as enum_schema
            from pg_type t
            inner join pg_namespace n on n.oid = t.typnamespace
            where t.typtype = 'e'
              and n.nspname = current_schema()
            order by t.typname asc
        `.execute(executor)

        for (const row of enumTypesResult.rows) {
            await this.executeRawStatement(
                `drop type if exists ${this.quoteIdentifier(row.enum_schema)}.${this.quoteIdentifier(row.enum_name)} cascade`,
                executor,
            )
        }
    }

    private normalizeIntrospectionEnumValues (enumValues: unknown): string[] | null {
        if (Array.isArray(enumValues))
            return enumValues.filter((value): value is string => typeof value === 'string')

        if (typeof enumValues !== 'string')
            return null

        const trimmed = enumValues.trim()
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}'))
            return null

        const inner = trimmed.slice(1, -1)
        if (inner.length === 0)
            return []

        return inner
            .split(',')
            .map(value => value.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'))
            .filter(Boolean)
    }

    private introspectionTypeToTs (typeName: string, enumValues: unknown): string {
        const normalizedEnumValues = this.normalizeIntrospectionEnumValues(enumValues)
        if (normalizedEnumValues && normalizedEnumValues.length > 0) {
            return normalizedEnumValues
                .map((value) => {
                    const escapedValue = value.replace(/'/g, String.raw`\'`)

                    return `'${escapedValue}'`
                })
                .join(' | ')
        }

        switch (typeName) {
            case 'bool':
                return 'boolean'
            case 'int2':
            case 'int4':
            case 'int8':
            case 'float4':
            case 'float8':
            case 'numeric':
            case 'money':
                return 'number'
            case 'json':
            case 'jsonb':
                return 'Record<string, unknown> | unknown[]'
            case 'date':
            case 'timestamp':
            case 'timestamptz':
                return 'Date'
            case 'bytea':
                return 'Uint8Array'
            case 'uuid':
            case 'varchar':
            case 'bpchar':
            case 'char':
            case 'text':
            case 'citext':
            case 'time':
            case 'timetz':
            case 'interval':
            case 'inet':
            case 'cidr':
            case 'macaddr':
            case 'macaddr8':
                return 'string'
            default:
                return 'unknown'
        }
    }

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

    private buildRawWhereCondition (condition: QueryRawCondition): RawBuilder<boolean> {
        const segments = condition.sql.split('?')
        const bindings = condition.bindings ?? []

        if (segments.length !== bindings.length + 1) {
            throw new ArkormException('Raw where bindings do not match the number of placeholders.')
        }

        const parts: RawBuilder<unknown>[] = []

        segments.forEach((segment, index) => {
            if (segment.length > 0)
                parts.push(sql.raw(segment))

            if (index < bindings.length)
                parts.push(sql`${bindings[index]}`)
        })

        if (parts.length === 0)
            return sql<boolean>`1 = 1`

        return sql<boolean>`${sql.join(parts, sql``)}`
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

        return this.buildRawWhereCondition(condition as QueryRawCondition)
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
        metadata: SqlRelationMetadata
        relatedTarget: QueryTarget<any>
    } {
        const metadata = target.model?.getRelationMetadata(relation)
        if (!metadata)
            throw new UnsupportedAdapterFeatureException(`Relation [${relation}] could not be resolved for SQL-backed relation execution.`, {
                operation: 'adapter.relation.metadata',
                model: target.modelName,
                relation,
            })

        if (
            metadata.type !== 'hasMany'
            && metadata.type !== 'hasOne'
            && metadata.type !== 'belongsTo'
            && metadata.type !== 'belongsToMany'
            && metadata.type !== 'hasOneThrough'
            && metadata.type !== 'hasManyThrough'
        ) {
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

    private resolveMappedTable (table: string): string {
        return this.mapping[table] ?? table
    }

    private buildBelongsToManyJoinSource (
        outerTarget: QueryTarget<any>,
        relatedTarget: QueryTarget<any>,
        metadata: BelongsToManyRelationMetadata,
    ): { from: RawBuilder<unknown>, condition: RawBuilder<boolean> } {
        const outerTable = this.resolveTable(outerTarget)
        const relatedTable = this.resolveTable(relatedTarget)
        const pivotTable = this.resolveMappedTable(metadata.throughTable)

        return {
            from: sql`${sql.table(relatedTable)} inner join ${sql.table(pivotTable)} on ${this.buildColumnReference(relatedTable, this.mapColumn(relatedTarget, metadata.relatedKey))} = ${this.buildColumnReference(pivotTable, metadata.relatedPivotKey)}`,
            condition: sql<boolean>`
                ${this.buildColumnReference(pivotTable, metadata.foreignPivotKey)}
                =
                ${this.buildColumnReference(outerTable, this.mapColumn(outerTarget, metadata.parentKey))}
            `,
        }
    }

    private buildThroughJoinSource (
        outerTarget: QueryTarget<any>,
        relatedTarget: QueryTarget<any>,
        metadata: ThroughRelationMetadata,
    ): { from: RawBuilder<unknown>, condition: RawBuilder<boolean> } {
        const outerTable = this.resolveTable(outerTarget)
        const relatedTable = this.resolveTable(relatedTarget)
        const throughTable = this.resolveMappedTable(metadata.throughTable)

        return {
            from: sql`${sql.table(relatedTable)} inner join ${sql.table(throughTable)} on ${this.buildColumnReference(relatedTable, this.mapColumn(relatedTarget, metadata.secondKey))} = ${this.buildColumnReference(throughTable, metadata.secondLocalKey)}`,
            condition: sql<boolean>`
                ${this.buildColumnReference(throughTable, metadata.firstKey)}
                =
                ${this.buildColumnReference(outerTable, this.mapColumn(outerTarget, metadata.localKey))}
            `,
        }
    }

    private buildRelatedJoinCondition (
        outerTarget: QueryTarget<any>,
        relation: string,
    ): { relatedTarget: QueryTarget<any>, from: RawBuilder<unknown>, condition: RawBuilder<boolean> } {
        const { metadata, relatedTarget } = this.buildRelatedTargetFromRelation(outerTarget, relation)
        const outerTable = this.resolveTable(outerTarget)
        const relatedTable = this.resolveTable(relatedTarget)

        if (metadata.type === 'belongsToMany') {
            const joinSource = this.buildBelongsToManyJoinSource(outerTarget, relatedTarget, metadata)

            return {
                relatedTarget,
                from: joinSource.from,
                condition: joinSource.condition,
            }
        }

        if (metadata.type === 'hasOneThrough' || metadata.type === 'hasManyThrough') {
            const joinSource = this.buildThroughJoinSource(outerTarget, relatedTarget, metadata)

            return {
                relatedTarget,
                from: joinSource.from,
                condition: joinSource.condition,
            }
        }

        if (metadata.type === 'hasMany' || metadata.type === 'hasOne') {
            return {
                relatedTarget,
                from: sql`${sql.table(relatedTable)}`,
                condition: sql<boolean>`
                    ${this.buildColumnReference(relatedTable, this.mapColumn(relatedTarget, metadata.foreignKey))}
                    =
                    ${this.buildColumnReference(outerTable, this.mapColumn(outerTarget, metadata.localKey))}
                `,
            }
        }

        return {
            relatedTarget,
            from: sql`${sql.table(relatedTable)}`,
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
        const { relatedTarget, from, condition } = this.buildRelatedJoinCondition(target, filter.relation)
        const whereCondition = this.combineConditions([
            condition,
            filter.where ? this.buildWhereCondition(relatedTarget, filter.where) : undefined,
        ])
        const operator = filter.operator === '!=' ? sql.raw('!=') : sql.raw(filter.operator)

        return sql<boolean>`(
            select count(*)::int
            from ${from}
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

    private buildQueryFilterCondition (
        target: QueryTarget<any>,
        condition?: QueryCondition,
        relationFilters?: RelationFilterSpec[],
    ): RawBuilder<boolean> {
        let expression = condition ? this.buildWhereCondition(target, condition) : null

        relationFilters?.forEach((filter) => {
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
            const { relatedTarget, from, condition } = this.buildRelatedJoinCondition(target, aggregate.relation)
            const relatedTable = this.resolveTable(relatedTarget)
            const whereCondition = this.combineConditions([
                condition,
                aggregate.where ? this.buildWhereCondition(relatedTarget, aggregate.where) : undefined,
            ])

            if (aggregate.type === 'exists') {
                return sql`, exists(
                    select 1
                    from ${from}
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
                from ${from}
                where ${whereCondition}
            ) as ${sql.id(aggregate.alias ?? `${aggregate.relation}${aggregate.type}`)}`
        }), sql``)
    }

    private buildCombinedWhereClause (
        target: QueryTarget<any>,
        condition?: QueryCondition,
        relationFilters?: RelationFilterSpec[],
    ): RawBuilder<unknown> {
        if (!condition && (!relationFilters || relationFilters.length === 0))
            return sql``

        return sql` where ${this.buildQueryFilterCondition(target, condition, relationFilters)}`
    }

    private buildSingleRowTargetCte (target: QueryTarget<any>, where: QueryCondition): RawBuilder<unknown> {
        const primaryKey = this.resolvePrimaryKey(target)

        return sql`target_row as (
            select ${sql.id(primaryKey)}
            from ${sql.table(this.resolveTable(target))}
            where ${this.buildWhereCondition(target, where)}
            limit 1
        )`
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

    private buildSelectStatement<TModel = unknown> (
        spec: SelectSpec<TModel>
    ): RawBuilder<Record<string, unknown>> {
        this.assertNoRelationLoads(spec)

        return sql<Record<string, unknown>>`
            select ${this.buildSelectList(spec.target, spec.columns)}
            ${this.buildRelationAggregateSelectList(spec.target, spec.relationAggregates)}
            from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildCombinedWhereClause(spec.target, spec.where, spec.relationFilters)}
            ${this.buildOrderBy(spec.target, spec.orderBy)}
            ${this.buildPaginationClause(spec)}
        `
    }

    private buildCountStatement<TModel = unknown> (spec: AggregateSpec<TModel>): RawBuilder<{ count: number | string }> {
        return sql<{ count: number | string }>`
            select count(*)::int as count
            from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildCombinedWhereClause(spec.target, spec.where, spec.relationFilters)}
        `
    }

    private buildExistsStatement<TModel = unknown> (spec: SelectSpec<TModel>): RawBuilder<{ exists: boolean }> {
        return sql<{ exists: boolean }>`
            select exists(
                select 1
                from ${sql.table(this.resolveTable(spec.target))}
                ${this.buildCombinedWhereClause(spec.target, spec.where, spec.relationFilters)}
                limit 1
            ) as exists
        `
    }

    private compileInspection (
        operation: string,
        target: QueryTarget<any>,
        statement: RawBuilder<unknown>,
    ): AdapterQueryInspection {
        const compiled = statement.compile(this.db)

        return {
            adapter: 'kysely',
            operation,
            target: target.table,
            sql: compiled.sql,
            parameters: [...compiled.parameters],
        }
    }

    private emitDebugQuery (
        phase: 'before' | 'after' | 'error',
        operation: string,
        target: QueryTarget<any>,
        inspection: AdapterQueryInspection | null,
        meta?: Record<string, unknown>,
        durationMs?: number,
        error?: unknown,
    ): void {
        emitRuntimeDebugEvent({
            type: 'query',
            phase,
            adapter: 'kysely',
            operation,
            target: target.table,
            inspection,
            meta,
            durationMs,
            error,
        })
    }

    private wrapExecutionError (
        error: unknown,
        operation: string,
        target: QueryTarget<any>,
        inspection: AdapterQueryInspection | null,
        meta?: Record<string, unknown>,
    ): Error {
        if (error instanceof ArkormException)
            return error

        return new QueryExecutionException(`Failed to execute ${operation} query.`, {
            operation: `adapter.${operation}`,
            model: target.modelName,
            delegate: target.table,
            inspection,
            meta,
            cause: error,
        })
    }

    private async executeWithDebug<TResult> (
        operation: string,
        target: QueryTarget<any>,
        statement: RawBuilder<unknown>,
        transform: (rows: Record<string, unknown>[]) => TResult,
        meta?: Record<string, unknown>,
    ): Promise<TResult> {
        const inspection = this.compileInspection(operation, target, statement)
        const startedAt = Date.now()
        this.emitDebugQuery('before', operation, target, inspection, meta)

        try {
            const result = await statement.execute(this.db)
            this.emitDebugQuery('after', operation, target, inspection, meta, Date.now() - startedAt)

            return transform(result.rows as unknown as Record<string, unknown>[])
        } catch (error) {
            const wrapped = this.wrapExecutionError(error, operation, target, inspection, meta)
            this.emitDebugQuery('error', operation, target, inspection, meta, Date.now() - startedAt, wrapped)
            throw wrapped
        }
    }

    public inspectQuery<TModel = unknown> (request: AdapterInspectionRequest<TModel>): AdapterQueryInspection | null {
        switch (request.operation) {
            case 'select':
                return this.compileInspection('select', request.spec.target, this.buildSelectStatement(request.spec))
            case 'selectOne':
                return this.compileInspection('selectOne', request.spec.target, this.buildSelectStatement({
                    ...request.spec,
                    limit: request.spec.limit ?? 1,
                }))
            case 'count':
                return this.compileInspection('count', request.spec.target, this.buildCountStatement(request.spec))
            case 'exists':
                return this.compileInspection('exists', request.spec.target, this.buildExistsStatement(request.spec))
            default:
                return null
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
        return await this.executeWithDebug('select', spec.target, this.buildSelectStatement(spec), rows => {
            return this.mapRows(spec.target, rows)
        }, {
            where: spec.where,
            relationFilters: spec.relationFilters,
            orderBy: spec.orderBy,
            limit: spec.limit,
            offset: spec.offset,
        })
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

        const statement = columns.length === 0
            ? sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))}
                default values
                returning *
            `
            : sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))} (${sql.join(columns.map(column => sql.id(column)), sql`, `)})
                values (${sql.join(columns.map(column => values[column]), sql`, `)})
                returning *
            `

        return await this.executeWithDebug('insert', spec.target, statement, rows => {
            return this.mapRow(spec.target, rows[0]) as DatabaseRow
        }, { values: spec.values })
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
            const statement = sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))}
                default values
                ${spec.ignoreDuplicates ? sql` on conflict do nothing` : sql``}
                returning ${sql.id(this.resolvePrimaryKey(spec.target))}
            `

            return await this.executeWithDebug('insertMany', spec.target, statement, rows => rows.length, {
                values: spec.values,
                ignoreDuplicates: spec.ignoreDuplicates,
            })
        }

        const values = sql.join(rows.map(row => {
            return sql`(${sql.join(columns.map(column => row[column] ?? null), sql`, `)})`
        }), sql`, `)

        const statement = sql<Record<string, unknown>>`
            insert into ${sql.table(this.resolveTable(spec.target))} (${sql.join(columns.map(column => sql.id(column)), sql`, `)})
            values ${values}
            ${spec.ignoreDuplicates ? sql` on conflict do nothing` : sql``}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `

        return await this.executeWithDebug('insertMany', spec.target, statement, rows => rows.length, {
            values: spec.values,
            ignoreDuplicates: spec.ignoreDuplicates,
        })
    }

    public async upsert<TModel = unknown> (spec: UpsertSpec<TModel>): Promise<number> {
        if (spec.values.length === 0)
            return 0

        const rows = spec.values.map(row => this.mapValues(spec.target, row))
        const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
        const uniqueColumns = spec.uniqueBy.map(column => this.mapColumn(spec.target, column))
        const updateColumns = (spec.updateColumns ?? [])
            .map(column => this.mapColumn(spec.target, column))
            .filter(column => !uniqueColumns.includes(column))
        const conflictTarget = sql.join(uniqueColumns.map(column => sql.id(column)), sql`, `)

        if (columns.length === 0) {
            const statement = sql<Record<string, unknown>>`
                insert into ${sql.table(this.resolveTable(spec.target))}
                default values
                on conflict (${conflictTarget}) do nothing
            `

            await this.executeWithDebug('upsert', spec.target, statement, () => undefined, {
                values: spec.values,
                uniqueBy: spec.uniqueBy,
                updateColumns: spec.updateColumns,
            })

            return spec.values.length
        }

        const values = sql.join(rows.map(row => {
            return sql`(${sql.join(columns.map(column => row[column] ?? null), sql`, `)})`
        }), sql`, `)
        const conflictAction = updateColumns.length === 0
            ? sql`do nothing`
            : sql`do update set ${sql.join(updateColumns.map(column => sql`${sql.id(column)} = excluded.${sql.id(column)}`), sql`, `)}`

        const statement = sql<Record<string, unknown>>`
            insert into ${sql.table(this.resolveTable(spec.target))} (${sql.join(columns.map(column => sql.id(column)), sql`, `)})
            values ${values}
            on conflict (${conflictTarget}) ${conflictAction}
        `

        await this.executeWithDebug('upsert', spec.target, statement, () => undefined, {
            values: spec.values,
            uniqueBy: spec.uniqueBy,
            updateColumns: spec.updateColumns,
        })

        return spec.values.length
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

        const statement = sql<Record<string, unknown>>`
            update ${sql.table(this.resolveTable(spec.target))}
            set ${sql.join(assignments, sql`, `)}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning *
        `

        return await this.executeWithDebug('update', spec.target, statement, rows => {
            return this.mapRow(spec.target, rows[0])
        }, { where: spec.where, values: spec.values })
    }

    /**
     * Updates a single record in the database matching the specified criteria with the given values.
     * 
     * @param spec 
     * @returns 
     */
    public async updateFirst<TModel = unknown> (spec: UpdateSpec<TModel>): Promise<DatabaseRow | null> {
        const values = this.mapValues(spec.target, spec.values)
        const assignments = Object.entries(values).map(([column, value]) => {
            return sql`${sql.id(column)} = ${value}`
        })

        if (assignments.length === 0)
            return await this.selectOne({ target: spec.target, where: spec.where, limit: 1 })

        const primaryKey = this.resolvePrimaryKey(spec.target)
        const table = this.resolveTable(spec.target)
        const statement = sql<Record<string, unknown>>`
            with ${this.buildSingleRowTargetCte(spec.target, spec.where)}
            update ${sql.table(table)}
            set ${sql.join(assignments, sql`, `)}
            from target_row
            where ${this.buildColumnReference(table, primaryKey)} = ${sql`target_row.${sql.id(primaryKey)}`}
            returning ${sql.table(table)}.*
        `

        return await this.executeWithDebug('updateFirst', spec.target, statement, rows => {
            return this.mapRow(spec.target, rows[0])
        }, { where: spec.where, values: spec.values })
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

        const statement = sql<Record<string, unknown>>`
            update ${sql.table(this.resolveTable(spec.target))}
            set ${sql.join(assignments, sql`, `)}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `

        return await this.executeWithDebug('updateMany', spec.target, statement, rows => rows.length, {
            where: spec.where,
            values: spec.values,
        })
    }

    /**
     * Deletes records from the database matching the specified criteria and returns the 
     * deleted record as a database row.
     * 
     * @param spec  The specification defining the delete criteria.
     * @returns     A promise that resolves to the deleted record as a database row, or null if no records match the criteria.
     */
    public async delete<TModel = unknown> (spec: DeleteSpec<TModel>): Promise<DatabaseRow | null> {
        const statement = sql<Record<string, unknown>>`
            delete from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning *
        `

        return await this.executeWithDebug('delete', spec.target, statement, rows => {
            return this.mapRow(spec.target, rows[0])
        }, { where: spec.where })
    }

    /**
     * Deletes a single record from the database matching the specified criteria and returns it as a database row.
     * 
     * @param spec 
     * @returns 
     */
    public async deleteFirst<TModel = unknown> (spec: DeleteSpec<TModel>): Promise<DatabaseRow | null> {
        const primaryKey = this.resolvePrimaryKey(spec.target)
        const table = this.resolveTable(spec.target)
        const statement = sql<Record<string, unknown>>`
            with ${this.buildSingleRowTargetCte(spec.target, spec.where)}
            delete from ${sql.table(table)}
            using target_row
            where ${this.buildColumnReference(table, primaryKey)} = ${sql`target_row.${sql.id(primaryKey)}`}
            returning ${sql.table(table)}.*
        `

        return await this.executeWithDebug('deleteFirst', spec.target, statement, rows => {
            return this.mapRow(spec.target, rows[0])
        }, { where: spec.where })
    }

    /**
     * Deletes multiple records from the database matching the specified criteria and 
     * returns the number of records successfully deleted.
     * 
     * @param spec  The specification defining the delete criteria.
     * @returns     A promise that resolves to the number of records successfully deleted.
     */
    public async deleteMany<TModel = unknown> (spec: DeleteManySpec<TModel>): Promise<number> {
        const statement = sql<Record<string, unknown>>`
            delete from ${sql.table(this.resolveTable(spec.target))}
            ${this.buildWhereClause(spec.target, spec.where)}
            returning ${sql.id(this.resolvePrimaryKey(spec.target))}
        `

        return await this.executeWithDebug('deleteMany', spec.target, statement, rows => rows.length, {
            where: spec.where,
        })
    }

    /**
     * Counts the number of records in the database matching the specified criteria and returns 
     * the count as a number.
     * 
     * @param spec  The specification defining the count criteria.
     * @returns     A promise that resolves to the number of records matching the criteria.
     */
    public async count<TModel = unknown> (spec: AggregateSpec<TModel>): Promise<number> {
        return await this.executeWithDebug('count', spec.target, this.buildCountStatement(spec), rows => {
            return Number((rows[0] as { count?: number | string } | undefined)?.count ?? 0)
        }, {
            where: spec.where,
            relationFilters: spec.relationFilters,
        })
    }

    /**
     * Checks for the existence of records matching the specified criteria.
     * 
     * @param spec  The specification defining the existence criteria.
     * @returns     A promise that resolves to a boolean indicating whether any records match the criteria.
     */
    public async exists<TModel = unknown> (spec: SelectSpec<TModel>): Promise<boolean> {
        return await this.executeWithDebug('exists', spec.target, this.buildExistsStatement(spec), rows => {
            return Boolean((rows[0] as { exists?: boolean } | undefined)?.exists)
        }, {
            where: spec.where,
            relationFilters: spec.relationFilters,
        })
    }

    public async introspectModels (options: AdapterModelIntrospectionOptions = {}): Promise<AdapterModelStructure[]> {
        const tables = options.tables?.filter(Boolean) ?? []
        const tableFilter = tables.length > 0
            ? sql` and cls.relname in (${sql.join(tables)})`
            : sql``

        const result = await sql<{
            table_name: string
            column_name: string
            is_nullable: boolean
            type_name: string
            element_type_name: string | null
            enum_values: string[] | null
            element_enum_values: string[] | null
        }>`
            select
                cls.relname as table_name,
                att.attname as column_name,
                not att.attnotnull as is_nullable,
                typ.typname as type_name,
                case when typ.typcategory = 'A' then elem.typname else null end as element_type_name,
                case when typ.typtype = 'e'
                    then array(select enumlabel from pg_enum where enumtypid = typ.oid order by enumsortorder)
                    else null
                end as enum_values,
                case when elem.typtype = 'e'
                    then array(select enumlabel from pg_enum where enumtypid = elem.oid order by enumsortorder)
                    else null
                end as element_enum_values
            from pg_attribute att
            inner join pg_class cls on cls.oid = att.attrelid
            inner join pg_namespace ns on ns.oid = cls.relnamespace
            inner join pg_type typ on typ.oid = att.atttypid
            left join pg_type elem on elem.oid = typ.typelem and typ.typcategory = 'A'
            where cls.relkind in ('r', 'p')
                and att.attnum > 0
                and not att.attisdropped
                and ns.nspname not in ('pg_catalog', 'information_schema')
                ${tableFilter}
            order by cls.relname asc, att.attnum asc
        `.execute(this.db)

        const models = new Map<string, AdapterModelStructure>()

        result.rows.forEach((row) => {
            const existing = models.get(row.table_name) ?? {
                name: str(row.table_name).studly().singular().toString(),
                table: row.table_name,
                fields: [],
            }

            const isArray = row.element_type_name !== null
            const baseType = isArray
                ? this.introspectionTypeToTs(row.element_type_name ?? 'unknown', row.element_enum_values)
                : this.introspectionTypeToTs(row.type_name, row.enum_values)

            existing.fields.push({
                name: row.column_name,
                type: isArray ? `Array<${baseType}>` : baseType,
                nullable: row.is_nullable,
            })

            models.set(row.table_name, existing)
        })

        return [...models.values()]
    }

    public async executeSchemaOperations (operations: SchemaOperation[]): Promise<void> {
        if (operations.length === 0)
            return

        await this.transaction(async (adapter) => {
            const trxAdapter = adapter as KyselyDatabaseAdapter

            for (const operation of operations) {
                if (operation.type === 'createTable') {
                    await trxAdapter.executeCreateTableOperation(operation, trxAdapter.db)
                    continue
                }

                if (operation.type === 'alterTable') {
                    await trxAdapter.executeAlterTableOperation(operation, trxAdapter.db)
                    continue
                }

                await trxAdapter.executeDropTableOperation(operation, trxAdapter.db)
            }
        })
    }

    public async resetDatabase (): Promise<void> {
        await this.transaction(async (adapter) => {
            const trxAdapter = adapter as KyselyDatabaseAdapter

            await trxAdapter.resetDatabaseInternal(trxAdapter.db)
        })
    }

    public async readAppliedMigrationsState (): Promise<AppliedMigrationsState> {
        await this.ensureMigrationStateTables()

        const migrationsResult = await sql<{
            id: string
            file: string
            class_name: string
            applied_at: string | Date
            checksum: string | null
        }>`
            select id, file, class_name, applied_at, checksum
            from ${sql.table(KyselyDatabaseAdapter.migrationStateTable)}
            order by applied_at asc, id asc
        `.execute(this.db)

        const runsResult = await sql<{
            id: string
            applied_at: string | Date
            migration_ids: unknown
        }>`
            select id, applied_at, migration_ids
            from ${sql.table(KyselyDatabaseAdapter.migrationRunTable)}
            order by applied_at asc, id asc
        `.execute(this.db)

        return {
            version: 1,
            migrations: migrationsResult.rows.map((row) => ({
                id: row.id,
                file: row.file,
                className: row.class_name,
                appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at),
                checksum: row.checksum ?? undefined,
            })),
            runs: runsResult.rows.map((row) => ({
                id: row.id,
                appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at),
                migrationIds: Array.isArray(row.migration_ids)
                    ? row.migration_ids.filter((value): value is string => typeof value === 'string')
                    : typeof row.migration_ids === 'string'
                        ? JSON.parse(row.migration_ids) as string[]
                        : [],
            })),
        }
    }

    public async writeAppliedMigrationsState (state: AppliedMigrationsState): Promise<void> {
        await this.transaction(async (adapter) => {
            const trxAdapter = adapter as KyselyDatabaseAdapter

            await trxAdapter.writeAppliedMigrationsStateInternal(state, trxAdapter.db)
        })
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