import { ArkormErrorContext, ArkormException } from './ArkormException'

export class ScopeNotDefinedException extends ArkormException {
    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, {
            code: 'SCOPE_NOT_DEFINED',
            ...context,
        })
        this.name = 'ScopeNotDefinedException'
    }
}