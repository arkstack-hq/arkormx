# Arkorm

[![NPM Downloads](https://img.shields.io/npm/dt/arkorm.svg)](https://www.npmjs.com/package/arkorm)
[![npm version](https://img.shields.io/npm/v/arkorm.svg)](https://www.npmjs.com/package/arkorm)
[![License](https://img.shields.io/npm/l/arkorm.svg)](https://github.com/arcstack-hq/arkorm/blob/main/LICENSE)
[![CI](https://github.com/arcstack-hq/arkorm/actions/workflows/ci.yml/badge.svg)](https://github.com/arcstack-hq/arkorm/actions/workflows/ci.yml)
[![Deploy Docs](https://github.com/arcstack-hq/arkorm/actions/workflows/deploy-docs.yml/badge.svg)](https://github.com/arcstack-hq/arkorm/actions/workflows/deploy-docs.yml)

Arkorm is a framework-agnostic ORM designed to run anywhere Node.js runs. It brings a familiar model layer and fluent query builder on top of Prisma delegates, enabling clean, modern, and type-safe development.

## Features

- Arkorm is built on top of Prisma, providing a familiar and powerful API for database interactions.
- Delegate-backed query execution with practical ORM ergonomics.
- End-to-end guides for setup, querying, relationships, migrations, and CLI usage.
- Full TypeScript support, providing strong typing and improved developer experience.
- Follows best practices for security, ensuring your data is protected.
- Open source and welcomes contributions from developers around the world.
- Intuitive API that feels familiar to users transitioning from Eloquent or other ORMs, making it easy to learn and adopt.

## Getting Started

### Installation

```sh
pnpm add arkorm @prisma/client
pnpm add -D prisma
```

### Configuration

Create `arkorm.config.js` in your project root:

```ts
import { defineConfig } from 'arkorm';
import { PrismaClient } from '@prisma/client';

export default defineConfig({
  prisma: new PrismaClient(...),
});
```

Or run the Arkorm CLI command `npx arkorm init` to initialize your project along with configuration.

### Define a model

```ts
import { Model } from 'arkorm';

export class User extends Model<'users'> {
  protected static override delegate = 'users'; // not required if your model name matches the delegate name or the pluralized form of it
}
```

### Generate Prisma client

```bash
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

- [Setup](https://arkorm.toneflix.net/guide/setup)
- [Configuration](https://arkorm.dev/guide/configuration)
- [Typing](https://arkorm.dev/guide/typing)
- [Models](https://arkorm.dev/guide/models)
- [Query Builder](https://arkorm.dev/guide/query-builder)
- [Relationships](https://arkorm.dev/guide/relationships)
