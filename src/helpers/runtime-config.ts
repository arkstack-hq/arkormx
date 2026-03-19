import type {
    ArkormConfig,
    ClientResolver,
    GetUserConfig,
    PaginationCurrentPageResolver,
    PaginationURLDriverFactory,
    PrismaClientLike,
    PrismaDelegateLike,
    PrismaTransactionCallback,
    PrismaTransactionCapableClient,
    PrismaTransactionOptions
} from '../types/core'
import { fileURLToPath, pathToFileURL } from 'url'

import { ArkormException } from '../Exceptions/ArkormException'
import { AsyncLocalStorage } from 'async_hooks'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import path from 'path'

const resolveDefaultStubsPath = (): string => {
    let current = path.dirname(fileURLToPath(import.meta.url))

    while (true) {
        const packageJsonPath = path.join(current, 'package.json')
        const stubsPath = path.join(current, 'stubs')

        if (existsSync(packageJsonPath) && existsSync(stubsPath))
            return stubsPath

        const parent = path.dirname(current)
        if (parent === current)
            break

        current = parent
    }

    return path.join(process.cwd(), 'stubs')
}

const baseConfig: Partial<ArkormConfig> = {
    paths: {
        stubs: resolveDefaultStubsPath(),
        seeders: path.join(process.cwd(), 'database', 'seeders'),
        models: path.join(process.cwd(), 'src', 'models'),
        migrations: path.join(process.cwd(), 'database', 'migrations'),
        factories: path.join(process.cwd(), 'database', 'factories'),
        buildOutput: path.join(process.cwd(), 'dist'),
    },
    outputExt: 'ts',
}
const userConfig: Partial<ArkormConfig> = {
    ...baseConfig,
    paths: {
        ...(baseConfig.paths ?? {}),
    },
}
let runtimeConfigLoaded = false
let runtimeConfigLoadingPromise: Promise<void> | undefined
let runtimeClientResolver: ClientResolver | undefined
let runtimePaginationURLDriverFactory: PaginationURLDriverFactory | undefined
let runtimePaginationCurrentPageResolver: PaginationCurrentPageResolver | undefined
const transactionClientStorage = new AsyncLocalStorage<PrismaClientLike>()

const mergePathConfig = (paths?: ArkormConfig['paths']): NonNullable<ArkormConfig['paths']> => {
    const defaults = baseConfig.paths ?? {}
    const current = userConfig.paths ?? {}
    const incoming = Object.entries(paths ?? {}).reduce<NonNullable<ArkormConfig['paths']>>((all, [key, value]) => {
        if (typeof value === 'string' && value.trim().length > 0) {
            const normalized = path.isAbsolute(value)
                ? value
                : path.resolve(process.cwd(), value)

            all[key as keyof NonNullable<ArkormConfig['paths']>] = normalized
        }

        return all
    }, {})

    return {
        ...defaults,
        ...current,
        ...incoming,
    }
}

/**
 * Define the ArkORM runtime configuration. This function can be used to provide.
 * 
 * @param config The ArkORM configuration object.
 * @returns The same configuration object.
 */
export const defineConfig = (config: ArkormConfig): ArkormConfig => {
    return config
}

/**
 * Get the user-provided ArkORM configuration. 
 * 
 * @returns The user-provided ArkORM configuration object.  
 */
export const getUserConfig: GetUserConfig = <K extends keyof ArkormConfig> (key?: K) => {
    if (key) {
        return userConfig[key]
    }

    return userConfig
}

/**
 * Configure the ArkORM runtime with the provided Prisma client resolver and 
 * delegate mapping resolver.
 * 
 * @param prisma 
 * @param mapping 
 */
export const configureArkormRuntime = (
    prisma: ClientResolver,
    options: Omit<ArkormConfig, 'prisma'> = {}
): void => {
    const nextConfig: Partial<ArkormConfig> = {
        ...userConfig,
        prisma,
        paths: mergePathConfig(options.paths),
    }

    if (options.pagination !== undefined)
        nextConfig.pagination = options.pagination

    if (options.outputExt !== undefined)
        nextConfig.outputExt = options.outputExt

    Object.assign(userConfig, {
        ...nextConfig,
    })

    runtimeClientResolver = prisma
    runtimePaginationURLDriverFactory = nextConfig.pagination?.urlDriver
    runtimePaginationCurrentPageResolver = nextConfig.pagination?.resolveCurrentPage
}

/**
 * Reset the ArkORM runtime configuration. 
 * This is primarily intended for testing purposes.
 */
export const resetArkormRuntimeForTests = (): void => {
    Object.assign(userConfig, {
        ...baseConfig,
        paths: {
            ...(baseConfig.paths ?? {}),
        },
    })
    runtimeConfigLoaded = false
    runtimeConfigLoadingPromise = undefined
    runtimeClientResolver = undefined
    runtimePaginationURLDriverFactory = undefined
    runtimePaginationCurrentPageResolver = undefined
}

/**
 * Resolve a Prisma client instance from the provided resolver, which can be either
 * a direct client instance or a function that returns a client instance.
 * 
 * @param resolver 
 * @returns 
 */
const resolveClient = (resolver: ClientResolver | undefined): PrismaClientLike | undefined => {
    if (!resolver)
        return undefined

    const client = typeof resolver === 'function'
        ? resolver()
        : resolver

    if (!client || typeof client !== 'object')
        return undefined

    return client
}

/**
 * Resolve and apply the ArkORM configuration from an imported module. 
 * This function checks for a default export and falls back to the module itself, then validates
 * the configuration object and applies it to the runtime if valid.
 * 
 * @param imported 
 * @returns 
 */
const resolveAndApplyConfig = (imported: unknown): void => {
    const candidate = imported as { default?: unknown }
    const config = (candidate?.default ?? imported) as Partial<ArkormConfig>
    if (!config || typeof config !== 'object' || !config.prisma)
        return

    configureArkormRuntime(config.prisma, {
        pagination: config.pagination,
        paths: config.paths,
        outputExt: config.outputExt,
    })
    runtimeConfigLoaded = true
}

/**
 * Dynamically import a configuration file. 
 * A cache-busting query parameter is appended to ensure the latest version is loaded.
 * 
 * @param configPath 
 * @returns A promise that resolves to the imported configuration module.   
 */
const importConfigFile = (configPath: string): Promise<unknown> => {
    const configUrl = `${pathToFileURL(configPath).href}?arkorm_runtime=${Date.now()}`

    return import(configUrl)
}

const loadRuntimeConfigSync = (): boolean => {
    const require = createRequire(import.meta.url)
    const syncConfigPaths = [
        path.join(process.cwd(), 'arkormx.config.cjs'),
    ]

    for (const configPath of syncConfigPaths) {
        if (!existsSync(configPath))
            continue

        try {
            const imported = require(configPath)
            resolveAndApplyConfig(imported)

            return true
        } catch {
            continue
        }
    }

    return false
}

/**
 * Load the ArkORM configuration by searching for configuration files in the 
 * current working directory.
 * @returns 
 */
export const loadArkormConfig = async (): Promise<void> => {
    if (runtimeConfigLoaded)
        return

    if (runtimeConfigLoadingPromise)
        return await runtimeConfigLoadingPromise

    if (loadRuntimeConfigSync())
        return

    runtimeConfigLoadingPromise = (async () => {
        const configPaths = [
            path.join(process.cwd(), 'arkormx.config.js'),
            path.join(process.cwd(), 'arkormx.config.ts'),
        ]

        for (const configPath of configPaths) {
            if (!existsSync(configPath))
                continue

            try {
                const imported = await importConfigFile(configPath)
                resolveAndApplyConfig(imported)

                return
            } catch {
                continue
            }
        }

        runtimeConfigLoaded = true
    })()

    await runtimeConfigLoadingPromise
}

/**
 * Ensure that the ArkORM configuration is loaded. 
 * This function can be called to trigger the loading process if it hasn't already been initiated.
 * If the configuration is already loaded, it will return immediately.
 * 
 * @returns 
 */
export const ensureArkormConfigLoading = (): void => {
    if (runtimeConfigLoaded)
        return

    if (!runtimeConfigLoadingPromise)
        void loadArkormConfig()
}

export const getDefaultStubsPath = (): string => {
    return resolveDefaultStubsPath()
}

/**
 * Get the runtime Prisma client. 
 * This function will trigger the loading of the ArkORM configuration if 
 * it hasn't already been loaded.
 * 
 * @returns 
 */
export const getRuntimePrismaClient = (): PrismaClientLike | undefined => {
    const activeTransactionClient = transactionClientStorage.getStore()
    if (activeTransactionClient)
        return activeTransactionClient

    if (!runtimeConfigLoaded)
        loadRuntimeConfigSync()

    return resolveClient(runtimeClientResolver)
}

export const getActiveTransactionClient = (): PrismaClientLike | undefined => {
    return transactionClientStorage.getStore()
}

export const isTransactionCapableClient = (value: unknown): value is PrismaTransactionCapableClient => {
    if (!value || typeof value !== 'object')
        return false

    return typeof (value as Record<string, unknown>).$transaction === 'function'
}

export const runArkormTransaction = async <TResult> (
    callback: PrismaTransactionCallback<TResult>,
    options: PrismaTransactionOptions = {},
): Promise<TResult> => {
    const activeTransactionClient = transactionClientStorage.getStore()
    if (activeTransactionClient)
        return await callback(activeTransactionClient)

    const client = getRuntimePrismaClient()
    if (!client)
        throw new ArkormException('Cannot start a transaction without a configured Prisma client.', {
            code: 'CLIENT_NOT_CONFIGURED',
            operation: 'transaction',
        })

    if (!isTransactionCapableClient(client)) {
        throw new UnsupportedAdapterFeatureException('Transactions are not supported by the current adapter.', {
            code: 'TRANSACTION_NOT_SUPPORTED',
            operation: 'transaction',
        })
    }

    return await client.$transaction(async (transactionClient) => {
        return await transactionClientStorage.run(transactionClient, async () => {
            return await callback(transactionClient)
        })
    }, options)
}

/**
 * Get the configured pagination URL driver factory from runtime config.
 *
 * @returns
 */
export const getRuntimePaginationURLDriverFactory = (): PaginationURLDriverFactory | undefined => {
    if (!runtimeConfigLoaded)
        loadRuntimeConfigSync()

    return runtimePaginationURLDriverFactory
}

/**
 * Get the configured current-page resolver from runtime config.
 *
 * @returns
 */
export const getRuntimePaginationCurrentPageResolver = (): PaginationCurrentPageResolver | undefined => {
    if (!runtimeConfigLoaded)
        loadRuntimeConfigSync()

    return runtimePaginationCurrentPageResolver
}

/**
 * Check if a given value is a Prisma delegate-like object 
 * by verifying the presence of common delegate methods.
 * 
 * @param value The value to check.
 * @returns True if the value is a Prisma delegate-like object, false otherwise.    
 */
export const isDelegateLike = (value: unknown): value is PrismaDelegateLike => {
    if (!value || typeof value !== 'object')
        return false

    const candidate = value as Record<string, unknown>

    return ['findMany', 'findFirst', 'create', 'update', 'delete', 'count']
        .every(method => typeof candidate[method] === 'function')
}

void loadArkormConfig()