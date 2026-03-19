/**
 * The ArkormException class is a custom error type for handling 
 * exceptions specific to the Arkormˣ.    
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export interface ArkormErrorContext {
    code?: string
    operation?: string
    model?: string
    delegate?: string
    relation?: string
    scope?: string
    meta?: Record<string, unknown>
    cause?: unknown
}

export class ArkormException extends Error {
    public readonly code?: string
    public readonly operation?: string
    public readonly model?: string
    public readonly delegate?: string
    public readonly relation?: string
    public readonly scope?: string
    public readonly meta?: Record<string, unknown>

    constructor(message: string, context: ArkormErrorContext = {}) {
        super(message, context.cause === undefined ? undefined : { cause: context.cause })
        this.name = 'ArkormException'
        this.code = context.code
        this.operation = context.operation
        this.model = context.model
        this.delegate = context.delegate
        this.relation = context.relation
        this.scope = context.scope
        this.meta = context.meta
    }

    public getContext (): Omit<ArkormErrorContext, 'cause'> & { cause?: unknown } {
        return {
            code: this.code,
            operation: this.operation,
            model: this.model,
            delegate: this.delegate,
            relation: this.relation,
            scope: this.scope,
            meta: this.meta,
            cause: this.cause,
        }
    }

    public toJSON (): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            ...this.getContext(),
        }
    }
}