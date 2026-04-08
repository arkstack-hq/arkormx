import { DB, resetArkormRuntimeForTests } from '../../src'
import type { DatabaseAdapter, InsertSpec, SelectSpec, UpdateSpec } from '../../src/types/adapter'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
    DB.setAdapter(undefined)
    resetArkormRuntimeForTests()
})

describe('DB facade', () => {
    it('queries raw table rows without model hydration constraints', async () => {
        const selectSpecs: Array<SelectSpec<any>> = []
        const adapter: DatabaseAdapter = {
            select: async <TModel = unknown> (spec: SelectSpec<TModel>) => {
                selectSpecs.push(spec)

                return [{ id: 1, name: 'Jane' }]
            },
            selectOne: async () => null,
            insert: async () => ({}),
            update: async () => ({}),
            delete: async () => ({}),
            count: async () => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => await callback(adapter),
        }

        DB.setAdapter(adapter)

        const rows = await DB.table<{ id: number, name: string }>('users')
            .where({ name: 'Jane' } as never)
            .get()

        expect(rows.all()).toEqual([{ id: 1, name: 'Jane' }])
        expect(selectSpecs[0]).toEqual(expect.objectContaining({
            target: expect.objectContaining({
                table: 'users',
                primaryKey: 'id',
                softDelete: {
                    enabled: false,
                    column: 'deletedAt',
                },
            }),
        }))
    })

    it('resolves updates using custom table metadata without a model', async () => {
        const selectOneSpecs: Array<SelectSpec<any>> = []
        const updateSpecs: Array<UpdateSpec<any>> = []
        const adapter: DatabaseAdapter = {
            select: async () => [],
            selectOne: async <TModel = unknown> (spec: SelectSpec<TModel>) => {
                selectOneSpecs.push(spec)

                return { uuid: 'user-1' }
            },
            insert: async () => ({}),
            update: async <TModel = unknown> (spec: UpdateSpec<TModel>) => {
                updateSpecs.push(spec)

                return { uuid: 'user-1', name: 'Updated' }
            },
            delete: async () => ({}),
            count: async () => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => await callback(adapter),
        }

        DB.setAdapter(adapter)

        const updated = await DB.table<{ uuid: string, name: string }>('users', {
            primaryKey: 'uuid',
        })
            .where({ email: 'jane@example.com' } as never)
            .update({ name: 'Updated' } as never)

        expect(updated).toEqual({ uuid: 'user-1', name: 'Updated' })
        expect(selectOneSpecs[0]).toEqual(expect.objectContaining({
            target: expect.objectContaining({
                table: 'users',
                primaryKey: 'uuid',
            }),
            columns: [{ column: 'uuid' }],
        }))
        expect(updateSpecs[0]).toEqual(expect.objectContaining({
            target: expect.objectContaining({
                table: 'users',
                primaryKey: 'uuid',
            }),
        }))
    })

    it('supports raw table insert metadata for generated keys and timestamps', async () => {
        const insertSpecs: Array<InsertSpec<any>> = []
        const adapter: DatabaseAdapter = {
            select: async () => [],
            selectOne: async () => null,
            insert: async <TModel = unknown> (spec: InsertSpec<TModel>) => {
                insertSpecs.push(spec)

                return spec.values
            },
            update: async () => ({}),
            delete: async () => ({}),
            count: async () => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => await callback(adapter),
        }

        DB.setAdapter(adapter)

        const created = await DB.table<{ id: string, createdAt: Date, updatedAt: Date, name: string }>('api_tokens', {
            primaryKeyGeneration: {
                strategy: 'uuid',
                prismaDefault: '@default(uuid())',
                databaseDefault: 'gen_random_uuid()::text',
                runtimeFactory: 'uuid',
            },
            timestampColumns: [
                { column: 'createdAt', default: 'now()' },
                { column: 'updatedAt', updatedAt: true },
            ],
        }).create({ name: 'Personal token' } as never)

        expect(typeof insertSpecs[0]?.values.id).toBe('string')
        expect(insertSpecs[0]?.values.createdAt).toBeInstanceOf(Date)
        expect(insertSpecs[0]?.values.updatedAt).toBeInstanceOf(Date)
        expect(created.id).toBe(insertSpecs[0]?.values.id)
    })

    it('runs raw table queries against the transaction-scoped adapter', async () => {
        const rootSelectSpecs: Array<SelectSpec<any>> = []
        const transactionSelectSpecs: Array<SelectSpec<any>> = []

        const transactionAdapter: DatabaseAdapter = {
            select: async <TModel = unknown> (spec: SelectSpec<TModel>) => {
                transactionSelectSpecs.push(spec)

                return [{ id: 1, name: 'tx' }]
            },
            selectOne: async () => null,
            insert: async () => ({}),
            update: async () => ({}),
            delete: async () => ({}),
            count: async () => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => await callback(transactionAdapter),
        }

        const adapter: DatabaseAdapter = {
            select: async <TModel = unknown> (spec: SelectSpec<TModel>) => {
                rootSelectSpecs.push(spec)

                return [{ id: 0, name: 'root' }]
            },
            selectOne: async () => null,
            insert: async () => ({}),
            update: async () => ({}),
            delete: async () => ({}),
            count: async () => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => await callback(transactionAdapter),
        }

        DB.setAdapter(adapter)

        const rows = await DB.transaction(async (db) => {
            return (await db.table<{ id: number, name: string }>('users').get()).all()
        })

        expect(rows).toEqual([{ id: 1, name: 'tx' }])
        expect(rootSelectSpecs).toHaveLength(0)
        expect(transactionSelectSpecs).toHaveLength(1)
    })
})