import {
    createPrismaDatabaseAdapter,
    createPrismaDelegateMap,
} from '../../src'
import { describe, expect, it } from 'vitest'

import { createCoreClient } from './helpers/core-fixtures'

describe('Prisma database adapter', () => {
    it('selects, inserts, updates, deletes, counts, and checks existence against Prisma-like delegates', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)

        const selected = await adapter.select({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: 'contains',
                value: '@example.com',
            },
            orderBy: [{ column: 'id', direction: 'asc' }],
        })

        expect(selected).toHaveLength(2)

        const first = await adapter.selectOne({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: 1,
            },
        })
        expect(first?.email).toBe('jane@example.com')

        const inserted = await adapter.insert({
            target: { table: 'users' },
            values: {
                id: 3,
                name: 'New',
                email: 'new@example.com',
                password: 'secret',
                isActive: 1,
                meta: '{}',
                createdAt: '2026-03-04T12:00:00.000Z',
            },
        })
        expect(inserted.id).toBe(3)

        const updated = await adapter.update({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: 3,
            },
            values: { email: 'updated@example.com' },
        })
        expect(updated?.email).toBe('updated@example.com')

        const count = await adapter.count({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'email',
                operator: 'contains',
                value: '@example.com',
            },
            aggregate: { type: 'count' },
        })
        expect(count).toBe(3)

        const exists = await adapter.exists({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: 3,
            },
        })
        expect(exists).toBe(true)

        const deleted = await adapter.delete({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: 3,
            },
        })
        expect(deleted?.id).toBe(3)
    })

    it('supports mapped Arkorm delegate names for delegate maps and adapter targets', async () => {
        const prisma = createCoreClient()
        const singularClient = {
            ...prisma,
            user: (prisma as Record<string, unknown>).users,
        } as Record<string, unknown>
        delete singularClient.users

        const delegateMap = createPrismaDelegateMap(singularClient, { users: 'user' })
        expect(delegateMap.users).toBeDefined()

        const adapter = createPrismaDatabaseAdapter(singularClient, { users: 'user' })
        const selected = await adapter.select({
            target: { table: 'users' },
        })

        expect(selected).toHaveLength(2)
    })

    it('runs transactions through the underlying Prisma-like client', async () => {
        const prisma = createCoreClient()
        const adapter = createPrismaDatabaseAdapter(prisma)

        await adapter.transaction(async (transactionAdapter) => {
            await transactionAdapter.insert({
                target: { table: 'users' },
                values: {
                    id: 9,
                    name: 'Txn',
                    email: 'txn@example.com',
                    password: 'secret',
                    isActive: 1,
                    meta: '{}',
                    createdAt: '2026-03-04T12:00:00.000Z',
                },
            })
        })

        const committed = await adapter.exists({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: 9,
            },
        })

        expect(committed).toBe(true)
    })
})