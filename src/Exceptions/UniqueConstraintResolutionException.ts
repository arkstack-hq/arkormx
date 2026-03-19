import { ArkormErrorContext, ArkormException } from './ArkormException'

export class UniqueConstraintResolutionException extends ArkormException {
    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, {
            code: 'UNIQUE_CONSTRAINT_RESOLUTION_FAILED',
            ...context,
        })
        this.name = 'UniqueConstraintResolutionException'
    }
}