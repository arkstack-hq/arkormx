import type { CastDefinition, CastHandler, CastType } from './types/core'

const builtinCasts: Record<CastType, CastHandler> = {
    string: {
        get: (value) => value == null ? value : String(value),
        set: (value) => value == null ? value : String(value),
    },
    number: {
        get: (value) => value == null ? value : Number(value),
        set: (value) => value == null ? value : Number(value),
    },
    boolean: {
        get: (value) => value == null ? value : Boolean(value),
        set: (value) => value == null ? value : Boolean(value),
    },
    date: {
        get: (value) => {
            if (value == null || value instanceof Date)
                return value

            return new Date(String(value))
        },
        set: (value) => {
            if (value == null || value instanceof Date)
                return value

            return new Date(String(value))
        },
    },
    json: {
        get: (value) => {
            if (value == null || typeof value !== 'string')
                return value

            try {
                return JSON.parse(value)
            } catch {
                return value
            }
        },
        set: (value) => {
            if (value == null || typeof value === 'string')
                return value

            return JSON.stringify(value)
        },
    },
    array: {
        get: (value) => {
            if (Array.isArray(value))
                return value

            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value)

                    return Array.isArray(parsed) ? parsed : [parsed]
                } catch {
                    return [value]
                }
            }

            if (value == null)
                return value

            return [value]
        },
        set: (value) => {
            if (value == null)
                return value

            return Array.isArray(value) ? value : [value]
        },
    },
}

export function resolveCast (definition: CastDefinition): CastHandler {
    if (typeof definition === 'string')
        return builtinCasts[definition]

    return definition
}