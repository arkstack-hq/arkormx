// TODO: @rexxars/jiti has to be replaced with jiti once a new release is available. See https://github.com/unjs/jiti/pull/427
import { createJiti } from '@rexxars/jiti'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export class RuntimeModuleLoader {
    static async load<T = unknown> (filePath: string): Promise<T> {
        const resolvedPath = resolve(filePath)
        const jiti = createJiti(pathToFileURL(resolvedPath).href, {
            fsCache: false,
            interopDefault: false,
            moduleCache: false,
            tsconfigPaths: true,
        })

        return await jiti.import<T>(resolvedPath)
    }

    static loadSync<T = unknown> (filePath: string): T {
        const resolvedPath = resolve(filePath)
        const jiti = createJiti(pathToFileURL(resolvedPath).href, {
            fsCache: false,
            interopDefault: false,
            moduleCache: false,
            tsconfigPaths: true,
        })

        return jiti(resolvedPath) as T
    }
}           