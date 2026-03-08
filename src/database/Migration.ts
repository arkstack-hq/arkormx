import { SchemaBuilder } from './SchemaBuilder'

export const MIGRATION_BRAND = Symbol.for('arkormx.migration')

/**
 * The Migration class serves as a base for defining database migrations, requiring 
 * the implementation of `up` and `down` methods to specify the changes to be 
 * applied or reverted in the database schema.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export abstract class Migration {
    public static readonly [MIGRATION_BRAND] = true

    /**
     * Defines the operations to be performed when applying the migration
     * 
     * @param schema A SchemaBuilder instance.
     */
    public abstract up (schema: SchemaBuilder): Promise<void> | void

    /**
     * Defines the operations to be performed when reverting the migration
     * 
     * @param schema A SchemaBuilder instance.
     */
    public abstract down (schema: SchemaBuilder): Promise<void> | void
}