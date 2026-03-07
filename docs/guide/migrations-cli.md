# Migrations and CLI

Arkorm provides CLI helpers for generating models, factories, seeders, and migration classes, and for applying migration classes to `schema.prisma`.

## Initialize config

```bash
arkorm init
```

## Generate files

```bash
arkorm make:model User
arkorm make:model User --all
arkorm make:factory User
arkorm make:seeder Database
arkorm make:migration "create users table"
```

## Sync model declarations from Prisma

```bash
arkorm models:sync
arkorm models:sync --schema ./prisma/schema.prisma --models ./src/models
```

## Run migrations

```bash
arkorm migrate --all
arkorm migrate CreateUsersMigration
arkorm migrate --all --skip-generate --skip-migrate
arkorm migrate --all --deploy
```

## Production runtime notes

When migrations/seeders are authored in TypeScript, production runtime should execute compiled JavaScript, to ensure that everything works as expected, consider the following:

- Keep source structure mirrored in build output.
- Configure `paths.buildOutput` to your build root.
- Arkorm will try to resolve your `.ts` files with their equivalent `.js` / `.cjs` / `.mjs` in the build output.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
