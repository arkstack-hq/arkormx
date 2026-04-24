# Arkormˣ

[![NPM Downloads](https://img.shields.io/npm/dt/arkormx.svg)](https://www.npmjs.com/package/arkormx)
[![npm version](https://img.shields.io/npm/v/arkormx.svg)](https://www.npmjs.com/package/arkormx)
[![License](https://img.shields.io/npm/l/arkormx.svg)](https://github.com/arkstack-hq/arkormx/blob/main/LICENSE)
[![codecov](https://codecov.io/gh/arkstack-hq/arkormx/graph/badge.svg?token=ls1VVoFkYh)](https://codecov.io/gh/arkstack-hq/arkormx)
[![CI](https://github.com/arkstack-hq/arkormx/actions/workflows/ci.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/ci.yml)
[![Deploy Documentation](https://github.com/arkstack-hq/arkormx/actions/workflows/deploy-docs.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/deploy-docs.yml)
[![Publish to NPM](https://github.com/arkstack-hq/arkormx/actions/workflows/publish.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/publish.yml)

Arkormˣ is a framework-agnostic ORM designed to run anywhere Node.js runs. It brings a familiar model layer and fluent query builder on top of adapter-backed execution, with Prisma compatibility available as an optional 2.x compatibility path.

## Features

- Adapter-backed query execution with practical ORM ergonomics.
- Adapter-first runtime setup with Kysely/Postgres support and optional Prisma compatibility for existing 2.x integrations.
- End-to-end guides for setup, querying, relationships, migrations, and CLI usage.
- Full TypeScript support, providing strong typing and improved developer experience.
- Follows best practices for security, ensuring your data is protected.
- Open source and welcomes contributions from developers around the world.
- Intuitive API that feels familiar to users transitioning from Eloquent or other ORMs, making it easy to learn and adopt.

## Getting Started

### Installation

Stable release:

```sh
pnpm add arkormx kysely pg
```

Preview release (`next`):

```sh
pnpm add arkormx@next kysely pg
```

### Configuration

Primary runtime path:

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

Optional compatibility/runtime config for CLI and transaction helpers:

Create `arkormx.config.js` in your project root:

```ts
import { defineConfig } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma,
});
```

Or run the Arkormˣ CLI command `npx arkorm init` to initialize your project along with configuration.

### Define a model

```ts
import { Model } from 'arkormx';

type UserAttributes = {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
};

export class User extends Model<UserAttributes> {}
```

### Optional Prisma compatibility

```sh
pnpm add @prisma/client
pnpm add -D prisma
```

### Run queries

```ts
const users = await User.query()
  .whereKey('isActive', true)
  .latest()
  .limit(10)
  .get();
```

### Run a transaction

```ts
await User.transaction(async () => {
  await User.query().create({
    name: 'Mia',
    email: 'mia@example.com',
    isActive: 1,
  });

  await User.query()
    .where({ email: 'john@example.com' })
    .updateFrom({ isActive: 1 });
});
```

## Next steps

- [Setup](https://arkormx.toneflix.net/guide/setup)
- [Configuration](https://arkormx.dev/guide/configuration)
- [Prisma Compatibility](https://arkormx.dev/guide/prisma-compatibility)
- [Typing](https://arkormx.dev/guide/typing)
- [Models](https://arkormx.dev/guide/models)
- [Query Builder](https://arkormx.dev/guide/query-builder)
- [Transactions](https://arkormx.dev/guide/transactions)
- [Relationships](https://arkormx.dev/guide/relationships)
