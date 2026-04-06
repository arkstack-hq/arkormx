# Setup

This page contains a complete starter setup for Arkormˣ + Prisma.

It also includes the Phase 6 Kysely/Postgres runtime path for applications that
want Arkorm models and query APIs on top of direct SQL execution.

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

## 3. Query usage

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
  prisma: () => prisma as unknown as Record<string, unknown>,
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
});
```

## 5. Kysely + Postgres runtime

If you want Arkorm to execute core CRUD queries through Kysely instead of the
Prisma compatibility adapter, create a Kysely database instance, wrap it with
`createKyselyAdapter(...)`, and bind that adapter to the models you want to run
through SQL.

Install the runtime packages:

```bash
pnpm add kysely pg
```

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

## 6. Production notes for TS seeders/migrations

When you run the Arkormˣ CLI, Node executes JavaScript.
If you source files are TypeScript, ensure that your build output structure is mirrors your source structure.

- Source: `database/migrations/CreateUsersMigration.ts`
- Build: `dist/database/migrations/CreateUsersMigration.js` (or `.cjs`/`.mjs`)

Arkormˣ uses `paths.buildOutput` to map your source files to their runtime build equivalents in your build output directory.
With `tsdown`, use non-bundled output (for example `unbundle`) to preserve paths.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
