# Configuration

Arkorm loads config from `arkorm.config.cjs`, `arkorm.config.js`, or `arkorm.config.ts` in your project root.

## defineConfig

```ts
import { defineConfig } from 'arkorm';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
});
```

## Full configuration shape

```ts
import { defineConfig, URLDriver } from 'arkorm';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class AppURLDriver extends URLDriver {}

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
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

## Config reference

- `prisma` (required): Prisma client instance or resolver function.
- `pagination.urlDriver`: custom URL driver factory for paginator links.
- `paths.stubs`: directory containing CLI stub templates.
- `paths.models`: generated model directory.
- `paths.factories`: generated factory directory.
- `paths.seeders`: generated seeder directory.
- `paths.migrations`: generated migration directory.
- `paths.buildOutput`: build output root used to map runtime files in production.
- `outputExt`: preferred generated extension (`'ts'` by default, falls back to `'js'` when TypeScript is unavailable).

## Runtime configuration

For frameworks that bootstrap Prisma elsewhere, use runtime configuration:

```ts
import { configureArkormRuntime } from 'arkorm';

configureArkormRuntime(() => prisma, {
  outputExt: 'js',
});
```
