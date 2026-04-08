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
})
