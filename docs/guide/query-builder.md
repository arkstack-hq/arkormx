# Query Builder

Arkorm query builder is fluent, typed, and delegate-backed.

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

## Conditional composition

```ts
await User.query()
  .when(filters.active, (q) => q.whereKey('isActive', true))
  .unless(filters.includeGuests, (q) => q.whereNot({ role: 'guest' }))
  .get();
```
