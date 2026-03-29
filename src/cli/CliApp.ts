import { ArkormConfig, GetUserConfig } from 'src/types'
import { PRISMA_ENUM_REGEX, applyCreateTableOperation, findModelBlock, generateMigrationFile } from '../helpers/migrations'
import { dirname, extname, join, relative } from 'path'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { getDefaultStubsPath, getUserConfig } from '../helpers/runtime-config'

import { Command } from '@h3ravel/musket'
import { Logger } from '@h3ravel/shared'
import { createRequire } from 'module'
import { str } from '@h3ravel/support'

type SyncedPrismaModelField = {
    name: string
    type: string
    nullable: boolean
}

type SyncedPrismaModel = {
    name: string
    table: string
    fields: SyncedPrismaModelField[]
}

type ParsedDeclarationNode =
    | { kind: 'array', element: ParsedDeclarationNode }
    | { kind: 'named', name: string }
    | { kind: 'null' }
    | { kind: 'string-literal', value: string }
    | { kind: 'union', types: ParsedDeclarationNode[] }

type ExistingDeclaration = {
    name: string
    raw: string
    type: string
}

/**
 * Main application class for the Arkormˣ CLI.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class CliApp {
    public command!: Command
    protected config: Partial<ArkormConfig> = {}

    constructor() {
        this.config = getUserConfig()
    }

    /**
     * Get the current configuration object or a specific configuration value.
     *
     * @param key Optional specific configuration key to retrieve
     * @returns The entire configuration object or the value of the specified key
     */
    getConfig: GetUserConfig = getUserConfig

    /**
     * Utility to ensure directory exists
     *
     * @param filePath
     */
    ensureDirectory (filePath: string) {
        const dir = dirname(filePath)
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
        }
    }

    /**
     * Convert absolute paths under current working directory into relative display paths.
     *
     * @param filePath
     * @returns
     */
    formatPathForLog (filePath: string): string {
        const relPath = relative(process.cwd(), filePath)
        if (!relPath)
            return '.'

        if (relPath.startsWith('..'))
            return filePath

        return relPath
    }

    /**
     * Utility to format a value for logging, converting absolute paths under current 
     * working directory into relative display paths.
     * 
     * @param name 
     * @param value 
     * @returns 
     */
    splitLogger (name: string, value: string) {
        value = value.includes(process.cwd()) ? this.formatPathForLog(value) : value

        return Logger.twoColumnDetail(name + ' ', ' ' + value, false).join('')
    }

    private hasTypeScriptInstalled (): boolean {
        try {
            const require = createRequire(import.meta.url)
            require.resolve('typescript', { paths: [process.cwd()] })

            return true
        } catch {
            return false
        }
    }

    private resolveOutputExt (): 'ts' | 'js' {
        const configured = this.getConfig('outputExt')
        const preferred: 'ts' | 'js' = configured === 'js' ? 'js' : 'ts'

        if (preferred === 'ts' && !this.hasTypeScriptInstalled())
            return 'js'

        return preferred
    }

    private stripKnownSourceExtension (value: string): string {
        return value.replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/i, '')
    }

    /**
     * Resolve a directory path to runtime output when the source path is unavailable.
     *
     * @param directoryPath
     * @returns
     */
    resolveRuntimeDirectoryPath (directoryPath: string): string {
        if (existsSync(directoryPath))
            return directoryPath

        const { buildOutput } = this.getConfig('paths') || {}
        if (typeof buildOutput !== 'string' || buildOutput.trim().length === 0)
            return directoryPath

        const relativeSource = relative(process.cwd(), directoryPath)
        if (!relativeSource || relativeSource.startsWith('..'))
            return directoryPath

        const mappedDirectory = join(buildOutput, relativeSource)

        return existsSync(mappedDirectory)
            ? mappedDirectory
            : directoryPath
    }

    /**
     * Resolve a script file path for runtime execution.
     * If a .ts file is provided, tries equivalent .js/.cjs/.mjs files first.
     * Also attempts mapped paths inside paths.buildOutput preserving structure.
     *
     * @param filePath
     * @returns
     */
    resolveRuntimeScriptPath (filePath: string): string {
        const extension = extname(filePath).toLowerCase()
        const isTsFile = extension === '.ts' || extension === '.mts' || extension === '.cts'
        const candidates: string[] = []

        if (isTsFile) {
            const base = filePath.slice(0, -extension.length)
            candidates.push(`${base}.js`, `${base}.cjs`, `${base}.mjs`)
        }

        const { buildOutput } = this.getConfig('paths') ?? {}
        if (typeof buildOutput === 'string' && buildOutput.trim().length > 0) {
            const relativeSource = relative(process.cwd(), filePath)
            if (relativeSource && !relativeSource.startsWith('..')) {
                const mappedFile = join(buildOutput, relativeSource)
                const mappedExtension = extname(mappedFile).toLowerCase()
                const mappedIsTs = mappedExtension === '.ts' || mappedExtension === '.mts' || mappedExtension === '.cts'

                if (mappedIsTs) {
                    const mappedBase = mappedFile.slice(0, -mappedExtension.length)
                    candidates.push(`${mappedBase}.js`, `${mappedBase}.cjs`, `${mappedBase}.mjs`)
                } else {
                    candidates.push(mappedFile)
                }
            }
        }

        const runtimeMatch = candidates.find(path => existsSync(path))
        if (runtimeMatch)
            return runtimeMatch

        return filePath
    }

    /**
     * Utility to generate file from stub
     *
     * @param stubPath
     * @param outputPath
     * @param replacements
     */
    generateFile (
        stubPath: string,
        outputPath: string,
        replacements: Record<string, string>,
        options?: any
    ): string {
        if (existsSync(outputPath) && !options?.force) {
            this.command.error(`Error: ${this.formatPathForLog(outputPath)} already exists.`)
            process.exit(1)
        } else if (existsSync(outputPath) && options?.force) {
            rmSync(outputPath)
        }

        let content = readFileSync(stubPath, 'utf-8')
        for (const [key, value] of Object.entries(replacements)) {
            content = content.replace(new RegExp(`{{${key}}}`, 'g'), value)
        }

        this.ensureDirectory(outputPath)
        writeFileSync(outputPath, content)

        return outputPath
    }

    /**
     * Resolve a configuration path with a fallback default
     * 
     * @param key The configuration key to resolve
     * @param fallback The fallback value if the configuration key is not set
     * @returns The resolved configuration path
     */
    private resolveConfigPath (
        key: keyof NonNullable<ArkormConfig['paths']>,
        fallback: string
    ): string {
        const { [key]: configured } = this.getConfig('paths') ?? {}
        if (typeof configured === 'string' && configured.trim().length > 0)
            return configured

        return fallback
    }

    /**
     * Resolve the path to a stub file based on configuration
     * 
     * @param stubName 
     * @returns 
     */
    private resolveStubPath (stubName: string): string {
        const stubsDir = this.resolveConfigPath('stubs', getDefaultStubsPath())

        return join(stubsDir, stubName)
    }

    /**
     * Generate a factory file for a given model name.
     * 
     * @param name 
     * @param options 
     * @returns 
     */
    public makeFactory (
        name: string,
        options: {
            force?: boolean
            modelName?: string
            modelImportPath?: string
        } = {}
    ): { name: string, path: string } {
        const baseName = str(name.replace(/Factory$/, '')).pascal()
        const factoryName = `${baseName}Factory`
        const modelName = options.modelName ? str(options.modelName).pascal() : baseName
        const outputExt = this.resolveOutputExt()
        const factoriesDir = this.resolveConfigPath('factories', join(process.cwd(), 'database', 'factories'))
        const outputPath = join(factoriesDir, `${factoryName}.${outputExt}`)
        const modelPath = join(this.resolveConfigPath('models', join(process.cwd(), 'src', 'models')), `${modelName}.${outputExt}`)
        const relativeImport = options.modelImportPath
            ?? `./${this.stripKnownSourceExtension(relative(dirname(outputPath), modelPath).replace(/\\/g, '/'))}${outputExt === 'js' ? '.js' : ''}`
        const stubPath = this.resolveStubPath(outputExt === 'js' ? 'factory.js.stub' : 'factory.stub')

        const path = this.generateFile(stubPath, outputPath, {
            FactoryName: factoryName,
            ModelName: modelName.toString(),
            ModelImportPath: relativeImport.startsWith('.') ? relativeImport : `./${relativeImport}`,
        }, options)

        return { name: factoryName, path }
    }

    /**
     * Generate a seeder file for a given name.
     * 
     * @param name 
     * @param options 
     * @returns 
     */
    public makeSeeder (
        name: string,
        options: { force?: boolean } = {}
    ): { name: string, path: string } {
        const baseName = str(name.replace(/Seeder$/, '')).pascal()
        const seederName = `${baseName}Seeder`
        const outputExt = this.resolveOutputExt()
        const seedersDir = this.resolveConfigPath('seeders', join(process.cwd(), 'database', 'seeders'))
        const outputPath = join(seedersDir, `${seederName}.${outputExt}`)
        const stubPath = this.resolveStubPath(outputExt === 'js' ? 'seeder.js.stub' : 'seeder.stub')

        const path = this.generateFile(stubPath, outputPath, {
            SeederName: seederName,
        }, options)

        return { name: seederName, path }
    }

    /**
     * Generate a migration file for a given name.
     * 
     * @param name The name of the migration.
     * @returns An object containing the name and path of the generated migration file.
     */
    public makeMigration (name: string): { name: string, path: string } {
        const migrationsDir = this.resolveConfigPath('migrations', join(process.cwd(), 'database', 'migrations'))
        const generated = generateMigrationFile(name, {
            directory: migrationsDir,
            extension: this.resolveOutputExt(),
        })

        return {
            name: generated.className,
            path: generated.filePath,
        }
    }

    /**
     * Generate a model file along with optional factory, seeder, and migration files.
     * 
     * @param name 
     * @param options 
     * @returns 
     */
    public makeModel (
        name: string,
        options: {
            force?: boolean
            factory?: boolean
            seeder?: boolean
            migration?: boolean
            all?: boolean
        } = {}
    ): {
        model: { name: string, path: string }
        prisma: { path: string, updated: boolean }
        factory?: { name: string, path: string }
        seeder?: { name: string, path: string }
        migration?: { name: string, path: string }
    } {
        const baseName = str(name.replace(/Model$/, '')).pascal().toString()
        const modelName = `${baseName}`
        const delegateName = str(baseName).camel().plural().toString()
        const outputExt = this.resolveOutputExt()
        const modelsDir = this.resolveConfigPath('models', join(process.cwd(), 'src', 'models'))

        const outputPath = join(modelsDir, `${modelName}.${outputExt}`)
        const shouldBuildFactory = options.all || options.factory
        const shouldBuildSeeder = options.all || options.seeder
        const shouldBuildMigration = options.all || options.migration
        const factoryName = `${baseName}Factory`
        const factoryPath = join(this.resolveConfigPath('factories', join(process.cwd(), 'database', 'factories')), `${factoryName}.${outputExt}`)

        const factoryImportPath = `./${relative(dirname(outputPath), factoryPath)
            .replace(/\\/g, '/')
            .replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/i, '')}${outputExt === 'js' ? '.js' : ''}`

        const stubPath = this.resolveStubPath(outputExt === 'js' ? 'model.js.stub' : 'model.stub')

        const modelPath = this.generateFile(stubPath, outputPath, {
            ModelName: modelName,
            DelegateName: delegateName,
            FactoryImport: shouldBuildFactory
                ? `import { ${factoryName} } from '${factoryImportPath}'\n`
                : '',
            FactoryLink: shouldBuildFactory
                ? outputExt === 'js'
                    ? `\n    static factoryClass = ${factoryName}`
                    : `\n    protected static override factoryClass = ${factoryName}`
                : '',
        }, options)

        const prisma = this.ensurePrismaModelEntry(modelName, delegateName)

        const created = {
            model: { name: modelName, path: modelPath },
            prisma,
            factory: undefined as { name: string, path: string } | undefined,
            seeder: undefined as { name: string, path: string } | undefined,
            migration: undefined as { name: string, path: string } | undefined,
        }

        if (shouldBuildFactory) {
            created.factory = this.makeFactory(baseName, {
                force: options.force,
                modelName,
                modelImportPath: `./${relative(dirname(factoryPath), outputPath)
                    .replace(/\\/g, '/')
                    .replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/i, '')}${outputExt === 'js' ? '.js' : ''}`,
            })
        }

        if (shouldBuildSeeder)
            created.seeder = this.makeSeeder(baseName, { force: options.force })

        if (shouldBuildMigration)
            created.migration = this.makeMigration(`create ${delegateName} table`)

        return created
    }

    /**
     * Ensure that the Prisma schema has a model entry for the given model 
     * and delegate names.
     * If the entry does not exist, it will be created with a default `id` field.
     * 
     * @param modelName The name of the model to ensure in the Prisma schema.
     * @param delegateName The name of the delegate (table) to ensure in the Prisma schema.
     */
    private ensurePrismaModelEntry (
        modelName: string,
        delegateName: string
    ): { path: string, updated: boolean } {
        const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
        if (!existsSync(schemaPath))
            return { path: schemaPath, updated: false }

        const source = readFileSync(schemaPath, 'utf-8')
        const existingByTable = findModelBlock(source, delegateName)
        const existingByName = new RegExp(`model\\s+${modelName}\\s*\\{`, 'm').test(source)
        if (existingByTable || existingByName)
            return { path: schemaPath, updated: false }

        const updated = applyCreateTableOperation(source, {
            type: 'createTable',
            table: delegateName,
            columns: [
                {
                    name: 'id',
                    type: 'id',
                    primary: true,
                },
            ],
            indexes: [],
            foreignKeys: [],
        })

        writeFileSync(schemaPath, updated)

        return { path: schemaPath, updated: true }
    }

    /**
     * Convert a Prisma scalar type to its corresponding TypeScript type.
     * 
     * @param value The Prisma scalar type.
     * @returns     The corresponding TypeScript type.
     */
    private prismaTypeToTs (value: string): string {
        if (value === 'Int' || value === 'Float' || value === 'Decimal')
            return 'number'
        if (value === 'BigInt')
            return 'bigint'
        if (value === 'String')
            return 'string'
        if (value === 'Boolean')
            return 'boolean'
        if (value === 'DateTime')
            return 'Date'
        if (value === 'Json')
            return 'Record<string, unknown> | unknown[]'
        if (value === 'Bytes')
            return 'Buffer'

        return 'unknown'
    }

    private splitTopLevel (value: string, delimiter: string): string[] {
        const parts: string[] = []
        let start = 0
        let angleDepth = 0
        let parenthesisDepth = 0
        let quote: string | null = null

        for (let index = 0; index < value.length; index += 1) {
            const character = value[index]
            const previous = index > 0 ? value[index - 1] : ''

            if (quote) {
                if (character === quote && previous !== '\\')
                    quote = null

                continue
            }

            if (character === '\'' || character === '"') {
                quote = character
                continue
            }

            if (character === '<') {
                angleDepth += 1
                continue
            }

            if (character === '>') {
                angleDepth = Math.max(0, angleDepth - 1)
                continue
            }

            if (character === '(') {
                parenthesisDepth += 1
                continue
            }

            if (character === ')') {
                parenthesisDepth = Math.max(0, parenthesisDepth - 1)
                continue
            }

            if (character === delimiter && angleDepth === 0 && parenthesisDepth === 0) {
                parts.push(value.slice(start, index).trim())
                start = index + 1
            }
        }

        parts.push(value.slice(start).trim())

        return parts.filter(Boolean)
    }

    private hasWrappedParentheses (value: string): boolean {
        if (!value.startsWith('(') || !value.endsWith(')'))
            return false

        let depth = 0
        let quote: string | null = null

        for (let index = 0; index < value.length; index += 1) {
            const character = value[index]
            const previous = index > 0 ? value[index - 1] : ''

            if (quote) {
                if (character === quote && previous !== '\\')
                    quote = null

                continue
            }

            if (character === '\'' || character === '"') {
                quote = character
                continue
            }

            if (character === '(')
                depth += 1

            if (character === ')') {
                depth -= 1

                if (depth === 0 && index < value.length - 1)
                    return false
            }
        }

        return depth === 0
    }

    private stripWrappedParentheses (value: string): string {
        let nextValue = value.trim()

        while (this.hasWrappedParentheses(nextValue))
            nextValue = nextValue.slice(1, -1).trim()

        return nextValue
    }

    private parseDeclarationType (value: string): ParsedDeclarationNode | null {
        const trimmed = this.stripWrappedParentheses(value.trim())
        if (!trimmed)
            return null

        const unionParts = this.splitTopLevel(trimmed, '|')
        if (unionParts.length > 1) {
            const types = unionParts
                .map(part => this.parseDeclarationType(part))
                .filter((part): part is ParsedDeclarationNode => part !== null)

            if (types.length !== unionParts.length)
                return null

            return {
                kind: 'union',
                types: types.flatMap(type => type.kind === 'union' ? type.types : [type]),
            }
        }

        if (trimmed.endsWith('[]')) {
            const element = this.parseDeclarationType(trimmed.slice(0, -2))
            if (!element)
                return null

            return { kind: 'array', element }
        }

        const arrayMatch = trimmed.match(/^(Array|ReadonlyArray)<([\s\S]+)>$/)
        if (arrayMatch) {
            const element = this.parseDeclarationType(arrayMatch[2])
            if (!element)
                return null

            return { kind: 'array', element }
        }

        if (trimmed === 'null')
            return { kind: 'null' }

        if (
            (trimmed.startsWith('\'') && trimmed.endsWith('\''))
            || (trimmed.startsWith('"') && trimmed.endsWith('"'))
        ) {
            return {
                kind: 'string-literal',
                value: trimmed.slice(1, -1),
            }
        }

        if (trimmed === 'Record<string, unknown>')
            return { kind: 'named', name: trimmed }

        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed))
            return { kind: 'named', name: trimmed }

        return null
    }

    private expandUnion (node: ParsedDeclarationNode): ParsedDeclarationNode[] {
        return node.kind === 'union' ? node.types : [node]
    }

    private isEnumTypeName (value: string, enums: Map<string, string[]>): boolean {
        return enums.has(value)
    }

    private isDeclarationNodeAssignable (
        actual: ParsedDeclarationNode,
        expected: ParsedDeclarationNode,
        enums: Map<string, string[]>
    ): boolean {
        if (expected.kind === 'named') {
            if (expected.name === 'unknown')
                return true

            if (actual.kind === 'named') {
                if (actual.name === expected.name)
                    return true

                if (expected.name === 'string' && this.isEnumTypeName(actual.name, enums))
                    return true
            }

            if (actual.kind === 'string-literal') {
                if (expected.name === 'string')
                    return true

                const enumValues = enums.get(expected.name)
                if (enumValues?.includes(actual.value))
                    return true
            }

            return false
        }

        if (expected.kind === 'array')
            return actual.kind === 'array' && this.isDeclarationAssignable(actual.element, expected.element, enums)

        if (expected.kind === 'null')
            return actual.kind === 'null'

        if (expected.kind === 'string-literal')
            return actual.kind === 'string-literal' && actual.value === expected.value

        return false
    }

    private isDeclarationAssignable (
        actual: ParsedDeclarationNode,
        expected: ParsedDeclarationNode,
        enums: Map<string, string[]>
    ): boolean {
        const actualTypes = this.expandUnion(actual)
        const expectedTypes = this.expandUnion(expected)

        return actualTypes.every(actualType => {
            return expectedTypes.some(expectedType => {
                return this.isDeclarationNodeAssignable(actualType, expectedType, enums)
            })
        })
    }

    private isCompatibleDeclarationType (
        actualType: string,
        expectedType: string,
        enums: Map<string, string[]>
    ): boolean {
        const actual = this.parseDeclarationType(actualType)
        const expected = this.parseDeclarationType(expectedType)

        if (!actual || !expected)
            return actualType.replace(/\s+/g, ' ').trim() === expectedType.replace(/\s+/g, ' ').trim()

        return this.isDeclarationAssignable(actual, expected, enums)
    }

    private collectEnumReferencesFromNode (
        node: ParsedDeclarationNode,
        enums: Map<string, string[]>,
        collected: Set<string>
    ): void {
        if (node.kind === 'named' && enums.has(node.name)) {
            collected.add(node.name)

            return
        }

        if (node.kind === 'array') {
            this.collectEnumReferencesFromNode(node.element, enums, collected)

            return
        }

        if (node.kind === 'union')
            node.types.forEach(type => this.collectEnumReferencesFromNode(type, enums, collected))
    }

    private collectEnumReferences (type: string, enums: Map<string, string[]>): string[] {
        const parsed = this.parseDeclarationType(type)
        if (!parsed)
            return []

        const collected = new Set<string>()
        this.collectEnumReferencesFromNode(parsed, enums, collected)

        return [...collected].sort((left, right) => left.localeCompare(right))
    }

    private syncPrismaEnumImports (modelSource: string, enumTypes: string[]): string {
        if (enumTypes.length === 0)
            return modelSource

        const importRegex = /^import\s+type\s+\{([^}]+)\}\s+from\s+['"]@prisma\/client['"]\s*;?$/m
        const existingImport = modelSource.match(importRegex)
        if (existingImport) {
            const existingTypes = existingImport[1]
                .split(',')
                .map(value => value.trim())
                .filter(Boolean)

            const mergedTypes = [...new Set([...existingTypes, ...enumTypes])]
                .sort((left, right) => left.localeCompare(right))

            return modelSource.replace(
                importRegex,
                `import type { ${mergedTypes.join(', ')} } from '@prisma/client'`
            )
        }

        const lines = modelSource.split('\n')
        let insertionIndex = 0

        while (insertionIndex < lines.length && lines[insertionIndex].trim().startsWith('import '))
            insertionIndex += 1

        lines.splice(insertionIndex, 0, `import type { ${enumTypes.join(', ')} } from '@prisma/client'`)

        return lines.join('\n')
    }

    /**
     * Parse Prisma enum definitions from a schema and return their member names.
     *
     * @param schema The Prisma schema source.
     * @returns      A map of enum names to their declared member names.
     */
    private parsePrismaEnums (schema: string): Map<string, string[]> {
        const enums = new Map<string, string[]>()

        for (const match of schema.matchAll(PRISMA_ENUM_REGEX)) {
            const enumName = match[1]
            const block = match[0]
            const values = block
                .split('\n')
                .slice(1, -1)
                .map(line => line.trim())
                .filter(line => Boolean(line) && !line.startsWith('//'))
                .map((line) => {
                    const memberMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)\b/)

                    return memberMatch?.[1]
                })
                .filter((value): value is string => Boolean(value))

            enums.set(enumName, values)
        }

        return enums
    }

    /**
     * Resolve the generated TypeScript declaration type for a Prisma field.
     *
     * @param fieldType  The Prisma field type token.
     * @param isList     Whether the field is declared as a Prisma list.
     * @param enums      Known Prisma enum definitions.
     * @returns          The declaration type to emit, or null when unsupported.
     */
    private prismaFieldTypeToTs (
        fieldType: string,
        isList: boolean,
        enums: Map<string, string[]>
    ): string | null {
        const baseType = enums.has(fieldType)
            ? fieldType
            : this.prismaTypeToTs(fieldType)

        if (baseType === 'unknown' && !enums.has(fieldType))
            return null

        return isList
            ? `Array<${baseType}>`
            : baseType
    }

    /**
     * Parse the Prisma schema to extract model definitions and their fields, focusing 
     * on scalar types.
     * 
     * @param schema    The Prisma schema as a string.
     * @returns         An array of model definitions with their fields.
     */
    private parsePrismaModels (schema: string): SyncedPrismaModel[] {
        const models: SyncedPrismaModel[] = []

        const enumDefinitions = this.parsePrismaEnums(schema)
        const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g
        const scalarTypes = new Set([
            'Int', 'Float', 'Decimal', 'BigInt', 'String', 'Boolean', 'DateTime', 'Json', 'Bytes'
        ])

        for (const match of schema.matchAll(modelRegex)) {
            const name = match[1]
            const body = match[2]
            const mapped = body.match(/@@map\("([^"]+)"\)/)
            const table = mapped?.[1] ?? `${name.charAt(0).toLowerCase()}${name.slice(1)}s`
            const fields: SyncedPrismaModelField[] = []

            body.split('\n').forEach((rawLine) => {
                const line = rawLine.trim()
                if (!line || line.startsWith('@@') || line.startsWith('//'))
                    return

                const fieldMatch = line.match(/^(\w+)\s+([A-Za-z][A-Za-z0-9_]*)(\[\])?(\?)?(?:\s|$)/)
                if (!fieldMatch)
                    return

                const fieldType = fieldMatch[2]
                if (!scalarTypes.has(fieldType) && !enumDefinitions.has(fieldType))
                    return

                const declarationType = this.prismaFieldTypeToTs(
                    fieldType,
                    Boolean(fieldMatch[3]),
                    enumDefinitions
                )
                if (!declarationType)
                    return

                fields.push({
                    name: fieldMatch[1],
                    type: declarationType,
                    nullable: Boolean(fieldMatch[4]),
                })
            })

            models.push({ name, table, fields })
        }

        return models
    }

    /**
     * Sync model attribute declarations in a model file based on the 
     * provided declarations.
     * This method takes the source code of a model file and a list of 
     * attribute declarations,
     * 
     * @param modelSource   The source code of the model file.
     * @param declarations  A list of attribute declarations to sync.
     * @returns An object containing the updated content and a flag indicating if it was updated.
     */
    private syncModelDeclarations (
        modelSource: string,
        declarations: SyncedPrismaModelField[],
        enums: Map<string, string[]>
    ): { content: string, updated: boolean } {
        const lines = modelSource.split('\n')
        const classIndex = lines.findIndex(line => /export\s+class\s+\w+\s+extends\s+Model<.+>\s*\{/.test(line))
        if (classIndex < 0)
            return { content: modelSource, updated: false }

        let classEndIndex = -1
        let depth = 0
        for (let index = classIndex; index < lines.length; index += 1) {
            const line = lines[index]
            depth += (line.match(/\{/g) || []).length
            depth -= (line.match(/\}/g) || []).length

            if (depth === 0) {
                classEndIndex = index
                break
            }
        }

        if (classEndIndex < 0)
            return { content: modelSource, updated: false }

        const withinClass = lines.slice(classIndex + 1, classEndIndex)
        const existingDeclarations = new Map<string, ExistingDeclaration>()

        withinClass.forEach((line) => {
            const declarationMatch = line.match(/^\s*declare\s+(\w+)\??:\s*([^;\n]+);?\s*$/)
            if (!declarationMatch)
                return

            existingDeclarations.set(declarationMatch[1], {
                name: declarationMatch[1],
                raw: line.trim(),
                type: declarationMatch[2].trim(),
            })
        })

        const withoutDeclares = withinClass.filter(line => !/^\s*declare\s+\w+\??:\s*[^\n]+$/.test(line))
        const chosenDeclarations = declarations.map((declaration) => {
            const expectedType = `${declaration.type}${declaration.nullable ? ' | null' : ''}`
            const existingDeclaration = existingDeclarations.get(declaration.name)

            if (
                existingDeclaration
                && this.isCompatibleDeclarationType(existingDeclaration.type, expectedType, enums)
            ) {
                return existingDeclaration.raw
            }

            return `declare ${declaration.name}: ${expectedType}`
        })

        const declarationLines = chosenDeclarations.map(declaration => `    ${declaration}`)
        const rebuiltClass = [...declarationLines, ...withoutDeclares]
        const content = [
            ...lines.slice(0, classIndex + 1),
            ...rebuiltClass,
            ...lines.slice(classEndIndex),
        ].join('\n')

        const enumImports = [...new Set(chosenDeclarations.flatMap((declaration) => {
            const type = declaration.replace(/^declare\s+\w+\??:\s*/, '').replace(/;$/, '').trim()

            return this.collectEnumReferences(type, enums)
        }))].sort((left, right) => left.localeCompare(right))

        const contentWithImports = this.syncPrismaEnumImports(content, enumImports)

        return {
            content: contentWithImports,
            updated: contentWithImports !== modelSource,
        }
    }

    /**
     * Sync model attribute declarations in model files based on the Prisma schema.
     * This method reads the Prisma schema to extract model definitions and their 
     * scalar fields, then updates the corresponding model files to include `declare` 
     * statements for these fields. It returns an object containing the paths of the
     * schema and models, the total number of model files processed, and lists of 
     * updated and skipped files.
     * 
     * @param options Optional parameters to specify custom paths for the Prisma schema and models directory.
     * @returns An object with details about the synchronization process, including updated and skipped files.
     */
    public syncModelsFromPrisma (options: {
        schemaPath?: string
        modelsDir?: string
    } = {}): {
        schemaPath: string
        modelsDir: string
        total: number
        updated: string[]
        skipped: string[]
    } {
        const schemaPath = options.schemaPath ?? join(process.cwd(), 'prisma', 'schema.prisma')
        const modelsDir = options.modelsDir ?? this.resolveConfigPath('models', join(process.cwd(), 'src', 'models'))

        if (!existsSync(schemaPath))
            throw new Error(`Prisma schema file not found: ${schemaPath}`)
        if (!existsSync(modelsDir))
            throw new Error(`Models directory not found: ${modelsDir}`)

        const schema = readFileSync(schemaPath, 'utf-8')
        const prismaEnums = this.parsePrismaEnums(schema)
        const prismaModels = this.parsePrismaModels(schema)

        const modelFiles = readdirSync(modelsDir)
            .filter((file: string) => file.endsWith('.ts'))

        const updated: string[] = []
        const skipped: string[] = []

        modelFiles.forEach((file: string) => {
            const filePath = join(modelsDir, file)
            const source = readFileSync(filePath, 'utf-8')
            const classMatch = source.match(/export\s+class\s+(\w+)\s+extends\s+Model<'([^']+)'>/)
            if (!classMatch) {
                skipped.push(filePath)

                return
            }

            const className = classMatch[1]
            const delegate = classMatch[2]
            const prismaModel = prismaModels.find(model => model.table === delegate) ?? prismaModels.find(model => model.name === className)
            if (!prismaModel || prismaModel.fields.length === 0) {
                skipped.push(filePath)

                return
            }

            const synced = this.syncModelDeclarations(source, prismaModel.fields, prismaEnums)
            if (!synced.updated) {
                skipped.push(filePath)

                return
            }

            writeFileSync(filePath, synced.content)
            updated.push(filePath)
        })

        return {
            schemaPath,
            modelsDir,
            total: modelFiles.length,
            updated,
            skipped,
        }
    }
}
