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
import { Post, Role, User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  deriveCollectionFieldName,
  deriveRelationAlias,
  deriveSingularFieldName,
} from '../../src/helpers/migrations'
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

      protected definition(sequence: number) {
        return {
          id: 2000 + sequence,
          name: `User ${sequence}`,
          email: `user${sequence}@example.com`,
          password: 'secret',
          isActive: 1,
        }
      }
    }

    User.setFactory(UserFactory)

    const factory = User.factory<UserFactory>().state((attributes) => ({
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

  it('supports has, for, hasAttached, and recycle factory relationships', async () => {
    class UserFactory extends ModelFactory<User> {
      protected model = User

      protected definition(sequence: number) {
        return {
          id: 2000 + sequence,
          name: `User ${sequence}`,
          email: `user${sequence}@example.com`,
          password: 'secret',
          isActive: 1,
        }
      }
    }

    class PostFactory extends ModelFactory<Post> {
      protected model = Post

      protected definition(sequence: number) {
        return {
          title: `Post ${sequence}`,
        }
      }
    }

    class RoleFactory extends ModelFactory<Role> {
      protected model = Role

      protected definition(sequence: number) {
        return {
          id: 4000 + sequence,
          name: `Role ${sequence}`,
        }
      }
    }

    User.setFactory(UserFactory)

    const user = await User.factory<UserFactory>()
      .has(new PostFactory().count(2))
      .hasAttached(new RoleFactory().count(2), { approved: true })
      .create()

    const posts = await user.posts().orderBy({ id: 'asc' }).getResults()
    expect(posts.all().map((post) => post.getAttribute('userId'))).toEqual([
      user.getAttribute('id'),
      user.getAttribute('id'),
    ])

    const roles = await user
      .roles()
      .wherePivot('approved', true)
      .orderBy({ id: 'asc' })
      .getResults()
    expect(roles.all().map((role) => role.getAttribute('name'))).toEqual(['Role 0', 'Role 1'])

    let madeParentId: unknown
    let createdParentId: unknown
    const postWithParentFactory = new PostFactory().for(
      new UserFactory()
        .afterMaking((parent) => {
          madeParentId = parent.getAttribute('id')
        })
        .afterCreating((parent) => {
          createdParentId = parent.getAttribute('id')
        }),
    )
    const madePostWithParent = await postWithParentFactory.makeAsync()
    expect(madeParentId).toBe(2000)
    expect(createdParentId).toBe(2000)
    expect(typeof madePostWithParent.getAttribute('userId')).toBe('number')

    const postWithParent = await postWithParentFactory.create()
    expect(typeof postWithParent.getAttribute('userId')).toBe('number')

    const recycledUser = await User.query().find(1)
    if (!recycledUser) throw new Error('Expected recycled user to exist.')

    const recycledPost = await new PostFactory()
      .for(new UserFactory())
      .recycle(recycledUser)
      .create()
    expect(recycledPost.getAttribute('userId')).toBe(1)
  })

  it('supports dependent definitions, configured callbacks, and ordered states', async () => {
    const callbacks: string[] = []

    class UserFactory extends ModelFactory<User> {
      protected model = User

      protected definition(sequence: number) {
        return {
          id: 5000 + sequence,
          name: `User ${sequence}`,
          email: `dependent-user${sequence}@example.com`,
          password: 'secret',
          isActive: 1,
        }
      }
    }

    class DependentPostFactory extends ModelFactory<Post, Record<string, unknown>> {
      protected model = Post

      protected override configure(): void {
        this.afterMaking((post) => {
          callbacks.push(`making:${String(post.getAttribute('title'))}`)
        })
        this.afterCreating((post) => {
          callbacks.push(`created:${String(post.getAttribute('title'))}`)
        })
      }

      protected definition(_sequence: number) {
        return {
          userId: new UserFactory(),
          status: 'draft',
          title: (attributes: Record<string, unknown>) =>
            `Post for ${String(attributes.userId)} (${String(attributes.status)})`,
        }
      }
    }

    const post = await new DependentPostFactory()
      .state((attributes) => ({
        ...attributes,
        status: 'active',
      }))
      .create()

    const userId = post.getAttribute('userId')
    expect(typeof userId).toBe('number')
    expect(post.getAttribute('title')).toBe(`Post for ${String(userId)} (active)`)
    expect(callbacks).toEqual([
      `making:Post for ${String(userId)} (active)`,
      `created:Post for ${String(userId)} (active)`,
    ])

    expect(() => new DependentPostFactory().make()).toThrow(
      'This factory definition creates a related model.',
    )
  })

  it('supports async factory definitions through explicit async factory methods', async () => {
    class AsyncUserFactory extends ModelFactory<User> {
      protected model = User

      protected async definition(sequence: number) {
        return {
          name: `Async User ${sequence}`,
          email: `async-user${sequence}@example.com`,
          password: 'secret',
          isActive: 1,
        }
      }
    }

    const factory = new AsyncUserFactory().state(async (attributes) => ({
      ...attributes,
      name: String(attributes.name).toUpperCase(),
    }))

    expect(() => factory.make()).toThrow(
      'This factory has an async definition. Use makeAsync(), makeManyAsync(), create(), or createMany() instead.',
    )

    const model = await factory.makeAsync()
    expect(model.getAttribute('name')).toBe('ASYNC USER 0')

    const many = await factory.count(2).makeManyAsync()
    expect(many).toHaveLength(2)
    expect(many[0]?.getAttribute('name')).toBe('ASYNC USER 1')
    expect(many[1]?.getAttribute('name')).toBe('ASYNC USER 2')

    const created = await factory.create({ email: 'async-created@example.com' })
    expect(created.getAttribute('name')).toBe('ASYNC USER 3')
    expect(created.getAttribute('email')).toBe('async-created@example.com')
  })

  it('supports seeder execution helpers', async () => {
    class SeedOne extends Seeder {
      public async run(): Promise<void> {
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
      public async run(): Promise<void> {
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
      public async run(): Promise<void> {
        await this.call(SeedOne, SeedTwo)
        await this.call([new SeedOne(), new SeedTwo()])
      }
    }

    const report = await Seeder.runWithReport(new RootSeeder())

    const users = await User.query().whereIn('id', [100, 101]).orderBy({ id: 'asc' }).get()
    expect(users.all().map((model) => model.getAttribute('id'))).toEqual([100, 100, 101, 101])
    expect(report).toEqual(['RootSeeder', 'SeedOne', 'SeedTwo', 'SeedOne', 'SeedTwo'])
  })

  it('supports migration schema planning and prisma schema mutation workflow', async () => {
    class CreateUsersMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('users', (table) => {
          table.uuid('id').primary()
          table.string('email').nullable()
          table.string('status').default('active')
          table.timestamp('deletedAt').nullable().map('deleted_at')
          table.index(['email', 'deletedAt'], 'users_email_deleted_at_idx')
          table.timestamps()
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
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
    expect(applied.schema).toContain(
      '@@index([email, deletedAt], name: "users_email_deleted_at_idx")',
    )

    class AddUserStatusEnumMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table
            .enum('accountStatus', ['ACTIVE', 'INACTIVE', 'SUSPENDED'])
            .enumName('UserStatus')
            .default('ACTIVE')
            .after('status')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    const enumApplied = await applyMigrationToPrismaSchema(AddUserStatusEnumMigration, {
      schemaPath,
    })
    expect(enumApplied.schema).toContain('enum UserStatus {')
    expect(enumApplied.schema).toContain('ACTIVE')
    expect(enumApplied.schema).toContain('INACTIVE')
    expect(enumApplied.schema).toContain('SUSPENDED')
    expect(enumApplied.schema).toContain('accountStatus UserStatus @default(ACTIVE)')

    class AddModerationStatusReuseMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.enum('moderationStatus', 'UserStatus').default('INACTIVE').after('accountStatus')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    const enumReuseApplied = await applyMigrationToPrismaSchema(AddModerationStatusReuseMigration, {
      schemaPath,
    })
    expect(enumReuseApplied.schema).toContain('moderationStatus UserStatus @default(INACTIVE)')

    class AddMissingEnumReuseMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.enum('unknownStatus', 'MissingEnum')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await expect(
      applyMigrationToPrismaSchema(AddMissingEnumReuseMigration, {
        schemaPath,
      }),
    ).rejects.toThrow('Prisma enum [MissingEnum] was not found for column [unknownStatus].')

    class AddInvalidEnumDefaultMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.enum('billingStatus', ['DUE', 'PAID']).enumName('BillingStatus').default('VOID')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await expect(
      applyMigrationToPrismaSchema(AddInvalidEnumDefaultMigration, {
        schemaPath,
      }),
    ).rejects.toThrow(
      'Enum default value [VOID] is not defined in Prisma enum [BillingStatus] for column [billingStatus].',
    )

    class AddInvalidEnumReuseDefaultMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.enum('shippingStatus', 'UserStatus').default('ARCHIVED')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await expect(
      applyMigrationToPrismaSchema(AddInvalidEnumReuseDefaultMigration, {
        schemaPath,
      }),
    ).rejects.toThrow(
      'Enum default value [ARCHIVED] is not defined in Prisma enum [UserStatus] for column [shippingStatus].',
    )

    class AddDuplicateEnumValuesMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.enum('duplicateStatus', ['OPEN', 'CLOSED', 'OPEN']).enumName('DuplicateStatus')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await expect(
      applyMigrationToPrismaSchema(AddDuplicateEnumValuesMigration, {
        schemaPath,
      }),
    ).rejects.toThrow('Enum column [duplicateStatus] contains duplicate enum value [OPEN].')

    class AddInvalidEnumMemberMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.enum('workflowStatus', ['PENDING', 'IN PROGRESS']).enumName('WorkflowStatus')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await expect(
      applyMigrationToPrismaSchema(AddInvalidEnumMemberMigration, {
        schemaPath,
      }),
    ).rejects.toThrow(
      'Enum column [workflowStatus] contains invalid Prisma enum value [IN PROGRESS].',
    )

    class AddNicknameMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table
            .string('nickname')
            .nullable()
            .map('nick_name')
            .after('email')
            .index(['nickname', 'email'], 'users_nickname_email_idx')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await expect(
      runMigrationWithPrisma(AddNicknameMigration, {
        cwd: prismaDirectory,
        schemaPath,
        runGenerate: false,
        runMigrate: false,
      }),
    ).resolves.toMatchObject({ schemaPath })

    const finalSchema = readFileSync(schemaPath, 'utf-8')
    expect(finalSchema).toContain('nickname String? @map("nick_name")')
    expect(finalSchema).toContain('@@index([nickname, email], name: "users_nickname_email_idx")')

    const nicknameLinePosition = finalSchema.indexOf('nickname String?')
    const emailLinePosition = finalSchema.indexOf('email String?')
    expect(nicknameLinePosition).toBeGreaterThan(-1)
    expect(emailLinePosition).toBeGreaterThan(-1)
    expect(nicknameLinePosition).toBeGreaterThan(emailLinePosition)

    class CreateOrdersMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('orders', (table) => {
          table.id()
          table.enum('state', ['PENDING', 'PAID']).enumName('OrderState').default('PENDING')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('orders')
      }
    }

    const ordersApplied = await applyMigrationToPrismaSchema(CreateOrdersMigration, {
      schemaPath,
    })
    expect(ordersApplied.schema).toContain('model Order')
    expect(ordersApplied.schema).toContain('state OrderState @default(PENDING)')
    expect(ordersApplied.schema).toContain('enum OrderState {')

    class CreateInvoicesMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('invoices', (table) => {
          table.id()
          table.enum('state', 'OrderState').default('PAID')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('invoices')
      }
    }

    const invoicesApplied = await applyMigrationToPrismaSchema(CreateInvoicesMigration, {
      schemaPath,
    })
    expect(invoicesApplied.schema).toContain('model Invoice')
    expect(invoicesApplied.schema).toContain('state OrderState @default(PAID)')

    class CreateApiKeysMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('api_keys', (table) => {
          table.string('key').primary()
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('api_keys')
      }
    }

    const apiKeysApplied = await applyMigrationToPrismaSchema(CreateApiKeysMigration, {
      schemaPath,
    })
    expect(apiKeysApplied.schema).toContain('key String @id')

    class CreateManualPrimaryMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('manual_ids', (table) => {
          table.integer('id').primary({ autoIncrement: false, default: 42 })
        })
        schema.createTable('slugs', (table) => {
          table.string('slug')
          table.primary('slug')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('manual_ids')
        schema.dropTable('slugs')
      }
    }

    const manualPrimaryApplied = await applyMigrationToPrismaSchema(CreateManualPrimaryMigration, {
      schemaPath,
    })
    expect(manualPrimaryApplied.schema).toContain('id Int @id @default(42)')
    expect(manualPrimaryApplied.schema).toContain('slug String @id')

    class CreateMembershipsMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('memberships', (table) => {
          table.integer('userId').map('user_id')
          table.integer('teamId').map('team_id')
          table.string('role')
          table.primary(['userId', 'teamId'], 'membershipIdentity')
          table.unique(['teamId', 'role'], 'membershipRoleIdentity')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('memberships')
      }
    }

    const membershipPlan = await getMigrationPlan(CreateMembershipsMigration, 'up')
    expect(membershipPlan[0]).toMatchObject({
      type: 'createTable',
      table: 'memberships',
      primaryKey: {
        columns: ['userId', 'teamId'],
        name: 'membershipIdentity',
      },
      uniqueConstraints: [
        {
          columns: ['teamId', 'role'],
          name: 'membershipRoleIdentity',
        },
      ],
    })

    const membershipsApplied = await applyMigrationToPrismaSchema(CreateMembershipsMigration, {
      schemaPath,
    })
    expect(membershipsApplied.schema).toContain(
      '@@id([userId, teamId], name: "membershipIdentity")',
    )
    expect(membershipsApplied.schema).toContain(
      '@@unique([teamId, role], name: "membershipRoleIdentity")',
    )
    expect(membershipsApplied.schema).not.toContain('userId Int @id')
    expect(membershipsApplied.schema).not.toContain('teamId Int @id')

    class CreateAssignmentsMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('assignments', (table) => {
          table.integer('accountId')
          table.string('code')
          table.string('source')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('assignments')
      }
    }

    class AddAssignmentsPrimaryKeyMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('assignments', (table) => {
          table.primary(['accountId', 'code'])
          table.unique(['accountId', 'source'], 'assignmentSourceIdentity')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    await applyMigrationToPrismaSchema(CreateAssignmentsMigration, {
      schemaPath,
    })
    const assignmentPlan = await getMigrationPlan(AddAssignmentsPrimaryKeyMigration, 'up')
    expect(assignmentPlan[0]).toMatchObject({
      type: 'alterTable',
      addPrimaryKey: {
        columns: ['accountId', 'code'],
      },
      addUniqueConstraints: [
        {
          columns: ['accountId', 'source'],
          name: 'assignmentSourceIdentity',
        },
      ],
    })

    const assignmentsApplied = await applyMigrationToPrismaSchema(
      AddAssignmentsPrimaryKeyMigration,
      {
        schemaPath,
      },
    )
    expect(assignmentsApplied.schema).toContain('@@id([accountId, code])')
    expect(assignmentsApplied.schema).toContain(
      '@@unique([accountId, source], name: "assignmentSourceIdentity")',
    )

    expect(() =>
      new SchemaBuilder().createTable('invalid_memberships', (table) => {
        table.integer('userId')
        table.primary(['userId', 'missingId'])
      }),
    ).toThrow('Composite primary key column [missingId] was not found')

    expect(() =>
      new SchemaBuilder().createTable('conflicting_memberships', (table) => {
        table.id()
        table.integer('teamId')
        table.primary(['id', 'teamId'])
      }),
    ).toThrow('cannot combine column primary keys with a composite primary key')

    expect(() =>
      new SchemaBuilder().createTable('invalid_unique_memberships', (table) => {
        table.integer('userId')
        table.unique(['userId', 'missingId'])
      }),
    ).toThrow('Composite unique constraint column [missingId] was not found')

    expect(() =>
      new SchemaBuilder().createTable('duplicate_unique_memberships', (table) => {
        table.integer('userId')
        table.integer('teamId')
        table.unique(['userId', 'teamId'])
        table.unique(['userId', 'teamId'])
      }),
    ).toThrow('has already been defined')

    class CreateTokensMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('tokens', (table) => {
          table.id()
          table.integer('userId')
          table.string('value')
          table
            .foreignKey('userId')
            .references('users', 'id')
            .onDelete('cascade')
            .alias('TokenUser')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('tokens')
      }
    }

    const tokensApplied = await applyMigrationToPrismaSchema(CreateTokensMigration, {
      schemaPath,
    })
    expect(tokensApplied.schema).toContain(
      'user User @relation("TokenUser", fields: [userId], references: [id], onDelete: Cascade)',
    )
    expect(tokensApplied.schema).toContain('tokens Token[] @relation("TokenUser")')

    class AddOwnerTokenRelationAliasMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('tokens', (table) => {
          table
            .foreignKey('userId')
            .references('users', 'id')
            .onDelete('cascade')
            .alias('TokenOwner')
            .as('owner')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    const aliasedApplied = await applyMigrationToPrismaSchema(AddOwnerTokenRelationAliasMigration, {
      schemaPath,
    })
    expect(aliasedApplied.schema).toContain(
      'owner User @relation("TokenOwner", fields: [userId], references: [id], onDelete: Cascade)',
    )

    class CreatePersonalAccessTokensMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('personal_access_tokens', (table) => {
          table.id()
          table.integer('userId')
          table.string('token')
          table
            .foreignKey('userId')
            .references('users', 'id')
            .onDelete('cascade')
            .alias('TokenOwner')
            .as('owner')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('personal_access_tokens')
      }
    }

    const personalTokensApplied = await applyMigrationToPrismaSchema(
      CreatePersonalAccessTokensMigration,
      {
        schemaPath,
      },
    )
    expect(personalTokensApplied.schema).toContain(
      'owner User @relation("TokenOwner", fields: [userId], references: [id], onDelete: Cascade)',
    )
    expect(personalTokensApplied.schema).toContain(
      'personalAccessTokens PersonalAccessToken[] @relation("TokenOwner")',
    )

    class CreateNextOfKinsMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('next_of_kins', (table) => {
          table.id()
          table.uuid('userId').foreign().references('users', 'id').onDelete('cascade')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('next_of_kins')
      }
    }

    const nextOfKinsApplied = await applyMigrationToPrismaSchema(CreateNextOfKinsMigration, {
      schemaPath,
    })
    expect(nextOfKinsApplied.schema).toContain(
      'user User @relation("NextOfKinUser", fields: [userId], references: [id], onDelete: Cascade)',
    )
    expect(nextOfKinsApplied.schema).toContain('nextOfKins NextOfKin[] @relation("NextOfKinUser")')

    class CreateStandaloneNextOfKinMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('standalone_next_of_kins', (table) => {
          table.uuid('id').primary()
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('standalone_next_of_kins')
      }
    }

    await applyMigrationToPrismaSchema(CreateStandaloneNextOfKinMigration, {
      schemaPath,
    })

    class AddUserNextOfKinOneToOneMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.alterTable('users', (table) => {
          table.uuid('nokId').nullable().unique().map('nok_id')
          table.foreignKey('nokId').references('standalone_next_of_kins', 'id').as('nextOfKin')
        })
      }

      public async down(_schema: SchemaBuilder): Promise<void> {}
    }

    const oneToOneApplied = await applyMigrationToPrismaSchema(AddUserNextOfKinOneToOneMigration, {
      schemaPath,
    })
    expect(oneToOneApplied.schema).toContain('nokId String? @unique @map("nok_id")')
    expect(oneToOneApplied.schema).toContain(
      'nextOfKin StandaloneNextOfKin? @relation("StandaloneNextOfKinUser", fields: [nokId], references: [id])',
    )
    expect(oneToOneApplied.schema).toContain('user User? @relation("StandaloneNextOfKinUser")')

    rmSync(directory, { recursive: true, force: true })
    rmSync(prismaDirectory, { recursive: true, force: true })
  })

  it('adds generated UUID defaults for string primary keys in migration metadata and Prisma schema', async () => {
    class CreateApiTokensMigration extends Migration {
      public async up(schema: SchemaBuilder): Promise<void> {
        schema.createTable('api_tokens', (table) => {
          table.id('id', 'string').primary()
          table.string('name')
        })
      }

      public async down(schema: SchemaBuilder): Promise<void> {
        schema.dropTable('api_tokens')
      }
    }

    const upPlan = await getMigrationPlan(CreateApiTokensMigration, 'up')
    expect(upPlan[0]).toMatchObject({
      type: 'createTable',
      table: 'api_tokens',
      columns: expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          type: 'string',
          primary: true,
          primaryKeyGeneration: expect.objectContaining({
            strategy: 'uuid',
            prismaDefault: '@default(uuid())',
            databaseDefault: 'gen_random_uuid()::text',
            runtimeFactory: 'uuid',
          }),
        }),
      ]),
    })

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

    const applied = await applyMigrationToPrismaSchema(CreateApiTokensMigration, {
      schemaPath,
    })

    expect(applied.schema).toContain('id String @id @default(uuid())')
    expect(applied.schema).toContain('name String')

    rmSync(prismaDirectory, { recursive: true, force: true })
  })

  it('derives inverse relation naming conventions', () => {
    expect(deriveCollectionFieldName('PersonalAccessToken')).toBe('personalAccessTokens')
    expect(deriveCollectionFieldName('Token')).toBe('tokens')
    expect(deriveCollectionFieldName('NextOfKin')).toBe('nextOfKins')
    expect(deriveSingularFieldName('User')).toBe('user')
    expect(deriveSingularFieldName('NextOfKin')).toBe('nextOfKin')

    expect(deriveRelationAlias('PersonalAccessToken', 'User')).toBe('PersonalAccessTokenUser')
    expect(deriveRelationAlias('Token', 'User')).toBe('TokenUser')
    expect(deriveRelationAlias('NextOfKin', 'User')).toBe('NextOfKinUser')
    expect(deriveRelationAlias('User', 'NextOfKin')).toBe('NextOfKinUser')
    expect(deriveRelationAlias('PersonalAccessToken', 'User', 'UserTokens')).toBe('UserTokens')
  })
})
