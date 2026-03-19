import { DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('PostgreSQL transactions', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
        await releasePostgresTestLock()
    })

    it('commits writes when the transaction succeeds', async () => {
        await DbUser.transaction(async () => {
            await DbUser.query().create({
                name: 'Mia',
                email: 'mia-transaction@example.com',
                isActive: 1,
            })

            await expect(DbUser.query().count()).resolves.toBe(3)
        })

        await expect(DbUser.query().count()).resolves.toBe(3)
        await expect(DbUser.query().whereKey('email', 'mia-transaction@example.com').exists()).resolves.toBe(true)
    })

    it('rolls back writes when the transaction callback throws', async () => {
        await expect(DbUser.transaction(async () => {
            await DbUser.query().create({
                name: 'Rollback',
                email: 'rollback-transaction@example.com',
                isActive: 1,
            })

            throw new Error('abort postgres transaction')
        })).rejects.toThrow('abort postgres transaction')

        await expect(DbUser.query().count()).resolves.toBe(2)
        await expect(DbUser.query().whereKey('email', 'rollback-transaction@example.com').exists()).resolves.toBe(false)
    })

    it('reuses the active transaction for nested transaction calls', async () => {
        await expect(DbUser.transaction(async () => {
            await DbUser.query().create({
                name: 'Outer',
                email: 'outer-transaction@example.com',
                isActive: 1,
            })

            await DbUser.transaction(async () => {
                await DbUser.query().create({
                    name: 'Inner',
                    email: 'inner-transaction@example.com',
                    isActive: 1,
                })
            })

            await expect(DbUser.query().count()).resolves.toBe(4)

            throw new Error('rollback nested postgres transaction')
        })).rejects.toThrow('rollback nested postgres transaction')

        await expect(DbUser.query().count()).resolves.toBe(2)
        await expect(DbUser.query().whereKey('email', 'outer-transaction@example.com').exists()).resolves.toBe(false)
        await expect(DbUser.query().whereKey('email', 'inner-transaction@example.com').exists()).resolves.toBe(false)
    })
})