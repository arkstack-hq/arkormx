import {
    Migration,
    ModelFactory,
    SchemaBuilder,
    Seeder,
    applyMigrationToPrismaSchema,
    generateMigrationFile,
    getMigrationPlan,
    runMigrationWithPrisma,
} from '../../src'
import { deriveCollectionFieldName, deriveInverseRelationAlias } from '../../src/helpers/migrations'
import { User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Database migration, seeding and factory helpers', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('supports class-based factories via model factory access', async () => {
        class UserFactory extends ModelFactory<User> {
            protected model = User

            protected definition (sequence: number) {
                return {
                    name: `User ${sequence}`,
                    email: `user${sequence}@example.com`,
                    password: 'secret',
                    isActive: 1,
                }
            }
        }

        User.setFactory(UserFactory)

        const factory = User.factory<UserFactory>().state(attributes => ({
            ...attributes,
            name: String(attributes.name).toUpperCase(),
        }))

        const model = factory.make()
        expect(model.getAttribute('name')).toBe('USER 0')

        const created = await factory.create({ email: 'special@example.com' })
        expect(created.getAttribute('email')).toBe('special@example.com')

        const createdMany = await factory.count(2).createMany()
        expect(createdMany).toHaveLength(2)
        expect(createdMany[0]?.getAttribute('name')).toBe('USER 2')
        expect(createdMany[1]?.getAttribute('name')).toBe('USER 3')

        const directFactory = new UserFactory().count(1)
        const directModel = directFactory.make()
        expect(directModel.getAttribute('name')).toBe('User 0')
    })

    it('supports seeder execution helpers', async () => {
        class SeedOne extends Seeder {
            public async run (): Promise<void> {
                await User.query().create({
                    id: 100,
                    name: 'Seed One',
                    email: 'seed-one@example.com',
                    password: 'secret',
                    isActive: 1,
                })
            }
        }

        class SeedTwo extends Seeder {
            public async run (): Promise<void> {
                await User.query().create({
                    id: 101,
                    name: 'Seed Two',
                    email: 'seed-two@example.com',
                    password: 'secret',
                    isActive: 1,
                })
            }
        }

        class RootSeeder extends Seeder {
            public async run (): Promise<void> {
                await this.call(SeedOne, SeedTwo)
                await this.call([new SeedOne(), new SeedTwo()])
            }
        }

        await new RootSeeder().run()

        const users = await User.query().whereIn('id', [100, 101]).orderBy({ id: 'asc' }).get()
        expect(users.all().map(model => model.getAttribute('id'))).toEqual([100, 100, 101, 101])
    })

    it('supports migration schema planning and prisma schema mutation workflow', async () => {
        class CreateUsersMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.createTable('users', table => {
                    table.uuid('id').primary()
                    table.string('email').nullable()
                    table.string('status').default('active')
                    table.timestamp('deletedAt').nullable().map('deleted_at')
                    table.index(['email', 'deletedAt'], 'users_email_deleted_at_idx')
                    table.timestamps()
                })
            }

            public async down (schema: SchemaBuilder): Promise<void> {
                schema.dropTable('users')
            }
        }

        const upPlan = await getMigrationPlan(CreateUsersMigration, 'up')
        expect(upPlan).toHaveLength(1)
        expect(upPlan[0]).toMatchObject({
            type: 'createTable',
            table: 'users',
        })

        const downPlan = await getMigrationPlan(new CreateUsersMigration(), 'down')
        expect(downPlan).toEqual([
            {
                type: 'dropTable',
                table: 'users',
            },
        ])

        const directory = mkdtempSync(join(tmpdir(), 'arkormx-migration-'))
        const generated = generateMigrationFile('create users table', {
            directory,
        })

        const fileContent = readFileSync(generated.filePath, 'utf-8')
        expect(generated.fileName).toMatch(/^\d{14}_create_users_table\.ts$/)
        expect(generated.className).toBe('CreateUsersTableMigration')
        expect(fileContent).toContain('extends Migration')

        const prismaDirectory = mkdtempSync(join(tmpdir(), 'arkormx-prisma-schema-'))
        const schemaPath = join(prismaDirectory, 'schema.prisma')
        const schemaSource = [
            'generator client {',
            '  provider = "prisma-client-js"',
            '}',
            '',
            'datasource db {',
            '  provider = "postgresql"',
            '}',
            '',
        ].join('\n')

        writeFileSync(schemaPath, schemaSource)

        const applied = await applyMigrationToPrismaSchema(CreateUsersMigration, {
            schemaPath,
        })
        expect(applied.operations).toHaveLength(1)
        expect(applied.schema).toContain('model User')
        expect(applied.schema).toContain('id String @id @default(uuid())')
        expect(applied.schema).toContain('email String?')
        expect(applied.schema).toContain('status String @default("active")')
        expect(applied.schema).toContain('deletedAt DateTime? @map("deleted_at")')
        expect(applied.schema).toContain('createdAt DateTime @default(now())')
        expect(applied.schema).toContain('updatedAt DateTime @updatedAt')
        expect(applied.schema).toContain('@@index([email, deletedAt], name: "users_email_deleted_at_idx")')

        class AddNicknameMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.alterTable('users', table => {
                    table.string('nickname').nullable().map('nick_name').after('email').index(['nickname', 'email'], 'users_nickname_email_idx')
                })
            }

            public async down (_schema: SchemaBuilder): Promise<void> {
            }
        }

        await expect(runMigrationWithPrisma(AddNicknameMigration, {
            cwd: prismaDirectory,
            schemaPath,
            runGenerate: false,
            runMigrate: false,
        })).resolves.toMatchObject({ schemaPath })

        const finalSchema = readFileSync(schemaPath, 'utf-8')
        expect(finalSchema).toContain('nickname String? @map("nick_name")')
        expect(finalSchema).toContain('@@index([nickname, email], name: "users_nickname_email_idx")')

        const nicknameLinePosition = finalSchema.indexOf('nickname String?')
        const emailLinePosition = finalSchema.indexOf('email String?')
        expect(nicknameLinePosition).toBeGreaterThan(-1)
        expect(emailLinePosition).toBeGreaterThan(-1)
        expect(nicknameLinePosition).toBeGreaterThan(emailLinePosition)

        class CreateApiKeysMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.createTable('api_keys', table => {
                    table.string('key').primary()
                })
            }

            public async down (schema: SchemaBuilder): Promise<void> {
                schema.dropTable('api_keys')
            }
        }

        const apiKeysApplied = await applyMigrationToPrismaSchema(CreateApiKeysMigration, {
            schemaPath,
        })
        expect(apiKeysApplied.schema).toContain('key String @id')

        class CreateManualPrimaryMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.createTable('manual_ids', table => {
                    table.integer('id').primary({ autoIncrement: false, default: 42 })
                })
                schema.createTable('slugs', table => {
                    table.string('slug')
                    table.primary('slug')
                })
            }

            public async down (schema: SchemaBuilder): Promise<void> {
                schema.dropTable('manual_ids')
                schema.dropTable('slugs')
            }
        }

        const manualPrimaryApplied = await applyMigrationToPrismaSchema(CreateManualPrimaryMigration, {
            schemaPath,
        })
        expect(manualPrimaryApplied.schema).toContain('id Int @id @default(42)')
        expect(manualPrimaryApplied.schema).toContain('slug String @id')

        class CreateTokensMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.createTable('tokens', table => {
                    table.id()
                    table.integer('userId')
                    table.string('value')
                    table.foreignKey('userId').references('users', 'id').onDelete('cascade').alias('TokenUser')
                })
            }

            public async down (schema: SchemaBuilder): Promise<void> {
                schema.dropTable('tokens')
            }
        }

        const tokensApplied = await applyMigrationToPrismaSchema(CreateTokensMigration, {
            schemaPath,
        })
        expect(tokensApplied.schema).toContain('user User @relation("TokenUser", fields: [userId], references: [id], onDelete: Cascade)')
        expect(tokensApplied.schema).toContain('tokens Token[] @relation("TokenUser")')

        class AddOwnerTokenRelationAliasMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.alterTable('tokens', table => {
                    table.foreignKey('userId').references('users', 'id').onDelete('cascade').alias('TokenOwner').as('owner')
                })
            }

            public async down (_schema: SchemaBuilder): Promise<void> {
            }
        }

        const aliasedApplied = await applyMigrationToPrismaSchema(AddOwnerTokenRelationAliasMigration, {
            schemaPath,
        })
        expect(aliasedApplied.schema).toContain('owner User @relation("TokenOwner", fields: [userId], references: [id], onDelete: Cascade)')

        class CreatePersonalAccessTokensMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.createTable('personal_access_tokens', table => {
                    table.id()
                    table.integer('userId')
                    table.string('token')
                    table.foreignKey('userId').references('users', 'id').onDelete('cascade').alias('TokenOwner').as('owner')
                })
            }

            public async down (schema: SchemaBuilder): Promise<void> {
                schema.dropTable('personal_access_tokens')
            }
        }

        const personalTokensApplied = await applyMigrationToPrismaSchema(CreatePersonalAccessTokensMigration, {
            schemaPath,
        })
        expect(personalTokensApplied.schema).toContain('owner User @relation("TokenOwner", fields: [userId], references: [id], onDelete: Cascade)')
        expect(personalTokensApplied.schema).toContain('personalAccessTokens PersonalAccessToken[] @relation("TokenUser")')

        rmSync(directory, { recursive: true, force: true })
        rmSync(prismaDirectory, { recursive: true, force: true })
    })

    it('derives inverse relation naming conventions', () => {
        expect(deriveCollectionFieldName('PersonalAccessToken')).toBe('personalAccessTokens')
        expect(deriveCollectionFieldName('Token')).toBe('tokens')

        expect(deriveInverseRelationAlias('PersonalAccessToken', 'User')).toBe('TokenUser')
        expect(deriveInverseRelationAlias('Token', 'User')).toBe('TokenUser')
        expect(deriveInverseRelationAlias('PersonalAccessToken', 'User', 'UserTokens')).toBe('UserTokens')
    })
})
