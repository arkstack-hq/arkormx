export interface SyncedPrismaModelField {
  name: string
  type: string
  nullable: boolean
}

export interface SyncedPrismaModel {
  name: string
  table: string
  fields: SyncedPrismaModelField[]
}

export interface SyncedModelSource {
  className: string
  table: string
}

export interface SyncedModelsResult {
  source: 'adapter' | 'prisma' | 'registry'
  schemaPath?: string
  modelsDir: string
  modelTypesPath?: string
  total: number
  updated: string[]
  skipped: string[]
}

export type ParsedDeclarationNode =
  | { kind: 'array'; element: ParsedDeclarationNode }
  | { kind: 'named'; name: string }
  | { kind: 'null' }
  | { kind: 'string-literal'; value: string }
  | { kind: 'union'; types: ParsedDeclarationNode[] }

export interface ExistingDeclaration {
  name: string
  raw: string
  type: string
}
