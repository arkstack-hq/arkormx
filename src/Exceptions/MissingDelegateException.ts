import { ArkormErrorContext, ArkormException } from './ArkormException'

export class MissingDelegateException extends ArkormException {
    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, {
            code: 'MISSING_DELEGATE',
            ...context,
        })
        this.name = 'MissingDelegateException'
    }
}