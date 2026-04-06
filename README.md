# Arkormˣ

[![NPM Downloads](https://img.shields.io/npm/dt/arkormx.svg)](https://www.npmjs.com/package/arkormx)
[![npm version](https://img.shields.io/npm/v/arkormx.svg)](https://www.npmjs.com/package/arkormx)
[![License](https://img.shields.io/npm/l/arkormx.svg)](https://github.com/arkstack-hq/arkormx/blob/main/LICENSE)
[![CI](https://github.com/arkstack-hq/arkormx/actions/workflows/ci.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/ci.yml)
[![Deploy Documentation](https://github.com/arkstack-hq/arkormx/actions/workflows/deploy-docs.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/deploy-docs.yml)
[![codecov](https://codecov.io/gh/arkstack-hq/arkormx/graph/badge.svg?token=ls1VVoFkYh)](https://codecov.io/gh/arkstack-hq/arkormx)

Arkormˣ is a framework-agnostic ORM designed to run anywhere Node.js runs. It brings a familiar model layer and fluent query builder on top of adapter-backed execution, with Prisma compatibility kept during the current transition window.

## Features

- Adapter-backed query execution with practical ORM ergonomics.
- Adapter-first runtime setup with Kysely/Postgres support and a Prisma compatibility adapter during migration.
- End-to-end guides for setup, querying, relationships, migrations, and CLI usage.
- Full TypeScript support, providing strong typing and improved developer experience.
- Follows best practices for security, ensuring your data is protected.
- Open source and welcomes contributions from developers around the world.
- Intuitive API that feels familiar to users transitioning from Eloquent or other ORMs, making it easy to learn and adopt.

## Getting Started

### Installation

Stable release:

```sh
pnpm add arkormx @prisma/client
pnpm add -D prisma
```

Preview release (`next`):

```sh
pnpm add arkormx@next @prisma/client
pnpm add -D prisma
```

### Configuration

Primary runtime path:

```ts
import { Model, createPrismaDatabaseAdapter } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const adapter = createPrismaDatabaseAdapter(prisma);

class User extends Model<'users'> {}

User.setAdapter(adapter);
```

Optional compatibility/runtime config for CLI and transaction helpers:

Create `arkormx.config.js` in your project root:

```ts
import { defineConfig } from 'arkormx';
import { PrismaClient } from '@prisma/client';

export default defineConfig({
  prisma: new PrismaClient(...),
});
```

Or run the Arkormˣ CLI command `npx arkorm init` to initialize your project along with configuration.

### Define a model

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users'; // not required if your model name matches the delegate name or the pluralized form of it
}
```

### Generate Prisma client

```sh
pnpm prisma generate
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
