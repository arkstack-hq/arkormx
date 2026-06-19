import { UnsupportedAdapterFeatureException } from '../../src'
import { User } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

describe('where helpers', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    describe('LIKE family (portable)', () => {
        it('whereNotLike excludes matching rows', async () => {
            const users = await User.query().whereNotLike('email', 'jane').get()

            expect(users.all().map(user => user.getAttribute('id'))).toEqual([2])
        })

        it('orWhereLike combines with OR semantics', async () => {
            const users = await User.query()
                .where({ isActive: 1 })
                .orWhereLike('email', 'john')
                .get()

            expect(users.all().map(user => user.getAttribute('id')).sort()).toEqual([1, 2])
        })

        it('orWhereNotLike combines with OR semantics', async () => {
            const users = await User.query()
                .where({ email: 'nobody@example.com' })
                .orWhereNotLike('email', 'jane')
                .get()

            expect(users.all().map(user => user.getAttribute('id'))).toEqual([2])
        })
    })

    describe('PostgreSQL-only predicates reject on the Prisma compatibility adapter', () => {
        it('rejects whereJsonContains', async () => {
            await expect(User.query().whereJsonContains('meta', { tier: 'pro' }).get())
                .rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
        })

        it('rejects whereJsonContainsKey', async () => {
            await expect(User.query().whereJsonContainsKey('meta->tier').get())
                .rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
        })

        it('rejects whereJsonLength', async () => {
            await expect(User.query().whereJsonLength('meta', '>', 1).get())
                .rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
        })

        it('rejects whereJsonOverlaps', async () => {
            await expect(User.query().whereJsonOverlaps('meta', ['a']).get())
                .rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
        })

        it('rejects having', async () => {
            await expect(User.query().groupBy('isActive').having('isActive', '>', 1).get())
                .rejects.toBeInstanceOf(UnsupportedAdapterFeatureException)
        })
    })

    describe('callback (nested grouping)', () => {
        it('wraps a where callback into a parenthesized group', async () => {
            const users = await User.query()
                .where(query => query.where({ id: 1 }).orWhere({ id: 2 }))
                .get()

            expect(users.all().map(user => user.getAttribute('id')).sort()).toEqual([1, 2])
        })

        it('preserves precedence so the group binds before the outer AND', async () => {
            // isActive = 0 AND (id = 1 OR id = 2) -> only John (id 2, isActive 0).
            // Without grouping this would read as isActive = 0 AND id = 1 OR id = 2.
            const users = await User.query()
                .where({ isActive: 0 })
                .where(query => query.where({ id: 1 }).orWhere({ id: 2 }))
                .get()

            expect(users.all().map(user => user.getAttribute('id'))).toEqual([2])
        })

        it('supports a callback passed to orWhere', async () => {
            const users = await User.query()
                .where({ isActive: 1 })
                .orWhere(query => query.where({ email: 'john@example.com' }))
                .get()

            expect(users.all().map(user => user.getAttribute('id')).sort()).toEqual([1, 2])
        })
    })

    describe('argument validation', () => {
        it('whereJsonLength rejects non-integer lengths', () => {
            expect(() => User.query().whereJsonLength('meta', 1.5)).toThrow()
        })
    })
})
