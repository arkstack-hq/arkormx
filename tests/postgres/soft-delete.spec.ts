import { DbArticle, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('PostgreSQL soft delete behavior', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
        await releasePostgresTestLock()
    })

    it('applies default, withTrashed, and onlyTrashed scopes with real data', async () => {
        const visible = await DbArticle.query().get()
        const withTrashed = await DbArticle.withTrashed().get()
        const onlyTrashed = await DbArticle.onlyTrashed().get()

        expect(visible.all().length).toBe(1)
        expect(withTrashed.all().length).toBe(2)
        expect(onlyTrashed.all().length).toBe(1)
    })

    it('soft deletes and restores records in postgres', async () => {
        const article = await DbArticle.query().firstOrFail()

        await article.delete()
        expect(article.getAttribute('deletedAt')).toBeInstanceOf(Date)

        await article.restore()
        expect(article.getAttribute('deletedAt')).toBeNull()
    })

    it('force deletes a soft-deleted model', async () => {
        const article = await DbArticle.query().whereKey('title', 'Live').firstOrFail()
        const identifier = article.getAttribute('id')

        await article.forceDelete()

        const removed = await DbArticle.withTrashed().find(identifier)
        expect(removed).toBeNull()
    })
})
