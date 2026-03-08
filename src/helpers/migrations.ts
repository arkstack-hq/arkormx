import { GenerateMigrationOptions, GeneratedMigrationFile, PrismaMigrationWorkflowOptions, PrismaSchemaSyncOptions, SchemaColumn, SchemaIndex, SchemaOperation, SchemaTableAlterOperation, SchemaTableCreateOperation, SchemaTableDropOperation } from 'src/types/migrations'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import { ArkormException } from '../Exceptions/ArkormException'
import { Migration } from '../database/Migration'
import { SchemaBuilder } from '../database/SchemaBuilder'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { str } from '@h3ravel/support'

export const PRISMA_MODEL_REGEX = /model\s+(\w+)\s*\{[\s\S]*?\n\}/g

/**
 * Convert a table name to a PascalCase model name, with basic singularization.
 * 
 * @param tableName The name of the table to convert.
 * @returns The corresponding PascalCase model name.
 */
export const toModelName = (tableName: string): string => {
    const normalized = tableName
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()

    const singular = normalized.endsWith('s') && normalized.length > 1
        ? normalized.slice(0, -1)
        : normalized

    const parts = singular.split(/\s+/g).filter(Boolean)
    if (parts.length === 0)
        return 'GeneratedModel'

    return parts
        .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join('')
}

/**
 * Escape special characters in a string for use in a regular expression.
 * 
 * @param value 
 * @returns 
 */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Convert a SchemaColumn definition to a Prisma field type string, including modifiers.
 * 
 * @param column 
 * @returns 
 */
export const resolvePrismaType = (column: SchemaColumn): string => {
    if (column.type === 'id')
        return 'Int'
    if (column.type === 'uuid')
        return 'String'
    if (column.type === 'string' || column.type === 'text')
        return 'String'
    if (column.type === 'integer')
        return 'Int'
    if (column.type === 'bigInteger')
        return 'BigInt'
    if (column.type === 'float')
        return 'Float'
    if (column.type === 'boolean')
        return 'Boolean'
    if (column.type === 'json')
        return 'Json'

    return 'DateTime'
}

/** 
 * Format a default value for inclusion in a Prisma schema field definition, based on its type.
 * 
 * @param value 
 * @returns 
 */
export const formatDefaultValue = (value: unknown): string | undefined => {
    if (value == null)
        return undefined

    if (typeof value === 'string')
        return `@default("${value.replace(/"/g, '\\"')}")`
    if (typeof value === 'number' || typeof value === 'bigint')
        return `@default(${value})`
    if (typeof value === 'boolean')
        return `@default(${value ? 'true' : 'false'})`

    return undefined
}

/**
 * Build a single line of a Prisma model field definition based on a SchemaColumn, including type and modifiers.
 * 
 * @param column 
 * @returns 
 */
export const buildFieldLine = (column: SchemaColumn): string => {
    if (column.type === 'id')
        return `  ${column.name} Int @id @default(autoincrement())`

    const scalar = resolvePrismaType(column)
    const nullable = column.nullable ? '?' : ''
    const unique = column.unique ? ' @unique' : ''
    const primary = column.primary ? ' @id' : ''
    const defaultValue = formatDefaultValue(column.default)
        ?? (column.type === 'uuid' && column.primary ? '@default(uuid())' : undefined)
    const defaultSuffix = defaultValue ? ` ${defaultValue}` : ''

    return `  ${column.name} ${scalar}${nullable}${primary}${unique}${defaultSuffix}`
}

/**
 * Build a Prisma model-level @@index definition line.
 * 
 * @param index 
 * @returns 
 */
export const buildIndexLine = (index: SchemaIndex): string => {
    const columns = index.columns.join(', ')
    const named = typeof index.name === 'string' && index.name.trim().length > 0
        ? `, name: "${index.name.replace(/"/g, '\\"')}"`
        : ''

    return `  @@index([${columns}]${named})`
}

/**
 * Build a Prisma model block string based on a SchemaTableCreateOperation, including 
 * all fields and any necessary mapping.
 * 
 * @param operation The schema table create operation to convert.
 * @returns         The corresponding Prisma model block string.
 */
export const buildModelBlock = (operation: SchemaTableCreateOperation): string => {
    const modelName = toModelName(operation.table)
    const mapped = operation.table !== modelName.toLowerCase()
    const fields = operation.columns.map(buildFieldLine)
    const indexes = (operation.indexes ?? []).map(buildIndexLine)
    const metadata = [
        ...indexes,
        ...(mapped ? [`  @@map("${str(operation.table).snake()}")`] : []),
    ]

    const lines = metadata.length > 0
        ? [...fields, '', ...metadata]
        : fields

    return `model ${modelName} {\n${lines.join('\n')}\n}`
}

/**
 * Find the Prisma model block in a schema string that corresponds to a given 
 * table name, using both explicit mapping and naming conventions.
 * 
 * @param schema 
 * @param table 
 * @returns 
 */
export const findModelBlock = (schema: string, table: string): {
    modelName: string
    block: string
    start: number
    end: number
} | null => {
    const candidates = [...schema.matchAll(PRISMA_MODEL_REGEX)]
    const explicitMapRegex = new RegExp(`@@map\\("${escapeRegex(table)}"\\)`)

    for (const match of candidates) {
        const block = match[0]
        const modelName = match[1]
        const start = match.index ?? 0
        const end = start + block.length
        if (explicitMapRegex.test(block))
            return { modelName, block, start, end }

        if (modelName.toLowerCase() === table.toLowerCase())
            return { modelName, block, start, end }

        if (modelName.toLowerCase() === toModelName(table).toLowerCase())
            return { modelName, block, start, end }
    }

    return null
}

/**
 * Apply a create table operation to a Prisma schema string, adding a new model 
 * block for the specified table and fields.
 * 
 * @param schema    The current Prisma schema string.
 * @param operation The schema table create operation to apply.
 * @returns         The updated Prisma schema string with the new model block.
 */
export const applyCreateTableOperation = (schema: string, operation: SchemaTableCreateOperation): string => {
    const existing = findModelBlock(schema, operation.table)
    if (existing)
        throw new ArkormException(`Prisma model for table [${operation.table}] already exists.`)

    const block = buildModelBlock(operation)
    const prefix = schema.trimEnd()

    return `${prefix}\n\n${block}\n`
}

/**
 * Apply an alter table operation to a Prisma schema string, modifying the model 
 * block for the specified table by adding and removing fields as needed.
 * 
 * @param schema    The current Prisma schema string.
 * @param operation The schema table alter operation to apply.
 * @returns         The updated Prisma schema string with the modified model block.
 */
export const applyAlterTableOperation = (
    schema: string,
    operation: SchemaTableAlterOperation
): string => {
    const model = findModelBlock(schema, operation.table)
    if (!model)
        throw new ArkormException(`Prisma model for table [${operation.table}] was not found.`)

    let block = model.block
    const bodyLines = block.split('\n')

    operation.dropColumns.forEach((column) => {
        const columnRegex = new RegExp(`^\\s*${escapeRegex(column)}\\s+`)
        for (let index = 0; index < bodyLines.length; index += 1) {
            if (columnRegex.test(bodyLines[index])) {
                bodyLines.splice(index, 1)

                return
            }
        }
    })

    operation.addColumns.forEach((column) => {
        const fieldLine = buildFieldLine(column)
        const columnRegex = new RegExp(`^\\s*${escapeRegex(column.name)}\\s+`)
        const exists = bodyLines.some(line => columnRegex.test(line))
        if (exists)
            return

        const defaultInsertIndex = Math.max(1, bodyLines.length - 1)
        const beforeInsertIndex = typeof column.before === 'string' && column.before.length > 0
            ? bodyLines.findIndex(line => new RegExp(`^\\s*${escapeRegex(column.before as string)}\\s+`).test(line))
            : -1
        const insertIndex = beforeInsertIndex > 0 ? beforeInsertIndex : defaultInsertIndex
        bodyLines.splice(insertIndex, 0, fieldLine)
    });

    (operation.addIndexes ?? []).forEach((index) => {
        const indexLine = buildIndexLine(index)
        const exists = bodyLines.some(line => line.trim() === indexLine.trim())
        if (exists)
            return

        const insertIndex = Math.max(1, bodyLines.length - 1)
        bodyLines.splice(insertIndex, 0, indexLine)
    })

    block = bodyLines.join('\n')

    return `${schema.slice(0, model.start)}${block}${schema.slice(model.end)}`
}

/**
 * Apply a drop table operation to a Prisma schema string, removing the model block
 * for the specified table.
 */
export const applyDropTableOperation = (
    schema: string,
    operation: SchemaTableDropOperation
): string => {
    const model = findModelBlock(schema, operation.table)
    if (!model)
        return schema

    const before = schema.slice(0, model.start).trimEnd()
    const after = schema.slice(model.end).trimStart()
    const separator = before && after ? '\n\n' : ''

    return `${before}${separator}${after}`
}

/**
 * The SchemaBuilder class provides a fluent interface for defining 
 * database schema operations in a migration, such as creating, altering, and 
 * dropping tables.
 * 
 * @param schema        The current Prisma schema string.
 * @param operations    The list of schema operations to apply.
 * @returns             The updated Prisma schema string after applying all operations.
 */
export const applyOperationsToPrismaSchema = (schema: string, operations: SchemaOperation[]): string => {
    return operations.reduce((current, operation) => {
        if (operation.type === 'createTable')
            return applyCreateTableOperation(current, operation)
        if (operation.type === 'alterTable')
            return applyAlterTableOperation(current, operation)

        return applyDropTableOperation(current, operation)
    }, schema)
}

/**
 * Run a Prisma CLI command using npx, capturing and throwing any errors that occur.
 * 
 * @param args The arguments to pass to the Prisma CLI command.
 * @param cwd The current working directory to run the command in.
 * @returns void
 */
export const runPrismaCommand = (
    args: string[],
    cwd: string
): void => {
    const command = spawnSync('npx', ['prisma', ...args], {
        cwd,
        encoding: 'utf-8',
    })

    if (command.status === 0)
        return

    const errorOutput = [command.stdout, command.stderr].filter(Boolean).join('\n').trim()

    throw new ArkormException(
        errorOutput
            ? `Prisma command failed: prisma ${args.join(' ')}\n${errorOutput}`
            : `Prisma command failed: prisma ${args.join(' ')}`
    )
}

/**
 * Generate a new migration file with a given name and options, including 
 * writing the file to disk if specified.
 * 
 * @param name 
 * @returns 
 */
export const resolveMigrationClassName = (name: string): string => {
    const cleaned = name
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
    if (!cleaned)
        return 'GeneratedMigration'

    const baseName = cleaned
        .split(/\s+/g)
        .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join('')

    return `${baseName}Migration`
}

/**
 * Pad a number with leading zeros to ensure it is at least two digits, for 
 * use in migration timestamps.
 * 
 * @param value 
 * @returns 
 */
export const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Create a timestamp string in the format YYYYMMDDHHMMSS for use in migration 
 * file names, based on the current date and time or a provided date.
 * 
 * @param date 
 * @returns 
 */
export const createMigrationTimestamp = (date = new Date()): string => {
    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hour = pad(date.getHours())
    const minute = pad(date.getMinutes())
    const second = pad(date.getSeconds())

    return `${year}${month}${day}${hour}${minute}${second}`
}

/**
 * Convert a migration name to a slug suitable for use in a file name, by 
 * lowercasing and replacing non-alphanumeric characters with underscores.
 * 
 * @param name 
 * @returns 
 */
export const toMigrationFileSlug = (name: string): string => {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

    return slug || 'migration'
}

/**
 * Build the source code for a new migration file based on a given class 
 * name, using a template with empty up and down methods.
 * 
 * @param className 
 * @returns 
 */
export const buildMigrationSource = (
    className: string,
    extension: 'ts' | 'js' = 'ts'
): string => {
    if (extension === 'js') {
        return [
            'import { Migration } from \'arkormx\'',
            '',
            `export default class ${className} extends Migration {`,
            '    /**',
            '     * @param {import(\'arkormx\').SchemaBuilder} schema',
            '     * @returns {Promise<void>}',
            '     */',
            '    async up (schema) {',
            '    }',
            '',
            '    /**',
            '     * @param {import(\'arkormx\').SchemaBuilder} schema',
            '     * @returns {Promise<void>}',
            '     */',
            '    async down (schema) {',
            '    }',
            '}',
            '',
        ].join('\n')
    }

    return [
        'import { Migration, SchemaBuilder } from \'arkormx\'',
        '',
        `export default class ${className} extends Migration {`,
        '    public async up (schema: SchemaBuilder): Promise<void> {',
        '    }',
        '',
        '    public async down (schema: SchemaBuilder): Promise<void> {',
        '    }',
        '}',
        '',
    ].join('\n')
}

/**
 * Generate a new migration file with a given name and options, including 
 * writing the file to disk if specified, and return the details of the generated file.
 * 
 * @param name 
 * @param options 
 * @returns 
 */
export const generateMigrationFile = (
    name: string,
    options: GenerateMigrationOptions = {}
): GeneratedMigrationFile => {
    const timestamp = createMigrationTimestamp(new Date())
    const fileSlug = toMigrationFileSlug(name)
    const className = resolveMigrationClassName(name)
    const extension = options.extension ?? 'ts'
    const directory = options.directory ?? join(process.cwd(), 'database', 'migrations')
    const fileName = `${timestamp}_${fileSlug}.${extension}`
    const filePath = join(directory, fileName)
    const content = buildMigrationSource(className, extension)

    if (options.write ?? true) {
        if (!existsSync(directory))
            mkdirSync(directory, { recursive: true })

        if (existsSync(filePath))
            throw new ArkormException(`Migration file already exists: ${filePath}`)

        writeFileSync(filePath, content)
    }

    return {
        fileName,
        filePath,
        className,
        content,
    }
}

/**
 * Get the list of schema operations that would be performed by a given migration class when run in a specified direction (up or down), without actually applying them.
 * 
 * @param migration The migration class or instance to analyze.
 * @param direction The direction of the migration to plan for ('up' or 'down').
 * @returns         A promise that resolves to an array of schema operations that would be performed.   
 */
export const getMigrationPlan = async (
    migration: Migration | (new () => Migration),
    direction: 'up' | 'down' = 'up'
): Promise<SchemaOperation[]> => {
    const instance = migration instanceof Migration
        ? migration
        : new migration()

    const schema = new SchemaBuilder()
    if (direction === 'up')
        await instance.up(schema)
    else
        await instance.down(schema)

    return schema.getOperations()
}

/**
 * Apply the schema operations defined in a migration to a Prisma schema 
 * file, updating the file on disk if specified, and return the updated 
 * schema and list of operations applied.
 * 
 * @param migration The migration class or instance to apply.
 * @param options   Options for applying the migration, including schema path and write flag.
 * @returns         A promise that resolves to an object containing the updated schema, schema path, and list of operations applied.
 */
export const applyMigrationToPrismaSchema = async (
    migration: Migration | (new () => Migration),
    options: PrismaSchemaSyncOptions = {}
): Promise<{ schema: string, schemaPath: string, operations: SchemaOperation[] }> => {
    const schemaPath = options.schemaPath ?? join(process.cwd(), 'prisma', 'schema.prisma')
    if (!existsSync(schemaPath))
        throw new ArkormException(`Prisma schema file not found: ${schemaPath}`)

    const source = readFileSync(schemaPath, 'utf-8')
    const operations = await getMigrationPlan(migration, 'up')
    const schema = applyOperationsToPrismaSchema(source, operations)

    if (options.write ?? true)
        writeFileSync(schemaPath, schema)

    return { schema, schemaPath, operations }
}

/**
 * Run a migration by applying its schema operations to a Prisma schema 
 * file, optionally generating Prisma client code and running migrations after 
 * applying the schema changes.
 * 
 * @param migration The migration class or instance to run.
 * @param options   Options for running the migration, including schema path, write flag, and Prisma commands.
 * @returns         A promise that resolves to an object containing the schema path and list of operations applied.
 */
export const runMigrationWithPrisma = async (
    migration: Migration | (new () => Migration),
    options: PrismaMigrationWorkflowOptions = {}
): Promise<{ schemaPath: string, operations: SchemaOperation[] }> => {
    const cwd = options.cwd ?? process.cwd()
    const schemaPath = options.schemaPath ?? join(cwd, 'prisma', 'schema.prisma')
    const applied = await applyMigrationToPrismaSchema(migration, {
        schemaPath,
        write: options.write,
    })

    const shouldGenerate = options.runGenerate ?? true
    const shouldMigrate = options.runMigrate ?? true
    const mode = options.migrateMode ?? 'dev'

    if (shouldGenerate)
        runPrismaCommand(['generate'], cwd)

    if (shouldMigrate) {
        if (mode === 'deploy') {
            runPrismaCommand(['migrate', 'deploy'], cwd)
        } else {
            const migrationName = options.migrationName ?? `arkorm_${createMigrationTimestamp()}`
            runPrismaCommand(['migrate', 'dev', '--name', migrationName], cwd)
        }
    }

    return {
        schemaPath: applied.schemaPath,
        operations: applied.operations,
    }
}
