import { ArkormErrorContext, ArkormException } from './ArkormException'

/**
 * The ModelNotFoundException class is a custom error type for handling 
 * cases where a requested model instance cannot be found in the database. 
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class ModelNotFoundException extends ArkormException {
    private modelName: string

    constructor(
        modelName: string,
        message: string = 'No query results for the given model.',
        context: ArkormErrorContext = {}
    ) {
        super(message, {
            code: 'MODEL_NOT_FOUND',
            model: modelName,
            ...context,
        })
        this.name = 'ModelNotFoundException'
        this.modelName = modelName
    }

    public getModelName (): string {
        return this.modelName
    }
}