import { SchemaOperation } from 'src/types/migrations'
import { TableBuilder } from './TableBuilder'
import { ArkormException } from '../Exceptions/ArkormException'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { getRuntimeAdapter, runArkormTransaction } from '../helpers/runtime-config'

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
   * Disable foreign-key constraint enforcement on the active PostgreSQL
   * connection by switching the session into replication mode, which
   * suppresses the internal triggers that enforce foreign keys.
   *
   * The setting is connection-scoped, so the disable, the work that depends
   * on it, and the matching {@link SchemaBuilder.enableForeignKeyConstraints}
   * must run on the same connection. Prefer
   * {@link SchemaBuilder.withoutForeignKeyConstraints}, which guarantees this
   * by wrapping the work in a transaction. Requires a SQL-backed adapter and
   * a database role permitted to set `session_replication_role`.
   *
   * @returns
   */
  public static async disableForeignKeyConstraints(): Promise<void> {
    await SchemaBuilder.setSessionReplicationRole('replica')
  }

  /**
   * Re-enable foreign-key constraint enforcement on the active PostgreSQL
   * connection by restoring the default session replication role.
   *
   * @returns
   */
  public static async enableForeignKeyConstraints(): Promise<void> {
    await SchemaBuilder.setSessionReplicationRole('origin')
  }

  /**
   * Run the given callback with foreign-key constraints disabled, then
   * restore them. The whole unit runs inside a transaction so the disable,
   * the callback, and the re-enable share a single connection (required for
   * the connection-scoped replication role to take effect) and roll back
   * together on failure.
   *
   * @example
   * await SchemaBuilder.withoutForeignKeyConstraints(async () => {
   *   await User.factory()
   *     .hasAttached(Tenant.factory().has(Project.factory(3)), { status: 'active' }, 'tenantMemberships')
   *     .create()
   * })
   *
   * @param callback
   * @returns
   */
  public static async withoutForeignKeyConstraints<TResult>(
    callback: () => TResult | Promise<TResult>,
  ): Promise<TResult> {
    return await runArkormTransaction(async () => {
      await SchemaBuilder.disableForeignKeyConstraints()

      try {
        return await callback()
      } finally {
        await SchemaBuilder.enableForeignKeyConstraints()
      }
    })
  }

  private static async setSessionReplicationRole(role: 'replica' | 'origin'): Promise<void> {
    const adapter = getRuntimeAdapter()
    if (!adapter)
      throw new ArkormException(
        'Toggling foreign-key constraints requires a configured database adapter.',
        {
          code: 'ADAPTER_NOT_CONFIGURED',
          operation: 'schema.foreignKeyConstraints',
        },
      )

    if (!adapter.rawQuery)
      throw new UnsupportedAdapterFeatureException(
        'Toggling foreign-key constraints requires an adapter that supports raw queries.',
        {
          operation: 'schema.foreignKeyConstraints',
          meta: {
            feature: 'rawQuery',
          },
        },
      )

    await adapter.rawQuery({ sql: `SET session_replication_role = '${role}'` })
  }

  /**
   * Defines a new table to be created in the migration.
   *
   * @param table     The name of the table to create.
   * @param callback  A callback function to define the table's columns and structure.
   * @returns         The current SchemaBuilder instance for chaining.
   */
  public createTable(table: string, callback: (table: TableBuilder) => void): this {
    const builder = new TableBuilder()
    callback(builder)
    const primaryKey = builder.getPrimaryKey()
    this.validateCompositePrimaryKey(table, primaryKey, builder.getColumns(), true)
    this.validateCompositeUniqueConstraints(
      table,
      builder.getUniqueConstraints(),
      builder.getColumns(),
      true,
    )
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
  public alterTable(table: string, callback: (table: TableBuilder) => void): this {
    const builder = new TableBuilder()
    callback(builder)
    const primaryKey = builder.getPrimaryKey()
    this.validateCompositePrimaryKey(table, primaryKey, builder.getColumns(), false)
    this.validateCompositeUniqueConstraints(
      table,
      builder.getUniqueConstraints(),
      builder.getColumns(),
      false,
    )
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
  public dropTable(table: string): this {
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
  public getOperations(): SchemaOperation[] {
    return this.operations.map((operation) => {
      if (operation.type === 'createTable') {
        return {
          ...operation,
          columns: operation.columns.map((column) => ({
            ...column,
            enumValues: column.enumValues ? [...column.enumValues] : undefined,
          })),
          indexes: operation.indexes.map((index) => ({
            ...index,
            columns: [...index.columns],
          })),
          foreignKeys: operation.foreignKeys.map((foreignKey) => ({ ...foreignKey })),
          primaryKey: operation.primaryKey
            ? { ...operation.primaryKey, columns: [...operation.primaryKey.columns] }
            : undefined,
          uniqueConstraints: operation.uniqueConstraints?.map((constraint) => ({
            ...constraint,
            columns: [...constraint.columns],
          })),
        }
      }

      if (operation.type === 'alterTable') {
        return {
          ...operation,
          addColumns: operation.addColumns.map((column) => ({
            ...column,
            enumValues: column.enumValues ? [...column.enumValues] : undefined,
          })),
          dropColumns: [...operation.dropColumns],
          addIndexes: operation.addIndexes.map((index) => ({
            ...index,
            columns: [...index.columns],
          })),
          addForeignKeys: operation.addForeignKeys.map((foreignKey) => ({ ...foreignKey })),
          addPrimaryKey: operation.addPrimaryKey
            ? { ...operation.addPrimaryKey, columns: [...operation.addPrimaryKey.columns] }
            : undefined,
          addUniqueConstraints: operation.addUniqueConstraints?.map((constraint) => ({
            ...constraint,
            columns: [...constraint.columns],
          })),
        }
      }

      return { ...operation }
    })
  }

  private validateCompositePrimaryKey(
    table: string,
    primaryKey: ReturnType<TableBuilder['getPrimaryKey']>,
    columns: ReturnType<TableBuilder['getColumns']>,
    requireColumns: boolean,
  ): void {
    if (!primaryKey) return

    if (columns.some((column) => column.primary))
      throw new Error(
        `Table [${table}] cannot combine column primary keys with a composite primary key.`,
      )

    if (!requireColumns) return

    primaryKey.columns.forEach((columnName) => {
      const column = columns.find((candidate) => candidate.name === columnName)
      if (!column)
        throw new Error(
          `Composite primary key column [${columnName}] was not found on table [${table}].`,
        )
      if (column.nullable)
        throw new Error(
          `Composite primary key column [${columnName}] on table [${table}] cannot be nullable.`,
        )
    })
  }

  private validateCompositeUniqueConstraints(
    table: string,
    constraints: ReturnType<TableBuilder['getUniqueConstraints']>,
    columns: ReturnType<TableBuilder['getColumns']>,
    requireColumns: boolean,
  ): void {
    if (!requireColumns) return

    constraints.forEach((constraint) => {
      constraint.columns.forEach((columnName) => {
        if (!columns.some((column) => column.name === columnName))
          throw new Error(
            `Composite unique constraint column [${columnName}] was not found on table [${table}].`,
          )
      })
    })
  }
}
