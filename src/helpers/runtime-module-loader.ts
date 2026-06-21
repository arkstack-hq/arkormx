import { createJiti } from 'jiti'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export interface LoadedRuntimeModule<T = unknown> {
  file: string
  module: T | null
  error?: unknown
}

export class RuntimeModuleLoader {
  static async load<T = unknown>(filePath: string, useDefault = false): Promise<T> {
    const resolvedPath = resolve(filePath)
    const jiti = createJiti(pathToFileURL(resolvedPath).href, {
      interopDefault: false,
      tsconfigPaths: true,
      sourceMaps: true,
    })

    return await jiti.import<T>(resolvedPath, useDefault ? { default: true } : {})
  }

  /**
   * Load many modules through a single shared jiti context, retrying files
   * that fail until no further progress is made.
   *
   * A shared module cache resolves circular imports consistently: a file that
   * fails because one of its dependencies was not yet cached (for example a
   * trait whose module imports a model which imports the class that uses the
   * trait) succeeds on a later pass, once a sibling load has populated that
   * dependency. A fresh per-file context cannot do this, so the same set of
   * files can load or fail depending purely on which file is the entry point.
   *
   * Each returned entry carries either the loaded module or the last error,
   * so callers can surface genuine failures instead of silently dropping them.
   *
   * @param filePaths
   * @param useDefault
   * @returns
   */
  static async loadAll<T = unknown>(
    filePaths: string[],
    useDefault = false,
  ): Promise<Array<LoadedRuntimeModule<T>>> {
    const jiti = createJiti(`${pathToFileURL(resolve('.')).href}/`, {
      interopDefault: false,
      tsconfigPaths: true,
      sourceMaps: true,
    })

    const results = new Map<string, LoadedRuntimeModule<T>>()
    let pending = filePaths.map((file) => resolve(file))

    while (pending.length > 0) {
      const failed: string[] = []

      for (const file of pending) {
        try {
          const module = await jiti.import<T>(file, useDefault ? { default: true } : {})
          results.set(file, { file, module })
        } catch (error) {
          failed.push(file)
          results.set(file, { file, module: null, error })
        }
      }

      /*  stop once a full pass makes no progress  */
      if (failed.length === pending.length) break

      pending = failed
    }

    return filePaths.map((file) => results.get(resolve(file)) as LoadedRuntimeModule<T>)
  }
}
