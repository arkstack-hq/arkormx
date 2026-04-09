import type { PrimaryKeyGeneration, TimestampColumnBehavior } from './migrations'

import type { DatabaseAdapter } from './adapter'
import type { SoftDeleteConfig } from './core'

export interface DatabaseTablePersistedMetadataOptions {
    cwd?: string
    configuredPath?: string
    strict?: boolean
}

export interface DatabaseTableOptions {
    adapter?: DatabaseAdapter
    primaryKey?: string
    columns?: Record<string, string>
    softDelete?: SoftDeleteConfig
    primaryKeyGeneration?: PrimaryKeyGeneration
    persistedMetadata?: boolean | DatabaseTablePersistedMetadataOptions
    timestampColumns?: TimestampColumnBehavior[]
}