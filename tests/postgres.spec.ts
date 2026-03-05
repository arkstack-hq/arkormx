import 'dotenv/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { configureArkormRuntime, Model, QueryBuilder } from '../src'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

class DbUser extends Model<'user'> {
    protected static override delegate = 'users'

    public scopeActive (query: QueryBuilder<DbUser>) {
        return query.whereKey('isActive', 1)
    }
}

class DbArticle extends Model<'article'> {
    protected static override delegate = 'articles'
    protected static override softDeletes = true
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL as string,
    }),
})

describe('Arkorm PostgreSQL integration', () => {
    beforeAll(async () => {
        configureArkormRuntime(prisma as unknown as Record<string, unknown>)

        await prisma.$connect()
    })

    beforeEach(async () => {
        configureArkormRuntime(prisma as unknown as Record<string, unknown>)

        await prisma.article.deleteMany()
        await prisma.user.deleteMany()

        await prisma.user.createMany({
            data: [
                { name: 'Jane', email: 'jane@example.com', isActive: 1 },
                { name: 'John', email: 'john@example.com', isActive: 0 },
            ],
        })

        await prisma.article.createMany({
            data: [
                { title: 'Live', deletedAt: null },
                { title: 'Archived', deletedAt: new Date('2026-03-04T12:00:00.000Z') },
            ],
        })
    })

    afterAll(async () => {
        await prisma.$disconnect()
    })

    it('runs queries against PostgreSQL using Prisma adapter', async () => {
        const users = await DbUser.query().orderBy({ id: 'asc' }).get()
        expect(users.length).toBe(2)

        const activeUsers = await DbUser.scope('active').get()
        expect(activeUsers.length).toBe(1)
        expect(activeUsers[0]?.getAttribute('email')).toBe('jane@example.com')
    })

    it('persists create/update/delete against PostgreSQL', async () => {
        const created = await DbUser.query().create({
            name: 'Mia',
            email: 'mia@example.com',
            isActive: 1,
        })

        expect(created.getAttribute('id')).toBeDefined()

        const model = created
        model.setAttribute('name', 'Mia Updated')
        await model.save()

        const reloaded = await DbUser.query().find(model.getAttribute('id'))
        expect(reloaded?.getAttribute('name')).toBe('Mia Updated')

        expect(reloaded).not.toBeNull()
        await reloaded?.delete()
        const deleted = await DbUser.query().find(model.getAttribute('id'))
        expect(deleted).toBeNull()
    })

    it('applies soft-delete scopes against PostgreSQL', async () => {
        const visible = await DbArticle.query().get()
        const withTrashed = await DbArticle.withTrashed().get()
        const onlyTrashed = await DbArticle.onlyTrashed().get()

        expect(visible.length).toBe(1)
        expect(withTrashed.length).toBe(2)
        expect(onlyTrashed.length).toBe(1)

        const article = await DbArticle.query().firstOrFail()
        await article.delete()
        expect(article.getAttribute('deletedAt')).toBeInstanceOf(Date)

        await article.restore()
        expect(article.getAttribute('deletedAt')).toBeNull()
    })
})
