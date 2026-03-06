/**
 * The ArkormException class is a custom error type for handling 
 * exceptions specific to the Arkorm.    
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class ArkormException extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ArkormException'
    }
}