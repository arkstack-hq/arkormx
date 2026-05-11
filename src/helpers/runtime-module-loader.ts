import { createJiti } from 'jiti'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export class RuntimeModuleLoader {
    static async load<T = unknown> (filePath: string, useDefault = false): Promise<T> {
        const resolvedPath = resolve(filePath)
        const jiti = createJiti(pathToFileURL(resolvedPath).href, {
            interopDefault: false,
            tsconfigPaths: true,
            sourceMaps: true,
        })

        return await jiti.import<T>(
            resolvedPath,
            useDefault ? { default: true } : {}
        )
    }
}           