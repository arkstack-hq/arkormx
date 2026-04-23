import type { DatabaseAdapter } from '../types/adapter'
import type { ModelQuerySchemaLike } from '../types/core'

import { createPrismaCompatibilityAdapter } from '../adapters/PrismaDatabaseAdapter'
import { MissingDelegateException } from '../Exceptions/MissingDelegateException'
import { getActiveTransactionClient, getRuntimeClient, isQuerySchemaLike } from './runtime-config'

const isObjectLike = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && typeof value === 'object'
}

const getCompatibilitySources = (preferredClient?: Record<string, unknown>): Array<Record<string, unknown> | undefined> => {
    const activeTransactionClient = getActiveTransactionClient()
    const runtimeClient = getRuntimeClient()

    return activeTransactionClient
        ? [activeTransactionClient, preferredClient, runtimeClient]
        : [preferredClient, runtimeClient]
}

export const getRuntimeCompatibilityAdapter = (preferredClient?: Record<string, unknown>): DatabaseAdapter | undefined => {
    const client = getCompatibilitySources(preferredClient)
        .find(source => isObjectLike(source))

    if (!client)
        return undefined

    return createPrismaCompatibilityAdapter(client)
}

export const resolveRuntimeCompatibilityQuerySchema = (
    candidates: string[],
    preferredClient?: Record<string, unknown>,
): ModelQuerySchemaLike | undefined => {
    return getCompatibilitySources(preferredClient)
        .flatMap(source => candidates.map(candidate => source?.[candidate]))
        .find(candidate => isQuerySchemaLike(candidate)) as ModelQuerySchemaLike | undefined
}

export const resolveRuntimeCompatibilityQuerySchemaOrThrow = <TSchema extends ModelQuerySchemaLike = ModelQuerySchemaLike> (
    key: string,
    candidates: string[],
    modelName: string,
    preferredClient?: Record<string, unknown>,
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