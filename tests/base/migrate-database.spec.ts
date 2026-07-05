import type {
  AggregateSpec,
  DatabaseAdapter,
  DeleteSpec,
  InsertSpec,
  SelectSpec,
  UpdateSpec,
} from '../../src/types/adapter'
import type { AppliedMigrationsState, SchemaOperation } from '../../src'
import { CliApp, configureArkormRuntime, resetArkormRuntimeForTests } from '../../src'
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import { Kernel } from '@h3ravel/musket'
import { MigrateCommand } from '../../src/cli/commands/MigrateCommand'
import { MigrateFreshCommand } from '../../src/cli/commands/MigrateFreshCommand'
import { MigrateRollbackCommand } from '../../src/cli/commands/MigrateRollbackCommand'
import { MigrationHistoryCommand } from '../../src/cli/commands/MigrationHistoryCommand'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const originalCwd = process.cwd()
const tempDirectories: string[] = []

const makeTempDir = (prefix: string): string => {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  tempDirectories.push(directory)

  return directory
}

const attachCommandIo = (
  command: {
    option: (name: string, fallback?: unknown) => unknown
    options: () => Record<string, unknown>
    argument: (name: string) => unknown
    success: (line: string) => void
    error: (line: string) => void
    confirm?: (line: string, defaultValue?: boolean) => Promise<boolean>
  },
  options: Record<string, unknown> = {},
  argumentsMap: Record<string, unknown> = {},
  confirmResponse = true,
) => {
  const successLines: string[] = []
  const errorLines: string[] = []

  // Mirror musket's `option(key, default)`: fall back to the default when unset.
  command.option = (name: string, fallback?: unknown) => options[name] ?? fallback
  command.options = () => options
  command.argument = (name: string) => argumentsMap[name]
  command.success = (line: string) => {
    successLines.push(line)
  }
  command.error = (line: string) => {
    errorLines.push(line)
  }
  command.confirm = async () => confirmResponse

  return { successLines, errorLines }
}

const createNoopAdapter = (): DatabaseAdapter => {
  const notImplemented = async (): Promise<never> => {
    throw new Error('Not implemented in test adapter')
  }

  const state: AppliedMigrationsState = {
    version: 1,
    migrations: [],
    runs: [],
  }
  const executed: SchemaOperation[][] = []
  const assertDatabaseExists = (): void => {
    if (!adapter.databaseExists) {
      const error = new Error(`database "${adapter.databaseName}" does not exist`) as Error & {
        code: string
      }
      error.code = '3D000'

      throw error
    }
  }

  const adapter: DatabaseAdapter & {
    state: AppliedMigrationsState
    executed: SchemaOperation[][]
    resetCount: number
    databaseExists: boolean
    databaseName: string
  } = {
    state,
    executed,
    resetCount: 0,
    databaseExists: true,
    databaseName: 'arkorm_test',
    select: async <TModel = unknown>(_spec: SelectSpec<TModel>) => await notImplemented(),
    selectOne: async <TModel = unknown>(_spec: SelectSpec<TModel>) => await notImplemented(),
    insert: async <TModel = unknown>(_spec: InsertSpec<TModel>) => await notImplemented(),
    update: async <TModel = unknown>(_spec: UpdateSpec<TModel>) => await notImplemented(),
    delete: async <TModel = unknown>(_spec: DeleteSpec<TModel>) => await notImplemented(),
    count: async <TModel = unknown>(_spec: AggregateSpec<TModel>) => await notImplemented(),
    transaction: async <TResult = unknown>(
      callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
    ): Promise<TResult> => {
      assertDatabaseExists()

      return await callback(adapter)
    },
    executeSchemaOperations: async (operations: SchemaOperation[]): Promise<void> => {
      assertDatabaseExists()
      executed.push(operations)
    },
    createDatabaseFromError: async (
      error: unknown,
    ): Promise<{ database?: string; created: boolean } | null> => {
      const candidate = error as { code?: unknown; message?: unknown } | undefined
      if (candidate?.code !== '3D000' || !String(candidate.message).includes(adapter.databaseName))
        return null

      adapter.databaseExists = true

      return { database: adapter.databaseName, created: true }
    },
    resetDatabase: async (): Promise<void> => {
      assertDatabaseExists()
      adapter.resetCount += 1
      adapter.executed.splice(0, adapter.executed.length)
      adapter.state.migrations.splice(0, adapter.state.migrations.length)
      adapter.state.runs = []
    },
    readAppliedMigrationsState: async (): Promise<AppliedMigrationsState> => {
      assertDatabaseExists()

      return JSON.parse(JSON.stringify(state)) as AppliedMigrationsState
    },
    writeAppliedMigrationsState: async (nextState: AppliedMigrationsState): Promise<void> => {
      assertDatabaseExists()
      state.version = nextState.version
      state.migrations.splice(0, state.migrations.length, ...nextState.migrations)
      state.runs = [...(nextState.runs ?? [])]
    },
  }

  return adapter
}

afterEach(() => {
  process.chdir(originalCwd)
  resetArkormRuntimeForTests()

  tempDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true })
  })
})

describe('database-backed migration command fallback', () => {
  it('uses adapter-backed migration execution and state tracking without prisma schema files', async () => {
    const workspace = makeTempDir('arkormx-db-migrate-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        "      table.string('email')",
        "      table.string('emailVerificationCode').nullable().map('email_verification_code')",
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      state: AppliedMigrationsState
      executed: SchemaOperation[][]
    }

    configureArkormRuntime(() => ({}), {
      adapter,
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const migrateCommand = new MigrateCommand(app, new Kernel(app))
    ;(migrateCommand as unknown as { app: CliApp }).app = app
    const migrateIo = attachCommandIo(migrateCommand as unknown as any, {
      all: true,
    })

    await migrateCommand.handle()

    expect(migrateIo.errorLines).toHaveLength(0)
    expect(migrateIo.successLines.some((line) => line.includes('Applied 1 migration(s).'))).toBe(
      true,
    )
    expect(adapter.executed).toHaveLength(1)
    expect(adapter.executed[0]?.[0]).toMatchObject({ type: 'createTable', table: 'users' })
    expect(adapter.state.migrations).toHaveLength(1)
    expect(
      JSON.parse(readFileSync(join(workspace, '.arkormx', 'column-mappings.json'), 'utf-8')),
    ).toEqual({
      version: 1,
      tables: {
        users: {
          columns: {
            emailVerificationCode: 'email_verification_code',
          },
          enums: {},
        },
      },
    })

    const historyCommand = new MigrationHistoryCommand(app, new Kernel(app))
    ;(historyCommand as unknown as { app: CliApp }).app = app
    const historyIo = attachCommandIo(historyCommand as unknown as any, {
      json: true,
    })

    await historyCommand.handle()

    expect(historyIo.errorLines).toHaveLength(0)
    expect(historyIo.successLines.join('\n')).toContain('"migrations"')

    const rollbackCommand = new MigrateRollbackCommand(app, new Kernel(app))
    ;(rollbackCommand as unknown as { app: CliApp }).app = app
    const rollbackIo = attachCommandIo(rollbackCommand as unknown as any)

    await rollbackCommand.handle()

    expect(rollbackIo.errorLines).toHaveLength(0)
    expect(
      rollbackIo.successLines.some((line) => line.includes('Rolled back 1 migration(s).')),
    ).toBe(true)
    expect(adapter.executed).toHaveLength(2)
    expect(adapter.executed[1]?.[0]).toMatchObject({ type: 'dropTable', table: 'users' })
    expect(adapter.state.migrations).toHaveLength(0)
    expect(existsSync(join(workspace, '.arkormx', 'column-mappings.json'))).toBe(false)
  })

  it('rolls back a batch in the exact reverse of the order it was applied', async () => {
    const workspace = makeTempDir('arkormx-db-rollback-order-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    const writeMigration = (fileName: string, className: string, table: string) =>
      writeFileSync(
        join(migrationsDir, fileName),
        [
          `import { Migration } from '${migrationBaseImport}'`,
          '',
          `export class ${className} extends Migration {`,
          '  async up (schema) {',
          `    schema.createTable('${table}', (table) => { table.id() })`,
          '  }',
          '',
          '  async down (schema) {',
          `    schema.dropTable('${table}')`,
          '  }',
          '}',
          '',
        ].join('\n'),
      )

    // Files load alphabetically, so alpha applies before bravo before charlie.
    writeMigration('CreateAlpha.ts', 'CreateAlpha', 'alpha')
    writeMigration('CreateBravo.ts', 'CreateBravo', 'bravo')
    writeMigration('CreateCharlie.ts', 'CreateCharlie', 'charlie')

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      state: AppliedMigrationsState
      executed: SchemaOperation[][]
    }

    configureArkormRuntime(() => ({}), { adapter, paths: { migrations: migrationsDir } })

    const app = new CliApp()

    const migrate = new MigrateCommand(app, new Kernel(app))
    ;(migrate as unknown as { app: CliApp }).app = app
    const migrateIo = attachCommandIo(migrate as unknown as any, { all: true })
    await migrate.handle()
    expect(migrateIo.errorLines).toHaveLength(0)
    adapter.executed.splice(0, adapter.executed.length)

    const rollback = new MigrateRollbackCommand(app, new Kernel(app))
    ;(rollback as unknown as { app: CliApp }).app = app
    // No --step: roll back the last (only) batch of all three migrations.
    const rollbackIo = attachCommandIo(rollback as unknown as any, {})
    await rollback.handle()

    expect(rollbackIo.errorLines).toHaveLength(0)
    const droppedTables = adapter.executed.map(
      (operations) => (operations[0] as { table: string }).table,
    )

    // down() runs in reverse application order: charlie, then bravo, then alpha.
    expect(droppedTables).toEqual(['charlie', 'bravo', 'alpha'])
    expect(adapter.state.migrations).toHaveLength(0)
  })

  it('offers to create the configured database before adapter-backed migrate runs', async () => {
    const workspace = makeTempDir('arkormx-db-migrate-create-database-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        "      table.string('email')",
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      databaseExists: boolean
      executed: SchemaOperation[][]
      state: AppliedMigrationsState
    }
    adapter.databaseExists = false

    configureArkormRuntime(() => ({}), {
      adapter,
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const command = new MigrateCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(command as unknown as any, { all: true })

    await command.handle()

    expect(io.errorLines).toHaveLength(0)
    expect(io.successLines.some((line) => line.includes('Created database: arkorm_test'))).toBe(
      true,
    )
    expect(adapter.databaseExists).toBe(true)
    expect(adapter.executed).toHaveLength(1)
    expect(adapter.state.migrations).toHaveLength(1)
  })

  it('stops adapter-backed migrate when the user opts out of database creation', async () => {
    const workspace = makeTempDir('arkormx-db-migrate-create-database-opt-out-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      databaseExists: boolean
      executed: SchemaOperation[][]
      state: AppliedMigrationsState
    }
    adapter.databaseExists = false

    configureArkormRuntime(() => ({}), {
      adapter,
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const command = new MigrateCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(command as unknown as any, { all: true }, {}, false)

    await command.handle()

    expect(
      io.errorLines.some((line) =>
        line.includes('Configured database [arkorm_test] does not exist'),
      ),
    ).toBe(true)
    expect(adapter.databaseExists).toBe(false)
    expect(adapter.executed).toHaveLength(0)
    expect(adapter.state.migrations).toHaveLength(0)
  })

  it('resets adapter-backed databases before reapplying tracked migrations', async () => {
    const workspace = makeTempDir('arkormx-db-fresh-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        "      table.string('email')",
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      state: AppliedMigrationsState
      executed: SchemaOperation[][]
      resetCount: number
    }
    adapter.state.migrations.push({
      id: 'stale:Migration',
      file: '/tmp/stale.ts',
      className: 'StaleMigration',
      appliedAt: '2026-04-07T00:00:00.000Z',
      checksum: 'stale',
    })

    configureArkormRuntime(() => ({}), {
      adapter,
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const freshCommand = new MigrateFreshCommand(app, new Kernel(app))
    ;(freshCommand as unknown as { app: CliApp }).app = app
    const freshIo = attachCommandIo(freshCommand as unknown as any)

    await freshCommand.handle()

    expect(freshIo.errorLines).toHaveLength(0)
    expect(
      freshIo.successLines.some((line) => line.includes('Refreshed database with 1 migration(s).')),
    ).toBe(true)
    expect(adapter.resetCount).toBe(1)
    expect(adapter.executed).toHaveLength(1)
    expect(adapter.executed[0]?.[0]).toMatchObject({ type: 'createTable', table: 'users' })
    expect(adapter.state.migrations).toHaveLength(1)
    expect(adapter.state.migrations[0]?.id).toContain('CreateUsersMigration')
  })

  it('migrate:fresh loads the project config to reach the adapter reset path (regression)', async () => {
    const workspace = makeTempDir('arkormx-db-fresh-loadconfig-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateThings.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        'export class CreateThings extends Migration {',
        "  async up (schema) { schema.createTable('things', (table) => { table.id() }) }",
        "  async down (schema) { schema.dropTable('things') }",
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      resetCount: number
      executed: SchemaOperation[][]
    }
    ;(globalThis as Record<string, unknown>).__ARKORM_FRESH_TEST_ADAPTER__ = adapter

    // The adapter is reachable ONLY through the project config — the command must
    // load it itself. Without loadArkormConfig() the adapter is undefined and
    // fresh wrongly takes the Prisma path (no schema.prisma => error, no reset).
    writeFileSync(
      join(workspace, 'arkormx.config.cjs'),
      `module.exports = { adapter: globalThis.__ARKORM_FRESH_TEST_ADAPTER__, paths: { migrations: ${JSON.stringify(migrationsDir)} } }\n`,
    )

    const app = new CliApp()
    const fresh = new MigrateFreshCommand(app, new Kernel(app))
    ;(fresh as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(fresh as unknown as any, {
      'skip-generate': true,
      'skip-migrate': true,
    })

    await fresh.handle()
    delete (globalThis as Record<string, unknown>).__ARKORM_FRESH_TEST_ADAPTER__

    expect(io.errorLines).toHaveLength(0)
    expect(adapter.resetCount).toBe(1)
    expect(adapter.executed[0]?.[0]).toMatchObject({ type: 'createTable', table: 'things' })
  })

  it('offers to create the configured database before adapter-backed fresh runs', async () => {
    const workspace = makeTempDir('arkormx-db-fresh-create-database-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      databaseExists: boolean
      executed: SchemaOperation[][]
      resetCount: number
      state: AppliedMigrationsState
    }
    adapter.databaseExists = false

    configureArkormRuntime(() => ({}), {
      adapter,
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const command = new MigrateFreshCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(command as unknown as any)

    await command.handle()

    expect(io.errorLines).toHaveLength(0)
    expect(io.successLines.some((line) => line.includes('Created database: arkorm_test'))).toBe(
      true,
    )
    expect(adapter.databaseExists).toBe(true)
    expect(adapter.resetCount).toBe(1)
    expect(adapter.executed).toHaveLength(1)
    expect(adapter.state.migrations).toHaveLength(1)
  })

  it('reports an error when persisted column mappings are disabled for database-backed migrations', async () => {
    const workspace = makeTempDir('arkormx-db-migrate-no-column-map-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        "      table.string('emailVerificationCode').map('email_verification_code')",
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      executed: SchemaOperation[][]
    }

    configureArkormRuntime(() => ({}), {
      adapter,
      features: {
        persistedColumnMappings: false,
      },
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const command = new MigrateCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(command as unknown as any, {
      all: true,
    })

    await command.handle()

    expect(io.successLines).toHaveLength(0)
    expect(io.errorLines.some((line) => line.includes('persisted column mappings'))).toBe(true)
    expect(adapter.executed).toHaveLength(0)
  })

  it('reports an error when persisted enums are disabled for database-backed migrations', async () => {
    const workspace = makeTempDir('arkormx-db-migrate-no-enums-')
    process.chdir(workspace)

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        "      table.enum('status', ['draft', 'published'])",
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      executed: SchemaOperation[][]
    }

    configureArkormRuntime(() => ({}), {
      adapter,
      features: {
        persistedEnums: false,
      },
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const command = new MigrateCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(command as unknown as any, {
      all: true,
    })

    await command.handle()

    expect(io.successLines).toHaveLength(0)
    expect(io.errorLines.some((line) => line.includes('persisted enum metadata'))).toBe(true)
    expect(adapter.executed).toHaveLength(0)
  })

  it('does not modify prisma schema files when adapter-backed fresh reset support is unavailable', async () => {
    const workspace = makeTempDir('arkormx-db-fresh-no-reset-')
    process.chdir(workspace)

    const schemaPath = join(workspace, 'prisma', 'schema.prisma')
    mkdirSync(join(workspace, 'prisma'), { recursive: true })
    writeFileSync(
      schemaPath,
      [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "postgresql"',
        '  url = env("DATABASE_URL")',
        '}',
        '',
        'model Legacy {',
        '  id Int @id',
        '}',
        '',
      ].join('\n'),
    )

    const migrationsDir = join(workspace, 'database', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })

    const migrationBaseImport = `${originalCwd.replace(/\\/g, '/')}/src/database/Migration.ts`
    writeFileSync(
      join(migrationsDir, 'CreateUsersMigration.ts'),
      [
        `import { Migration } from '${migrationBaseImport}'`,
        '',
        'export class CreateUsersMigration extends Migration {',
        '  async up (schema) {',
        "    schema.createTable('users', (table) => {",
        '      table.id()',
        '    })',
        '  }',
        '',
        '  async down (schema) {',
        "    schema.dropTable('users')",
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const adapter = createNoopAdapter() as DatabaseAdapter & {
      executed: SchemaOperation[][]
      resetDatabase?: () => Promise<void>
    }
    delete adapter.resetDatabase

    configureArkormRuntime(() => ({}), {
      adapter,
      paths: {
        migrations: migrationsDir,
      },
    })

    const app = new CliApp()
    const command = new MigrateFreshCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachCommandIo(command as unknown as any, {
      schema: schemaPath,
    })

    await command.handle()

    expect(io.successLines).toHaveLength(0)
    expect(io.errorLines.some((line) => line.includes('does not support database reset'))).toBe(
      true,
    )
    expect(adapter.executed).toHaveLength(0)
    expect(readFileSync(schemaPath, 'utf-8')).toContain('model Legacy')
  })
})
