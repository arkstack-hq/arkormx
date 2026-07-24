import type { DatabaseAdapter, DatabaseRow } from '../types'
import type { RelationColumnLookupSpec, RelationTableLookupSpec } from '../types/relationship'
import {
  getPersistedTableMetadata,
  resolvePersistedMetadataFeatures,
} from '../helpers/column-mappings'

import { getUserConfig } from '../helpers/runtime-config'

/**
 * Utility class responsible for loading data from relation tables, which are used to
 * manage relationships between models in Arkorm.
 *
 * @author Legacy (3m1n3nc3)
 * @since 2.0.0-next.0
 */
export class RelationTableLoader {
  public constructor(private readonly adapter: DatabaseAdapter) {}

  private buildTarget(table: string): {
    table: string
    columns: Record<string, string>
  } {
    const metadata = getPersistedTableMetadata(table, {
      features: resolvePersistedMetadataFeatures(getUserConfig('features')),
    })

    return { table, columns: metadata.columns }
  }

  /**
   * Restore raw column keys on rows the adapter returned.
   *
   * @param table
   * @param rows
   * @returns
   */
  private restoreRawColumns(table: string, rows: DatabaseRow[]): DatabaseRow[] {
    const entries = Object.entries(this.buildTarget(table).columns ?? {})
    if (entries.length === 0) return rows

    return rows.map((row) => {
      const restored: DatabaseRow = { ...row }
      for (const [attribute, column] of entries) {
        if (column !== attribute && attribute in restored) restored[column] = restored[attribute]
      }

      return restored
    })
  }

  public async selectRows(spec: RelationTableLookupSpec): Promise<DatabaseRow[]> {
    const rows = await this.adapter.select({
      target: this.buildTarget(spec.table),
      where: spec.where,
      columns: spec.columns,
      orderBy: spec.orderBy,
      limit: spec.limit,
      offset: spec.offset,
    })

    return this.restoreRawColumns(spec.table, rows)
  }

  public async selectRow(spec: RelationTableLookupSpec): Promise<DatabaseRow | null> {
    const row = await this.adapter.selectOne({
      target: this.buildTarget(spec.table),
      where: spec.where,
      columns: spec.columns,
      orderBy: spec.orderBy,
      limit: spec.limit ?? 1,
      offset: spec.offset,
    })

    return row ? (this.restoreRawColumns(spec.table, [row])[0] ?? null) : null
  }

  public async selectColumnValues(spec: RelationColumnLookupSpec): Promise<unknown[]> {
    const rows = await this.selectRows({
      ...spec.lookup,
      columns: [{ column: spec.column }],
    })

    return rows.map((row) => row[spec.column])
  }

  public async selectColumnValue(spec: RelationColumnLookupSpec): Promise<unknown | null> {
    const row = await this.selectRow({
      ...spec.lookup,
      columns: [{ column: spec.column }],
      limit: 1,
    })

    return row?.[spec.column] ?? null
  }
}
