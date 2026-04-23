import { configureArkormRuntime, defineConfig, isQuerySchemaLike } from './runtime-config'
import { createPrismaCompatibilityAdapter, createPrismaDatabaseAdapter, type PrismaDelegateNameMapping } from '../adapters/PrismaDatabaseAdapter'

import type { ModelQuerySchemaLike, RuntimeClientLike } from '../types/core'

export type PrismaDelegateMap<TClient extends RuntimeClientLike> = {
    [K in keyof TClient as TClient[K] extends ModelQuerySchemaLike ? K : never]:
    TClient[K] extends ModelQuerySchemaLike ? TClient[K] : never
}

/**
 * Compatibility-only helper that exposes Prisma query schemas as a plain object map.
 * It is retained for migration support and tests, not as a supported runtime bootstrap path.
 *
 * @deprecated Prefer createPrismaDatabaseAdapter(prisma) for runtime usage.
 *
 * @param prisma The Prisma client instance to adapt.
 * @param mapping An optional mapping of Prisma delegate names to ArkORM delegate names.
 * @returns A record of adapted Prisma compatibility query schemas.
 */
export function createPrismaAdapter (
    prisma: RuntimeClientLike
): Record<string, ModelQuerySchemaLike> {
    return Object
        .entries(prisma)
        .reduce<Record<string, ModelQuerySchemaLike>>((accumulator, [key, value]) => {
            if (!isQuerySchemaLike(value))
                return accumulator

            accumulator[key] = value

            return accumulator
        }, {})
}

/**
 * Compatibility-only helper for legacy delegate-map bootstrapping during migration.
 *
 * @deprecated Prefer createPrismaDatabaseAdapter(prisma, mapping). Direct delegate-map
 * bootstrapping is no longer part of the supported runtime path.
 *
 * @param prisma The Prisma client instance.
 * @param mapping Optional mapping of Arkormˣ delegate names to Prisma delegate names.
 * @returns A compatibility map keyed by Arkormˣ query-schema names.
 */
export function createPrismaDelegateMap (
    prisma: RuntimeClientLike,
    mapping: PrismaDelegateNameMapping = {}
): Record<string, ModelQuerySchemaLike> {
    const delegates = createPrismaAdapter(prisma)

    if (Object.keys(mapping).length === 0)
        return delegates

    return Object.entries(mapping).reduce<Record<string, ModelQuerySchemaLike>>((accumulator, [arkormDelegate, prismaDelegate]) => {
        const resolved = delegates[prismaDelegate]
        if (!resolved)
            return accumulator

        accumulator[arkormDelegate] = resolved

        return accumulator
    }, {})
}

/**
 * Infer the Prisma delegate name for a given model name using a simple convention.
 * 
 * @param modelName The name of the model to infer the delegate name for.
 * @returns The inferred Prisma delegate name.
 */
export function inferDelegateName (modelName: string): string {
    return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}s`
}

export {
    configureArkormRuntime,
    createPrismaCompatibilityAdapter,
    createPrismaDatabaseAdapter,
    defineConfig,
}