import { ArkormErrorContext, ArkormException } from './ArkormException'

export class QueryConstraintException extends ArkormException {
    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, {
            code: 'QUERY_CONSTRAINT',
            ...context,
        })
        this.name = 'QueryConstraintException'
    }
}