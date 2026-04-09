import {
    QueryExecutionException,
    configureArkormRuntime,
    createPrismaDatabaseAdapter,
    createPrismaDelegateMap,
} from '../../src'
import { describe, expect, it, vi } from 'vitest'

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

    it('emits runtime debug events when debug config is enabled', async () => {
        const prisma = createCoreClient()
        const events: Array<Record<string, unknown>> = []
        const adapter = createPrismaDatabaseAdapter(prisma)

        configureArkormRuntime(() => ({}), {
            debug: (event) => {
                events.push({
                    phase: event.phase,
                    operation: event.operation,
                    target: event.target,
                })
            },
        })

        await adapter.select({
            target: { table: 'users' },
            where: {
                type: 'comparison',
                column: 'id',
                operator: '=',
                value: 1,
            },
        })

        expect(events).toEqual([
            { phase: 'before', operation: 'select', target: 'users' },
            { phase: 'after', operation: 'select', target: 'users' },
        ])
    })

    it('wraps raw delegate failures in QueryExecutionException', async () => {
        const prisma = {
            users: {
                findMany: async () => {
                    throw new Error('Unknown argument `ids`')
                },
                findFirst: async () => null,
                create: async () => ({}),
                update: async () => ({}),
                delete: async () => ({}),
                count: async () => 0,
            },
        }

        const adapter = createPrismaDatabaseAdapter(prisma)

        let error: QueryExecutionException | undefined

        try {
            await adapter.select({
                target: { table: 'users' },
                where: {
                    type: 'comparison',
                    column: 'ids',
                    operator: '=',
                    value: 1,
                },
            })
        } catch (caught) {
            error = caught as QueryExecutionException
        }

        expect(error).toBeInstanceOf(QueryExecutionException)
        if (!error)
            throw new Error('Expected adapter.select() to throw QueryExecutionException.')

        expect(error.getContext()).toMatchObject({
            code: 'QUERY_EXECUTION_FAILED',
            operation: 'adapter.select',
            delegate: 'users',
        })
        expect(error.getInspection()).toBeUndefined()
    })

    it('translates Arkorm relation load plans into Prisma include arguments at the adapter edge', async () => {
        const prisma = createCoreClient()
        const findManySpy = vi.spyOn((prisma as Record<string, any>).users, 'findMany')
        const adapter = createPrismaDatabaseAdapter(prisma)

        await adapter.select({
            target: { table: 'users' },
            relationLoads: [
                {
                    relation: 'posts',
                    constraint: {
                        type: 'comparison',
                        column: 'title',
                        operator: '=',
                        value: 'A',
                    },
                    orderBy: [{ column: 'id', direction: 'desc' }],
                    columns: [{ column: 'id' }, { column: 'title' }],
                    limit: 1,
                    relationLoads: [
                        {
                            relation: 'comments',
                        },
                    ],
                },
            ],
        })

        expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
            include: {
                posts: {
                    where: { title: 'A' },
                    orderBy: [{ id: 'desc' }],
                    select: { id: true, title: true },
                    include: { comments: true },
                    take: 1,
                },
            },
        }))
    })

    it('introspects model structure from Prisma runtime data model metadata when available', async () => {
        const prisma = {
            user: {
                findMany: async () => [],
                findFirst: async () => null,
                create: async () => ({}),
                update: async () => ({}),
                delete: async () => ({}),
                count: async () => 0,
            },
            _runtimeDataModel: {
                models: {
                    User: {
                        dbName: 'users',
                        fields: [
                            { name: 'id', kind: 'scalar', type: 'Int', isRequired: true },
                            { name: 'email', kind: 'scalar', type: 'String', isRequired: true },
                            { name: 'status', kind: 'enum', type: 'UserStatus', isRequired: true },
                            { name: 'tags', kind: 'enum', type: 'UserStatus', isRequired: true, isList: true },
                            { name: 'posts', kind: 'object', type: 'Post', isRequired: false },
                        ],
                    },
                },
                enums: {
                    UserStatus: {
                        values: ['ACTIVE', 'SUSPENDED'],
                    },
                },
            },
        } as Record<string, unknown>

        const adapter = createPrismaDatabaseAdapter(prisma)
        const models = await adapter.introspectModels?.()

        expect(models).toEqual([
            {
                name: 'User',
                table: 'users',
                fields: [
                    { name: 'id', type: 'number', nullable: false },
                    { name: 'email', type: 'string', nullable: false },
                    { name: 'status', type: '\'ACTIVE\' | \'SUSPENDED\'', nullable: false },
                    { name: 'tags', type: 'Array<\'ACTIVE\' | \'SUSPENDED\'>', nullable: false },
                ],
            },
        ])
    })
})