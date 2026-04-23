import type { DatabaseAdapter } from '../types/adapter'
import type { ModelQuerySchemaLike, RuntimeClientLike } from '../types/core'

import { createPrismaCompatibilityAdapter } from '../adapters/PrismaDatabaseAdapter'
import { MissingDelegateException } from '../Exceptions/MissingDelegateException'
import { getActiveTransactionClient, getRuntimeClient, isQuerySchemaLike } from './runtime-config'

const isObjectLike = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && typeof value === 'object'
}

const isCompatibilityClient = (value: unknown): value is RuntimeClientLike => {
    return Boolean(value) && typeof value === 'object'
}

const getCompatibilitySources = (preferredClient?: RuntimeClientLike): Array<RuntimeClientLike | undefined> => {
    const activeTransactionClient = getActiveTransactionClient()
    const runtimeClient = getRuntimeClient()

    return activeTransactionClient
        ? [activeTransactionClient, preferredClient, runtimeClient]
        : [preferredClient, runtimeClient]
}

export const getRuntimeCompatibilityAdapter = (preferredClient?: RuntimeClientLike): DatabaseAdapter | undefined => {
    const client = getCompatibilitySources(preferredClient)
        .find(source => isCompatibilityClient(source))

    if (!client)
        return undefined

    return createPrismaCompatibilityAdapter(client)
}

export const resolveRuntimeCompatibilityQuerySchema = (
    candidates: string[],
    preferredClient?: RuntimeClientLike,
): ModelQuerySchemaLike | undefined => {
    return getCompatibilitySources(preferredClient)
        .flatMap((source) => {
            if (!isObjectLike(source))
                return []

            return candidates.map(candidate => source[candidate])
        })
        .find(candidate => isQuerySchemaLike(candidate)) as ModelQuerySchemaLike | undefined
}

export const resolveRuntimeCompatibilityQuerySchemaOrThrow = <TSchema extends ModelQuerySchemaLike = ModelQuerySchemaLike> (
    key: string,
    candidates: string[],
    modelName: string,
    preferredClient?: RuntimeClientLike,
): TSchema => {
    const resolved = resolveRuntimeCompatibilityQuerySchema(candidates, preferredClient)

    if (!resolved) {
        throw new MissingDelegateException(`Database delegate [${key}] is not configured.`, {
            operation: 'getDelegate',
            model: modelName,
            delegate: key,
            meta: {
                candidates,
            },
        })
    }

    return resolved as TSchema
}