import { User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Base transactions', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('commits writes when the transaction succeeds', async () => {
        await User.transaction(async () => {
            await User.query().create({
                id: 3,
                name: 'Mia',
                email: 'mia@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-05T00:00:00.000Z'),
            })

            await expect(User.query().count()).resolves.toBe(3)
        })

        await expect(User.query().count()).resolves.toBe(3)
        await expect(User.query().whereKey('email', 'mia@example.com').exists()).resolves.toBe(true)
    })

    it('rolls back writes when the transaction callback throws', async () => {
        await expect(User.transaction(async () => {
            await User.query().create({
                id: 3,
                name: 'Rollback',
                email: 'rollback@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-05T01:00:00.000Z'),
            })

            throw new Error('abort transaction')
        })).rejects.toThrow('abort transaction')

        await expect(User.query().count()).resolves.toBe(2)
        await expect(User.query().whereKey('email', 'rollback@example.com').exists()).resolves.toBe(false)
    })

    it('reuses the active transaction for nested transaction calls', async () => {
        await expect(User.transaction(async () => {
            await User.query().create({
                id: 3,
                name: 'Outer',
                email: 'outer@example.com',
                isActive: 1,
                createdAt: new Date('2026-03-05T02:00:00.000Z'),
            })

            await User.transaction(async () => {
                await User.query().create({
                    id: 4,
                    name: 'Inner',
                    email: 'inner@example.com',
                    isActive: 1,
                    createdAt: new Date('2026-03-05T03:00:00.000Z'),
                })
            })

            await expect(User.query().count()).resolves.toBe(4)

            throw new Error('rollback nested transaction')
        })).rejects.toThrow('rollback nested transaction')

        await expect(User.query().count()).resolves.toBe(2)
        await expect(User.query().whereKey('email', 'outer@example.com').exists()).resolves.toBe(false)
        await expect(User.query().whereKey('email', 'inner@example.com').exists()).resolves.toBe(false)
    })
})