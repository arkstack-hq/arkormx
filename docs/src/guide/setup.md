# Setup

This page contains a complete starter setup for adapter-first Arkormˣ.

The primary path is to bind an adapter to your models at bootstrap time.
Prisma runtime config remains available for CLI flows, transaction helpers, and
the compatibility adapter during the transition window.

## 1. Create `arkormx.config.ts`

```ts
import { defineConfig } from 'arkormx';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
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

This config keeps Prisma available for Arkorm runtime helpers. Your model query
path should still bind an adapter explicitly.

You can also use the Arkormˣ CLI to generate this config file by running the initialize command: `npx arkormx init`.

## 2. Define models

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';
}

export class Article extends Model<'articles'> {
  protected static override delegate = 'articles';
  protected static override softDeletes = true;
}
```

## 3. Bind an adapter

Prisma compatibility adapter:

```ts
import { createPrismaDatabaseAdapter } from 'arkormx';

const adapter = createPrismaDatabaseAdapter(prisma);

User.setAdapter(adapter);
Article.setAdapter(adapter);
```

## 4. Query usage

```ts
const users = await User.query().whereKey('isActive', true).latest().get();
const article = await Article.query().first();

users[0]?.getAttribute('email');
article?.getAttribute('deletedAt');
```

## 5. Pagination URL customization (optional)

```ts
import { URLDriver, defineConfig } from 'arkormx';

class AppURLDriver extends URLDriver {
  public override url(page: number): string {
    return `/app${super.url(page)}`;
  }
}

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
});
```

## 6. Kysely + Postgres runtime

If you want Arkorm to execute core CRUD queries through Kysely instead of the
Prisma compatibility adapter, create a Kysely database instance, wrap it with
`createKyselyAdapter(...)`, and bind that adapter to the models you want to run
through SQL.

Install the runtime packages:

```bash
pnpm add kysely pg
```

If you are following the preview line, install Arkorm with the `next` tag first:

::: code-group

```bash [pnpm next]
pnpm add arkormx@next @prisma/client
pnpm add -D prisma
pnpm add kysely pg
```

```bash [npm next]
npm install arkormx@next @prisma/client
npm install -D prisma
npm install kysely pg
```

```bash [yarn next]
yarn add arkormx@next @prisma/client
yarn add -D prisma
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

Bind the adapter to your models during application bootstrap:

```ts
import { Article, User } from './models';
import { adapter } from './database';

User.setAdapter(adapter);
Article.setAdapter(adapter);
```

You can still keep Prisma runtime config if you want Prisma-backed delegates for
CLI flows, seeds, or other parts of the app:

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { defineConfig } from 'arkormx';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
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
and restores adapters for a known model list is the cleanest pattern.

## 7. Production notes for TS seeders/migrations

When you run the Arkormˣ CLI, Node executes JavaScript.
If you source files are TypeScript, ensure that your build output structure is mirrors your source structure.

- Source: `database/migrations/CreateUsersMigration.ts`
- Build: `dist/database/migrations/CreateUsersMigration.js` (or `.cjs`/`.mjs`)

Arkormˣ uses `paths.buildOutput` to map your source files to their runtime build equivalents in your build output directory.
With `tsdown`, use non-bundled output (for example `unbundle`) to preserve paths.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
