import { SchemaColumn, SchemaColumnType, SchemaIndex } from 'src/types'

/**
 * The TableBuilder class provides a fluent interface for defining 
 * the structure of a database table in a migration, including columns to add or drop.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class TableBuilder {
    private readonly columns: SchemaColumn[] = []
    private readonly dropColumnNames: string[] = []
    private readonly indexes: SchemaIndex[] = []
    private latestColumnName: string | undefined

    /**
     * Defines a primary key column in the table.
     * 
     * @param columnNameOrOptions 
     * @param options 
     * @returns 
     */
    public primary (
        columnNameOrOptions?: string | {
            columnName?: string
            autoIncrement?: boolean
            default?: unknown
        },
        options?: {
            autoIncrement?: boolean
            default?: unknown
        }
    ): this {
        const config = typeof columnNameOrOptions === 'string'
            ? {
                columnName: columnNameOrOptions,
                ...(options ?? {}),
            }
            : (columnNameOrOptions ?? {})
        const column = this.resolveColumn(config.columnName)
        column.primary = true

        if (typeof config.autoIncrement === 'boolean')
            column.autoIncrement = config.autoIncrement

        if (Object.prototype.hasOwnProperty.call(config, 'default'))
            column.default = config.default

        return this
    }

    /**
     * Defines an auto-incrementing primary key column.
     * 
     * @param name  The name of the primary key column.
     * @default 'id'
     * @returns     The current TableBuilder instance for chaining.
     */
    public id (
        name = 'id',
        type: Exclude<SchemaColumnType, 'boolean' | 'timestamp' | 'date' | 'json'> = 'id'
    ): this {
        return this.column(name, type, { primary: true })
    }

    /**
     * Defines a UUID column in the table.
     * 
     * @param name      The name of the UUID column.
     * @param options   Additional options for the UUID column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public uuid (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'uuid', options)
    }

    /**
     * Defines a string column in the table.
     * 
     * @param name      The name of the string column.
     * @param options   Additional options for the string column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public string (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'string', options)
    }

    /**
     * Defines a text column in the table.
     * 
     * @param name      The name of the text column.
     * @param options   Additional options for the text column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public text (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'text', options)
    }

    /**
     * Defines an integer column in the table.
     * 
     * @param name      The name of the integer column.
     * @param options   Additional options for the integer column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public integer (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'integer', options)
    }

    /**
     * Defines a big integer column in the table.
     * 
     * @param name      The name of the big integer column.
     * @param options   Additional options for the big integer column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public bigInteger (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'bigInteger', options)
    }

    /**
     * Defines a float column in the table.
     * 
     * @param name      The name of the float column.
     * @param options   Additional options for the float column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public float (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'float', options)
    }

    /**
     * Marks a column as unique in the table.
     * 
     * @param name Optional explicit column name. 
     * When omitted, applies to the latest defined column.
     * @returns The current TableBuilder instance for chaining.
     */
    public unique (name?: string): this {
        const column = this.resolveColumn(name)
        column.unique = true

        return this
    }

    /**
     * Defines a boolean column in the table.
     * 
     * @param name      The name of the boolean column. 
     * @param options   Additional options for the boolean column.
     * @returns         The current TableBuilder instance for chaining.
     */
    public boolean (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'boolean', options)
    }

    /**
     * Defines a JSON column in the table.
     * 
     * @param name      The name of the JSON column.
     * @param options   Additional options for the JSON column.
     * @returns 
     */
    public json (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'json', options)
    }

    /**
     * Defines a date column in the table.
     * 
     * @param name      The name of the date column.
     * @param options   Additional options for the date column.
     * @returns 
     */
    public date (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'date', options)
    }

    /**
     * Defines colonns for a polymorphic relationship in the table.
     * 
     * @param name    The base name for the polymorphic relationship columns.
     * @returns 
     */
    public morphs (name: string, nullable = false): this {
        this.string(`${name}Type`, { nullable })
        this.integer(`${name}Id`, { nullable })

        return this
    }

    /**
     * Defines nullable columns for a polymorphic relationship in the table.
     * 
     * @param name  The base name for the polymorphic relationship columns.
     * @returns 
     */
    public nullableMorphs (name: string): this {
        return this.morphs(name, true)
    }

    /**
     * Defines a timestamp column in the table.
     * 
     * @param name      The name of the timestamp column.
     * @param options   Additional options for the timestamp column.
     * @returns 
     */
    public timestamp (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'timestamp', options)
    }

    /**
     * Defines both createdAt and updatedAt timestamp columns in the table.
     * 
     * @returns 
     */
    public timestamps (): this {
        this.timestamp('createdAt', { nullable: false })
        this.timestamp('updatedAt', { nullable: false })

        return this
    }

    /**
     * Defines a soft delete timestamp column in the table.
     * 
     * @param column    The name of the soft delete column.
     * @returns 
     */
    public softDeletes (column = 'deletedAt'): this {
        this.timestamp(column, { nullable: true })

        return this
    }

    /**
     * Defines a column to be dropped from the table in an alterTable operation.
     * 
     * @param name   The name of the column to drop.
     * @returns 
     */
    public dropColumn (name: string): this {
        this.dropColumnNames.push(name)

        return this
    }

    /**
     * Marks a column as nullable.
     * 
     * @param columnName Optional explicit column name. When omitted, applies to the latest defined column.
     * @returns          The current TableBuilder instance for chaining.
     */
    public nullable (columnName?: string): this {
        const column = this.resolveColumn(columnName)
        column.nullable = true

        return this
    }

    /**
     * Sets the column position to appear after another column when possible.
     * 
     * @param referenceColumn The column that the target column should be placed after.
     * @param columnName      Optional explicit target column name. When omitted, applies to the latest defined column.
     * @returns               The current TableBuilder instance for chaining.
     */
    public after (referenceColumn: string, columnName?: string): this {
        const column = this.resolveColumn(columnName)
        column.after = referenceColumn

        return this
    }

    /**
     * Maps the column to a custom database column name.
     * 
     * @param name       The custom database column name.
     * @param columnName Optional explicit target column name. When omitted, applies to the latest defined column.
     * @returns          The current TableBuilder instance for chaining.
     */
    public map (name: string, columnName?: string): this {
        const column = this.resolveColumn(columnName)
        column.map = name

        return this
    }

    /**
     * Defines an index on one or more columns.
     * 
     * @param columns Optional target columns. When omitted, applies to the latest defined column.
     * @param name    Optional index name.
     * @returns       The current TableBuilder instance for chaining.
     */
    public index (columns?: string | string[], name?: string): this {
        const columnList = Array.isArray(columns)
            ? columns
            : typeof columns === 'string'
                ? [columns]
                : [this.resolveColumn().name]

        this.indexes.push({
            columns: [...columnList],
            name,
        })

        return this
    }

    /**
     * Returns a deep copy of the defined columns for the table.
     * 
     * @returns 
     */
    public getColumns (): SchemaColumn[] {
        return this.columns.map(column => ({ ...column }))
    }

    /**
     * Returns a copy of the defined column names to be dropped from the table.
     * 
     * @returns 
     */
    public getDropColumns (): string[] {
        return [...this.dropColumnNames]
    }

    /**
     * Returns a deep copy of the defined indexes for the table.
     * 
     * @returns
     */
    public getIndexes (): SchemaIndex[] {
        return this.indexes.map(index => ({
            ...index,
            columns: [...index.columns],
        }))
    }

    /**
     * Defines a column in the table with the given name.
     * 
     * @param name      The name of the column.
     * @param type      The type of the column.
     * @param options   Additional options for the column.
     * @returns 
     */
    private column (
        name: string,
        type: SchemaColumnType,
        options: Partial<SchemaColumn>
    ): this {
        this.columns.push({
            name,
            type,
            map: options.map,
            nullable: options.nullable,
            unique: options.unique,
            primary: options.primary,
            autoIncrement: options.autoIncrement,
            after: options.after,
            default: options.default,
        })
        this.latestColumnName = name

        return this
    }

    /**
     * Resolve a target column by name or fallback to the latest defined column.
     * 
     * @param columnName 
     * @returns 
     */
    private resolveColumn (columnName?: string): SchemaColumn {
        const targetName = columnName ?? this.latestColumnName
        if (!targetName)
            throw new Error('No column available for this operation.')

        const column = this.columns.find(item => item.name === targetName)
        if (!column)
            throw new Error(`Column [${targetName}] was not found in the table definition.`)

        return column
    }
}