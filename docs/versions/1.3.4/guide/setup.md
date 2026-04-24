# Setup

This page contains a complete starter setup for Arkormˣ + Prisma.

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

## 5. Production notes for TS seeders/migrations

When you run the Arkormˣ CLI, Node executes JavaScript.
If you source files are TypeScript, ensure that your build output structure is mirrors your source structure.

- Source: `database/migrations/CreateUsersMigration.ts`
- Build: `dist/database/migrations/CreateUsersMigration.js` (or `.cjs`/`.mjs`)

Arkormˣ uses `paths.buildOutput` to map your source files to their runtime build equivalents in your build output directory.
With `tsdown`, use non-bundled output (for example `unbundle`) to preserve paths.

If you use a bundler like like `tsdown`, you can set the `unbundle` config to `true` to ensure that your build output mirrors your source structure, if you use other bundlers, check their documentation for similar options.
