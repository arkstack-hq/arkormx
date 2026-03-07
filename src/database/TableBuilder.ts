import { SchemaColumn, SchemaColumnType } from 'src/types'

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

    /**
     * Defines an auto-incrementing primary key column.
     * 
     * @param name  The name of the primary key column.
     * @default 'id'
     * @returns     The current TableBuilder instance for chaining.
     */
    public id (name = 'id'): this {
        return this.column(name, 'id', { primary: true })
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
     * @returns 
     */
    public integer (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'integer', options)
    }

    /**
     * Defines a big integer column in the table.
     * 
     * @param name      The name of the big integer column.
     * @param options   Additional options for the big integer column.
     * @returns 
     */
    public bigInteger (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'bigInteger', options)
    }

    /**
     * Defines a float column in the table.
     * 
     * @param name      The name of the float column.
     * @param options   Additional options for the float column.
     * @returns 
     */
    public float (name: string, options: Partial<SchemaColumn> = {}): this {
        return this.column(name, 'float', options)
    }

    /**
     * Defines a boolean column in the table.
     * 
     * @param name      The name of the boolean column. 
     * @param options   Additional options for the boolean column.
     * @returns 
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
            nullable: options.nullable,
            unique: options.unique,
            primary: options.primary,
            default: options.default,
        })

        return this
    }
}