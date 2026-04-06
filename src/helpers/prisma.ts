import { configureArkormRuntime, defineConfig, isDelegateLike } from './runtime-config'
import { createPrismaCompatibilityAdapter, createPrismaDatabaseAdapter, type PrismaDelegateNameMapping } from '../adapters/PrismaDatabaseAdapter'

import type { PrismaClientLike, PrismaDelegateLike } from '../types/core'

export type PrismaDelegateMap<TClient extends PrismaClientLike> = {
    [K in keyof TClient as TClient[K] extends PrismaDelegateLike ? K : never]:
    TClient[K] extends PrismaDelegateLike ? TClient[K] : never
}

/**
 * Create an adapter to convert a Prisma client instance into a format 
 * compatible with ArkORM's expectations.
 * 
 * @param prisma The Prisma client instance to adapt.
 * @param mapping An optional mapping of Prisma delegate names to ArkORM delegate names.
 * @returns A record of adapted Prisma delegates compatible with ArkORM.
 */
export function createPrismaAdapter (
    prisma: PrismaClientLike
): Record<string, PrismaDelegateLike> {
    return Object
        .entries(prisma)
        .reduce<Record<string, PrismaDelegateLike>>((accumulator, [key, value]) => {
            if (!isDelegateLike(value))
                return accumulator

            accumulator[key] = value

            return accumulator
        }, {})
}

/**
 * Create a delegate mapping record for Model.setClient() from a Prisma client.
 *
 * @param prisma The Prisma client instance.
 * @param mapping Optional mapping of Arkormˣ delegate names to Prisma delegate names.
 * @returns A delegate map keyed by Arkormˣ delegate names.
 */
export function createPrismaDelegateMap (
    prisma: PrismaClientLike,
    mapping: PrismaDelegateNameMapping = {}
): Record<string, PrismaDelegateLike> {
    const delegates = createPrismaAdapter(prisma)

    if (Object.keys(mapping).length === 0)
        return delegates

    return Object.entries(mapping).reduce<Record<string, PrismaDelegateLike>>((accumulator, [arkormDelegate, prismaDelegate]) => {
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