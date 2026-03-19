import { ArkormErrorContext, ArkormException } from './ArkormException'

export class UnsupportedAdapterFeatureException extends ArkormException {
    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, {
            code: 'UNSUPPORTED_ADAPTER_FEATURE',
            ...context,
        })
        this.name = 'UnsupportedAdapterFeatureException'
    }
}