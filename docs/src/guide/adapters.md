# Database Adapters

Adapters translate Arkorm query specifications into database or client
operations. Most applications should use a built-in adapter. The public
`DatabaseAdapter` contract is available for integrations that need a different
database layer.

## Built-in adapters

### Kysely

```ts
import { createKyselyAdapter } from 'arkormx'

const adapter = createKyselyAdapter(db)
```

The optional second argument maps Arkorm table names to Kysely table names:

```ts
const adapter = createKyselyAdapter(db, {
  users: 'app_users',
})
```

### Prisma compatibility

```ts
import { createPrismaDatabaseAdapter } from 'arkormx'

const adapter = createPrismaDatabaseAdapter(prisma)
```

The optional mapping resolves Arkorm table/delegate names to Prisma client
delegate names:

```ts
const adapter = createPrismaDatabaseAdapter(prisma, {
  users: 'user',
})
```

See [Prisma Compatibility](./prisma-compatibility.md) for its intentionally
narrower feature surface.

## Accessing and overriding the adapter

The adapter is normally set once through [configuration](./configuration.md), but
the `DB` facade exposes it directly:

```ts
import { DB } from 'arkormx'

const adapter = DB.getAdapter() // the effective runtime adapter (or undefined)
DB.setAdapter(myAdapter) // override the process-wide adapter
```

`Model.getAdapter()` returns the adapter a specific model resolves to (its bound
adapter, or the runtime one). `Model.setAdapter(adapter)` binds an adapter to a
single model class — handy in tests or multi-database setups.

A scoped `DB` instance runs its operations through a specific adapter without
touching global state — this is how [transactions](./transactions.md) route work
to the transaction connection:

```ts
const scoped = new DB(myAdapter)
await scoped.raw('select 1')
await scoped.table('users').where({ id: 1 }).first()
```

## Capability matrix

Capabilities let the query builder select optimized paths without assuming
that every adapter supports the same operations.

| Capability                   | Kysely/Postgres | Prisma compatibility                   |
| ---------------------------- | --------------- | -------------------------------------- |
| Transactions                 | Yes             | When the client exposes `$transaction` |
| Returning rows               | Yes             | No                                     |
| Insert many                  | Yes             | When a delegate exposes `createMany`   |
| Native upsert                | Yes             | No                                     |
| Update many                  | Yes             | When a delegate exposes `updateMany`   |
| Delete many                  | Yes             | No                                     |
| Optimized exists             | Yes             | Yes                                    |
| Adapter-owned relation loads | Yes             | No                                     |
| Relation aggregates          | Yes             | No                                     |
| Relation filters             | Yes             | No                                     |
| Raw select expressions       | Yes             | No                                     |
| Raw where clauses            | Yes             | No                                     |
| Raw full queries             | Yes             | No                                     |
| Schema introspection         | Yes             | Yes                                    |
| Schema operation execution   | Yes             | No                                     |

When a capability is unavailable, Arkorm may use a generic fallback. If the
requested behavior cannot be represented safely, it throws
`UnsupportedAdapterFeatureException`.

## Adapter contract

A custom adapter implements the core read, write, count, and transaction
methods:

```ts
import type { DatabaseAdapter } from 'arkormx'

export class AppDatabaseAdapter implements DatabaseAdapter {
  readonly capabilities = {
    transactions: true,
    exists: true,
  }

  async select(spec) {
    return []
  }

  async selectOne(spec) {
    return null
  }

  async insert(spec) {
    return spec.values
  }

  async update(spec) {
    return null
  }

  async delete(spec) {
    return null
  }

  async count(spec) {
    return 0
  }

  async transaction(callback, context) {
    return callback(this)
  }
}
```

The minimum required methods are:

- `select`
- `selectOne`
- `insert`
- `update`
- `delete`
- `count`
- `transaction`

Optional methods provide optimized or specialized behavior:

- `insertMany`, `upsert`, `updateFirst`, `updateMany`, `deleteFirst`, `deleteMany`
- `exists`, `rawQuery`, `loadRelations`, `inspectQuery`
- `introspectModels`, `executeSchemaOperations`, `resetDatabase`
- `createDatabaseFromError`
- `readAppliedMigrationsState`, `writeAppliedMigrationsState`
- `dispose`

Implement `dispose()` to release connection pools and clients. The CLI calls it
after a command finishes so short-lived processes (`migrate`, `seed`, …) exit
promptly instead of hanging on the pool's idle timeout. The built-in Kysely
adapter destroys its Kysely instance (ending the pool) and the Prisma
compatibility adapter calls `$disconnect()`.

## Query specifications

Arkorm passes structured specifications rather than builder internals. A select
spec can contain:

```ts
type SelectSpec = {
  target: QueryTarget
  columns?: QuerySelectColumn[]
  where?: QueryCondition
  orderBy?: QueryOrderBy[]
  limit?: number
  offset?: number
  softDeleteMode?: 'exclude' | 'include' | 'only'
  relationLoads?: RelationLoadPlan[]
  relationAggregates?: RelationAggregateSpec[]
  relationFilters?: RelationFilterSpec[]
}
```

Column mappings in `target.columns` use logical model attributes as keys and
physical database columns as values. Adapter results should be returned using
logical attribute names so model hydration, casts, and mutators continue to
work consistently.

Conditions are structured comparison, group, negation, or raw nodes. Prefer
compiling these nodes with your database client's parameter binding rather than
interpolating values into SQL.

## Declaring capabilities

Only advertise behavior the adapter actually implements:

```ts
readonly capabilities = {
  transactions: true,
  returning: true,
  insertMany: true,
  updateMany: true,
  exists: true,
  rawSelect: true,
  rawWhere: true,
  joins: true,
};
```

Capability flags and optional methods should agree. For example, an adapter
that advertises `rawSelect` must compile `QuerySelectColumn` entries with
`raw: true`, an adapter that advertises `rawWhere` must compile
`QueryRawCondition`, an adapter that advertises `joins` must compile the
`QueryJoin` entries on a `SelectSpec`, and an adapter that advertises
`relationLoads` must implement `loadRelations()`.

## Inspection and errors

Implement `inspectQuery()` when the adapter can provide a useful non-executing
query representation. Wrap database-client failures in
`QueryExecutionException`, preserving the original error as `cause` and adding
an inspection when possible.

See [Observability and Errors](./observability-errors.md) for the public event
and exception shapes.
