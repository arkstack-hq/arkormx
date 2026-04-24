import type { AggregateSpec, DatabaseAdapter, DeleteSpec, InsertSpec, SelectSpec, UpdateSpec } from '../../src/types/adapter'

import { Model, configureArkormRuntime, resetArkormRuntimeForTests } from '../../src'
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
    resetArkormRuntimeForTests()

    tempDirectories.splice(0).forEach((directory) => {
        rmSync(directory, { recursive: true, force: true })
    })
})

describe('persisted column mappings', () => {
    it('merges persisted mappings into model metadata for adapter-backed queries', async () => {
        const workspace = makeTempDir('arkormx-column-mappings-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                app_users: {
                    columns: {
                        emailVerificationCode: 'email_verification_code',
                    },
                    enums: {},
                },
            },
        }, null, 2))

        class PersistedUser extends Model {
            protected static override table = 'app_users'
        }

        const selectSpecs: Array<SelectSpec<any>> = []
        const adapter: DatabaseAdapter = {
            select: async <TModel = unknown> (spec: SelectSpec<TModel>) => {
                selectSpecs.push(spec)

                return []
            },
            selectOne: async <TModel = unknown> (_spec: SelectSpec<TModel>) => null,
            insert: async <TModel = unknown> (_spec: InsertSpec<TModel>) => ({}),
            update: async <TModel = unknown> (_spec: UpdateSpec<TModel>) => ({}),
            delete: async <TModel = unknown> (_spec: DeleteSpec<TModel>) => ({}),
            count: async <TModel = unknown> (_spec: AggregateSpec<TModel>) => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => {
                return await callback(adapter)
            },
        }

        PersistedUser.setAdapter(adapter)

        try {
            expect(PersistedUser.getColumnMap()).toEqual({
                emailVerificationCode: 'email_verification_code',
            })
            expect(PersistedUser.getColumnName('emailVerificationCode')).toBe('email_verification_code')

            await PersistedUser.query()
                .where({ emailVerificationCode: 'abc123' } as never)
                .orderBy({ emailVerificationCode: 'asc' } as never)
                .get()

            expect(selectSpecs[0]).toEqual(expect.objectContaining({
                target: expect.objectContaining({
                    table: 'app_users',
                    columns: {
                        emailVerificationCode: 'email_verification_code',
                    },
                }),
                where: {
                    type: 'comparison',
                    column: 'emailVerificationCode',
                    operator: '=',
                    value: 'abc123',
                },
                orderBy: [{
                    column: 'emailVerificationCode',
                    direction: 'asc',
                }],
            }))
        } finally {
            PersistedUser.setAdapter(undefined)
        }
    })

    it('lets explicit model column metadata override persisted mappings', () => {
        const workspace = makeTempDir('arkormx-column-mappings-override-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                app_users: {
                    columns: {
                        emailVerificationCode: 'email_verification_code',
                    },
                    enums: {},
                },
            },
        }, null, 2))

        class ExplicitUser extends Model {
            protected static override table = 'app_users'
            protected static override columns = {
                emailVerificationCode: 'custom_verification_code',
            }
        }

        expect(ExplicitUser.getColumnMap()).toEqual({
            emailVerificationCode: 'custom_verification_code',
        })
    })

    it('throws a clear error for non-Prisma adapters when persisted column mappings are disabled', () => {
        const workspace = makeTempDir('arkormx-column-mappings-disabled-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                app_users: {
                    columns: {
                        emailVerificationCode: 'email_verification_code',
                    },
                    enums: {},
                },
            },
        }, null, 2))

        class PersistedUser extends Model {
            protected static override table = 'app_users'
        }

        configureArkormRuntime(undefined, {
            adapter: {
                select: async () => [],
                selectOne: async () => null,
                insert: async () => ({}),
                update: async () => ({}),
                delete: async () => ({}),
                count: async () => 0,
                exists: async () => false,
                transaction: async <TResult = unknown> (
                    callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
                ): Promise<TResult> => await callback({} as DatabaseAdapter),
            } as DatabaseAdapter,
            features: {
                persistedColumnMappings: false,
            },
        })

        expect(() => PersistedUser.getColumnMap()).toThrow(/persisted column mappings/)
    })

    it('exposes persisted primary key generation metadata on model metadata', () => {
        const workspace = makeTempDir('arkormx-column-mappings-pk-generation-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                api_tokens: {
                    columns: {},
                    enums: {},
                    primaryKeyGeneration: {
                        column: 'id',
                        strategy: 'uuid',
                        prismaDefault: '@default(uuid())',
                        databaseDefault: 'gen_random_uuid()::text',
                        runtimeFactory: 'uuid',
                    },
                },
            },
        }, null, 2))

        class ApiToken extends Model {
            protected static override table = 'api_tokens'
        }

        expect(ApiToken.getModelMetadata()).toEqual(expect.objectContaining({
            primaryKeyGeneration: {
                strategy: 'uuid',
                prismaDefault: '@default(uuid())',
                databaseDefault: 'gen_random_uuid()::text',
                runtimeFactory: 'uuid',
            },
        }))
    })

    it('exposes persisted timestamp metadata on model metadata', () => {
        const workspace = makeTempDir('arkormx-column-mappings-timestamps-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                posts: {
                    columns: {},
                    enums: {},
                    timestampColumns: [
                        { column: 'createdAt', default: 'now()' },
                        { column: 'updatedAt', updatedAt: true },
                    ],
                },
            },
        }, null, 2))

        class Post extends Model {
            protected static override table = 'posts'
        }

        expect(Post.getModelMetadata()).toEqual(expect.objectContaining({
            timestampColumns: [
                { column: 'createdAt', default: 'now()' },
                { column: 'updatedAt', updatedAt: true },
            ],
        }))
    })

    it('generates missing primary keys for non-Prisma adapter inserts', async () => {
        const workspace = makeTempDir('arkormx-column-mappings-pk-fallback-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                api_tokens: {
                    columns: {},
                    enums: {},
                    primaryKeyGeneration: {
                        column: 'id',
                        strategy: 'uuid',
                        prismaDefault: '@default(uuid())',
                        databaseDefault: 'gen_random_uuid()::text',
                        runtimeFactory: 'uuid',
                    },
                },
            },
        }, null, 2))

        class ApiToken extends Model {
            protected static override table = 'api_tokens'
        }

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

        ApiToken.setAdapter(adapter)

        try {
            const created = await ApiToken.query().create({ name: 'Personal token' } as never)
            const insertedId = insertSpecs[0]?.values.id

            expect(typeof insertedId).toBe('string')
            expect(insertedId).toMatch(/^[0-9a-f-]{36}$/)
            expect(created.getAttribute('id')).toBe(insertedId)
        } finally {
            ApiToken.setAdapter(undefined)
        }
    })

    it('hydrates missing timestamp columns for non-Prisma inserts and updates', async () => {
        const workspace = makeTempDir('arkormx-column-mappings-timestamp-fallback-')
        process.chdir(workspace)

        mkdirSync(join(workspace, '.arkormx'), { recursive: true })
        writeFileSync(join(workspace, '.arkormx', 'column-mappings.json'), JSON.stringify({
            version: 1,
            tables: {
                posts: {
                    columns: {},
                    enums: {},
                    timestampColumns: [
                        { column: 'createdAt', default: 'now()' },
                        { column: 'updatedAt', updatedAt: true },
                    ],
                },
            },
        }, null, 2))

        class Post extends Model {
            protected static override table = 'posts'
        }

        const insertSpecs: Array<InsertSpec<any>> = []
        const updateSpecs: Array<UpdateSpec<any>> = []
        const adapter: DatabaseAdapter = {
            select: async () => [],
            selectOne: async () => null,
            insert: async <TModel = unknown> (spec: InsertSpec<TModel>) => {
                insertSpecs.push(spec)

                return { id: 1, ...spec.values }
            },
            update: async <TModel = unknown> (spec: UpdateSpec<TModel>) => {
                updateSpecs.push(spec)

                return { id: 1, title: 'Updated', ...spec.values }
            },
            delete: async () => ({}),
            count: async () => 0,
            exists: async () => false,
            transaction: async <TResult = unknown> (
                callback: (adapter: DatabaseAdapter) => TResult | Promise<TResult>,
            ): Promise<TResult> => await callback(adapter),
        }

        Post.setAdapter(adapter)

        try {
            const created = await Post.query().create({ title: 'Draft' } as never)
            const createdValues = insertSpecs[0]?.values

            expect(createdValues?.createdAt).toBeInstanceOf(Date)
            expect(createdValues?.updatedAt).toBeInstanceOf(Date)
            expect(created.getAttribute('createdAt')).toBeInstanceOf(Date)
            expect(created.getAttribute('updatedAt')).toBeInstanceOf(Date)

            await Post.query().where({ id: 1 } as never).update({ title: 'Updated' } as never)
            const updatedValues = updateSpecs[0]?.values

            expect(updatedValues?.title).toBe('Updated')
            expect(updatedValues?.updatedAt).toBeInstanceOf(Date)
            expect(updatedValues?.createdAt).toBeUndefined()
        } finally {
            Post.setAdapter(undefined)
        }
    })
})
