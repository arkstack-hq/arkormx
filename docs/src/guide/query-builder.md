# Query Builder

Arkorm's query builder is fluent, typed, and adapter-backed. Start model
queries with `Model.query()` or use `DB.table()` when you do not need model
hydration, scopes, relationships, or lifecycle events.

For multi-step writes that need atomic commit and rollback behavior, see
[Transactions](./transactions.md).

## Raw table access

```ts
import { DB } from 'arkormx';

const users = await DB.table<{ id: number; name: string }>('users')
  .where({ name: 'Jane' })
  .get();

const rows = users.all();
```

You can pass table metadata when the builder needs help resolving mapped
columns, generated keys, timestamps, or soft deletes:

```ts
const users = DB.table('users', {
  primaryKey: 'uuid',
  columns: {
    createdAt: 'created_at',
  },
  softDelete: {
    enabled: true,
    column: 'deletedAt',
  },
});
```

## Selecting columns

Use `select()` to restrict the scalar columns returned by the adapter. The
selection map replaces any selection already present on the builder.

```ts
const users = await User.query()
  .select({
    id: true,
    name: true,
    email: true,
  })
  .get();
```

The result is still hydrated into model instances, but attributes that were
not selected are absent:

```ts
const user = await User.query().select({ id: true, email: true }).firstOrFail();

user.getAttribute('email'); // selected value
user.getAttribute('name'); // undefined
```

Top-level `select()` accepts scalar projections only. Use `with()` or
`include()` for relationships. A nested selection such as
`select({ posts: { select: { id: true } } })` throws
`UnsupportedAdapterFeatureException`.

## Reading records

```ts
const users = await User.query().get(); // ArkormCollection<User>
const first = await User.query().first(); // User | null
const required = await User.query().firstOrFail(); // User or throws
const user = await User.query().find(1); // primary key lookup
const byEmail = await User.query().find('jane@example.com', 'email');
```

`firstWhere()` combines a comparison with `first()`:

```ts
await User.query().firstWhere('email', 'jane@example.com');
await User.query().firstWhere('score', '>=', 100);
```

Use `findOr()` when a missing record should produce a fallback value:

```ts
const result = await User.query().findOr(999, async () => {
  return { missing: true };
});
```

## Filtering

Object filters can be combined with `AND`, `OR`, and negation:

```ts
await User.query()
  .where({ role: 'member' })
  .whereKey('isActive', true)
  .orWhere({ role: 'admin' })
  .whereNot({ suspended: true })
  .orWhereNot({ role: 'guest' })
  .get();
```

Common helpers:

```ts
await User.query().whereNull('deletedAt').get();
await User.query().whereNotNull('email').get();
await User.query().whereIn('id', [1, 2, 3]).get();
await User.query().orWhereIn('id', [4, 5]).get();
await User.query().whereNotIn('role', ['guest']).get();
await User.query().orWhereNotIn('role', ['guest']).get();
await User.query().whereKeyNot('status', 'blocked').get();
await User.query().whereBetween('score', [80, 100]).get();
```

String matching helpers are available on model, table, and relation queries:

```ts
await User.query().whereLike('email', '@example.com').get();
await User.query().whereStartsWith('email', 'jane').get();
await User.query().whereEndsWith('email', '@example.com').get();

await user.posts().whereStartsWith('title', 'Ann').getResults();
```

Date helpers build UTC ranges:

```ts
await User.query().whereDate('createdAt', '2026-03-01').get();
await User.query().whereMonth('createdAt', 3, 2026).get();
await User.query().whereYear('createdAt', 2026).get();
```

## Raw predicates and queries

Use raw predicates when an expression cannot be represented by the normal
filter helpers:

```ts
const users = await User.query()
  .whereRaw('LOWER("email") = ?', ['jane@example.com'])
  .orWhereRaw('"last_login_at" > NOW() - INTERVAL \'7 days\'')
  .get();
```

`whereRaw()` and `orWhereRaw()` require the adapter's `rawWhere` capability.
They are supported by the Kysely adapter and intentionally unsupported by the
Prisma compatibility adapter.

For a complete raw query, use `DB.raw()`:

```ts
const rows = await DB.raw<{ id: number; email: string }>(
  'select id, email from users where is_active = ?',
  [true],
);
```

`DB.raw()` returns an `ArkormCollection` and requires an adapter that implements
`rawQuery()`.

## Ordering and limits

```ts
await User.query().orderBy({ name: 'asc' }).get();
await User.query().latest().limit(10).get();
await User.query().oldest('updatedAt').offset(20).take(10).get();
await User.query().forPage(2, 15).get();
await User.query().inRandomOrder().first();
```

`orderBy()` replaces the existing order. `reorder()` clears it and can
optionally apply a replacement:

```ts
const query = User.query().orderBy({ createdAt: 'desc' });

query.reorder('name', 'asc');
query.reorder(); // clear ordering entirely
```

`skip()` and `offset()` are aliases. `take()` and `limit()` are aliases.

## Eager loading

Use `with()` for Arkorm relationship names:

```ts
await User.query()
  .with({
    profile: true,
    posts: (query) => query.latest().limit(5),
  })
  .get();
```

`include()` accepts a Prisma-like relation plan and replaces the current include
plan:

```ts
await User.query()
  .include({
    posts: {
      where: { published: true },
      orderBy: { id: 'desc' },
      select: { id: true, title: true },
      take: 5,
    },
  })
  .get();
```

See [Relationships](./relationships.md) for relation filters, aggregates, and
polymorphic loading.

## Existence and aggregates

```ts
await User.query().exists();
await User.query().doesntExist();
await User.query().count();
await User.query().min('score');
await User.query().max('score');
await User.query().sum('score');
await User.query().avg('score');
```

`sum()` returns `0` when there are no numeric values. `avg()`, `min()`, and
`max()` return `null` when no value is available.

The callback helpers execute only for the opposite existence state:

```ts
await User.query()
  .where({ email })
  .existsOr(() => createMissingUser(email));

await User.query()
  .where({ email })
  .doesntExistOr(() => notifyExistingUser(email));
```

## Values and plucking

```ts
const email = await User.query().value('email'); // value | null
const requiredEmail = await User.query().valueOrFail('email');
const emails = await User.query().pluck('email');
const emailsOrderedById = await User.query().pluck('email', 'id');
```

`valueOrFail()` throws `ModelNotFoundException` when no value is found.
`pluck()` returns an `ArkormCollection` of scalar values.

## Conditional composition

```ts
const query = User.query()
  .when(filters.active, (q) => q.whereKey('isActive', true))
  .unless(filters.includeGuests, (q) => q.whereNot({ role: 'guest' }))
  .tap((q) => auditQueryShape(q));
```

- `when()` applies its callback when the value is truthy.
- `unless()` applies its callback when the value is falsy.
- Both accept an optional third callback for the opposite branch.
- `tap()` returns the builder after running the callback.
- `pipe()` returns the callback's result.

```ts
const count = await User.query()
  .whereKey('isActive', true)
  .pipe((q) => q.count());
```

Use `clone()` when branching from a shared base query:

```ts
const active = User.query().whereKey('isActive', true);

const admins = await active.clone().where({ role: 'admin' }).get();
const members = await active.clone().where({ role: 'member' }).get();
```

## Inspecting queries

`inspect()` asks the active adapter for a non-executing representation of the
current query:

```ts
const inspection = User.query()
  .whereKey('id', 1)
  .select({ id: true, email: true })
  .inspect();

console.log(inspection?.sql);
console.log(inspection?.parameters);
```

Supported operation hints are `select`, `selectOne`, `count`, and `exists`.
The method returns `null` when the adapter does not implement `inspectQuery()`.
See [Observability and Errors](./observability-errors.md) for runtime query
events and structured execution failures.

## Creating records

`create()` returns one hydrated model. `createMany()` returns hydrated models:

```ts
const user = await User.query().create({
  name: 'Alice',
  email: 'alice@example.com',
  isActive: true,
});

const users = await User.query().createMany([
  { name: 'Bob', email: 'bob@example.com', isActive: true },
  { name: 'Carol', email: 'carol@example.com', isActive: false },
]);
```

`insert()` returns `boolean` and does not return hydrated models:

```ts
await User.query().insert({
  name: 'Dylan',
  email: 'dylan@example.com',
  isActive: true,
});

await User.query().insert([
  { name: 'Eve', email: 'eve@example.com', isActive: true },
  { name: 'Frank', email: 'frank@example.com', isActive: false },
]);
```

Additional insert helpers:

```ts
const inserted = await User.query().insertOrIgnore(values); // affected count
const id = await User.query().insertGetId(values); // primary key value

const count = await User.query().insertUsing(
  ['name', 'email', 'isActive'],
  PendingUser.query().select({
    name: true,
    email: true,
    isActive: true,
  }),
);
```

`insertUsing()` and `insertOrIgnoreUsing()` accept another query builder, an
array of records, or an async resolver. Only the listed columns are copied.

## Updating records

`update()` updates the first matching record and returns it as a hydrated model:

```ts
const user = await User.query()
  .whereKey('id', 1)
  .update({ name: 'Jane Updated' });
```

`updateFrom()` uses update-many semantics and returns an affected-row count:

```ts
const affected = await User.query()
  .where({ role: 'guest' })
  .updateFrom({ isActive: false });
```

Both methods require a `where` clause. Arkorm throws
`QueryConstraintException` instead of allowing an unconstrained update.

Use `updateOrInsert()` or `upsert()` for create-or-update flows:

```ts
await User.query().updateOrInsert(
  { email: 'new-user@example.com' },
  { name: 'New User', isActive: true },
);

await User.query().upsert(
  [
    {
      email: 'jane@example.com',
      name: 'Jane Upserted',
      isActive: true,
    },
  ],
  'email',
  ['name', 'isActive'],
);
```

`updateOrInsert()` returns `boolean`. `upsert()` returns an affected-row count
and uses an optimized adapter path when the adapter advertises `upsert`.

## Deleting records

```ts
const deleted = await User.query().whereKey('id', 1).delete(); // User | null

const required = await User.query().whereKey('id', 2).deleteOrFail(); // User or throws
```

Deletes require a `where` clause. `deleteOrFail()` throws
`ModelNotFoundException` when no record matches. Model soft-delete behavior is
covered in [Models](./models.md).
