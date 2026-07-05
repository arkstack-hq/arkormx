import { CliApp, resetArkormRuntimeForTests } from '../../src'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'

import { DbCommand } from '../../src/cli/commands/DbCommand'
import { Kernel } from '@h3ravel/musket'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const originalCwd = process.cwd()
const tempDirs: string[] = []

const makeTempDir = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'arkormx-db-cmd-'))
  tempDirs.push(directory)

  return directory
}

const attachIo = (
  command: any,
  options: Record<string, unknown> = {},
  args: Record<string, unknown> = {},
  editorReturn = '',
) => {
  const successLines: string[] = []
  const errorLines: string[] = []
  const lines: string[] = []
  let editorOpened = false

  command.option = (name: string, fallback?: unknown) => options[name] ?? fallback
  command.options = () => options
  command.argument = (name: string) => args[name]
  command.success = (line: string) => successLines.push(line)
  command.error = (line: string) => errorLines.push(line)
  command.line = (line: string) => lines.push(line)
  command.multiline = async () => {
    editorOpened = true

    return editorReturn
  }

  return { successLines, errorLines, lines, editorOpened: () => editorOpened }
}

const makeAdapter = (
  rows: Array<Record<string, unknown>>,
  behavior: { throw?: string } = {},
) => {
  const calls: Array<{ sql: string; bindings?: unknown[] }> = []

  const adapter = {
    rawQuery: async (spec: { sql: string; bindings?: unknown[] }) => {
      calls.push(spec)
      if (behavior.throw) throw new Error(behavior.throw)

      return rows
    },
  }

  return { adapter, calls }
}

const runDb = async (
  adapter: unknown,
  options: Record<string, unknown>,
  args: Record<string, unknown> = {},
  editorReturn = '',
) => {
  // Run from an empty directory so loadArkormConfig() finds no project config.
  process.chdir(makeTempDir())

  const app = new CliApp()
  // Stub config resolution so the command sees exactly the adapter under test.
  ;(app as unknown as { getConfig: (key: string) => unknown }).getConfig = (key: string) =>
    key === 'adapter' ? adapter : undefined
  const command = new DbCommand(app, new Kernel(app))
  ;(command as unknown as { app: CliApp }).app = app
  const io = attachIo(command as unknown as any, options, args, editorReturn)

  await command.handle()

  return io
}

afterEach(() => {
  process.chdir(originalCwd)
  resetArkormRuntimeForTests()
  tempDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe('DbCommand (raw SQL)', () => {
  it('executes SQL from the argument and renders a table', async () => {
    const { adapter, calls } = makeAdapter([
      { id: 1, name: 'Jane' },
      { id: 2, name: 'John' },
    ])

    const io = await runDb(adapter, {}, { sql: 'select id, name from users' })

    expect(io.errorLines).toHaveLength(0)
    expect(calls).toEqual([{ sql: 'select id, name from users', bindings: [] }])

    const table = io.lines.join('\n')
    expect(table).toContain('id')
    expect(table).toContain('name')
    expect(table).toContain('Jane')
    expect(table).toContain('John')
    expect(io.successLines.some((line) => line.includes('(2 rows)'))).toBe(true)
  })

  it('renders NULL for null cells and singular row count', async () => {
    const { adapter } = makeAdapter([{ id: 1, name: null }])

    const io = await runDb(adapter, {}, { sql: 'select 1' })

    expect(io.lines.join('\n')).toContain('NULL')
    expect(io.successLines.some((line) => line.includes('(1 row)'))).toBe(true)
  })

  it('outputs JSON with --json', async () => {
    const rows = [{ id: 1, active: true }]
    const { adapter } = makeAdapter(rows)

    const io = await runDb(adapter, { json: true }, { sql: 'select 1' })

    expect(JSON.parse(io.lines.join('\n'))).toEqual(rows)
  })

  it('passes parsed --bindings to the adapter', async () => {
    const { adapter, calls } = makeAdapter([])

    await runDb(
      adapter,
      { bindings: '[1, "active"]' },
      { sql: 'select * from users where id = ? and status = ?' },
    )

    expect(calls[0]?.bindings).toEqual([1, 'active'])
  })

  it('reads SQL from --file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkormx-db-cmd-'))
    tempDirs.push(dir)
    const file = join(dir, 'query.sql')
    writeFileSync(file, 'select 42 as answer')

    const { adapter, calls } = makeAdapter([{ answer: 42 }])

    const io = await runDb(adapter, { file }, {})

    expect(io.errorLines).toHaveLength(0)
    expect(calls[0]?.sql).toBe('select 42 as answer')
  })

  it('reports a friendly message when no rows are returned', async () => {
    const { adapter } = makeAdapter([])

    const io = await runDb(adapter, {}, { sql: 'update users set active = true' })

    expect(io.successLines.some((line) => line.includes('0 rows returned'))).toBe(true)
    expect(io.lines).toHaveLength(0)
  })

  it('opens the editor when no SQL is given and runs the entered statement', async () => {
    const { adapter, calls } = makeAdapter([{ now: '2026-07-05' }])

    const io = await runDb(adapter, {}, {}, 'select now()')

    expect(io.editorOpened()).toBe(true)
    expect(calls[0]?.sql).toBe('select now()')
    expect(io.errorLines).toHaveLength(0)
  })

  it('errors when the editor is closed without any SQL', async () => {
    const { adapter } = makeAdapter([])

    const io = await runDb(adapter, {}, {}, '   ')

    expect(io.editorOpened()).toBe(true)
    expect(io.errorLines.some((line) => line.includes('No SQL statement provided'))).toBe(true)
  })

  it('prefers the argument over the editor', async () => {
    const { adapter, calls } = makeAdapter([])

    const io = await runDb(adapter, {}, { sql: 'select 1' }, 'select 2')

    expect(io.editorOpened()).toBe(false)
    expect(calls[0]?.sql).toBe('select 1')
  })

  it('errors on an invalid --bindings value', async () => {
    const { adapter } = makeAdapter([])

    const io = await runDb(adapter, { bindings: 'not json' }, { sql: 'select 1' })

    expect(io.errorLines.some((line) => line.includes('--bindings must be valid JSON'))).toBe(true)
  })

  it('errors when no adapter is configured', async () => {
    const io = await runDb(undefined, {}, { sql: 'select 1' })

    expect(io.errorLines.some((line) => line.includes('configured database adapter'))).toBe(true)
  })

  it('errors when the adapter does not support rawQuery', async () => {
    const io = await runDb({ select: async () => [] }, {}, { sql: 'select 1' })

    expect(io.errorLines.some((line) => line.includes('does not support raw queries'))).toBe(true)
  })

  it('surfaces adapter execution errors', async () => {
    const { adapter } = makeAdapter([], { throw: 'syntax error at or near "slect"' })

    const io = await runDb(adapter, {}, { sql: 'slect 1' })

    expect(io.errorLines.some((line) => line.includes('syntax error'))).toBe(true)
  })

  it('loads the adapter from arkormx.config when none is pre-set (regression)', async () => {
    // No getConfig stub: the command must load the project config itself and
    // resolve the adapter from it — the original bug returned "no adapter".
    const dir = makeTempDir()
    writeFileSync(
      join(dir, 'arkormx.config.cjs'),
      'module.exports = { adapter: { rawQuery: async () => [{ loaded_from: "config" }] } }\n',
    )
    process.chdir(dir)

    const app = new CliApp()
    const command = new DbCommand(app, new Kernel(app))
    ;(command as unknown as { app: CliApp }).app = app
    const io = attachIo(command as unknown as any, {}, { sql: 'select 1' })

    await command.handle()

    expect(io.errorLines).toHaveLength(0)
    expect(io.lines.join('\n')).toContain('loaded_from')
    expect(io.lines.join('\n')).toContain('config')
  })
})
