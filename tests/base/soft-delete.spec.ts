import { Article, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Soft delete behavior', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('applies default, withTrashed, and onlyTrashed scopes', async () => {
        const visible = await Article.query().get()
        const withTrashed = await Article.withTrashed().get()
        const onlyTrashed = await Article.onlyTrashed().get()

        expect(visible.all().length).toBe(1)
        expect(withTrashed.all().length).toBe(2)
        expect(onlyTrashed.all().length).toBe(1)
    })

    it('soft deletes and restores records', async () => {
        const article = await Article.query().find(2000)
        expect(article).not.toBeNull()

        await (article as Article).delete()
        expect((article as Article).getAttribute('deletedAt')).toBeInstanceOf(Date)

        await (article as Article).restore()
        expect((article as Article).getAttribute('deletedAt')).toBeNull()
    })

    it('force deletes a soft-deletable model', async () => {
        const article = await Article.query().find(2000)
        expect(article).not.toBeNull()

        await (article as Article).forceDelete()

        const existsWithTrashed = await Article.withTrashed().find(2000)
        expect(existsWithTrashed).toBeNull()
    })

    it('throws when restoring without an id', async () => {
        const article = new Article({ title: 'No Id' })

        await expect(article.restore()).rejects.toThrow('Cannot restore a model without an id.')
    })
})
