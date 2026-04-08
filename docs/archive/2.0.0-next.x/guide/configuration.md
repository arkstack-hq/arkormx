# Configuration

Arkormˣ loads config from `arkormx.config.cjs`, `arkormx.config.js`, or `arkormx.config.ts` in your project root.

Adapter configuration is the primary runtime path. Prisma is optional and only
needed when you want compatibility mode, CLI flows, or Prisma-backed
transactions during the transition window.

## defineConfig

```ts
import { defineConfig } from 'arkormx';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { createKyselyAdapter } from 'arkormx';

export default defineConfig({
  adapter: createKyselyAdapter(
    new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
        }),
      }),
    }),
  ),
});
```

## Full configuration shape

```ts
import { createKyselyAdapter, defineConfig, URLDriver } from 'arkormx';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

class AppURLDriver extends URLDriver {}

export default defineConfig({
  adapter: createKyselyAdapter(db),
  features: {
    persistedColumnMappings: true,
    persistedEnums: true,
  },
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
  paths: {
    stubs: './stubs',
    models: './src/models',
    factories: './database/factories',
    seeders: './database/seeders',
    migrations: './database/migrations',
    buildOutput: './dist',
  },
  outputExt: 'ts',
});
```

If you still need Prisma compatibility, add it alongside the adapter instead of
replacing the adapter-first setup:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma,
  adapter: createKyselyAdapter(db),
});
```

## Config reference

- `prisma` (optional): Prisma client instance or resolver function for compatibility mode, CLI flows, and Prisma-backed `Model.transaction(...)`.
- `adapter`: optional global adapter applied automatically to models that do not define their own adapter.
- `features.persistedColumnMappings`: enable or disable persisted non-Prisma column mapping metadata written to `.arkormx/column-mappings.json` during adapter-backed migrations. Defaults to `true`.
- `features.persistedEnums`: enable or disable persisted non-Prisma enum metadata used by adapter-backed `models:sync`. Defaults to `true`.
- `boot`: optional low-level synchronous hook for advanced runtime binding work.
- `pagination.urlDriver`: custom URL driver factory for paginator links.
- `pagination.resolveCurrentPage`: runtime hook used when `paginate()` or `simplePaginate()` is called without an explicit page argument.
- `paths.models`: generated model directory.
- `paths.factories`: generated factory directory.
- `paths.seeders`: generated seeder directory.
- `paths.migrations`: generated migration directory.
- `paths.buildOutput`: build output root used to map runtime files in production.
- `outputExt`: preferred generated extension (`'ts'` by default, falls back to `'js'` when TypeScript is unavailable).

## Runtime configuration

For frameworks that bootstrap Prisma elsewhere, use runtime configuration:

```ts
import { configureArkormRuntime } from 'arkormx';

configureArkormRuntime(() => prisma, {
  outputExt: 'js',
});
```

Runtime configuration does not replace `defineConfig({ adapter })`. Prefer the
top-level `adapter` field so Arkorm can apply one adapter automatically across
your model layer, and use the lower-level binding APIs only for advanced cases
such as transaction-scoped adapter overrides.

```ts
import { createKyselyAdapter, defineConfig } from 'arkormx';

export default defineConfig({
  prisma: () => prisma,
  adapter: createKyselyAdapter(db),
});
```

Runtime configuration also enables transaction scopes through
`Model.transaction(...)`, because Arkorm can resolve the active Prisma client
and switch compatibility-adapter queries onto the transaction client automatically.

If you do not use Prisma compatibility features, you can omit `prisma`
entirely and configure only `adapter`.
