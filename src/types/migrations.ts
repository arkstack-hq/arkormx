
export type SchemaColumnType =
    | 'id'
    | 'string'
    | 'text'
    | 'integer'
    | 'bigInteger'
    | 'float'
    | 'boolean'
    | 'json'
    | 'date'
    | 'timestamp'

export interface SchemaColumn {
    name: string
    type: SchemaColumnType
    nullable?: boolean
    unique?: boolean
    primary?: boolean
    default?: unknown
}

export interface SchemaTableCreateOperation {
    type: 'createTable'
    table: string
    columns: SchemaColumn[]
}

export interface SchemaTableAlterOperation {
    type: 'alterTable'
    table: string
    addColumns: SchemaColumn[]
    dropColumns: string[]
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