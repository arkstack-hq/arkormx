# Helpers

Arkorm exports a small set of helper functions for application bootstrap,
package integration, testing, and advanced schema work. Most applications only
need the helpers in this guide.

Import helpers from `arkormx`:

```ts
import { defineConfig, loadModelsFrom, registerModels } from 'arkormx'
```

Avoid importing from `src/helpers/*` in application code. Those module paths are
implementation details; the stable public surface is the package export.

## Configuration

### `defineConfig(config)`

Use `defineConfig()` in `arkormx.config.ts` to keep configuration typed while
returning the same object unchanged:

```ts
import { createKyselyAdapter, defineConfig } from 'arkormx'

export default defineConfig({
  adapter: createKyselyAdapter(db),
  paths: {
    models: './app/models',
    migrations: './database/migrations',
    seeders: './database/seeders',
    factories: './database/factories',
  },
})
```

### `configureArkormRuntime(client?, options)`

Use `configureArkormRuntime()` when a framework creates the database client or
adapter outside the config file:

```ts
import { configureArkormRuntime, createKyselyAdapter } from 'arkormx'

configureArkormRuntime(() => prisma, {
  adapter: createKyselyAdapter(db),
})
```

Prefer `defineConfig({ adapter })` for normal applications. Runtime
configuration is most useful for framework adapters, test harnesses, and code
that wires Arkorm after process startup.

### Runtime access helpers

These helpers read the effective runtime state:

```ts
import { getRuntimeAdapter, getRuntimeClient, getUserConfig } from 'arkormx'

const adapter = getRuntimeAdapter()
const client = getRuntimeClient()
const paths = getUserConfig('paths')
const config = getUserConfig()
```

`getRuntimePrismaClient` is still exported as a compatibility alias for
`getRuntimeClient`, but new code should use `getRuntimeClient()`.

### `disposeArkormRuntime()`

Use `disposeArkormRuntime()` in short-lived processes and tests when you need to
release the configured adapter or client before the Node process exits:

```ts
import { disposeArkormRuntime } from 'arkormx'

afterAll(async () => {
  await disposeArkormRuntime()
})
```

Long-running apps usually do not call this until shutdown.

### `bindAdapterToModels(adapter, models)`

Bind one adapter to a set of model classes:

```ts
import { bindAdapterToModels, createKyselyAdapter } from 'arkormx'
import { AuditLog } from './models/AuditLog'
import { Event } from './models/Event'

const adapter = createKyselyAdapter(db)

bindAdapterToModels(adapter, [AuditLog, Event])
```

This is useful for tests, packages, and multi-database applications. Normal apps
usually configure a single runtime adapter instead.

## Runtime Discovery

Use runtime discovery helpers when models, migrations, seeders, or factories
live outside your configured app paths.

```ts
import {
  loadFactoriesFrom,
  loadMigrationsFrom,
  loadModelsFrom,
  loadSeedersFrom,
  registerPaths,
} from 'arkormx'

loadModelsFrom('./packages/billing/src/models')
loadMigrationsFrom('./packages/billing/database/migrations')
loadSeedersFrom('./packages/billing/database/seeders')
loadFactoriesFrom('./packages/billing/database/factories')

registerPaths({
  models: './packages/audit/src/models',
  migrations: ['./packages/audit/database/migrations'],
})
```

These helpers append runtime discovery paths. They do not rewrite
`defineConfig({ paths })`, and generated files still use the configured primary
paths.

Use the matching getters when you need to inspect what has been registered:

```ts
import { getRegisteredPaths } from 'arkormx'

const allPaths = getRegisteredPaths()
const modelPaths = getRegisteredPaths('models')
```

## Explicit Registration

Runtime discovery loads files from directories. Explicit registration lets you
provide constructors directly, which is useful for plugins, tests, bundled
packages, and environments where file-system discovery is unavailable.

```ts
import { registerFactories, registerMigrations, registerModels, registerSeeders } from 'arkormx'
import { AuditLog } from './models/AuditLog'
import { AuditLogFactory } from './database/factories/AuditLogFactory'
import { CreateAuditTablesMigration } from './database/migrations/CreateAuditTablesMigration'
import { AuditSeeder } from './database/seeders/AuditSeeder'

registerModels(AuditLog)
registerFactories(AuditLogFactory)
registerMigrations(CreateAuditTablesMigration)
registerSeeders(AuditSeeder)
```

The corresponding getters return the constructors currently registered:

```ts
import {
  getRegisteredFactories,
  getRegisteredMigrations,
  getRegisteredModels,
  getRegisteredSeeders,
} from 'arkormx'
```

The `Arkorm` class exposes the same registration and discovery helpers as
static and instance methods:

```ts
import { Arkorm } from 'arkormx'

Arkorm.loadModelsFrom('./packages/billing/src/models')
Arkorm.registerModels(AuditLog)

const arkorm = new Arkorm()
arkorm.loadSeedersFrom('./database/seeders')
arkorm.registerSeeders(AuditSeeder)
```

## Prisma Helpers

### `createPrismaDatabaseAdapter(prisma, mapping?)`

Wrap a Prisma client in Arkorm's compatibility adapter:

```ts
import { createPrismaDatabaseAdapter, defineConfig } from 'arkormx'

export default defineConfig({
  adapter: createPrismaDatabaseAdapter(prisma),
})
```

Pass a mapping when Arkorm table names and Prisma delegate names differ:

```ts
createPrismaDatabaseAdapter(prisma, {
  users: 'user',
  roleUsers: 'roleUser',
})
```

### `inferDelegateName(modelName)`

`inferDelegateName()` applies Arkorm's Prisma delegate naming convention:

```ts
import { inferDelegateName } from 'arkormx'

inferDelegateName('User') // users
```

This is mainly useful for adapter integrations and diagnostics.

### Deprecated compatibility helpers

`createPrismaAdapter()` and `createPrismaDelegateMap()` are still exported for
legacy migration paths. Prefer `createPrismaDatabaseAdapter()` for new runtime
setup.

## Generated Column Helpers

Use `resolveGeneratedExpression()` when building generated-column definitions
from Arkorm expressions:

```ts
import { resolveGeneratedExpression } from 'arkormx'

const expression = resolveGeneratedExpression((sql) =>
  sql.json('profile', ['age']).asNumber().gte(18),
)
```

Generated columns cannot use bind parameters, so this helper inlines literal
values and rejects unsupported aggregate expressions. Most users will reach it
indirectly through the schema builder.

## Internal Helpers

Some helper modules are exported because the CLI, migrations, and adapters share
them. Treat these as lower-level integration APIs unless you are extending
Arkorm itself:

| Helper area                     | Typical use                                                   |
| ------------------------------- | ------------------------------------------------------------- |
| Migration history helpers       | CLI and custom migration runners                              |
| Column-mapping metadata helpers | model sync, migrations, and adapter metadata                  |
| Runtime module loader helpers   | file discovery for models, seeders, factories, and migrations |
| Migration planning helpers      | avoiding duplicate side effects while planning migrations     |

When possible, prefer the higher-level APIs documented in
[Configuration](./configuration.md), [Migrations & CLI](./migrations-cli.md),
and [Database Adapters](./adapters.md).
