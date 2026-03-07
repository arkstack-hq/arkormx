# Getting Started

Arkormˣ is a framework-agnostic ORM designed to run anywhere Node.js runs. It brings a familiar model layer and fluent query builder on top of Prisma delegates, enabling clean, modern, and type-safe development.

## 1. Install dependencies

::: code-group

```bash [pnpm]
pnpm add arkormx @prisma/client
pnpm add -D prisma
```

```bash [npm]
npm install arkormx @prisma/client
npm install -D prisma
```

```bash [yarn]
yarn add arkormx @prisma/client
yarn add -D prisma
```

:::

## 2. Configure Arkormˣ

Create `arkormx.config.ts` in your project root:

```ts
import { defineConfig } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
});
```

Or run the Arkormˣ CLI command `npx arkormx init` to initialize your project along with the configuration.

## 3. Define a model

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';
}
```

## 4. Run queries

```ts
const users = await User.query()
  .whereKey('isActive', true)
  .latest()
  .limit(10)
  .get();
```

## 5. Generate Prisma client

```sh
pnpm prisma generate
```

## Next steps

- [Setup](./setup.md)
- [Configuration](./configuration.md)
- [Typing](./typing.md)
- [Models](./models.md)
- [Query Builder](./query-builder.md)
- [Relationships](./relationships.md)
