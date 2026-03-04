import type { PaginationMeta } from './types/core'

export class Paginator<T> {
    public readonly data: T[]
    public readonly meta: PaginationMeta

    public constructor(data: T[], total: number, perPage: number, currentPage: number) {
        const lastPage = Math.max(1, Math.ceil(total / perPage))
        const from = total === 0 ? null : (currentPage - 1) * perPage + 1
        const to = total === 0 ? null : Math.min(currentPage * perPage, total)

        this.data = data
        this.meta = {
            total,
            perPage,
            currentPage,
            lastPage,
            from,
            to,
        }
    }

    public toJSON () {
        return {
            data: this.data,
            meta: this.meta,
        }
    }
}