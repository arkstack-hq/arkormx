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
})