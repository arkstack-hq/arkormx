import {
  Migration,
  SchemaBuilder,
  applyMigrationToDatabase,
  applyOperationsToPrismaSchema,
} from '../../src'
import type { DatabaseAdapter, SchemaOperation, SchemaTableAlterOperation } from '../../src'
import { describe, expect, it } from 'vitest'

describe('TableBuilder.change()', () => {
  it('records changed columns separately from added columns', () => {
    const schema = new SchemaBuilder()
    schema.alterTable('users', (table) => {
      table.string('nickname').nullable() // a normal addition
      table.string('status').default('active').change() // a change
      table.enum('role', ['admin', 'user', 'guest']).change() // an enum change
    })

    const [operation] = schema.getOperations() as SchemaTableAlterOperation[]

    expect(operation.addColumns.map((column) => column.name)).toEqual(['nickname'])
    expect(operation.changeColumns?.map((column) => column.name)).toEqual(['status', 'role'])

    const status = operation.changeColumns?.find((column) => column.name === 'status')
    expect(status).toMatchObject({ type: 'string', default: 'active' })

    const role = operation.changeColumns?.find((column) => column.name === 'role')
    expect(role).toMatchObject({ type: 'enum' })
    expect(role?.enumValues).toEqual(['admin', 'user', 'guest'])
  })

  it('rewrites the Prisma field line for a changed column', () => {
    const source = [
      'model User {',
      '  id     Int    @id @default(autoincrement())',
      '  status String @default("active")',
      '}',
      '',
    ].join('\n')

    const schema = new SchemaBuilder()
    schema.alterTable('users', (table) => {
      table.string('status').nullable().change()
    })

    const next = applyOperationsToPrismaSchema(source, schema.getOperations())

    expect(next).toContain('status String?')
    expect(next).not.toContain('status String @default("active")')
  })
})

describe('Migration.done()', () => {
  const recordingAdapter = (log: string[]): DatabaseAdapter =>
    ({
      executeSchemaOperations: async (operations: SchemaOperation[]) => {
        log.push(`operations:${operations.length}`)
      },
    }) as unknown as DatabaseAdapter

  it('runs done("up") after the up operations are applied', async () => {
    const log: string[] = []

    class CreateThingsMigration extends Migration {
      public up(schema: SchemaBuilder): void {
        schema.createTable('things', (table) => {
          table.id()
          table.string('name')
        })
      }

      public down(schema: SchemaBuilder): void {
        schema.dropTable('things')
      }

      public override done(direction: 'up' | 'down'): void {
        log.push(`done:${direction}`)
      }
    }

    await applyMigrationToDatabase(recordingAdapter(log), CreateThingsMigration)

    expect(log).toEqual(['operations:1', 'done:up'])
  })

  it('defaults to a no-op when not overridden', async () => {
    const log: string[] = []

    class NoopMigration extends Migration {
      public up(schema: SchemaBuilder): void {
        schema.createTable('noop', (table) => table.id())
      }

      public down(schema: SchemaBuilder): void {
        schema.dropTable('noop')
      }
    }

    await expect(applyMigrationToDatabase(recordingAdapter(log), NoopMigration)).resolves.toBeDefined()
    expect(log).toEqual(['operations:1'])
  })
})
