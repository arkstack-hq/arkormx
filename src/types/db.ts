import type { PrimaryKeyGeneration, TimestampColumnBehavior } from './migrations'

import type { DatabaseAdapter } from './adapter'
import type { SoftDeleteConfig } from './core'

export interface DatabaseTableOptions {
    adapter?: DatabaseAdapter
    primaryKey?: string
    columns?: Record<string, string>
    softDelete?: SoftDeleteConfig
    primaryKeyGeneration?: PrimaryKeyGeneration
    timestampColumns?: TimestampColumnBehavior[]
}