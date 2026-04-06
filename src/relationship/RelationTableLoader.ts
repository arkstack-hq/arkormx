import type { DatabaseAdapter, DatabaseRow } from '../types'
import type { RelationColumnLookupSpec, RelationTableLookupSpec } from '../types/relationship'

export class RelationTableLoader {
    public constructor(
        private readonly adapter: DatabaseAdapter,
    ) { }

    public async selectRows (spec: RelationTableLookupSpec): Promise<DatabaseRow[]> {
        return await this.adapter.select({
            target: { table: spec.table },
            where: spec.where,
            columns: spec.columns,
            orderBy: spec.orderBy,
            limit: spec.limit,
            offset: spec.offset,
        })
    }

    public async selectRow (spec: RelationTableLookupSpec): Promise<DatabaseRow | null> {
        return await this.adapter.selectOne({
            target: { table: spec.table },
            where: spec.where,
            columns: spec.columns,
            orderBy: spec.orderBy,
            limit: spec.limit ?? 1,
            offset: spec.offset,
        })
    }

    public async selectColumnValues (spec: RelationColumnLookupSpec): Promise<unknown[]> {
        const rows = await this.selectRows({
            ...spec.lookup,
            columns: [{ column: spec.column }],
        })

        return rows.map(row => row[spec.column])
    }

    public async selectColumnValue (spec: RelationColumnLookupSpec): Promise<unknown | null> {
        const row = await this.selectRow({
            ...spec.lookup,
            columns: [{ column: spec.column }],
            limit: 1,
        })

        return row?.[spec.column] ?? null
    }
}