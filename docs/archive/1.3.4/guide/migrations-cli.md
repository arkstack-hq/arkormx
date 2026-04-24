# Migrations and CLI

Arkormˣ provides CLI helpers for generating models, factories, seeders, and migration classes, and for applying migration classes to `schema.prisma`.

## Initialize config

Use this once per project to scaffold `arkormx.config.*` and bootstrap the expected directory structure.

```sh
npx arkorm init
```

## Generate files

Use generators to create consistent project files quickly:

- `make:model`: creates a model class. Add `--all` to also generate factory, seeder, and migration.
- `make:factory`: creates a factory class for model test/seed data generation.
- `make:seeder`: creates a seeder class used by the `seed` command.
- `make:migration`: creates a timestamped migration class file.

```sh
npx arkorm make:model User
npx arkorm make:model User --all
npx arkorm make:factory User
npx arkorm make:seeder Database
npx arkorm make:migration "create users table"
```

## Sync model declarations from Prisma

`models:sync` reads Prisma models from `schema.prisma` and updates `declare` attributes inside your Arkorm models.

- Scalar fields are mapped to TypeScript types.
- Prisma enum fields are emitted with `import type { EnumName } from '@prisma/client'` declarations.
- `Json` fields are emitted as `Record<string, unknown> | unknown[]`, and Prisma list fields are emitted as `Array<...>`.
- Nullable Prisma fields are emitted as `type | null`.
- Existing non-`declare` class members are preserved.
- Existing `declare` fields are preserved when their current type is already compatible with the generated type.

```sh
npx arkorm models:sync
npx arkorm models:sync --schema ./prisma/schema.prisma --models ./src/models
```

## Run migrations

`migrate` loads migration classes, applies their `up` operations to `schema.prisma`, then optionally runs Prisma commands.

- `--all`: run all migration class files in the migrations directory.
- `<name>`: run one migration class/file by name.
- `--skip-generate`: skip `prisma generate`.
- `--skip-migrate`: skip `prisma migrate dev/deploy`.
- `--deploy`: use `prisma migrate deploy` instead of `prisma migrate dev`.

```sh
npx arkorm migrate --all
npx arkorm migrate CreateUsersMigration
npx arkorm migrate --all --skip-generate --skip-migrate
npx arkorm migrate --all --deploy
```

## Rollback migrations

`migrate:rollback` applies `down` operations for tracked migration classes and updates migration history state.

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
  table.id();
  table.integer('userId');
  table.string('value');

  table
    .foreignKey('userId')
    .references('users', 'id')
    .onDelete('cascade')
    .alias('TokenUser');
});
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
  .as('owner');
```

Generated relation field:

```prisma
owner User @relation("TokenOwner", fields: [userId], references: [id], onDelete: Cascade)
```

Arkormˣ also adds the inverse list relation on the referenced model automatically. For a `personal_access_tokens -> users` foreign key, it generates:

```prisma
personalAccessTokens PersonalAccessToken[] @relation("TokenUser")
```

If the foreign key column is the latest column you added, you can also chain `foreign()` directly from that column definition:

```ts
schema.createTable('next_of_kins', (table) => {
  table.id();
  table.uuid('userId').foreign().references('users', 'id').onDelete('cascade');
});
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
  table.uuid('nokId').nullable().unique().map('nok_id');

  table.foreignKey('nokId').references('next_of_kins', 'id').as('nextOfKin');
});
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
  .as('owner');
```

## Enum columns

Use `table.enum(...)` when a field should map to a Prisma enum type.

```ts
schema.createTable('orders', (table) => {
  table.id();
  table
    .enum('status', ['PENDING', 'PAID', 'CANCELLED'])
    .enumName('OrderStatus')
    .default('PENDING');
});
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
  table.enum('status', 'OrderStatus').default('PAID');
});
```

When you reuse an enum by name, Arkorm expects the enum block to already exist
in the Prisma schema. If it cannot find that enum, the migration fails.
Configured defaults are validated against the reused enum's existing members.

## Production runtime notes

When migrations/seeders are authored in TypeScript, production runtime should execute compiled JavaScript, to ensure that everything works as expected, consider the following:

- Keep source structure mirrored in build output.
- Configure `paths.buildOutput` to your build root.
- Arkormˣ will try to resolve your `.ts` files with their equivalent `.js` / `.cjs` / `.mjs` in the build output.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
