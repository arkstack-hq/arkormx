import { SchemaOperation } from 'src/types/migrations'
import { TableBuilder } from './TableBuilder'

/**
 * The SchemaBuilder class provides methods for defining the operations to be 
 * performed in a migration, such as creating, altering, or dropping tables. 
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class SchemaBuilder {
    private readonly operations: SchemaOperation[] = []

    /**
     * Defines a new table to be created in the migration.
     * 
     * @param table     The name of the table to create.
     * @param callback  A callback function to define the table's columns and structure.
     * @returns         The current SchemaBuilder instance for chaining.
     */
    public createTable (table: string, callback: (table: TableBuilder) => void): this {
        const builder = new TableBuilder()
        callback(builder)
        const primaryKey = builder.getPrimaryKey()
        this.validateCompositePrimaryKey(table, primaryKey, builder.getColumns(), true)
        this.validateCompositeUniqueConstraints(table, builder.getUniqueConstraints(), builder.getColumns(), true)
        this.operations.push({
            type: 'createTable',
            table,
            columns: builder.getColumns(),
            indexes: builder.getIndexes(),
            foreignKeys: builder.getForeignKeys(),
            primaryKey,
            uniqueConstraints: builder.getUniqueConstraints(),
        })

        return this
    }

    /**
     * Defines alterations to an existing table in the migration.
     * 
     * @param table     The name of the table to alter.
     * @param callback  A callback function to define the alterations to the table's columns and structure.
     * @returns         The current SchemaBuilder instance for chaining.
     */
    public alterTable (table: string, callback: (table: TableBuilder) => void): this {
        const builder = new TableBuilder()
        callback(builder)
        const primaryKey = builder.getPrimaryKey()
        this.validateCompositePrimaryKey(table, primaryKey, builder.getColumns(), false)
        this.validateCompositeUniqueConstraints(table, builder.getUniqueConstraints(), builder.getColumns(), false)
        this.operations.push({
            type: 'alterTable',
            table,
            addColumns: builder.getColumns(),
            dropColumns: builder.getDropColumns(),
            addIndexes: builder.getIndexes(),
            addForeignKeys: builder.getForeignKeys(),
            addPrimaryKey: primaryKey,
            addUniqueConstraints: builder.getUniqueConstraints(),
        })

        return this
    }

    /**
     * Defines a table to be dropped in the migration.
     * 
     * @param table The name of the table to drop.
     * @returns     The current SchemaBuilder instance for chaining.
     */
    public dropTable (table: string): this {
        this.operations.push({
            type: 'dropTable',
            table,
        })

        return this
    }

    /**
     * Returns a deep copy of the defined schema operations for the migration/
     * 
     * @returns An array of schema operations for the migration.
     */
    public getOperations (): SchemaOperation[] {
        return this.operations.map((operation) => {
            if (operation.type === 'createTable') {
                return {
                    ...operation,
                    columns: operation.columns.map(column => ({
                        ...column,
                        enumValues: column.enumValues ? [...column.enumValues] : undefined,
                    })),
                    indexes: operation.indexes.map(index => ({
                        ...index,
                        columns: [...index.columns],
                    })),
                    foreignKeys: operation.foreignKeys.map(foreignKey => ({ ...foreignKey })),
                    primaryKey: operation.primaryKey
                        ? { ...operation.primaryKey, columns: [...operation.primaryKey.columns] }
                        : undefined,
                    uniqueConstraints: operation.uniqueConstraints?.map(constraint => ({
                        ...constraint,
                        columns: [...constraint.columns],
                    })),
                }
            }

            if (operation.type === 'alterTable') {
                return {
                    ...operation,
                    addColumns: operation.addColumns.map(column => ({
                        ...column,
                        enumValues: column.enumValues ? [...column.enumValues] : undefined,
                    })),
                    dropColumns: [...operation.dropColumns],
                    addIndexes: operation.addIndexes.map(index => ({
                        ...index,
                        columns: [...index.columns],
                    })),
                    addForeignKeys: operation.addForeignKeys.map(foreignKey => ({ ...foreignKey })),
                    addPrimaryKey: operation.addPrimaryKey
                        ? { ...operation.addPrimaryKey, columns: [...operation.addPrimaryKey.columns] }
                        : undefined,
                    addUniqueConstraints: operation.addUniqueConstraints?.map(constraint => ({
                        ...constraint,
                        columns: [...constraint.columns],
                    })),
                }
            }

            return { ...operation }
        })
    }

    private validateCompositePrimaryKey (
        table: string,
        primaryKey: ReturnType<TableBuilder['getPrimaryKey']>,
        columns: ReturnType<TableBuilder['getColumns']>,
        requireColumns: boolean,
    ): void {
        if (!primaryKey)
            return

        if (columns.some(column => column.primary))
            throw new Error(`Table [${table}] cannot combine column primary keys with a composite primary key.`)

        if (!requireColumns)
            return

        primaryKey.columns.forEach((columnName) => {
            const column = columns.find(candidate => candidate.name === columnName)
            if (!column)
                throw new Error(`Composite primary key column [${columnName}] was not found on table [${table}].`)
            if (column.nullable)
                throw new Error(`Composite primary key column [${columnName}] on table [${table}] cannot be nullable.`)
        })
    }

    private validateCompositeUniqueConstraints (
        table: string,
        constraints: ReturnType<TableBuilder['getUniqueConstraints']>,
        columns: ReturnType<TableBuilder['getColumns']>,
        requireColumns: boolean,
    ): void {
        if (!requireColumns)
            return

        constraints.forEach((constraint) => {
            constraint.columns.forEach((columnName) => {
                if (!columns.some(column => column.name === columnName))
                    throw new Error(`Composite unique constraint column [${columnName}] was not found on table [${table}].`)
            })
        })
    }
}
