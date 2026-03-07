# Migrations and CLI

Arkormˣ provides CLI helpers for generating models, factories, seeders, and migration classes, and for applying migration classes to `schema.prisma`.

## Initialize config

```bash
arkormx init
```

## Generate files

```bash
arkormx make:model User
arkormx make:model User --all
arkormx make:factory User
arkormx make:seeder Database
arkormx make:migration "create users table"
```

## Sync model declarations from Prisma

```bash
arkormx models:sync
arkormx models:sync --schema ./prisma/schema.prisma --models ./src/models
```

## Run migrations

```bash
arkormx migrate --all
arkormx migrate CreateUsersMigration
arkormx migrate --all --skip-generate --skip-migrate
arkormx migrate --all --deploy
```

## Production runtime notes

When migrations/seeders are authored in TypeScript, production runtime should execute compiled JavaScript, to ensure that everything works as expected, consider the following:

- Keep source structure mirrored in build output.
- Configure `paths.buildOutput` to your build root.
- Arkormˣ will try to resolve your `.ts` files with their equivalent `.js` / `.cjs` / `.mjs` in the build output.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
