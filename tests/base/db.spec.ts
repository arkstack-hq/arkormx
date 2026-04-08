import { DB, resetArkormRuntimeForTests } from '../../src'
import type { DatabaseAdapter, InsertSpec, SelectSpec, UpdateSpec } from '../../src/types/adapter'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const originalCwd = process.cwd()
const tempDirectories: string[] = []

const makeTempDir = (prefix: string): string => {
    const directory = mkdtempSync(join(tmpdir(), prefix))
    tempDirectories.push(directory)

    return directory
}

afterEach(() => {
    process.chdir(originalCwd)
    DB.setAdapter(undefined)
    resetArkormRuntimeForTests()

    tempDirectories.splice(0).forEach((directory) => {
        rmSync(directory, { recursive: true, force: true })
    })
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

    it('falls back to persisted table metadata when explicit DB options are not provided', async () => {
        const workspace = makeTempDir('arkormx-db-persisted-metadata-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                api_tokens: {
                    columns: {
                        createdAt: 'created_at',
                    },
                    enums: {},
                    primaryKeyGeneration: {
                        column: 'id',
                        strategy: 'uuid',
                        prismaDefault: '@default(uuid())',
                        databaseDefault: 'gen_random_uuid()::text',
                        runtimeFactory: 'uuid',
                    },
                    timestampColumns: [
                        { column: 'createdAt', default: 'now()' },
                        { column: 'updatedAt', updatedAt: true },
                    ],
                },
            },
        }, null, 2))

        const selectSpecs: Array<SelectSpec<any>> = []
        const insertSpecs: Array<InsertSpec<any>> = []
        const adapter: DatabaseAdapter = {
            select: async <TModel = unknown> (spec: SelectSpec<TModel>) => {
                selectSpecs.push(spec)

                return []
            },
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

        await DB.table('api_tokens')
            .where({ createdAt: new Date('2026-03-01T00:00:00.000Z') } as never)
            .get()

        const created = await DB.table<{ id: string, createdAt: Date, updatedAt: Date, name: string }>('api_tokens')
            .create({ name: 'Token' } as never)

        expect(selectSpecs[0]).toEqual(expect.objectContaining({
            target: expect.objectContaining({
                table: 'api_tokens',
                columns: {
                    createdAt: 'created_at',
                },
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
            }),
            where: {
                type: 'comparison',
                column: 'createdAt',
                operator: '=',
                value: new Date('2026-03-01T00:00:00.000Z'),
            },
        }))
        expect(typeof insertSpecs[0]?.values.id).toBe('string')
        expect(insertSpecs[0]?.values.createdAt).toBeInstanceOf(Date)
        expect(insertSpecs[0]?.values.updatedAt).toBeInstanceOf(Date)
        expect(created.id).toBe(insertSpecs[0]?.values.id)
    })

    it('lets explicit DB options override or disable persisted table metadata', async () => {
        const workspace = makeTempDir('arkormx-db-persisted-metadata-override-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                api_tokens: {
                    columns: {
                        createdAt: 'created_at',
                    },
                    enums: {},
                    primaryKeyGeneration: {
                        column: 'id',
                        strategy: 'uuid',
                        prismaDefault: '@default(uuid())',
                        databaseDefault: 'gen_random_uuid()::text',
                        runtimeFactory: 'uuid',
                    },
                    timestampColumns: [
                        { column: 'createdAt', default: 'now()' },
                    ],
                },
            },
        }, null, 2))

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

        await DB.table('api_tokens', {
            columns: {
                createdAt: 'created_timestamp',
            },
            persistedMetadata: false,
        }).create({ name: 'No persisted metadata' } as never)

        expect(insertSpecs[0]?.target.columns).toEqual({
            createdAt: 'created_timestamp',
        })
        expect(insertSpecs[0]?.target.primaryKeyGeneration).toBeUndefined()
        expect(insertSpecs[0]?.target.timestampColumns).toBeUndefined()
        expect(insertSpecs[0]?.values.id).toBeUndefined()
        expect(insertSpecs[0]?.values.createdAt).toBeUndefined()
    })
})