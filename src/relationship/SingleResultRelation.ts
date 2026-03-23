import type { RelatedModelClass, RelationDefaultResolver, RelationDefaultValue } from 'src/types'

import { Relation } from './Relation'

/**
 * Base class for relationships that resolve to a single related model.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 1.3.0
 */
export abstract class SingleResultRelation<TParent, TRelated> extends Relation<TRelated> {
    protected defaultValue: RelationDefaultValue<object, TRelated> | undefined

    protected constructor(
        protected readonly parent: TParent,
        protected readonly related: RelatedModelClass<TRelated>,
    ) {
        super()
    }

    /**
     * Defines a default value to return when the relationship does not find a related model.
     * 
     * @param value     The default value or a callback that returns the default value.
     * @returns         The current instance for method chaining.
     */
    public withDefault (value: RelationDefaultValue<TParent, TRelated> = {}): this {
        this.defaultValue = value as RelationDefaultValue<object, TRelated>

        return this
    }

    protected resolveDefaultResult (): TRelated | null {
        if (typeof this.defaultValue === 'undefined')
            return null

        const resolved = typeof this.defaultValue === 'function'
            ? (this.defaultValue as RelationDefaultResolver<object, TRelated>)(this.parent as object)
            : this.defaultValue

        if (resolved instanceof this.related)
            return resolved as TRelated

        return this.related.hydrate(resolved as Record<string, unknown>)
    }
}