import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import {
    applyMigrationToPrismaSchema,
    Migration,
    ModelFactory,
    SchemaBuilder,
    generateMigrationFile,
    getMigrationPlan,
    runMigrationWithPrisma,
    Seeder,
} from '../../src'
import { User, setupCoreRuntime } from './helpers/core-fixtures'

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
                    table.id()
                    table.string('email', { unique: true })
                    table.timestamps()
                    table.softDeletes()
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

        const directory = mkdtempSync(join(tmpdir(), 'arkorm-migration-'))
        const generated = generateMigrationFile('create users table', {
            directory,
        })

        const fileContent = readFileSync(generated.filePath, 'utf-8')
        expect(generated.fileName).toMatch(/^\d{14}_create_users_table\.ts$/)
        expect(generated.className).toBe('CreateUsersTableMigration')
        expect(fileContent).toContain('extends Migration')

        const prismaDirectory = mkdtempSync(join(tmpdir(), 'arkorm-prisma-schema-'))
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
        expect(applied.schema).toContain('deletedAt DateTime?')

        class AddNicknameMigration extends Migration {
            public async up (schema: SchemaBuilder): Promise<void> {
                schema.alterTable('users', table => {
                    table.string('nickname', { nullable: true })
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
        expect(finalSchema).toContain('nickname String?')

        rmSync(directory, { recursive: true, force: true })
        rmSync(prismaDirectory, { recursive: true, force: true })
    })
})
