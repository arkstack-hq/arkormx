import type { PaginationOptions } from './types'

/**
 * URLDriver builds pagination URLs from paginator options.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class URLDriver {
    private static readonly DEFAULT_PAGE_NAME = 'page'
    private readonly path: string
    private readonly query: Record<string, string | number | boolean | null | undefined>
    private readonly fragment: string
    private readonly pageName: string

    public constructor(options: PaginationOptions = {}) {
        this.path = options.path ?? '/'
        this.query = options.query ?? {}
        this.fragment = options.fragment ?? ''
        this.pageName = options.pageName ?? URLDriver.DEFAULT_PAGE_NAME
    }

    public getPageName (): string {
        return this.pageName
    }

    public url (page: number): string {
        const targetPage = Math.max(1, page)
        const [basePath, pathQuery = ''] = this.path.split('?')
        const search = new URLSearchParams(pathQuery)

        Object.entries(this.query).forEach(([key, value]) => {
            if (value == null) {
                search.delete(key)

                return
            }

            search.set(key, String(value))
        })

        search.set(this.pageName, String(targetPage))

        const queryString = search.toString()
        const normalizedFragment = this.fragment.replace(/^#/, '')

        if (!queryString && !normalizedFragment)
            return basePath
        if (!normalizedFragment)
            return `${basePath}?${queryString}`
        if (!queryString)
            return `${basePath}#${normalizedFragment}`

        return `${basePath}?${queryString}#${normalizedFragment}`
    }
}
