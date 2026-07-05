import type { DatabaseRow, DatabaseValue } from '../../types/adapter'
import { existsSync, readFileSync } from 'node:fs'
import { getRuntimeAdapter, loadArkormConfig } from '../../helpers/runtime-config'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { getRuntimeCompatibilityAdapter } from '../../helpers/runtime-compatibility'
import { resolve } from 'node:path'

/**
 * Executes a raw SQL statement against the configured database adapter and prints
 * the result — Arkorm's equivalent of `artisan db`.
 *
 * @author Legacy (3m1n3nc3)
 */
export class DbCommand extends Command<CliApp> {
  protected signature = `db
        {sql? : Raw SQL statement to execute (prompts for it when omitted)}
        {--file= : Read the SQL statement from a file instead of the argument}
        {--bindings= : JSON array of positional bindings for ? placeholders}
        {--json : Print result rows as JSON instead of a table}
    `

  protected description = 'Execute a raw SQL statement against the configured database'

  async handle() {
    this.app.command = this
    await loadArkormConfig()

    const sql = await this.resolveSql()
    if (sql === null) return
    if (sql.trim().length === 0) return void this.error('Error: No SQL statement provided.')

    const bindings = this.resolveBindings()
    if (bindings === null) return

    const adapter = getRuntimeAdapter() ?? getRuntimeCompatibilityAdapter()
    if (!adapter)
      return void this.error(
        'Error: No database driver configured. Set an adapter or client in arkormx.config.',
      )

    if (typeof adapter.rawQuery !== 'function')
      return void this.error(
        'Error: The configured adapter does not support raw queries. Use a SQL-backed adapter (e.g. the Kysely/PostgreSQL adapter).',
      )

    let rows: DatabaseRow[]
    try {
      rows = (await adapter.rawQuery({
        sql,
        bindings: bindings as DatabaseValue[],
      })) as DatabaseRow[]
    } catch (error) {
      return void this.error(`Error: ${this.describeError(error)}`)
    }

    this.render(rows)
  }

  /**
   * Builds a readable message from an adapter error, appending the underlying
   * cause (e.g. the PostgreSQL error) so failures aren't hidden behind the
   * generic "Raw query execution failed" wrapper.
   */
  private describeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    const cause = (error as { cause?: unknown }).cause
    const causeMessage =
      cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined

    return causeMessage && !message.includes(causeMessage)
      ? `${message} (${causeMessage})`
      : message
  }

  /**
   * Resolves the SQL to run. Priority: the positional argument, then `--file`,
   * then an interactive editor prompt (so a bare `arkorm db` lets you compose a
   * statement). Returns `null` (after emitting an error) when a referenced file is
   * missing.
   */
  private async resolveSql(): Promise<string | null> {
    const argument = this.argument('sql')
    if (typeof argument === 'string' && argument.trim().length > 0) return argument

    const filePath = this.option('file') ? String(this.option('file')) : undefined
    if (filePath) {
      const resolved = resolve(filePath)
      if (!existsSync(resolved)) {
        this.error(`Error: SQL file not found: ${this.app.formatPathForLog(resolved)}`)

        return null
      }

      return readFileSync(resolved, 'utf-8')
    }

    // No SQL passed — open the user's editor to compose a statement.
    return await this.multiline('Query', 'Enter the SQL to execute')
  }

  /**
   * Parses `--bindings` as a JSON array. Returns `null` (after emitting an error)
   * when the value is present but not a valid JSON array.
   */
  private resolveBindings(): unknown[] | null {
    const raw = this.option('bindings')
    if (raw == null || raw === '') return []

    try {
      const parsed = JSON.parse(String(raw))
      if (!Array.isArray(parsed)) {
        this.error('Error: --bindings must be a JSON array, e.g. --bindings="[1, \\"active\\"]".')

        return null
      }

      return parsed
    } catch {
      this.error('Error: --bindings must be valid JSON, e.g. --bindings="[1, \\"active\\"]".')

      return null
    }
  }

  private render(rows: DatabaseRow[]): void {
    if (this.option('json')) {
      this.line(JSON.stringify(rows, null, 2))

      return
    }

    if (rows.length === 0) {
      this.success('Statement executed successfully. (0 rows returned)')

      return
    }

    this.renderTable(rows)
    this.success(`(${rows.length} row${rows.length === 1 ? '' : 's'})`)
  }

  private renderTable(rows: DatabaseRow[]): void {
    const columns = rows.reduce<string[]>((accumulator, row) => {
      Object.keys(row).forEach((key) => {
        if (!accumulator.includes(key)) accumulator.push(key)
      })

      return accumulator
    }, [])

    const cell = (value: unknown): string => {
      if (value === null || value === undefined) return 'NULL'
      if (value instanceof Date) return value.toISOString()
      if (typeof value === 'object') return JSON.stringify(value)

      return String(value)
    }

    const widths = columns.map((column) =>
      rows.reduce((max, row) => Math.max(max, cell(row[column]).length), column.length),
    )

    const separator = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`
    const formatRow = (values: string[]): string =>
      `| ${values.map((value, index) => value.padEnd(widths[index])).join(' | ')} |`

    this.line(separator)
    this.line(formatRow(columns))
    this.line(separator)
    rows.forEach((row) => this.line(formatRow(columns.map((column) => cell(row[column])))))
    this.line(separator)
  }
}
