import { Kysely, PostgresDialect } from 'kysely'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { CliApp, resetArkormRuntimeForTests } from '../../src'
import { mkdtempSync, rmSync } from 'node:fs'
import { DbCommand } from '../../src/cli/commands/DbCommand'
import { Kernel } from '@h3ravel/musket'
import { Pool } from 'pg'
import { createKyselyAdapter } from '../../src'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('DbCommand against the Kysely adapter', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) })
  const adapter = createKyselyAdapter(db)
  const originalCwd = process.cwd()
  const tempDirs: string[] = []

  afterEach(() => {
    process.chdir(originalCwd)
    resetArkormRuntimeForTests()
    tempDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
  })

  afterAll(async () => {
    await db.destroy()
  })

  const runDb = async (options: Record<string, unknown>, args: Record<string, unknown> = {}) => {
    // Run from an empty directory so loadArkormConfig() finds no project config.
    const directory = mkdtempSync(join(tmpdir(), 'arkormx-db-cmd-pg-'))
    tempDirs.push(directory)
    process.chdir(directory)

    const app = new CliApp()
    ;(app as unknown as { getConfig: (key: string) => unknown }).getConfig = (key: string) =>
      key === 'adapter' ? adapter : undefined
    const command = new DbCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app

    const lines: string[] = []
    const successLines: string[] = []
    const errorLines: string[] = []
    Object.assign(command as unknown as Record<string, unknown>, {
      option: (name: string, fallback?: unknown) => options[name] ?? fallback,
      options: () => options,
      argument: (name: string) => args[name],
      line: (line: string) => lines.push(line),
      success: (line: string) => successLines.push(line),
      error: (line: string) => errorLines.push(line),
      multiline: async () => '',
    })

    await command.handle()

    return { lines, successLines, errorLines }
  }

  it('executes a real SELECT and renders the result', async () => {
    const io = await runDb({}, { sql: "select 1 as one, 'hi' as greeting" })

    expect(io.errorLines).toHaveLength(0)
    const table = io.lines.join('\n')
    expect(table).toContain('one')
    expect(table).toContain('greeting')
    expect(table).toContain('hi')
    expect(io.successLines.some((line) => line.includes('(1 row)'))).toBe(true)
  })

  it('applies positional bindings', async () => {
    const io = await runDb(
      { json: true, bindings: '[7]' },
      { sql: 'select ? as answer' },
    )

    expect(io.errorLines).toHaveLength(0)
    expect(JSON.parse(io.lines.join('\n'))).toEqual([{ answer: 7 }])
  })

  it('surfaces SQL errors from the adapter', async () => {
    const io = await runDb({}, { sql: 'select * from a_table_that_does_not_exist_xyz' })

    expect(io.errorLines.length).toBeGreaterThan(0)
  })
})
