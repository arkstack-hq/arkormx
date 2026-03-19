import { ArkormErrorContext, ArkormException } from './ArkormException'

export class RelationResolutionException extends ArkormException {
    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, {
            code: 'RELATION_RESOLUTION_FAILED',
            ...context,
        })
        this.name = 'RelationResolutionException'
    }
}