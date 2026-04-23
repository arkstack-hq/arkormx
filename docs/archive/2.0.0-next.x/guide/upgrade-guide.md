# Migrating from 1.x to 2.x

Arkorm 2.x keeps the familiar model and query-builder surface from 1.x, but
the runtime architecture is now adapter-first.

If you are upgrading an existing 1.x app, the safest path is:

1. Move your runtime bootstrap to `defineConfig(...)`.
2. Keep Prisma compatibility enabled first if your app already depends on it.
3. Remove old per-model client/bootstrap wiring.
4. Migrate typing and CLI usage incrementally.
5. Switch individual apps or services to SQL-backed adapters when you are ready.

## What changed

The biggest 2.x changes are architectural, not stylistic.

- Adapter-first runtime is now the primary path.
- Prisma is optional compatibility infrastructure instead of the default mental model.
- One global adapter in `arkormx.config.*` is the normal setup.
- Manual per-model adapter binding is now an advanced pattern, mainly for transaction-scoped overrides.
- Model typing is centered on model attributes rather than Prisma-shaped delegate assumptions.
- Migration commands can now work through adapter-backed database execution when the active adapter supports it.
- Non-Prisma adapter projects can persist mapped-column and enum metadata in `.arkormx/column-mappings.json` so runtime mapping and `models:sync` keep working after migrations run.

## Upgrade checklist

Use this as a practical order of operations.

### 1. Move bootstrap into `defineConfig(...)`

In 1.x, many apps bootstrapped Arkorm directly from Prisma client wiring or
manual runtime hooks. In 2.x, start from a central config file.

Typical 1.x style:

```ts
import { Model } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

Model.setClient(prisma);
```

Recommended 2.x compatibility-first upgrade:

```ts
import { PrismaClient } from '@prisma/client';
import { createPrismaDatabaseAdapter, defineConfig } from 'arkormx';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma,
  adapter: createPrismaDatabaseAdapter(prisma),
});
```

This keeps Prisma available for compatibility features while moving the app to
the 2.x runtime shape.

### 2. Prefer one global adapter

In 1.x, it was common to think in terms of binding a client or adapter directly
to individual models.

In 2.x, the preferred setup is one top-level adapter:

```ts
import { createKyselyAdapter, defineConfig } from 'arkormx';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

export default defineConfig({
  adapter: createKyselyAdapter(db),
});
```

Keep explicit `Model.setAdapter(...)` calls only when you intentionally need a
temporary adapter override, for example inside a transaction boundary.

### 3. Treat Prisma as compatibility, not the default runtime

You do not need to remove Prisma immediately.

If your 1.x app already uses Prisma heavily, the lowest-risk migration is:

1. Keep Prisma.
2. Wrap it with `createPrismaDatabaseAdapter(...)`.
3. Move the app onto `defineConfig({ adapter, prisma })`.
4. Keep parity tests passing.
5. Introduce SQL-backed adapters later.

That lets you adopt the 2.x runtime contract without forcing a database access
rewrite on day one.

### 4. Simplify model declarations

Most 1.x models migrate directly, but some old runtime assumptions are no
longer the preferred default.

2.x model declarations should usually be minimal:

```ts
import { Model } from 'arkormx';

export class User extends Model {}
```

Only keep explicit delegate or table overrides when the inferred name does not
match your storage name:

```ts
export class User extends Model {
  protected static override delegate = 'users';
}
```

Soft-delete configuration is still model-level:

```ts
export class Article extends Model {
  protected static override softDeletes = true;
}
```

### 5. Update typing to the 2.x model-first style

If your 1.x code relied on Prisma-shaped delegate typing or older runtime-first
generic patterns, move toward attribute-driven model typing.

Recommended 2.x style:

```ts
import { Model } from 'arkormx';

type UserAttributes = {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
};

export class User extends Model<UserAttributes> {}
```

This keeps your type surface aligned with your model data instead of coupling
it to one specific delegate implementation.

If you built custom helpers around Arkorm's older delegate-shaped utility
types, move them toward the neutral query-schema names during the 2.x window.
In practice that means preferring `ModelQuerySchemaLike`, `QuerySchemaWhere`,
`QuerySchemaRow`, `QuerySchemaCreateData`, `QuerySchemaUpdateData`, and
`QuerySchemaForModel` over the older `Delegate*` names. When you build
attribute-backed helper schemas directly, prefer `AttributeQuerySchema` over
`AttributeSchemaDelegate`. The old names still exist as deprecated aliases for
incremental migration, but they are no longer the primary type surface.

See the full [Typing](./typing.md) guide for the 2.x conventions.

### 6. Review CLI and migration behavior

The class-based migration workflow remains, but the backend can now vary.

- Prisma/file-backed projects can keep using `migrate`, `migrate:rollback`, and `migrate:history` as before.
- Adapter-backed runtimes can execute migrations directly against the database when the adapter supports it.
- `migrate:fresh` is available in 2.x to reset the database and rerun all migration classes.
- Adapter-backed migration history now also drives persisted column and enum metadata for non-Prisma projects.

If you are staying on Prisma compatibility first, your CLI flow can remain very
close to your 1.x process.

If you are moving to Kysely or another SQL-backed adapter, validate migration
behavior in a staging database before using it in normal team workflows.

If your migrations use mapped columns or enum definitions outside Prisma, keep the default `features.persistedColumnMappings` and `features.persistedEnums` settings enabled unless you are intentionally replacing that metadata with explicit model configuration.

## Common before and after

### Before: 1.x Prisma-first bootstrap

```ts
import { Model } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

Model.setClient(prisma);
```

### After: 2.x compatibility-first bootstrap

```ts
import { PrismaClient } from '@prisma/client';
import { createPrismaDatabaseAdapter, defineConfig } from 'arkormx';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma,
  adapter: createPrismaDatabaseAdapter(prisma),
});
```

### After: 2.x adapter-first SQL bootstrap

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

## Recommended migration paths

### Lowest-risk path

Use this when you want the smallest behavioral jump.

1. Upgrade to 2.x.
2. Keep Prisma.
3. Replace old client bootstrap with `defineConfig({ prisma, adapter: createPrismaDatabaseAdapter(prisma) })`.
4. Remove deprecated `Model.setClient(...)` usage and any direct delegate-map bootstrap.
5. Update typing gradually.

### Full adapter-first path

Use this when you are ready to adopt the 2.x architecture directly.

1. Upgrade to 2.x.
2. Introduce a global SQL-backed adapter such as Kysely.
3. Keep Prisma only if you still need compatibility features or CLI integration.
4. Move migrations and test coverage onto the adapter-backed runtime.
5. Remove compatibility-only bootstrap once it is no longer needed.

## Breaking-change hotspots to check

Audit these areas first during the upgrade:

- App bootstrap that still calls `Model.setClient(...)`
- App bootstrap that still constructs direct delegate maps instead of an adapter
- Manual `setAdapter(...)` calls that are no longer needed
- Custom delegate-name mapping that now belongs in the adapter constructor
- Model typing that assumes Prisma delegate internals
- CI flows that assume only Prisma schema-file migration execution

## Related guides

- [Getting Started](./getting-started.md)
- [Setup](./setup.md)
- [Configuration](./configuration.md)
- [Prisma Compatibility](./prisma-compatibility.md)
- [Migrations and CLI](./migrations-cli.md)
- [Typing](./typing.md)
