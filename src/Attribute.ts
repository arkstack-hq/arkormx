export interface AttributeOptions<TGet = unknown, TSet = unknown> {
    get?: (value: unknown) => TGet
    set?: (value: TSet) => unknown
}

export class Attribute<TGet = unknown, TSet = unknown> {
    public readonly get?: (value: unknown) => TGet
    public readonly set?: (value: TSet) => unknown

    public constructor(options: AttributeOptions<TGet, TSet> = {}) {
        this.get = options.get
        this.set = options.set
    }

    public static make<TGet = unknown, TSet = unknown> (
        options: AttributeOptions<TGet, TSet>
    ): Attribute<TGet, TSet> {
        return new Attribute(options)
    }

    public static isAttribute (value: unknown): value is Attribute {
        if (!value || typeof value !== 'object')
            return false

        return value instanceof Attribute
    }
}