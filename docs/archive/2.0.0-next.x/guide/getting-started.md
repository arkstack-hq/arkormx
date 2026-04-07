# Getting Started

Arkormˣ is a framework-agnostic ORM designed to run anywhere Node.js runs. It brings a familiar model layer and fluent query builder on top of adapter-backed execution, with Prisma compatibility preserved during the current migration window.

## 1. Install dependencies

Use the default package name for stable releases. If you want the current 2.x
preview line, install `arkormx@next` instead.

::: code-group

```bash [pnpm]
pnpm add arkormx@next kysely pg
```

```bash [npm]
npm install arkormx@next kysely pg
```

```bash [yarn]
yarn add arkormx@next kysely pg
```

:::

## 2. Configure Arkormˣ

Initialize Arkorm centrally in `arkormx.config.ts`:

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
});
```

If you still need Prisma for compatibility mode, CLI flows, or Prisma-backed
`Model.transaction(...)`, add it later as an opt-in companion config. The full
examples are in [Setup](./setup.md) and
[Prisma Compatibility](./prisma-compatibility.md).

Or run the Arkormˣ CLI command `npx arkormx init` to initialize your project along with the configuration.

## 3. Define a model

```ts
import { Model } from 'arkormx';

export class User extends Model {}
```

For conventional models, Arkorm can infer the runtime table/delegate name from
the model class. Add `delegate` or `table` only when your storage name differs
from that convention.

## 4. Run queries

```ts
const users = await User.query()
  .whereKey('isActive', true)
  .latest()
  .limit(10)
  .get();
```

## 5. Optional Prisma compatibility

Install Prisma only if you want the compatibility adapter, Prisma-backed
transactions, or CLI flows that depend on the Prisma client:

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

## Next steps

- [Setup](./setup.md)
- [Configuration](./configuration.md)
- [Prisma Compatibility](./prisma-compatibility.md)
- [Typing](./typing.md)
- [Models](./models.md)
- [Query Builder](./query-builder.md)
- [Transactions](./transactions.md)
- [Relationships](./relationships.md)
