import { ArkormException } from './ArkormException'

/**
 * The ModelNotFoundException class is a custom error type for handling 
 * cases where a requested model instance cannot be found in the database. 
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class ModelNotFoundException extends ArkormException {
    constructor(message: string = 'No query results for the given model.') {
        super(message)
        this.name = 'ModelNotFoundException'
    }
}