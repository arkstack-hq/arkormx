# Configuration

Arkormˣ loads config from `arkormx.config.cjs`, `arkormx.config.js`, or `arkormx.config.ts` in your project root.

Adapter binding is the primary runtime path. Config still matters for CLI flows,
runtime helpers, and Prisma compatibility during the transition window.

## defineConfig

```ts
import { defineConfig } from 'arkormx';
import { PrismaClient } from '@prisma/client';

export default defineConfig({
  prisma: new PrismaClient(),
});
```

## Full configuration shape

```ts
import { defineConfig, URLDriver } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class AppURLDriver extends URLDriver {}

export default defineConfig({
  prisma: new PrismaClient(),
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
- `pagination.resolveCurrentPage`: runtime hook used when `paginate()` or `simplePaginate()` is called without an explicit page argument.
- `paths.models`: generated model directory.
- `paths.factories`: generated factory directory.
- `paths.seeders`: generated seeder directory.
- `paths.migrations`: generated migration directory.
- `paths.buildOutput`: build output root used to map runtime files in production.
- `outputExt`: preferred generated extension (`'ts'` by default, falls back to `'js'` when TypeScript is unavailable).

## Runtime configuration

For frameworks that bootstrap Prisma elsewhere, use runtime configuration:

```ts
import { configureArkormRuntime } from 'arkormx';

configureArkormRuntime(() => prisma, {
  outputExt: 'js',
});
```

Runtime configuration does not replace `Model.setAdapter(...)`. Bind an adapter
explicitly during bootstrap and use runtime config only when Arkorm also needs
access to the Prisma client for CLI or transaction scoping.

```ts
import { createPrismaDatabaseAdapter } from 'arkormx';

const adapter = createPrismaDatabaseAdapter(prisma)

User.setAdapter(adapter)
```

Runtime configuration also enables transaction scopes through
`Model.transaction(...)`, because Arkorm can resolve the active Prisma client
and switch compatibility-adapter queries onto the transaction client automatically.
