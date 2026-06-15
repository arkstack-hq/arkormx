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

Use `select()` to restrict the columns returned by the adapter. The selection
replaces any selection already present on the builder.

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

### Distinct and grouping

Use `distinct()` to remove duplicate selected rows and `groupBy()` to group
results by one or more model attributes:

```ts
const statuses = await User.query()
  .select({ isActive: true })
  .distinct()
  .groupBy('isActive')
  .get();

const totals = await Order.query()
  .select(['customerId', 'count(*) as "orderCount"'])
  .groupBy('customerId')
  .get();
```

`groupBy()` accepts either separate attributes or an array:

```ts
query.groupBy('customerId', 'status');
query.groupBy(['customerId', 'status']);
```

Both methods are also available on relationship queries. They require a
SQL-backed adapter and are not supported by the Prisma compatibility adapter.

Use an expression-to-alias entry for a computed projection:

```ts
const users = await User.query()
  .select({
    id: true,
    name: true,
    '1': 'isActive',
  })
  .get();
```

The object key is emitted as a raw SQL expression and the string value is its
result alias. String and string-array overloads are also available:

```ts
await User.query().select('1 as "isActive"').get();

await User.query()
  .select([
    'id',
    'COALESCE("display_name", "name") as "displayName"',
  ])
  .get();
```

Use `addSelect()` to append projections without replacing the existing
selection:

```ts
const users = await User.query()
  .select({ id: true, name: true })
  .addSelect({ '1': 'isActive' })
  .addSelect('COUNT(*) OVER () as "totalRows"')
  .get();
```

`addSelect()` accepts the same object, string, and string-array forms as
`select()`.

When no `select()` call precedes it, `addSelect()` preserves the implicit
wildcard selection:

```ts
await User.query()
  .addSelect({ '1': 'isActive' })
  .get();
```

This produces a projection equivalent to:

```sql
SELECT *, 1 AS "isActive" FROM "users"
```

Computed projections retain the value type returned by the database. For
example, `1 AS isActive` returns `1` unless the model defines a cast for
`isActive`.

::: warning Trusted SQL only
Expression keys and string projections are inserted as raw SQL. Never build
them from request values or other untrusted input. Raw projections do not
support parameter bindings; use `DB.raw()` when values need to be bound.
:::

Raw projections require the adapter's `rawSelect` capability. They work with
the Kysely adapter and are intentionally unsupported by the Prisma
compatibility adapter.

Use `with()` or `include()` for relationships. A nested selection such as
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
await User.query().whereTime('createdAt', '>=', '09:30').get();
await User.query().whereDay('createdAt', 15).get();
await User.query().wherePast('expiresAt').get();
await User.query().whereFuture('startsAt').get();
await User.query().whereNowOrPast('publishedAt').get();
await User.query().whereNowOrFuture('availableAt').get();
await User.query().whereToday('createdAt').get();
await User.query().whereBeforeToday('createdAt').get();
await User.query().whereAfterToday('createdAt').get();
await User.query().whereTodayOrBefore('createdAt').get();
await User.query().whereTodayOrAfter('createdAt').get();
```

Compare columns, add EXISTS subqueries, or perform PostgreSQL full-text search:

```ts
await User.query().whereColumn('firstName', 'lastName').get();
await User.query().whereColumn('updatedAt', '>', 'createdAt').get();
await User.query().whereExists(Post.query().where({ published: true })).get();
await User.query().whereExists(query => query.whereColumn('id', 'managerId')).get();
await User.query().whereFullText(['name', 'bio'], 'database engineer').get();
```

`whereTime`, `whereDay`, `whereColumn`, `whereExists`, and `whereFullText`
require a SQL-backed adapter. Relative date helpers use UTC day boundaries and
work with structured compatibility adapters.

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

**Identifier casing.** PostgreSQL folds *unquoted* identifiers to lower case, so
a bare camelCase column in raw SQL (`createdAt < ?`) would resolve to a
non-existent `createdat` column. The Kysely adapter automatically wraps bare
mixed-case identifiers in double quotes, so `whereRaw('createdAt < ?', [before])`
compiles to `"createdAt" < $1`. SQL keywords (`AND`, `OR`, `LIKE`), function
names, string literals, and identifiers you already quoted are left untouched.
You can still quote identifiers yourself if you prefer to be explicit.

For a complete raw query, use `DB.raw()`:

```ts
const rows = await DB.raw<{ id: number; email: string }>(
  'select id, email from users where is_active = ?',
  [true],
);
```

`DB.raw()` returns an `ArkormCollection` and requires an adapter that implements
`rawQuery()`.

### Multi-statement scripts

`DB.raw()` also accepts scripts that contain more than one statement, including
`do $$ … $$` blocks. The Kysely adapter splits the script into individual
statements (semicolons inside string literals, dollar-quoted bodies, and
comments are ignored) and runs them one at a time inside a transaction:

```ts
await DB.raw(`
  do $$
  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'financial_transactions_amount_positive'
    ) then
      alter table financial_transactions
        add constraint financial_transactions_amount_positive
        check (amount > 0);
    end if;
  end $$;
`);
```

The rows returned are those of the last statement that produces any.

## Joins

Join other tables with a Laravel-style join family. The `on` columns are treated
as raw qualified identifiers (`table.column`), so their casing is preserved:

```ts
const rows = await User.query()
  .join('posts', 'users.id', '=', 'posts.userId')
  .leftJoin('profiles', 'users.id', 'profiles.userId')
  .select(['users.id', 'posts.title'])
  .get();
```

A two-argument `on` defaults the operator to `=`, so
`leftJoin('posts', 'users.id', 'posts.userId')` is equivalent to the example
above. Pass a closure to build a compound `on` condition through a
`JoinClause`:

```ts
await User.query()
  .join('posts', join =>
    join
      .on('users.id', 'posts.userId')
      .where('posts.published', '=', true)
      .whereNotNull('posts.publishedAt'),
  )
  .get();
```

The full family is available: `join` / `innerJoin`, `leftJoin`, `rightJoin`,
`crossJoin`, the `joinWhere` / `leftJoinWhere` / `rightJoinWhere` value-comparison
variants, the subquery joins `joinSub` / `leftJoinSub` / `rightJoinSub` /
`crossJoinSub`, and the lateral joins `joinLateral` / `leftJoinLateral`.

```ts
const recent = Post.query().where({ status: 'published' });

await User.query()
  .joinSub(recent, 'recent_posts', 'users.id', '=', 'recent_posts.userId')
  .get();
```

Joins require the adapter's `joins` capability. They are supported by the Kysely
adapter and intentionally unsupported by the Prisma compatibility adapter. Join
clauses use physical database table and column names; alias qualified
mixed-case columns in `select()` when you need their casing preserved in the
result set.

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
