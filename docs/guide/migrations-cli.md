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
- Nullable Prisma fields are emitted as `type | null`.
- Existing non-`declare` class members are preserved.

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

You can override the inverse relation name with `.inverseAlias(name)` when needed:

```ts
table
  .foreignKey('userId')
  .references('users', 'id')
  .alias('TokenOwner')
  .inverseAlias('UserTokens')
  .as('owner');
```

## Production runtime notes

When migrations/seeders are authored in TypeScript, production runtime should execute compiled JavaScript, to ensure that everything works as expected, consider the following:

- Keep source structure mirrored in build output.
- Configure `paths.buildOutput` to your build root.
- Arkormˣ will try to resolve your `.ts` files with their equivalent `.js` / `.cjs` / `.mjs` in the build output.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
