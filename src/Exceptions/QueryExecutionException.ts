import type { AdapterQueryInspection } from '../types/core'

import { ArkormErrorContext, ArkormException } from './ArkormException'

export interface QueryExecutionExceptionContext extends ArkormErrorContext {
    inspection?: AdapterQueryInspection | null
}

export class QueryExecutionException extends ArkormException {
    public readonly inspection?: AdapterQueryInspection | null

    public constructor(
        message = 'Database query execution failed.',
        context: QueryExecutionExceptionContext = {}
    ) {
        super(message, {
            code: 'QUERY_EXECUTION_FAILED',
            ...context,
            meta: {
                ...(context.meta ?? {}),
                ...(context.inspection ? { inspection: context.inspection } : {}),
            },
        })

        this.name = 'QueryExecutionException'
        this.inspection = context.inspection
    }

    public getInspection (): AdapterQueryInspection | null | undefined {
        return this.inspection
    }
}