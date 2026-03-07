# Arkormˣ

[![NPM Downloads](https://img.shields.io/npm/dt/arkormx.svg)](https://www.npmjs.com/package/arkormx)
[![npm version](https://img.shields.io/npm/v/arkormx.svg)](https://www.npmjs.com/package/arkormx)
[![License](https://img.shields.io/npm/l/arkormx.svg)](https://github.com/arkstack-hq/arkormx/blob/main/LICENSE)
[![CI](https://github.com/arkstack-hq/arkormx/actions/workflows/ci.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/ci.yml)
[![Deploy Documentation](https://github.com/arkstack-hq/arkormx/actions/workflows/deploy-docs.yml/badge.svg)](https://github.com/arkstack-hq/arkormx/actions/workflows/deploy-docs.yml)
[![codecov](https://codecov.io/gh/arkstack-hq/arkormx/graph/badge.svg?token=ls1VVoFkYh)](https://codecov.io/gh/arkstack-hq/arkormx)

Arkormˣ is a framework-agnostic ORM designed to run anywhere Node.js runs. It brings a familiar model layer and fluent query builder on top of Prisma delegates, enabling clean, modern, and type-safe development.

## Features

- Arkormˣ is built on top of Prisma, providing a familiar and powerful API for database interactions.
- Delegate-backed query execution with practical ORM ergonomics.
- End-to-end guides for setup, querying, relationships, migrations, and CLI usage.
- Full TypeScript support, providing strong typing and improved developer experience.
- Follows best practices for security, ensuring your data is protected.
- Open source and welcomes contributions from developers around the world.
- Intuitive API that feels familiar to users transitioning from Eloquent or other ORMs, making it easy to learn and adopt.

## Getting Started

### Installation

```sh
pnpm add arkormx @prisma/client
pnpm add -D prisma
```

### Configuration

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

## Next steps

- [Setup](https://arkormx.toneflix.net/guide/setup)
- [Configuration](https://arkormx.dev/guide/configuration)
- [Typing](https://arkormx.dev/guide/typing)
- [Models](https://arkormx.dev/guide/models)
- [Query Builder](https://arkormx.dev/guide/query-builder)
- [Relationships](https://arkormx.dev/guide/relationships)
