import {
    BelongsToManyRelation,
    BelongsToRelation,
    HasManyRelation,
    HasManyThroughRelation,
    HasOneRelation,
    HasOneThroughRelation,
    MorphManyRelation,
    MorphOneRelation,
    MorphToManyRelation
} from './relationship'
import type { CastMap, PrismaDelegateLike, Serializable } from './types/core'

import { QueryBuilder } from './QueryBuilder'
import { resolveCast } from './casts'
import { str } from '@h3ravel/support'

export interface ModelStatic<TModel> {
    new(attributes?: Record<string, unknown>): TModel
    query: () => QueryBuilder<TModel>
    hydrate: (attributes: Record<string, unknown>) => TModel
    hydrateMany: (attributes: Record<string, unknown>[]) => TModel[]
    getDelegate: (delegate?: string) => PrismaDelegateLike
}

export abstract class Model {
    protected static client: Record<string, PrismaDelegateLike>
    protected static delegate: string

    protected casts: CastMap = {}
    protected hidden: string[] = []
    protected visible: string[] = []
    protected appends: string[] = []

    protected readonly attributes: Record<string, unknown>

    public constructor(attributes: Record<string, unknown> = {}) {
        this.attributes = {}
        this.fill(attributes)
    }

    public static setClient (client: Record<string, PrismaDelegateLike>): void {
        this.client = client
    }

    public static getDelegate (delegate?: string): PrismaDelegateLike {
        const key = delegate || this.delegate || `${this.name.charAt(0).toLowerCase()}${this.name.slice(1)}s`
        const resolved = this.client?.[key]
        if (!resolved)
            throw new Error(`Prisma delegate [${key}] is not configured.`)

        return resolved
    }

    public static query<TModel> (this: ModelStatic<TModel>): QueryBuilder<TModel> {
        return new QueryBuilder<TModel>(this.getDelegate(), this)
    }

    public static hydrate<TModel> (
        this: new (attributes: Record<string, unknown>) => TModel,
        attributes: Record<string, unknown>
    ): TModel {
        return new this(attributes)
    }

    public static hydrateMany<TModel> (
        this: new (attributes: Record<string, unknown>) => TModel,
        attributes: Record<string, unknown>[]
    ): TModel[] {
        return attributes.map(attribute => new this(attribute))
    }

    public fill (attributes: Record<string, unknown>): this {
        Object.entries(attributes).forEach(([key, value]) => {
            this.setAttribute(key, value)
        })

        return this
    }

    public getAttribute (key: string): unknown {
        const mutator = this.resolveGetMutator(key)
        const cast = this.casts[key]
        let value = this.attributes[key]

        if (cast)
            value = resolveCast(cast).get(value)

        if (mutator)
            return mutator.call(this, value)

        return value
    }

    public setAttribute (key: string, value: unknown): this {
        const mutator = this.resolveSetMutator(key)
        const cast = this.casts[key]
        let resolved = value

        if (mutator)
            resolved = mutator.call(this, resolved)

        if (cast)
            resolved = resolveCast(cast).set(resolved)

        this.attributes[key] = resolved

        return this
    }

    public async save (): Promise<this> {
        const identifier = this.getAttribute('id') as string | number | undefined
        const payload = this.getRawAttributes()

        const constructor = this.constructor as unknown as ModelStatic<this>
        if (identifier == null) {
            const model = await constructor.query().create(payload)
            this.fill((model as unknown as Model).getRawAttributes())

            return this
        }

        const model = await constructor.query().where({ id: identifier }).update(payload)
        this.fill((model as unknown as Model).getRawAttributes())

        return this
    }

    public async delete (): Promise<this> {
        const identifier = this.getAttribute('id')
        if (identifier == null)
            throw new Error('Cannot delete a model without an id.')

        const constructor = this.constructor as unknown as ModelStatic<this>

        return constructor.query().where({ id: identifier }).delete()
    }

    public getRawAttributes (): Record<string, unknown> {
        return { ...this.attributes }
    }

    public toObject (): Serializable {
        const keys = this.visible.length > 0
            ? this.visible
            : Object.keys(this.attributes).filter(key => !this.hidden.includes(key))

        const object = keys.reduce<Serializable>((accumulator, key) => {
            let value = this.getAttribute(key)
            if (value instanceof Date)
                value = value.toISOString()

            accumulator[key] = value

            return accumulator
        }, {})

        this.appends.forEach((attribute) => {
            object[attribute] = this.getAttribute(attribute)
        })

        return object
    }

    public toJSON (): Serializable {
        return this.toObject()
    }

    protected hasOne<TRelated> (
        related: ModelStatic<TRelated>,
        foreignKey: string,
        localKey = 'id'
    ): HasOneRelation<this, TRelated> {
        return new HasOneRelation<this, TRelated>(this, related, foreignKey, localKey)
    }

    protected hasMany<TRelated> (
        related: ModelStatic<TRelated>,
        foreignKey: string,
        localKey = 'id'
    ): HasManyRelation<this, TRelated> {
        return new HasManyRelation<this, TRelated>(this, related, foreignKey, localKey)
    }

    protected belongsTo<TRelated> (
        related: ModelStatic<TRelated>,
        foreignKey: string,
        ownerKey = 'id'
    ): BelongsToRelation<this, TRelated> {
        return new BelongsToRelation<this, TRelated>(this, related, foreignKey, ownerKey)
    }

    protected belongsToMany<TRelated> (
        related: ModelStatic<TRelated>,
        throughDelegate: string,
        foreignPivotKey: string,
        relatedPivotKey: string,
        parentKey = 'id',
        relatedKey = 'id'
    ): BelongsToManyRelation<this, TRelated> {
        return new BelongsToManyRelation<this, TRelated>(this, related, throughDelegate, foreignPivotKey, relatedPivotKey, parentKey, relatedKey)
    }

    protected hasOneThrough<TRelated> (
        related: ModelStatic<TRelated>,
        throughDelegate: string,
        firstKey: string,
        secondKey: string,
        localKey = 'id',
        secondLocalKey = 'id'
    ): HasOneThroughRelation<this, TRelated> {
        return new HasOneThroughRelation(this, related, throughDelegate, firstKey, secondKey, localKey, secondLocalKey)
    }

    protected hasManyThrough<TRelated> (
        related: ModelStatic<TRelated>,
        throughDelegate: string,
        firstKey: string,
        secondKey: string,
        localKey = 'id',
        secondLocalKey = 'id'
    ): HasManyThroughRelation<this, TRelated> {
        return new HasManyThroughRelation(this, related, throughDelegate, firstKey, secondKey, localKey, secondLocalKey)
    }

    protected morphOne<TRelated> (
        related: ModelStatic<TRelated>,
        morphName: string,
        localKey = 'id'
    ): MorphOneRelation<this, TRelated> {
        return new MorphOneRelation(this, related, morphName, localKey)
    }

    protected morphMany<TRelated> (
        related: ModelStatic<TRelated>,
        morphName: string,
        localKey = 'id'
    ): MorphManyRelation<this, TRelated> {
        return new MorphManyRelation(this, related, morphName, localKey)
    }

    protected morphToMany<TRelated> (
        related: ModelStatic<TRelated>,
        throughDelegate: string,
        morphName: string,
        relatedPivotKey: string,
        parentKey = 'id',
        relatedKey = 'id'
    ): MorphToManyRelation<this, TRelated> {
        return new MorphToManyRelation(this, related, throughDelegate, morphName, relatedPivotKey, parentKey, relatedKey)
    }

    private resolveGetMutator (key: string): ((value: unknown) => unknown) | null {
        const methodName = `get${str(key).studly()}Attribute`
        const method = (this as unknown as Record<string, unknown>)[methodName]

        return typeof method === 'function' ? method as (value: unknown) => unknown : null
    }

    private resolveSetMutator (key: string): ((value: unknown) => unknown) | null {
        const methodName = `set${str(key).studly()}Attribute`
        const method = (this as unknown as Record<string, unknown>)[methodName]

        return typeof method === 'function' ? method as (value: unknown) => unknown : null
    }
}