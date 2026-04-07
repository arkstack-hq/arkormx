# Setup

This page contains a complete starter setup for adapter-first Arkormˣ.

The primary 2.x path is to configure one global adapter in
`arkormx.config.ts`. Prisma remains optional for compatibility mode, CLI flows,
and Prisma-backed transaction helpers during the transition window.

## 1. Create `arkormx.config.ts`

```ts
import { createKyselyAdapter, defineConfig } from 'arkormx';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

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

This is the default 2.x setup. Arkorm applies the configured adapter
automatically, so normal app bootstrap does not need `User.setAdapter(...)` or
`bindAdapter(...)` calls.

You can also use the Arkormˣ CLI to generate this config file by running the initialize command: `npx arkormx init`.

## 2. Define models

```ts
import { Model } from 'arkormx';

export class User extends Model {}

export class Article extends Model {
  protected static override softDeletes = true;
}
```

Only add `delegate` or `table` when your model names do not match the storage
names Arkorm would infer by convention.

## 3. Query usage

With a global adapter configured, Arkorm queries work without extra bootstrap
steps:

```ts
const users = await User.query().whereKey('isActive', true).latest().get();
const article = await Article.query().first();

users[0]?.getAttribute('email');
article?.getAttribute('deletedAt');
```

## 4. Pagination URL customization (optional)

```ts
import { URLDriver, defineConfig } from 'arkormx';

class AppURLDriver extends URLDriver {
  public override url(page: number): string {
    return `/app${super.url(page)}`;
  }
}

export default defineConfig({
  adapter,
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
});
```

## 5. Kysely + Postgres runtime

Kysely is the primary SQL example in the 2.x docs. Create a Kysely database
instance, wrap it with `createKyselyAdapter(...)`, and assign that adapter to
the top-level `adapter` config field.

Kysely does not ship the Postgres driver itself. This setup uses
`PostgresDialect` with a `pg` pool, so you need both `kysely` and `pg`.

You do not need Prisma for this setup. This section only installs the SQL
runtime pieces Arkorm needs for the adapter-first path.

Install the packages used in this setup:

::: code-group

```bash [pnpm]
pnpm add kysely pg
```

```bash [npm]
npm install kysely pg
```

```bash [yarn]
yarn add kysely pg
```

:::

Create a runtime module:

```ts
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { createKyselyAdapter } from 'arkormx';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({ pool }),
});

export const adapter = createKyselyAdapter(db);
```

Configure the adapter centrally from `arkormx.config.ts`:

```ts
import { defineConfig } from 'arkormx';
import { adapter } from './database';

export default defineConfig({
  adapter,
});
```

You can still keep Prisma as an opt-in companion if you want Prisma-backed CLI
flows, compatibility delegates, or `Model.transaction(...)`:

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { defineConfig } from 'arkormx';
import { adapter } from './database';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

export default defineConfig({
  prisma: () => prisma,
  adapter,
});
```

With that in place, normal Arkorm queries continue to work:

```ts
const users = await User.query().orderBy({ id: 'asc' }).get();
const article = await Article.query().onlyTrashed().first();
```

Current Phase 6 scope:

- Kysely-backed execution covers core reads, writes, count, exists, pagination, and adapter transactions.
- Relation eager loading, relation filters, and relation aggregates still follow later migration phases.

Transaction example:

```ts
import { User } from './models';
import { adapter } from './database';

await adapter.transaction(async (transactionAdapter) => {
  const previousAdapter = User.getAdapter();

  User.setAdapter(transactionAdapter);

  try {
    await User.query().create({
      name: 'Mia',
      email: 'mia@example.com',
      isActive: 1,
    });
  } finally {
    User.setAdapter(previousAdapter);
  }
});
```

If you bind transaction-scoped adapters manually like this, restore the
previous adapter before leaving the callback. A small runtime helper that binds
and restores adapters for a known model list is the cleanest pattern. The
`boot` hook only applies the default app-level adapter.

## 6. Production notes for TS seeders/migrations

When you run the Arkormˣ CLI, Node executes JavaScript.
If you source files are TypeScript, ensure that your build output structure is mirrors your source structure.

- Source: `database/migrations/CreateUsersMigration.ts`
- Build: `dist/database/migrations/CreateUsersMigration.js` (or `.cjs`/`.mjs`)

Arkormˣ uses `paths.buildOutput` to map your source files to their runtime build equivalents in your build output directory.
With `tsdown`, use non-bundled output (for example `unbundle`) to preserve paths.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
