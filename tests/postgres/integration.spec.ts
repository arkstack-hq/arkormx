import { DbArticle, DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ArkormCollection } from '../../src'

describe('Arkormˣ PostgreSQL integration smoke', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
        await releasePostgresTestLock()
    })

    it('runs queries and scopes against PostgreSQL', async () => {
        const users = await DbUser.query().orderBy({ id: 'asc' }).get()
        expect(users).toBeInstanceOf(ArkormCollection)
        expect(users.all().length).toBe(2)

        const activeUsers = await DbUser.scope('active').get()
        expect(activeUsers.all().length).toBe(1)
        expect(activeUsers.all()[0]?.getAttribute('email')).toBe('jane@example.com')
    })

    it('persists and soft-deletes against PostgreSQL', async () => {
        const created = await DbUser.query().create({
            name: 'Mia',
            email: 'mia@example.com',
            isActive: 1,
        })

        created.setAttribute('name', 'Mia Updated')
        await created.save()

        const reloaded = await DbUser.query().find(created.getAttribute('id'))
        expect(reloaded?.getAttribute('name')).toBe('Mia Updated')

        const article = await DbArticle.query().firstOrFail()
        await article.delete()
        expect(article.getAttribute('deletedAt')).toBeInstanceOf(Date)
    })
})