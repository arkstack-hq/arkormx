import { Model } from './Model'

/**
 * Base pivot class that all pivot models should extend. 
 * 
 * @template TModel The type of the model extending this base class.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 2.0.0-next.18
 */
export class PivotModel extends Model {
    constructor(protected readonly attributes: Record<string, unknown> = {}) {
        super(attributes)
    }
}