import type { PrimaryKeyGeneration, SchemaColumn } from '../types/migrations'

import { randomUUID } from 'node:crypto'

export class PrimaryKeyGenerationPlanner {
    public static plan (column: Pick<SchemaColumn, 'type' | 'primary' | 'default'>): PrimaryKeyGeneration | undefined {
        if (!column.primary || column.default !== undefined)
            return undefined

        if (column.type === 'uuid' || column.type === 'string') {
            return {
                strategy: 'uuid',
                prismaDefault: '@default(uuid())',
                databaseDefault: column.type === 'uuid'
                    ? 'gen_random_uuid()'
                    : 'gen_random_uuid()::text',
                runtimeFactory: 'uuid',
            }
        }

        return undefined
    }

    public static generate (generation: PrimaryKeyGeneration | undefined): unknown {
        if (generation?.runtimeFactory === 'uuid')
            return randomUUID()

        return undefined
    }
}