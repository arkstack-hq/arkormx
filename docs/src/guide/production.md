# Production Deployment

This guide covers production concerns for adapter-first Arkorm applications,
including runtime config loading and compiled migrations or seeders.

## Runtime configuration

Use the same adapter-first configuration in production that you use during
development:

```ts
import { createKyselyAdapter, defineConfig } from 'arkormx';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

export default defineConfig({
  adapter: createKyselyAdapter(db),
  paths: {
    models: './src/models',
    migrations: './database/migrations',
    seeders: './database/seeders',
    factories: './database/factories',
    buildOutput: './dist',
  },
});
```

Prisma is optional. Add `client` only when the application still needs Prisma
compatibility delegates or client-backed transaction behavior:

```ts
export default defineConfig({
  adapter,
  client: () => prisma,
});
```

## Build strategy

Runtime discovery needs access to migration, seeder, factory, and model modules.
Preserve their source folder structure in build output:

```txt
database/migrations/CreateUsersMigration.ts
dist/database/migrations/CreateUsersMigration.js
```

With tsdown, use unbundled output:

```ts
export default {
  unbundle: true,
};
```

If you bundle application code into a single file, register classes explicitly
instead of relying on directory discovery:

```ts
import {
  registerMigrations,
  registerModels,
  registerSeeders,
} from 'arkormx';

registerModels(User, Post);
registerMigrations(CreateUsersTableMigration);
registerSeeders(DatabaseSeeder);
```

## Generated extension policy

- `outputExt: 'ts'` generates TypeScript when TypeScript is installed.
- Arkorm falls back to JavaScript generation when TypeScript is unavailable.
- Production Node.js normally executes the compiled `.js`, `.cjs`, or `.mjs` output.

For a configured TypeScript source path, Arkorm checks equivalent runtime
scripts and paths under `paths.buildOutput`.

## Migration deployment

For adapter-backed migrations:

```sh
npx arkorm migrate --all
```

For the Prisma compatibility workflow, use deploy mode in production:

```sh
npx arkorm migrate --all --deploy
```

Do not run development-oriented Prisma migration commands against production
unless that is an intentional part of your deployment process.

## Operational checks

- Validate that the production process can load `arkormx.config.*`.
- Validate database connectivity before accepting traffic.
- Run migrations as a distinct deployment step.
- Verify compiled migration and seeder paths in staging.
- Keep `.arkormx/column-mappings.json` with the deployment when persisted mappings or enums are enabled.
- Use `debug` callbacks with sampling or redaction when forwarding query events to production logs.
- Ensure shutdown hooks close the underlying pool or database client.

See [Observability and Errors](./observability-errors.md) for query events and
structured failures.
