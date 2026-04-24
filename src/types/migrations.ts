
export type SchemaColumnType =
    | 'id'
    | 'uuid'
    | 'enum'
    | 'string'
    | 'text'
    | 'integer'
    | 'bigInteger'
    | 'float'
    | 'boolean'
    | 'json'
    | 'date'
    | 'timestamp'

export interface PrimaryKeyGeneration {
    strategy: 'uuid'
    prismaDefault?: string
    databaseDefault?: string
    runtimeFactory?: 'uuid'
}

export interface TimestampColumnBehavior {
    column: string
    default?: 'now()'
    updatedAt?: boolean
}

export interface SchemaColumn {
    name: string
    type: SchemaColumnType
    enumName?: string
    enumValues?: string[]
    map?: string
    nullable?: boolean
    unique?: boolean
    primary?: boolean
    autoIncrement?: boolean
    after?: string
    default?: unknown
    updatedAt?: boolean
    primaryKeyGeneration?: PrimaryKeyGeneration
}

export interface SchemaIndex {
    columns: string[]
    name?: string
}

export type SchemaForeignKeyAction =
    | 'cascade'
    | 'restrict'
    | 'setNull'
    | 'noAction'
    | 'setDefault'

export interface SchemaForeignKey {
    column: string
    referencesTable: string
    referencesColumn: string
    onDelete?: SchemaForeignKeyAction
    relationAlias?: string
    inverseRelationAlias?: string
    fieldAlias?: string
}

export interface SchemaTableCreateOperation {
    type: 'createTable'
    table: string
    columns: SchemaColumn[]
    indexes: SchemaIndex[]
    foreignKeys: SchemaForeignKey[]
}

export interface SchemaTableAlterOperation {
    type: 'alterTable'
    table: string
    addColumns: SchemaColumn[]
    dropColumns: string[]
    addIndexes: SchemaIndex[]
    addForeignKeys: SchemaForeignKey[]
}

export interface SchemaTableDropOperation {
    type: 'dropTable'
    table: string
}

export type SchemaOperation =
    | SchemaTableCreateOperation
    | SchemaTableAlterOperation
    | SchemaTableDropOperation

export interface GenerateMigrationOptions {
    directory?: string
    extension?: 'ts' | 'js'
    write?: boolean
}

export interface GeneratedMigrationFile {
    fileName: string
    filePath: string
    className: string
    content: string
}

export interface PrismaSchemaSyncOptions {
    schemaPath?: string
    write?: boolean
}

export interface PrismaMigrationWorkflowOptions extends PrismaSchemaSyncOptions {
    cwd?: string
    runGenerate?: boolean
    runMigrate?: boolean
    migrateMode?: 'dev' | 'deploy'
    migrationName?: string
}

export type MigrationInstanceLike = {
    up: (...args: any[]) => Promise<void> | void
    down: (...args: any[]) => Promise<void> | void
}

export interface AppliedMigrationEntry {
    id: string
    file: string
    className: string
    appliedAt: string
    checksum?: string
}

export interface AppliedMigrationRun {
    id: string
    appliedAt: string
    migrationIds: string[]
}

export interface AppliedMigrationsState {
    version: 1
    migrations: AppliedMigrationEntry[]
    runs?: AppliedMigrationRun[]
}

export type MigrationClass = new () => MigrationInstanceLike