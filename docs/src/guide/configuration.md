# Configuration

Arkormˣ loads config from `arkormx.config.cjs`, `arkormx.config.js`, or `arkormx.config.ts` in your project root.

Adapter configuration is the primary runtime path. Prisma is optional and only
needed when you want compatibility mode, CLI flows, or Prisma-backed
transactions on the supported 2.x compatibility path.

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
  naming: {
    modelTableCase: 'snake',
  },
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
  client: () => prisma,
  adapter: createKyselyAdapter(db),
});
```

## Config reference

| Key                                   | Description                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client` (optional)                   | Runtime client instance or resolver function for compatibility mode, CLI flows, and transaction fallback when no adapter transaction path is available.         |
| `prisma` (optional, deprecated alias) | Prisma client instance or resolver function kept for 2.x compatibility with older config.                                                                       |
| `adapter`                             | Optional global adapter applied automatically to models that do not define their own adapter.                                                                   |
| `naming.modelTableCase`               | Inferred model table-name casing strategy (`'snake'` default, also supports `'camel'`, `'kebab'`, and `'studly'`).                                              |
| `features.persistedColumnMappings`    | Enable or disable persisted non-Prisma column mapping metadata written to `.arkormx/column-mappings.json` during adapter-backed migrations. Defaults to `true`. |
| `features.persistedEnums`             | Enable or disable persisted non-Prisma enum metadata used by adapter-backed `models:sync`. Defaults to `true`.                                                  |
| `boot`                                | Optional low-level synchronous hook for advanced runtime binding work.                                                                                          |
| `pagination.urlDriver`                | Custom URL driver factory for paginator links.                                                                                                                  |
| `pagination.resolveCurrentPage`       | Runtime hook used when `paginate()` or `simplePaginate()` is called without an explicit page argument.                                                          |
| `paths.models`                        | Generated model directory.                                                                                                                                      |
| `paths.factories`                     | Generated factory directory.                                                                                                                                    |
| `paths.seeders`                       | Generated seeder directory.                                                                                                                                     |
| `paths.migrations`                    | Generated migration directory.                                                                                                                                  |
| `paths.buildOutput`                   | Build output root used to map runtime files in production.                                                                                                      |
| `outputExt`                           | Preferred generated extension (`'ts'` by default, falls back to `'js'` when TypeScript is unavailable).                                                         |

## Additive runtime paths

The `paths` config points Arkormˣ at your application's primary model, factory,
seeder, and migration directories. Packages and plugins can add their own
directories without replacing those configured paths:

```ts
import {
  loadFactoriesFrom,
  loadMigrationsFrom,
  loadModelsFrom,
  loadSeedersFrom,
  registerPaths,
} from 'arkormx';

loadMigrationsFrom('./packages/audit/database/migrations');
loadSeedersFrom('./packages/audit/database/seeders');
loadModelsFrom('./packages/audit/src/models');
loadFactoriesFrom('./packages/audit/database/factories');

registerPaths({
  migrations: ['./packages/billing/database/migrations'],
  seeders: './packages/billing/database/seeders',
});
```

These helpers augment runtime discovery only. They do not mutate
`defineConfig({ paths: ... })`, and generated files still use the configured
primary paths.

## Explicit runtime registration

You can also register concrete classes directly. This is useful for plugins,
test harnesses, or bundled packages where the files may not live in a normal
discovery directory:

```ts
import {
  registerFactories,
  registerMigrations,
  registerModels,
  registerSeeders,
} from 'arkormx';
import { CreateAuditTablesMigration } from './database/migrations/CreateAuditTablesMigration';
import { AuditSeeder } from './database/seeders/AuditSeeder';
import { AuditLog } from './src/models/AuditLog';
import { AuditLogFactory } from './database/factories/AuditLogFactory';

registerMigrations(CreateAuditTablesMigration);
registerSeeders(AuditSeeder);
registerModels(AuditLog);
registerFactories(AuditLogFactory);
```

The migration and seeder CLI commands include explicitly registered classes
alongside discovered files. Explicit registrations can run even when no
migration or seeder directory exists.

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
  client: () => prisma,
  adapter: createKyselyAdapter(db),
});
```

Runtime configuration also enables transaction scopes through
`Model.transaction(...)`, because Arkorm can resolve the active runtime client
and switch compatibility-adapter queries onto the transaction client automatically.

If you do not use compatibility-client features, you can omit `client`
entirely and configure only `adapter`.
