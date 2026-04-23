# Transactions

Arkormˣ exposes transactions through `Model.transaction(...)`.
The callback runs inside a transaction scope, and every Arkorm query executed
inside that callback automatically resolves delegates from the active
transaction client.

That means you can keep writing normal model and query-builder code without
threading a transaction object through every method.

## Basic usage

```ts
import { User } from './models/User';

await User.transaction(async () => {
  await User.query().create({
    name: 'Mia',
    email: 'mia@example.com',
    isActive: 1,
  });

  await User.query()
    .where({ email: 'john@example.com' })
    .updateFrom({ isActive: 1 });
});
```

If the callback completes successfully, Arkorm commits the transaction.
If the callback throws, Arkorm rolls the transaction back.

## Rollback behavior

```ts
await User.transaction(async () => {
  await User.query().create({
    name: 'Rollback Example',
    email: 'rollback@example.com',
    isActive: 1,
  });

  throw new Error('abort transaction');
});
```

The insert above is discarded because the callback throws before the
transaction completes.

## Returning values from a transaction

`Model.transaction()` returns whatever your callback returns.

```ts
const createdUser = await User.transaction(async () => {
  const user = await User.query().create({
    name: 'Nina',
    email: 'nina@example.com',
    isActive: 1,
  });

  return user;
});
```

## Nested transactions

Nested `Model.transaction()` calls reuse the currently active transaction
instead of opening a second one.

```ts
await User.transaction(async () => {
  await User.query().create({
    name: 'Outer User',
    email: 'outer@example.com',
    isActive: 1,
  });

  await User.transaction(async () => {
    await User.query().create({
      name: 'Inner User',
      email: 'inner@example.com',
      isActive: 1,
    });
  });
});
```

If the outer transaction rolls back, the inner work rolls back with it.

## Raw table transactions with DB

When you want transaction-scoped table queries without defining a model, use
`DB.transaction(...)` together with `db.table(...)`.

```ts
import { DB } from 'arkormx';

await DB.transaction(async (db) => {
  await db.table('users').insert({
    name: 'Mia',
    email: 'mia@example.com',
    isActive: 1,
  });

  await db
    .table('users')
    .where({ email: 'john@example.com' })
    .updateFrom({ isActive: 1 });
});
```

Inside the callback, every query created through that `db` instance uses the
transaction-scoped adapter.

## Using the transaction client directly

The callback also receives the active runtime transaction client.
Use it when you need to mix Arkorm queries with direct delegate calls.

```ts
await User.transaction(async (tx) => {
  await User.query().create({
    name: 'Mixed Flow',
    email: 'mixed@example.com',
    isActive: 1,
  });

  await (tx as any).userProfile.create({
    data: { userId: 1 },
  });
});
```

In most Arkorm flows you do not need the `tx` argument because `Model.query()`
already uses the active transaction client automatically.

## Transaction options

Arkorm forwards the optional second argument to the active adapter transaction
implementation or the compatibility client's interactive transaction call.

```ts
await User.transaction(
  async () => {
    await User.query().whereKey('id', 1).updateFrom({ isActive: 1 });
  },
  {
    timeout: 10_000,
    maxWait: 5_000,
    isolationLevel: 'Serializable',
  },
);
```

Use this when you need to control transaction timeouts or isolation semantics.

## Requirements

`Model.transaction(...)` depends on Arkorm having access to either an adapter
with transaction support or a runtime compatibility client. Use
`defineConfig({ client })`, `defineConfig({ prisma })`, or
`configureArkormRuntime(...)` during application boot when you want
client-backed transaction scoping.

```ts
import { configureArkormRuntime } from 'arkormx';

configureArkormRuntime(() => prisma);
```

If your app uses an adapter-first runtime path such as Kysely, prefer the
adapter's own `transaction(...)` method or `DB.transaction(...)` when you want
table-centric access without model classes.

If your current adapter does not expose transaction support, Arkorm throws an
unsupported-adapter error when `Model.transaction()` or `DB.transaction()` is
called.
