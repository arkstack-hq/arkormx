import { SchemaForeignKey, SchemaForeignKeyAction } from 'src/types'

/**
 * The ForeignKeyBuilder class provides a fluent interface for defining 
 * foreign key constraints in a migration. It allows you to specify 
 * the referenced table and column, as well as actions to take on 
 * delete and aliases for the relation.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.2.2
 */
export class ForeignKeyBuilder {
    private readonly foreignKey: SchemaForeignKey

    public constructor(foreignKey: SchemaForeignKey) {
        this.foreignKey = foreignKey
    }

    /**
     * Defines the referenced table and column for this foreign key constraint.
     * 
     * @param table 
     * @param column 
     * @returns 
     */
    public references (table: string, column: string): this {
        this.foreignKey.referencesTable = table
        this.foreignKey.referencesColumn = column

        return this
    }

    /**
     * Defines the action to take when a referenced record is deleted, such 
     * as "CASCADE", "SET NULL", or "RESTRICT".
     * 
     * @param action 
     * @returns 
     */
    public onDelete (action: SchemaForeignKeyAction): this {
        this.foreignKey.onDelete = action

        return this
    }

    /**
     * Defines an alias for the relation represented by this foreign key, which 
     * can be used in the ORM for more intuitive access to related models.
     * 
     * @param name 
     * @returns 
     */
    public alias (name: string): this {
        this.foreignKey.relationAlias = name

        return this
    }

    /**
     * Defines an alias for the inverse relation represented by this foreign key.
     * 
     * @param name 
     * @returns 
     */
    public inverseAlias (name: string): this {
        this.foreignKey.inverseRelationAlias = name

        return this
    }

    /**
     * Defines an alias for the foreign key field itself, which can be 
     * used in the ORM for more intuitive access to the foreign key value.
     * 
     * @param fieldName 
     * @returns 
     */
    public as (fieldName: string): this {
        this.foreignKey.fieldAlias = fieldName

        return this
    }
}