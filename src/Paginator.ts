import { ArkormCollection } from './Collection'
import { getRuntimePaginationURLDriverFactory } from './helpers/runtime-config'
import { URLDriver } from './URLDriver'
import type {
    PaginationMeta,
    PaginationOptions,
    PaginationURLDriver,
    SimplePaginationMeta
} from './types/core'

/**
 * The LengthAwarePaginator class encapsulates paginated results with full
 * metadata including the total result count and last page.
 * 
 * @template T The type of the data being paginated.
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class LengthAwarePaginator<T> {
    public readonly data: ArkormCollection<T>
    public readonly meta: PaginationMeta
    private readonly urlDriver: PaginationURLDriver

    /**
    * Creates a new LengthAwarePaginator instance.
     * 
     * @param data          The collection of data being paginated.
     * @param total         The total number of items.
     * @param perPage       The number of items per page.
     * @param currentPage   The current page number.
     * @param options       URL generation options.
     */
    public constructor(
        data: ArkormCollection<T>,
        total: number,
        perPage: number,
        currentPage: number,
        options: PaginationOptions = {}
    ) {
        const lastPage = Math.max(1, Math.ceil(total / perPage))
        const from = total === 0 ? null : (currentPage - 1) * perPage + 1
        const to = total === 0 ? null : Math.min(currentPage * perPage, total)

        this.data = data
        const urlDriverFactory = getRuntimePaginationURLDriverFactory()
        this.urlDriver = urlDriverFactory ? urlDriverFactory(options) : new URLDriver(options)
        this.meta = {
            total,
            perPage,
            currentPage,
            lastPage,
            from,
            to,
        }
    }

    public getPageName (): string {
        return this.urlDriver.getPageName()
    }

    public url (page: number): string {
        return this.urlDriver.url(page)
    }

    public nextPageUrl (): string | null {
        if (this.meta.currentPage >= this.meta.lastPage)
            return null

        return this.url(this.meta.currentPage + 1)
    }

    public previousPageUrl (): string | null {
        if (this.meta.currentPage <= 1)
            return null

        return this.url(this.meta.currentPage - 1)
    }

    public firstPageUrl (): string {
        return this.url(1)
    }

    public lastPageUrl (): string {
        return this.url(this.meta.lastPage)
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
            links: {
                first: this.firstPageUrl(),
                last: this.lastPageUrl(),
                prev: this.previousPageUrl(),
                next: this.nextPageUrl(),
            },
        }
    }
}

/**
 * The Paginator class encapsulates simple pagination results without total count.
 *
 * @template T The type of the data being paginated.
 */
export class Paginator<T> {
    public readonly data: ArkormCollection<T>
    public readonly meta: SimplePaginationMeta
    private readonly urlDriver: PaginationURLDriver

    /**
     * Creates a new simple Paginator instance.
     *
     * @param data          The collection of data being paginated.
     * @param perPage       The number of items per page.
     * @param currentPage   The current page number.
     * @param hasMorePages  Indicates whether additional pages exist.
     * @param options       URL generation options.
     */
    public constructor(
        data: ArkormCollection<T>,
        perPage: number,
        currentPage: number,
        hasMorePages: boolean,
        options: PaginationOptions = {}
    ) {
        const count = data.all().length
        const from = count === 0 ? null : (currentPage - 1) * perPage + 1
        const to = count === 0 ? null : (from ?? 1) + count - 1

        this.data = data
        const urlDriverFactory = getRuntimePaginationURLDriverFactory()
        this.urlDriver = urlDriverFactory ? urlDriverFactory(options) : new URLDriver(options)
        this.meta = {
            perPage,
            currentPage,
            from,
            to,
            hasMorePages,
        }
    }

    public getPageName (): string {
        return this.urlDriver.getPageName()
    }

    public url (page: number): string {
        return this.urlDriver.url(page)
    }

    public nextPageUrl (): string | null {
        if (!this.meta.hasMorePages)
            return null

        return this.url(this.meta.currentPage + 1)
    }

    public previousPageUrl (): string | null {
        if (this.meta.currentPage <= 1)
            return null

        return this.url(this.meta.currentPage - 1)
    }

    public toJSON () {
        return {
            data: this.data,
            meta: this.meta,
            links: {
                prev: this.previousPageUrl(),
                next: this.nextPageUrl(),
            },
        }
    }
}