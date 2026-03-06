import { ArkormCollection } from './Collection'
import type { PaginationMeta } from './types/core'

/**
 * The Paginator class encapsulates paginated results, including the data and
 * pagination metadata.
 * 
 * @template T The type of the data being paginated.
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class Paginator<T> {
    public readonly data: ArkormCollection<T>
    public readonly meta: PaginationMeta

    /**
     * Creates a new Paginator instance.
     * 
     * @param data          The collection of data being paginated.
     * @param total         The total number of items.
     * @param perPage       The number of items per page.
     * @param currentPage   The current page number.
     */
    public constructor(data: ArkormCollection<T>, total: number, perPage: number, currentPage: number) {
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

    /**
     * Converts the paginator instance to a JSON-serializable object.
     * 
     * @returns 
     */
    public toJSON () {
        return {
            data: this.data,
            meta: this.meta,
        }
    }
}