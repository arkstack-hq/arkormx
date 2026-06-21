import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'

import { RuntimeModuleLoader } from '../../src/helpers/runtime-module-loader'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directories: string[] = []

const makeWorkspace = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'arkormx-loader-'))
  directories.push(directory)

  return directory
}

const write = (directory: string, name: string, lines: string[]): string => {
  const file = join(directory, name)
  writeFileSync(file, `${lines.join('\n')}\n`)

  return file
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__arkormLoaderFlag
  while (directories.length) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe('RuntimeModuleLoader.loadAll', () => {
  it('retries entry-order failures once a sibling populates the shared context', async () => {
    const workspace = makeWorkspace()

    // `gated` throws unless a global flag is set, and does NOT import `flag`,
    // so loading it first fails. Loading `flag` sets the flag; a retry pass
    // then loads `gated`. This mirrors a trait that is undefined until a
    // sibling module finishes initializing under a circular import.
    const gated = write(workspace, 'gated.ts', [
      'if (!(globalThis as any).__arkormLoaderFlag) throw new Error("flag not set yet")',
      'export class Gated {}',
    ])
    const flag = write(workspace, 'flag.ts', [
      '(globalThis as any).__arkormLoaderFlag = true',
      'export const FLAG = true',
    ])

    const results = await RuntimeModuleLoader.loadAll<Record<string, unknown>>([gated, flag])

    expect(results.every((result) => result.module !== null)).toBe(true)
    expect(results.every((result) => result.error === undefined)).toBe(true)
    expect(
      (results.find((result) => result.file === gated)?.module as { Gated?: unknown })?.Gated,
    ).toBeTypeOf('function')
  })

  it('surfaces a genuinely broken module as an error without throwing or dropping siblings', async () => {
    const workspace = makeWorkspace()
    const broken = write(workspace, 'broken.ts', ['throw new Error("boom")'])
    const good = write(workspace, 'good.ts', ['export class Good {}'])

    const results = await RuntimeModuleLoader.loadAll<Record<string, unknown>>([broken, good])

    const brokenResult = results.find((result) => result.file === broken)
    const goodResult = results.find((result) => result.file === good)

    expect(brokenResult?.module).toBeNull()
    expect(brokenResult?.error).toBeInstanceOf(Error)
    expect((brokenResult?.error as Error).message).toContain('boom')
    expect((goodResult?.module as { Good?: unknown })?.Good).toBeTypeOf('function')
  })
})
