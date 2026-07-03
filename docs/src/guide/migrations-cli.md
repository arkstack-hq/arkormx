# Migrations and CLI

Arkorm provides CLI helpers for generating models, factories, seeders, and
migration classes. Migrations can execute through an adapter-backed database
or update `schema.prisma` on the Prisma compatibility path.

## Initialize config

Use this once per project to scaffold `arkormx.config.*` and bootstrap the expected directory structure.

```sh
npx arkorm init
```

Pass `--force` to re-run `init` in an already-configured project; the existing
`arkormx.config.*` is backed up before being replaced.

## Generate files

Use generators to create consistent project files quickly:

- `make:model`: creates a model class. Add `--all` to also generate factory, seeder, and migration, or select individual companions with `--factory`, `--seeder`, and `--migration`. Use `--pivot` (`-p`) to scaffold an intermediate pivot model.
- `make:factory`: creates a factory class for model test/seed data generation.
- `make:seeder`: creates a seeder class used by the `seed` command.
- `make:migration`: creates a timestamped migration class file.

All `make:*` generators accept `--force` (`-f`) to overwrite an existing file.

```sh
npx arkorm make:model User
npx arkorm make:model User --all
npx arkorm make:model User --factory --migration
npx arkorm make:model RoleUser --pivot
npx arkorm make:factory User
npx arkorm make:seeder Database
npx arkorm make:migration "create users table"
npx arkorm make:model User --force
```

## Author migrations

Migration classes implement `up()` and `down()`. Keep the two methods
symmetrical so `migrate:rollback` can reverse the change.

```ts
import { Migration, SchemaBuilder } from 'arkormx'

export class CreateUsersTableMigration extends Migration {
  public up(schema: SchemaBuilder): void {
    schema.createTable('users', (table) => {
      table.id()
      table.string('name')
      table.string('email').unique()
      table.boolean('isActive').default(true).map('is_active')
      table.timestamps()
      table.softDeletes()

      table.index('email', 'users_email_index')
    })
  }

  public down(schema: SchemaBuilder): void {
    schema.dropTable('users')
  }
}
```

Alter an existing table with `alterTable()`:

```ts
export class AddBioToUsersMigration extends Migration {
  public up(schema: SchemaBuilder): void {
    schema.alterTable('users', (table) => {
      table.text('bio').nullable()
    })
  }

  public down(schema: SchemaBuilder): void {
    schema.alterTable('users', (table) => {
      table.dropColumn('bio')
    })
  }
}
```

`up()` and `down()` may be synchronous or asynchronous. The schema builder
records operations; the active migration backend decides whether to execute
them against the database or apply them to Prisma schema text.

### Changing existing columns

Redefine a column in place by chaining `.change()` at the end of a normal column
definition inside `alterTable()`. The redefined type, nullability, default, and
(for enums) values replace the existing column:

```ts
export class TweakUsersMigration extends Migration {
  public up(schema: SchemaBuilder): void {
    schema.alterTable('users', (table) => {
      table.string('status').default('active').change() // type / default / not-null
      table.bigInteger('points').nullable().change() // widen integer -> bigint
      table.enum('role', ['admin', 'editor', 'viewer']).change() // change enum values
    })
  }

  public down(schema: SchemaBuilder): void {
    schema.alterTable('users', (table) => {
      table.string('status').nullable().change()
    })
  }
}
```

On the database-backed (Kysely) adapter, `.change()` emits `ALTER COLUMN`
statements for the type (with a `USING` cast), nullability, and default, and
re-applies a single-column unique constraint when `.unique()` is chained. Enum
value changes recreate the enum type (rename → create → re-point the column →
drop), which keeps the change transaction-safe. On the Prisma compatibility path
the matching field line in `schema.prisma` is rewritten.

Notes and limits: `.change()` redefines the full column signature, so include
every modifier you want to keep (an omitted `.default()` drops the default, an
omitted `.nullable()` makes it `NOT NULL`). Type conversions that PostgreSQL
cannot cast implicitly (e.g. text → integer with non-numeric data, or setting
`NOT NULL` on a column that contains nulls) still require a manual data fix or a
raw migration. Dropping a unique constraint or index is done with explicit
operations rather than through `.change()`.

### Post-migration hook

Besides `up()` and `down()`, a migration may define an optional
`done(direction)` hook. It runs after the migration's schema operations have
been applied to the database, for whichever direction ran — useful for seeding
or data backfills once the schema is in place:

```ts
export class CreateRolesMigration extends Migration {
  public up(schema: SchemaBuilder): void {
    schema.createTable('roles', (table) => {
      table.id()
      table.string('slug').unique()
    })
  }

  public down(schema: SchemaBuilder): void {
    schema.dropTable('roles')
  }

  public async done(direction: 'up' | 'down'): Promise<void> {
    if (direction === 'up') {
      await DB.table('roles').insert([{ slug: 'owner' }, { slug: 'member' }])
    }
  }
}
```

`done()` fires on the database-backed migration path (`migrate`, `migrate:fresh`,
and `migrate:rollback`) once the schema operations succeed.

## Generated columns

`table.generated(name, expression, options)` defines a PostgreSQL
`GENERATED ALWAYS AS (…) STORED` column — a value the database computes from the
row's own columns on every write. This gives you zero write-path code,
database-guaranteed consistency, and a fast, indexable `GROUP BY`.

The expression may be a raw SQL string or an
[expression-builder](./expressions.md) factory:

```ts
schema.createTable('line_items', (table) => {
  table.id()
  table.integer('price')
  table.integer('quantity')

  // String form
  table.generated('total_cents', '"price" * "quantity" * 100', { type: 'integer' })

  // Expression-builder form
  table.generated('total', (e) => e.col('price').times(e.col('quantity')), { type: 'integer' })

  table.index('total') // generated columns are indexable
})
```

`options` accepts `type` (the column type, default `text`), `stored` (default
`true`), and `nullable`.

Constraints: the expression must be **immutable** and reference only the row's
own columns (no subqueries or references to other tables — use a
[computed attribute](./expressions.md#computed-virtual-attributes) for
cross-table logic). Generated columns are read-only: the database rejects any
attempt to write them, and the generated Prisma schema models them as
`@default(dbgenerated("…"))` so Prisma never writes the value.

## Schema builder reference

`SchemaBuilder` supports:

- `createTable(name, callback)`
- `alterTable(name, callback)`
- `dropTable(name)`

It also exposes static helpers for temporarily disabling foreign-key
constraint enforcement (see [Toggling foreign-key
constraints](#toggling-foreign-key-constraints)):

- `SchemaBuilder.disableForeignKeyConstraints()`
- `SchemaBuilder.enableForeignKeyConstraints()`
- `SchemaBuilder.withoutForeignKeyConstraints(callback)`

`TableBuilder` column methods:

| Method                                                     | Purpose                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `id(name?, type?)`                                         | Primary key column, defaulting to `id`.                    |
| `uuid(name)`                                               | UUID column. Chain `primary()` for a UUID primary key.     |
| `string(name)` / `text(name)`                              | Short or long text columns.                                |
| `integer(name)` / `bigInteger(name)` / `float(name)`       | Numeric columns.                                           |
| `decimal(name, precision?, scale?)`                        | Fixed-precision decimal (`numeric`), defaults `8, 2`.      |
| `boolean(name)`                                            | Boolean column.                                            |
| `json(name)`                                               | JSON column.                                               |
| `date(name)` / `timestamp(name)`                           | Date and timestamp (`timestamptz`) columns.                |
| `dateTime(name)`                                           | Timestamp without time zone.                               |
| `generated(name, expression, options?)`                    | Database-computed `GENERATED ALWAYS AS (…) STORED` column. |
| `enum(name, valuesOrEnumName)`                             | Define or reuse an enum.                                   |
| `timestamps(casing?, mapCasing?)`                          | Add `createdAt` and `updatedAt` (casing configurable).     |
| `softDeletes(column?)`                                     | Add a nullable soft-delete timestamp.                      |
| `morphs(name, nullable?)` / `nullableMorphs(name)`         | Add polymorphic `{name}Type` + integer `{name}Id` columns. |
| `uuidMorphs(name, nullable?)` / `nullableUuidMorphs(name)` | Same, but with a UUID `{name}Id` column.                   |
| `change()`                                                 | Redefine the chained column in place (see above).          |
| `dropColumn(name)`                                         | Drop a column (in `alterTable`).                           |

Define a composite primary key at table level:

```ts
schema.createTable('memberships', (table) => {
  table.integer('userId').map('user_id')
  table.integer('teamId').map('team_id')
  table.string('role')

  table.primary(['userId', 'teamId'], 'membershipIdentity')
})
```

The optional second argument names the constraint. Composite primary keys are
emitted as Prisma `@@id` declarations and database-level `PRIMARY KEY`
constraints. They can also be added through `alterTable()`:

```ts
schema.alterTable('assignments', (table) => {
  table.primary(['accountId', 'code'])
})
```

Composite keys must contain at least two unique, non-nullable columns and
cannot be combined with a column-level `primary()` or `id()` definition.
Arkorm model identity helpers currently use a single configured primary-key
attribute; composite-key support here applies to schema creation and
migrations.

Define a composite unique constraint with the same table-level syntax:

```ts
schema.createTable('memberships', (table) => {
  table.integer('teamId')
  table.string('role')
  table.unique(['teamId', 'role'], 'membershipRoleIdentity')
})
```

The optional second argument names the constraint. Without a name, the
database adapter chooses one. Prisma schema generation emits an equivalent
`@@unique([teamId, role])` model attribute.

Composite unique constraints can also be added while altering a table:

```ts
schema.alterTable('memberships', (table) => {
  table.unique(['teamId', 'role'])
})
```

Each composite unique constraint must contain at least two distinct,
non-empty column names. During table creation, every referenced column must
be defined in the same table callback.

Column modifiers can be chained from a column definition:

```ts
table.uuid('publicId').primary({ default: 'uuid()' }).map('public_id')

table.string('emailVerificationCode').nullable().unique().map('email_verification_code')
```

Available modifiers include `primary()`, `nullable()`, `unique()`, `default()`,
`after()`, and `map()`. Table-level `index()` accepts one column or an array:

```ts
table.index(['accountId', 'createdAt'], 'events_account_created_index')
```

Use logical model attribute names in migrations. `.map()` records the physical
database name while preserving logical names for queries and generated model
declarations.

### Timestamp columns

`timestamps()` defines the `createdAt` and `updatedAt` columns. Both arguments
are optional and accept a casing keyword (`'camel'` or `'snake'`) or an explicit
`{ createdAt?, updatedAt? }` override. The first argument controls the logical
attribute names; the second controls the physical database column names via
`.map()`:

```ts
table.timestamps() // createdAt / updatedAt
table.timestamps('snake') // created_at / updated_at
table.timestamps('camel', 'snake') // createdAt mapped to created_at column
table.timestamps({ createdAt: 'createdOn' })
table.timestamps('camel', { createdAt: 'created_on' })
```

When the second argument is omitted no `.map()` is applied, so the attribute
name is also the physical column name.

## Toggling foreign-key constraints

When seeding interdependent data or inserting rows in an order that would
otherwise violate foreign keys, you can temporarily disable foreign-key
enforcement. On PostgreSQL, Arkorm does this by switching the connection's
`session_replication_role` to `replica`, which suppresses the triggers that
enforce foreign keys, and back to `origin` to restore them.

The recommended entry point is `withoutForeignKeyConstraints()`. It wraps the
work in a transaction so the disable, the work, and the re-enable all run on the
**same connection** (the setting is connection-scoped) and roll back together on
failure:

```ts
import { SchemaBuilder } from 'arkormx'

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await SchemaBuilder.withoutForeignKeyConstraints(async () => {
      await User.factory()
        .hasAttached(Tenant.factory().has(Project.factory(3)), { status: 'active' }, 'tenants')
        .create()
    })
  }
}
```

Constraints are restored automatically even if the callback throws.

The disable/enable steps are also available directly for finer control. Because
the setting is connection-scoped, run them inside a single transaction so they
share a connection with the work in between:

```ts
await DB.transaction(async () => {
  await SchemaBuilder.disableForeignKeyConstraints()
  // ... seed data ...
  await SchemaBuilder.enableForeignKeyConstraints()
})
```

::: warning
This requires a SQL-backed adapter and a database role permitted to set
`session_replication_role` (typically superuser or a role with the
`rds_superuser`/replication privilege on managed PostgreSQL). The Prisma
compatibility adapter does not support it.
:::

## Sync model declarations

`models:sync` updates `declare` attributes inside your Arkorm models from the best available schema source.

- When the active adapter supports model introspection, Arkorm reads the database structure directly.
- Otherwise Arkorm falls back to Prisma models from `schema.prisma`.
- For non-Prisma adapter workflows, Arkorm also uses persisted enum metadata from `.arkormx/column-mappings.json` so enums defined through migration classes remain available to adapter-backed sync.

- Scalar fields are mapped to TypeScript types.
- Prisma enum fields are emitted with `import type { EnumName } from '@prisma/client'` declarations.
- Adapter-introspected enum fields are emitted as string-literal unions.
- `Json` fields are emitted as `Record<string, unknown> | unknown[]`, and Prisma list fields are emitted as `Array<...>`.
- Nullable Prisma fields are emitted as `type | null`.
- Existing non-`declare` class members are preserved.
- Existing `declare` fields are preserved when their current type is already compatible with the generated type.

```sh
npx arkorm models:sync
npx arkorm models:sync --schema ./prisma/schema.prisma --models ./src/models
```

## Run migrations

`migrate` loads migration classes and applies their `up` operations using the active migration backend.

- Prisma/file-backed flows update `schema.prisma`, then optionally run Prisma commands.
- Adapter-backed flows execute schema operations directly against the database when the adapter supports them.
- In adapter-backed flows, Arkorm also rebuilds `.arkormx/column-mappings.json` from the applied migration set so mapped columns and enum definitions remain available at runtime.

- `--all`: run all migration class files in the migrations directory.
- `<name>`: run one migration class/file by name.
- `--skip-generate`: skip `prisma generate`.
- `--skip-migrate`: skip `prisma migrate dev/deploy`.
- `--deploy`: use `prisma migrate deploy` instead of `prisma migrate dev`.
- `--create-database`: for adapters that support database creation, create the configured database when missing instead of prompting.
- `--state-file=<path>`: use a custom applied-migration state file instead of the default.
- `--schema=<path>`: override the `schema.prisma` path (Prisma/file-backed flows).

```sh
npx arkorm migrate --all
npx arkorm migrate CreateUsersMigration
npx arkorm migrate --all --skip-generate --skip-migrate
npx arkorm migrate --all --deploy
npx arkorm migrate --all --create-database
```

### Rebuild the schema from scratch

`migrate:fresh` drops the database schema and re-runs every migration from zero —
useful in local development and CI when you want a clean database rather than an
incremental change.

- `--skip-generate` / `--skip-migrate`: skip the Prisma generate / sync steps.
- `--create-database`: create the configured database when missing instead of prompting.
- `--state-file=<path>`: use a custom applied-migration state file.
- `--schema=<path>`: override the `schema.prisma` path.

```sh
npx arkorm migrate:fresh
npx arkorm migrate:fresh --skip-generate --skip-migrate
npx arkorm migrate:fresh --create-database
```

::: warning
`migrate:fresh` is destructive — it discards all data in the schema. Never run it
against a production database.
:::

### Package and plugin migrations

Application config keeps one primary `paths.migrations` directory, but packages
can add migration sources during boot:

```ts
import { loadMigrationsFrom, registerMigrations } from 'arkormx'
import { CreateAuditTablesMigration } from './database/migrations/CreateAuditTablesMigration'

loadMigrationsFrom('./packages/audit/database/migrations')
registerMigrations(CreateAuditTablesMigration)
```

If you are using the `Arkorm` class as an extension surface, the same migration
registration methods are available there:

```ts
import { Arkorm } from 'arkormx'
import { CreateAuditTablesMigration } from './database/migrations/CreateAuditTablesMigration'

Arkorm.loadMigrationsFrom('./packages/audit/database/migrations')
Arkorm.registerMigrations(CreateAuditTablesMigration)
```

`migrate`, `migrate:fresh`, and `migrate:rollback` read the configured
directory, any paths registered with `loadMigrationsFrom(...)`, and any classes
registered with `registerMigrations(...)`.

Registered migration classes are tracked with an identity like
`registered:CreateAuditTablesMigration`. This lets bundled plugins provide
migrations without relying on a physical migrations directory.

## Rollback migrations

`migrate:rollback` applies `down` operations for tracked migration classes and updates migration history state.

When you use adapter-backed migrations, rollback also refreshes `.arkormx/column-mappings.json` so removed mapped columns and enums disappear from persisted metadata.

- Default behavior: rolls back all migration classes applied by the **last** `migrate` run.
- `--step=<n>`: rolls back only the latest `n` applied migration classes.
- `--dry-run`: previews rollback targets without changing schema/history or running Prisma commands.
- `--skip-generate`: skip `prisma generate`.
- `--skip-migrate`: skip `prisma migrate dev/deploy`.
- `--deploy`: run with deploy mode when Prisma migrate execution is enabled.

```sh
npx arkorm migrate:rollback
npx arkorm migrate:rollback --step=1
npx arkorm migrate:rollback --dry-run
npx arkorm migrate:rollback --skip-generate --skip-migrate
```

## Inspect migration history

Use migration history commands to audit or reset tracked migration class state.

For adapter-backed projects, resetting or deleting migration history also clears persisted metadata derived from that state.

- `migrate:history`: prints tracked migration state.
- `--json`: prints raw JSON output.
- `--reset`: clears tracked entries but keeps the state file.
- `--delete`: removes the state file.

```sh
npx arkorm migrate:history
npx arkorm migrate:history --json
npx arkorm migrate:history --reset
npx arkorm migrate:history --delete
```

## Foreign keys and relation aliases

Use `foreignKey` in table migrations to generate Prisma relation fields automatically:

```ts
schema.createTable('tokens', (table) => {
  table.id()
  table.integer('userId')
  table.string('value')

  table.foreignKey('userId').references('users', 'id').onDelete('cascade').alias('TokenUser')
})
```

This generates a relation field like:

```prisma
user User @relation("TokenUser", fields: [userId], references: [id], onDelete: Cascade)
```

You can also rename the generated relation field with `.as(fieldName)`:

```ts
table
  .foreignKey('userId')
  .references('users', 'id')
  .onDelete('cascade')
  .alias('TokenOwner')
  .as('owner')
```

Generated relation field:

```prisma
owner User @relation("TokenOwner", fields: [userId], references: [id], onDelete: Cascade)
```

Arkorm also adds the inverse list relation on the referenced model automatically. For a `personal_access_tokens -> users` foreign key, it generates:

```prisma
personalAccessTokens PersonalAccessToken[] @relation("TokenUser")
```

If the foreign key column is the latest column you added, you can also chain `foreign()` directly from that column definition:

```ts
schema.createTable('next_of_kins', (table) => {
  table.id()
  table.uuid('userId').foreign().references('users', 'id').onDelete('cascade')
})
```

That generates a named relation on both sides by default:

```prisma
model NextOfKin {
  user User @relation("NextOfKinUser", fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  nextOfKins NextOfKin[] @relation("NextOfKinUser")
}
```

For one-to-one relations, make the foreign key column `@unique`. If the relation should be optional on the owning side, make the foreign key nullable and alias the relation field explicitly when the column name is not descriptive enough:

```ts
schema.alterTable('users', (table) => {
  table.uuid('nokId').nullable().unique().map('nok_id')

  table.foreignKey('nokId').references('next_of_kins', 'id').as('nextOfKin')
})
```

This generates a one-to-one relation shape:

```prisma
model User {
  nokId     String?     @unique @map("nok_id")
  nextOfKin NextOfKin?  @relation("NextOfKinUser", fields: [nokId], references: [id])
}

model NextOfKin {
  user User? @relation("NextOfKinUser")
}
```

If you want the owning-side relation to be required, keep the foreign key unique but drop `.nullable()`.

You can override the inverse relation name with `.inverseAlias(name)` when needed:

```ts
table
  .foreignKey('userId')
  .references('users', 'id')
  .alias('TokenOwner')
  .inverseAlias('UserTokens')
  .as('owner')
```

## Enum columns

Use `table.enum(...)` when a field should map to a Prisma enum type.

```ts
schema.createTable('orders', (table) => {
  table.id()
  table.enum('status', ['PENDING', 'PAID', 'CANCELLED']).enumName('OrderStatus').default('PENDING')
})
```

This generates both the model field and the Prisma enum block:

```prisma
enum OrderStatus {
  PENDING
  PAID
  CANCELLED
}

model Order {
  id     Int         @id @default(autoincrement())
  status OrderStatus @default(PENDING)
}
```

Notes:

- `enumName` is required so Arkorm can emit a stable Prisma enum type name.
- Enum defaults should be provided as enum member names like `'PENDING'`, not quoted Prisma expressions.
- Enum defaults must match one of the enum members. Arkorm validates this before writing `schema.prisma`.
- Enum member names must be valid Prisma identifiers such as `PENDING_REVIEW`; spaces and other invalid characters are rejected.
- Enum member lists cannot contain duplicates.
- Reusing the same `enumName` across migrations is supported as long as the enum values match exactly.

You can also reuse an enum that already exists in `schema.prisma` by passing the
enum name instead of redefining its values:

```ts
schema.alterTable('invoices', (table) => {
  table.enum('status', 'OrderStatus').default('PAID')
})
```

When you reuse an enum by name, Arkorm expects the enum block to already exist
in the Prisma schema. If it cannot find that enum, the migration fails.
Configured defaults are validated against the reused enum's existing members.

## Production runtime notes

When migrations and seeders are authored in TypeScript, production should
execute compiled JavaScript:

- Keep source structure mirrored in build output.
- Configure `paths.buildOutput` to your build root.
- Arkorm will try to resolve your `.ts` files with their equivalent `.js` / `.cjs` / `.mjs` in the build output.

If you use a bundler such as `tsdown`, set `unbundle` to `true` so build output
mirrors source structure. For other bundlers, use the equivalent option.
