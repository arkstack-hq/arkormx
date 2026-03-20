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
        this.operations.push({
            type: 'createTable',
            table,
            columns: builder.getColumns(),
            indexes: builder.getIndexes(),
            foreignKeys: builder.getForeignKeys(),
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
        this.operations.push({
            type: 'alterTable',
            table,
            addColumns: builder.getColumns(),
            dropColumns: builder.getDropColumns(),
            addIndexes: builder.getIndexes(),
            addForeignKeys: builder.getForeignKeys(),
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
                }
            }

            return { ...operation }
        })
    }
}