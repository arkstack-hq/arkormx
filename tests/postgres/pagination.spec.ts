import { DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { LengthAwarePaginator, Paginator } from '../../src'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('PostgreSQL Pagination', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
        await releasePostgresTestLock()
    })

    it('normalizes invalid page and perPage values', async () => {
        const page = await DbUser.query().orderBy({ id: 'asc' }).paginate(0, 0)
        expect(page).toBeInstanceOf(LengthAwarePaginator)
        expect(page.meta.currentPage).toBe(1)
        expect(page.meta.perPage).toBe(1)
        expect(page.meta.total).toBe(2)
        expect(page.meta.lastPage).toBe(2)
        expect(page.meta.from).toBe(1)
        expect(page.meta.to).toBe(1)

        const simplePage = await DbUser.query().orderBy({ id: 'asc' }).simplePaginate(0, 0)
        expect(simplePage).toBeInstanceOf(Paginator)
        expect(simplePage.meta.currentPage).toBe(1)
        expect(simplePage.meta.perPage).toBe(1)
        expect(simplePage.meta.hasMorePages).toBe(true)
        expect(simplePage.meta.from).toBe(1)
        expect(simplePage.meta.to).toBe(1)
    })

    it('returns null ranges for empty datasets', async () => {
        const page = await DbUser.query().whereKey('id', 99999).paginate(10, 1)
        expect(page.data.all().length).toBe(0)
        expect(page.meta.total).toBe(0)
        expect(page.meta.lastPage).toBe(1)
        expect(page.meta.from).toBeNull()
        expect(page.meta.to).toBeNull()

        const simplePage = await DbUser.query().whereKey('id', 99999).simplePaginate(10, 1)
        expect(simplePage.data.all().length).toBe(0)
        expect(simplePage.meta.hasMorePages).toBe(false)
        expect(simplePage.meta.from).toBeNull()
        expect(simplePage.meta.to).toBeNull()
    })

    it('returns correct boundary metadata on last page', async () => {
        const page = await DbUser.query().orderBy({ id: 'asc' }).paginate(1, 2)
        expect(page.data.all().length).toBe(1)
        expect(page.data.all()[0]?.getAttribute('id')).toBe(2)
        expect(page.meta.currentPage).toBe(2)
        expect(page.meta.lastPage).toBe(2)
        expect(page.meta.from).toBe(2)
        expect(page.meta.to).toBe(2)

        const simplePage = await DbUser.query().orderBy({ id: 'asc' }).simplePaginate(1, 2)
        expect(simplePage.data.all().length).toBe(1)
        expect(simplePage.data.all()[0]?.getAttribute('id')).toBe(2)
        expect(simplePage.meta.currentPage).toBe(2)
        expect(simplePage.meta.hasMorePages).toBe(false)
        expect(simplePage.meta.from).toBe(2)
        expect(simplePage.meta.to).toBe(2)
    })

    it('builds pagination URLs using path, query, fragment and pageName options', async () => {
        const page = await DbUser.query().orderBy({ id: 'asc' }).paginate(1, 1, {
            path: '/users',
            query: { filter: 'active' },
            fragment: 'grid',
            pageName: 'p',
        })

        expect(page.getPageName()).toBe('p')
        expect(page.url(2)).toBe('/users?filter=active&p=2#grid')
        expect(page.nextPageUrl()).toBe('/users?filter=active&p=2#grid')
        expect(page.previousPageUrl()).toBeNull()
        expect(page.firstPageUrl()).toBe('/users?filter=active&p=1#grid')
        expect(page.lastPageUrl()).toBe('/users?filter=active&p=2#grid')

        const simplePage = await DbUser.query().orderBy({ id: 'asc' }).simplePaginate(1, 1, {
            path: '/users',
            query: { filter: 'active' },
            fragment: 'grid',
            pageName: 'p',
        })

        expect(simplePage.getPageName()).toBe('p')
        expect(simplePage.url(2)).toBe('/users?filter=active&p=2#grid')
        expect(simplePage.nextPageUrl()).toBe('/users?filter=active&p=2#grid')
        expect(simplePage.previousPageUrl()).toBeNull()
    })

})
