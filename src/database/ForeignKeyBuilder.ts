import { SchemaForeignKey, SchemaForeignKeyAction } from 'src/types'

export class ForeignKeyBuilder {
    private readonly foreignKey: SchemaForeignKey

    public constructor(foreignKey: SchemaForeignKey) {
        this.foreignKey = foreignKey
    }

    public references (table: string, column: string): this {
        this.foreignKey.referencesTable = table
        this.foreignKey.referencesColumn = column

        return this
    }

    public onDelete (action: SchemaForeignKeyAction): this {
        this.foreignKey.onDelete = action

        return this
    }

    public alias (name: string): this {
        this.foreignKey.relationAlias = name

        return this
    }

    public inverseAlias (name: string): this {
        this.foreignKey.inverseRelationAlias = name

        return this
    }

    public as (fieldName: string): this {
        this.foreignKey.fieldAlias = fieldName

        return this
    }
}