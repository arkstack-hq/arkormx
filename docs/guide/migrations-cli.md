# Migrations and CLI

Arkormˣ provides CLI helpers for generating models, factories, seeders, and migration classes, and for applying migration classes to `schema.prisma`.

## Initialize config

```sh
npx arkorm init
```

## Generate files

```sh
npx arkorm make:model User
npx arkorm make:model User --all
npx arkorm make:factory User
npx arkorm make:seeder Database
npx arkorm make:migration "create users table"
```

## Sync model declarations from Prisma

```sh
npx arkorm models:sync
npx arkorm models:sync --schema ./prisma/schema.prisma --models ./src/models
```

## Run migrations

```sh
npx arkorm migrate --all
npx arkorm migrate CreateUsersMigration
npx arkorm migrate --all --skip-generate --skip-migrate
npx arkorm migrate --all --deploy
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
