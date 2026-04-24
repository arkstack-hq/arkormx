import type {
    AdapterBindableModel,
    ArkormConfig,
    ArkormDebugEvent,
    ArkormDebugHandler,
    ClientResolver,
    GetUserConfig,
    ModelQuerySchemaLike,
    PaginationCurrentPageResolver,
    PaginationURLDriverFactory,
    RuntimeClientLike,
    TransactionCallback,
    TransactionCapableClient,
    TransactionOptions
} from '../types/core'

import { ArkormException } from '../Exceptions/ArkormException'
import { AsyncLocalStorage } from 'async_hooks'
import type { DatabaseAdapter } from '../types/adapter'
import { RuntimeModuleLoader } from './runtime-module-loader'
import { UnsupportedAdapterFeatureException } from '../Exceptions/UnsupportedAdapterFeatureException'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { resetPersistedColumnMappingsCache } from './column-mappings'

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
    naming: {
        modelTableCase: 'snake',
    },
    features: {
        persistedColumnMappings: true,
        persistedEnums: true,
    },
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
    naming: {
        ...(baseConfig.naming ?? {}),
    },
    features: {
        ...(baseConfig.features ?? {}),
    },
    paths: {
        ...(baseConfig.paths ?? {}),
    },
}
let runtimeConfigLoaded = false
let runtimeConfigLoadingPromise: Promise<void> | undefined
let runtimeClientResolver: ClientResolver | undefined
let runtimeAdapter: DatabaseAdapter | undefined
let runtimePaginationURLDriverFactory: PaginationURLDriverFactory | undefined
let runtimePaginationCurrentPageResolver: PaginationCurrentPageResolver | undefined
let runtimeDebugHandler: ArkormDebugHandler | undefined
const transactionClientStorage = new AsyncLocalStorage<RuntimeClientLike>()
const transactionAdapterStorage = new AsyncLocalStorage<DatabaseAdapter>()

const defaultDebugHandler: ArkormDebugHandler = (event) => {
    const prefix = `[arkorm:${event.adapter}] ${event.operation}${event.target ? ` [${event.target}]` : ''}`
    const payload = {
        phase: event.phase,
        durationMs: event.durationMs,
        inspection: event.inspection ?? undefined,
        meta: event.meta,
        error: event.error,
    }

    if (event.phase === 'error') {
        console.error(prefix, payload)

        return
    }

    console.debug(prefix, payload)
}

const resolveDebugHandler = (debug: ArkormConfig['debug']): ArkormDebugHandler | undefined => {
    if (debug === true)
        return defaultDebugHandler

    return typeof debug === 'function' ? debug : undefined
}

const mergeNamingConfig = (
    naming?: ArkormConfig['naming']
): NonNullable<ArkormConfig['naming']> => {
    const defaults = baseConfig.naming ?? {}
    const current = userConfig.naming ?? {}

    return {
        ...defaults,
        ...current,
        ...(naming ?? {}),
    }
}

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
 * Merge the feature configuration from the base defaults, user configuration, and provided options.
 * 
 * @param features 
 * @returns 
 */
const mergeFeatureConfig = (
    features?: ArkormConfig['features']
): NonNullable<ArkormConfig['features']> => {
    const defaults = baseConfig.features ?? {}
    const current = userConfig.features ?? {}

    return {
        ...defaults,
        ...current,
        ...(features ?? {}),
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
 * Bind a database adapter instance to an array of models that support adapter binding.
 * 
 * @param adapter 
 * @param models 
 * @returns 
 */
export const bindAdapterToModels = (
    adapter: DatabaseAdapter,
    models: AdapterBindableModel[]
): DatabaseAdapter => {
    models.forEach((model) => {
        model.setAdapter(adapter)
    })

    return adapter
}

/**
 * Get the user-provided ArkORM configuration. 
 * 
 * @param key Optional specific configuration key to retrieve. If omitted, the entire configuration object is returned.
 * @returns The user-provided ArkORM configuration object.  
 */
export const getUserConfig: GetUserConfig = <K extends keyof ArkormConfig> (key?: K) => {
    if (key) {
        return userConfig[key]
    }

    return userConfig
}

/**
 * Configure the ArkORM runtime with the provided runtime client resolver and
 * adapter-first options.
 * 
 * @param client 
 * @param options
 */
export const configureArkormRuntime = (
    client?: ClientResolver,
    options: Omit<ArkormConfig, 'prisma'> = {}
): void => {
    const resolvedClient = client ?? options.client
    const nextConfig: Partial<ArkormConfig> = {
        ...userConfig,
        naming: mergeNamingConfig(options.naming),
        features: mergeFeatureConfig(options.features),
        paths: mergePathConfig(options.paths),
    }

    nextConfig.client = resolvedClient
    nextConfig.prisma = resolvedClient

    if (options.pagination !== undefined)
        nextConfig.pagination = options.pagination

    if (options.adapter !== undefined)
        nextConfig.adapter = options.adapter

    if (options.boot !== undefined)
        nextConfig.boot = options.boot

    if (options.debug !== undefined)
        nextConfig.debug = options.debug

    if (options.outputExt !== undefined)
        nextConfig.outputExt = options.outputExt

    Object.assign(userConfig, {
        ...nextConfig,
    })

    runtimeClientResolver = resolvedClient
    runtimeAdapter = options.adapter
    runtimePaginationURLDriverFactory = nextConfig.pagination?.urlDriver
    runtimePaginationCurrentPageResolver = nextConfig.pagination?.resolveCurrentPage
    runtimeDebugHandler = resolveDebugHandler(nextConfig.debug)

    const bootClient = resolveClient(resolvedClient)

    options.boot?.({
        client: bootClient,
        prisma: bootClient,
        bindAdapter: bindAdapterToModels,
    })
}

/**
 * Reset the ArkORM runtime configuration. 
 * This is primarily intended for testing purposes.
 */
export const resetArkormRuntimeForTests = (): void => {
    Object.assign(userConfig, {
        ...baseConfig,
        naming: {
            ...(baseConfig.naming ?? {}),
        },
        features: {
            ...(baseConfig.features ?? {}),
        },
        paths: {
            ...(baseConfig.paths ?? {}),
        },
    })
    runtimeConfigLoaded = false
    runtimeConfigLoadingPromise = undefined
    runtimeClientResolver = undefined
    runtimeAdapter = undefined
    runtimePaginationURLDriverFactory = undefined
    runtimePaginationCurrentPageResolver = undefined
    runtimeDebugHandler = undefined
    resetPersistedColumnMappingsCache()
}

/**
 * Resolve a runtime client instance from the provided resolver, which can be either
 * a direct client instance or a function that returns a client instance.
 * 
 * @param resolver 
 * @returns 
 */
const resolveClient = (resolver: ClientResolver | undefined): RuntimeClientLike | undefined => {
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
    if (!config || typeof config !== 'object')
        return

    const runtimeClient = config.client ?? config.prisma

    configureArkormRuntime(runtimeClient, {
        client: runtimeClient,
        adapter: config.adapter,
        boot: config.boot,
        debug: config.debug,
        naming: config.naming,
        features: config.features,
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
    return RuntimeModuleLoader.load(configPath)
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
 * Get the runtime compatibility client.
 * This function will trigger the loading of the ArkORM configuration if 
 * it hasn't already been loaded.
 * 
 * @returns 
 */
export const getRuntimeClient = (): RuntimeClientLike | undefined => {
    const activeTransactionClient = transactionClientStorage.getStore()
    if (activeTransactionClient)
        return activeTransactionClient

    if (!runtimeConfigLoaded)
        loadRuntimeConfigSync()

    return resolveClient(runtimeClientResolver)
}

/**
 * @deprecated Use getRuntimeClient instead.
 */
export const getRuntimePrismaClient = getRuntimeClient

export const getRuntimeAdapter = (): DatabaseAdapter | undefined => {
    const activeTransactionAdapter = transactionAdapterStorage.getStore()
    if (activeTransactionAdapter)
        return activeTransactionAdapter

    if (!runtimeConfigLoaded)
        loadRuntimeConfigSync()

    return runtimeAdapter
}

export const getActiveTransactionClient = (): RuntimeClientLike | undefined => {
    return transactionClientStorage.getStore()
}

export const getActiveTransactionAdapter = (): DatabaseAdapter | undefined => {
    return transactionAdapterStorage.getStore()
}

export const isTransactionCapableClient = (value: unknown): value is TransactionCapableClient => {
    if (!value || typeof value !== 'object')
        return false

    return typeof (value as Record<string, unknown>).$transaction === 'function'
}

export const runArkormTransaction = async <TResult> (
    callback: TransactionCallback<TResult>,
    options: TransactionOptions = {},
    preferredAdapter?: DatabaseAdapter,
): Promise<TResult> => {
    const activeTransactionAdapter = transactionAdapterStorage.getStore()
    const activeTransactionClient = transactionClientStorage.getStore()
    if (activeTransactionAdapter || activeTransactionClient) {
        return await callback({
            adapter: activeTransactionAdapter,
            client: activeTransactionClient,
        })
    }

    const adapter = preferredAdapter ?? getRuntimeAdapter()
    if (adapter) {
        return await adapter.transaction(async (transactionAdapter) => {
            return await transactionAdapterStorage.run(transactionAdapter, async () => {
                return await callback({
                    adapter: transactionAdapter,
                    client: transactionClientStorage.getStore(),
                })
            })
        }, options)
    }

    const client = getRuntimeClient()
    if (!client)
        throw new ArkormException('Cannot start a transaction without a configured runtime client or adapter.', {
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
            return await callback({ client: transactionClient })
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

export const getRuntimeDebugHandler = (): ArkormDebugHandler | undefined => {
    if (!runtimeConfigLoaded)
        loadRuntimeConfigSync()

    return runtimeDebugHandler
}

export const emitRuntimeDebugEvent = (event: ArkormDebugEvent): void => {
    getRuntimeDebugHandler()?.(event)
}

/**
 * Check if a given value matches Arkorm's query-schema contract
 * by verifying the presence of common delegate methods.
 * 
 * @param value The value to check.
 * @returns True if the value matches the query-schema contract, false otherwise.
 */
export const isQuerySchemaLike = (value: unknown): value is ModelQuerySchemaLike => {
    if (!value || typeof value !== 'object')
        return false

    const candidate = value as Record<string, unknown>

    return ['findMany', 'findFirst', 'create', 'update', 'delete', 'count']
        .every(method => typeof candidate[method] === 'function')
}

/**
 * @deprecated Use isQuerySchemaLike instead.
 */
export const isDelegateLike = isQuerySchemaLike

void loadArkormConfig()