# Query Builder

Arkormˣ query builder is fluent, typed, and delegate-backed.

## Common reads

```ts
await User.query().get();
await User.query().first();
await User.query().firstOrFail();
await User.query().find(1);
```

## Filtering

```ts
await User.query()
  .whereKey('isActive', true)
  .orWhere({ role: 'admin' })
  .whereNotNull('email')
  .whereIn('id', [1, 2, 3])
  .get();
```

## Date and range helpers

```ts
await User.query().whereBetween('id', [10, 100]).get();
await User.query().whereDate('createdAt', '2026-03-01').get();
await User.query().whereMonth('createdAt', 3, 2026).get();
await User.query().whereYear('createdAt', 2026).get();
```

## Ordering and pagination helpers

```ts
await User.query().latest().limit(10).get();
await User.query().oldest('updatedAt').offset(20).take(10).get();
await User.query().forPage(2, 15).get();
```

## Existence and aggregates

```ts
await User.query().exists();
await User.query().doesntExist();
await User.query().count();
await User.query().sum('score');
await User.query().avg('score');
```

## Utility helpers

```ts
await User.query().pluck('email');
await User.query().value('email');
await User.query().valueOrFail('email');
```

## Write helpers (insert/update/upsert)

```ts
await User.query().insert({
  id: 3,
  name: 'Alice',
  email: 'alice@example.com',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

await User.query().insert([
  { id: 4, name: 'Bob', email: 'bob@example.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 5, name: 'Carol', email: 'carol@example.com', isActive: false, createdAt: new Date(), updatedAt: new Date() },
]);

await User.query().insertOrIgnore([
  { id: 6, name: 'Dylan', email: 'dylan@example.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
]);

const id = await User.query().insertGetId({
  id: 7,
  name: 'Eve',
  email: 'eve@example.com',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

await User.query().insertUsing(
  ['id', 'name', 'email', 'isActive', 'createdAt', 'updatedAt'],
  async () => [
    { id: 8, name: 'Frank', email: 'frank@example.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  ]
);

await User.query().insertOrIgnoreUsing(
  ['id', 'name', 'email', 'isActive', 'createdAt', 'updatedAt'],
  [
    { id: 9, name: 'Grace', email: 'grace@example.com', isActive: false, createdAt: new Date(), updatedAt: new Date() },
  ]
);

await User.query().where({ email: 'jane@example.com' }).updateFrom({ name: 'Jane Updated' });

await User.query().updateOrInsert(
  { email: 'new-user@example.com' },
  { id: 10, name: 'New User', isActive: true, createdAt: new Date(), updatedAt: new Date() }
);

await User.query().upsert(
  [
    { id: 11, email: 'jane@example.com', name: 'Jane Upserted', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  ],
  'email',
  ['name']
);
```

- `insert(values)` inserts one or many rows.
- `insertOrIgnore(values)` inserts and ignores duplicate/conflict errors when supported.
- `insertGetId(values, sequence?)` inserts one row and returns the generated key field (defaults to `id`).
- `insertUsing(columns, query)` and `insertOrIgnoreUsing(columns, query)` accept arrays, async resolvers, or query-builder sources.
- `updateFrom(values)` performs constrained updates and returns affected count when supported by the adapter.
- `updateOrInsert(attributes, values)` updates the matching record or inserts a new one.
- `upsert(values, uniqueBy, update?)` processes batch upserts keyed by one or many unique columns.

## Conditional composition

```ts
await User.query()
  .when(filters.active, (q) => q.whereKey('isActive', true))
  .unless(filters.includeGuests, (q) => q.whereNot({ role: 'guest' }))
  .get();
```
