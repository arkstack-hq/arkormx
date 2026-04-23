# Prisma Compatibility

Arkorm now treats adapter binding as the primary runtime path.

Prisma is still supported through the compatibility adapter during the
transition window.

If you are coming from Arkorm 1.x, read
[Upgrade Guide](./upgrade-guide.md) first, then use this page
for the Prisma-specific part of that upgrade.

## Recommended bootstrap

This guide assumes that you intentionally want Prisma compatibility. The normal
2.x setup path is still `defineConfig({ adapter })` with your chosen runtime
adapter.

```ts
import { createPrismaDatabaseAdapter, defineConfig } from 'arkormx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineConfig({
  prisma: () => prisma,
  adapter: createPrismaDatabaseAdapter(prisma),
});
```

If your Arkorm delegate names differ from Prisma delegate names, pass a mapping:

```ts
const adapter = createPrismaDatabaseAdapter(prisma, {
  users: 'user',
  articles: 'article',
});
```

## Deprecated runtime APIs

These APIs still work during the transition window, but they should not be used
for new code:

- `Model.setClient(...)`
- `Model.getDelegate(...)`
- the static `Model.delegate` alias
- direct delegate maps created only for `Model.setClient(...)`

These APIs are no longer part of the primary `Model` runtime surface. In 2.x,
the primary path is adapter-first setup via `Model.setAdapter(...)`,
`defineConfig({ adapter })`, or `configureArkormRuntime(..., { adapter })`.

Direct delegate-map bootstrapping is also no longer part of the supported runtime
path, it currently only exists for temporary migration compatibility.

`Model.setClient(...)`, `Model.getDelegate(...)`, and `Model.delegate` now emit
or participate in deprecation-driven compatibility behavior and are scheduled
for removal in Arkorm 3.0.

## When to keep runtime config

Keep `defineConfig({ prisma })` or `configureArkormRuntime(...)` when Arkorm
still needs access to the Prisma client for:

- CLI workflows
- `Model.transaction(...)` on the compatibility path
- incremental migration where only part of the model set is adapter-bound

## Migration notes for existing Prisma users

1. Replace `Model.setClient(...)` bootstrap code with `defineConfig({ adapter: createPrismaDatabaseAdapter(prisma) })`.
2. Keep your `defineConfig({ prisma })` or `configureArkormRuntime(...)` call if you use CLI commands or `Model.transaction(...)`.
3. Move any custom delegate-name mapping into `createPrismaDatabaseAdapter(prisma, mapping)`.
4. Keep parity tests running against the compatibility adapter while you roll out SQL-backed adapters.

## Current adapter differences

The Prisma compatibility adapter intentionally keeps a narrower query surface
than the Kysely SQL-backed adapter.

- `whereLike(...)`, `whereStartsWith(...)`, and `whereEndsWith(...)` work on the compatibility adapter.
- `whereRaw(...)` and `orWhereRaw(...)` do not work on the compatibility adapter.
- If you need raw SQL predicates such as `LOWER(email)` expressions, use a SQL-backed adapter such as Kysely.

## Compatibility window

The Prisma compatibility adapter remains part of the supported runtime surface
through the Arkorm 2.x line and stays covered by CI.

Removal will not happen before Arkorm 3.0 and requires all of the following:

- adapter-first setup is the default in docs and examples
- compatibility coverage still passes in CI through the announced window
- migration notes exist for Prisma users
- the remaining transition blockers in the migration plan are closed
