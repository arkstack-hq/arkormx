import type { PrismaDelegateLike, PrismaFindManyArgs } from './types/core'

import type { ModelStatic } from './Model'
import { Paginator } from './Paginator'

export class QueryBuilder<TModel> {
    private readonly args: PrismaFindManyArgs = {}

    public constructor(
        private readonly delegate: PrismaDelegateLike,
        private readonly model: ModelStatic<TModel>,
    ) { }

    public where (where: Record<string, unknown>): this {
        if (!this.args.where) {
            this.args.where = where

            return this
        }

        this.args.where = {
            AND: [this.args.where, where],
        }

        return this
    }

    public orderBy (orderBy: PrismaFindManyArgs['orderBy']): this {
        this.args.orderBy = orderBy

        return this
    }

    public include (include: PrismaFindManyArgs['include']): this {
        this.args.include = include

        return this
    }

    public with (relations: string | string[]): this {
        const names = Array.isArray(relations) ? relations : [relations]
        this.args.include = {
            ...(this.args.include || {}),
            ...names.reduce<Record<string, boolean>>((accumulator, name) => {
                accumulator[name] = true

                return accumulator
            }, {}),
        }

        return this
    }

    public select (select: PrismaFindManyArgs['select']): this {
        this.args.select = select

        return this
    }

    public skip (skip: number): this {
        this.args.skip = skip

        return this
    }

    public take (take: number): this {
        this.args.take = take

        return this
    }

    public async get (): Promise<TModel[]> {
        const rows = await this.delegate.findMany(this.args)

        return this.model.hydrateMany(rows as Record<string, unknown>[])
    }

    public async first (): Promise<TModel | null> {
        const row = await this.delegate.findFirst(this.args)
        if (!row)
            return null

        return this.model.hydrate(row as Record<string, unknown>)
    }

    public async firstOrFail (): Promise<TModel> {
        const model = await this.first()
        if (!model)
            throw new Error('Record not found.')

        return model
    }

    public async find (value: string | number, key = 'id'): Promise<TModel | null> {
        return this.where({ [key]: value }).first()
    }

    public async create (data: Record<string, unknown>): Promise<TModel> {
        const created = await this.delegate.create({ data })

        return this.model.hydrate(created as Record<string, unknown>)
    }

    public async update (data: Record<string, unknown>): Promise<TModel> {
        if (!this.args.where)
            throw new Error('Update requires a where clause.')

        const updated = await this.delegate.update({ where: this.args.where, data })

        return this.model.hydrate(updated as Record<string, unknown>)
    }

    public async delete (): Promise<TModel> {
        if (!this.args.where)
            throw new Error('Delete requires a where clause.')

        const deleted = await this.delegate.delete({ where: this.args.where })

        return this.model.hydrate(deleted as Record<string, unknown>)
    }

    public async count (): Promise<number> {
        return this.delegate.count({ where: this.args.where })
    }

    public async paginate (page = 1, perPage = 15): Promise<Paginator<TModel>> {
        const currentPage = Math.max(1, page)
        const pageSize = Math.max(1, perPage)
        const total = await this.count()
        const items = await this.clone()
            .skip((currentPage - 1) * pageSize)
            .take(pageSize)
            .get()

        return new Paginator(items, total, pageSize, currentPage)
    }

    public clone (): QueryBuilder<TModel> {
        const builder = new QueryBuilder<TModel>(this.delegate, this.model)
        builder.args.where = this.args.where
        builder.args.include = this.args.include
        builder.args.orderBy = this.args.orderBy
        builder.args.select = this.args.select
        builder.args.skip = this.args.skip
        builder.args.take = this.args.take

        return builder
    }
}