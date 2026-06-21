# Models

Models are the core abstraction in Arkorm. They represent an Arkorm model
backed by your configured adapter and provide attribute APIs,
casts, mutators/accessors, scopes, events, and relationship definitions.

## Basic model

```ts
import { Model } from 'arkormx'

export class User extends Model {}
```

For conventional model names, this is enough. Arkorm falls back to the model
name when you do not provide explicit metadata.

## Metadata (Arkorm next)

Arkorm can now expose explicit model metadata for adapters and future SQL planning,
while still preserving convention-based fallback behavior for existing models.

```ts
export class User extends Model {
  protected static override table = 'app_users'
  protected static override primaryKey = 'uuid'
  protected static override columns = {
    displayName: 'display_name',
  }
}
```

Available metadata helpers:

- `Model.getTable()`
- `Model.getPrimaryKey()`
- `Model.getColumnMap()`
- `Model.getColumnName(attribute)`
- `Model.getModelMetadata()`
- `Model.getRelationMetadata(name)`

Fallback rules:

- `table` falls back to `delegate`, then the model name in plural snake case.
- `delegate` is only needed when you want to override Arkorm's conventional
  model-name-based resolution.
- `primaryKey` falls back to `'id'`.
- `columns` falls back to an empty map.
- soft delete metadata still comes from `softDeletes` and `deletedAtColumn`.

You can customize inferred table casing globally:

```ts
import { defineConfig } from 'arkormx'

export default defineConfig({
  naming: {
    case: 'camel', // 'snake' (default), 'camel', 'kebab', 'studly'
  },
})
```

## Attributes

```ts
const user = await User.query().firstOrFail()

const email = user.getAttribute('email')
user.setAttribute('name', 'Jane')
await user.save()
```

Arkorm also supports runtime property sugar:

```ts
user.name = 'Jane'
console.log(user.email)
```

## Fill and persist models

`fill()` assigns several attributes through the normal mutator and cast path:

```ts
const user = new User()

user.fill({
  name: 'Jane',
  email: 'jane@example.com',
})

await user.save()
```

`save()` inserts a model that does not yet exist in the database and updates
one that does. Existence is tracked through the `exists` flag, not the presence
of a primary-key value: a model built with `new Model(...)` starts with
`exists === false` and inserts on its first save (even when you assign a primary
key yourself), while models loaded from the database or returned by `create()`
have `exists === true` and update. `save()` returns the same model instance with
persisted values applied and sets `exists` to `true` after a successful insert.

Use `update()` for a fill-and-save shortcut:

```ts
const updated = await user.update({
  name: 'Jane Updated',
})
```

Instance `update()` returns `false` when the model has no identifier or the
operation fails. Use query-builder `update()` when you need the underlying
exception rather than this boolean convenience contract.

When you want failures to surface instead of being swallowed, use the
`*OrFail` family. Each runs inside a transaction and rethrows on failure,
returning the model instance on success:

```ts
await user.saveOrFail()
await user.updateOrFail({ name: 'Jane Updated' })
await user.deleteOrFail()
```

- `saveOrFail()`: like `save()`, but wrapped in a transaction that rolls back and rethrows on error.
- `updateOrFail(attributes)`: fill-and-save like `update()`, but throws (instead of returning `false`) when the model has no identifier or the operation fails.
- `deleteOrFail()`: like `delete()`, wrapped in a transaction that rolls back and rethrows on error.

## Static query helpers

Common queries are available directly on the model class as shortcuts over
`Model.query()`:

```ts
const users = await User.all() // ArkormCollection of every record
const actives = await User.where({ isActive: 1 }).get()

const created = await User.create({ name: 'Jane', email: 'jane@example.com' })
const affected = await User.upsert(rows, 'email', ['name'])
const deleted = await User.destroy([1, 2, 3]) // returns the number removed
```

- `Model.all()`: retrieve every record as a collection.
- `Model.where(where)`: start a query builder constrained by `where`.
- `Model.create(data)`: create and persist a record, returning the hydrated model.
- `Model.upsert(values, uniqueBy, update?)`: insert or update by unique key(s), returning the affected count.
- `Model.destroy(idOrIds)`: delete records by primary key, dispatching model events for each match, returning the number deleted.

The query builder also exposes find-or-create helpers, reachable through
`Model.query()` or `Model.where(...)`:

```ts
const user = await User.query().firstOrCreate(
  { email: 'jane@example.com' }, // matched against existing records
  { name: 'Jane' }, // merged in only when creating
)

const draft = await User.query().firstOrNew({ email: 'ghost@example.com' })
const settled = await User.query().updateOrCreate({ email: 'jane@example.com' }, { name: 'Jane' })
const result = await User.query()
  .where({ email: 'x@example.com' })
  .firstOr(() => 'fallback')
```

- `firstOrCreate(attributes, values?)`: return the first match, otherwise create and persist a record with `{ ...attributes, ...values }`.
- `firstOrNew(attributes, values?)`: return the first match, otherwise return an unpersisted model with `{ ...attributes, ...values }`.
- `updateOrCreate(attributes, values?)`: update the first match with `values`, otherwise create a record with `{ ...attributes, ...values }`.
- `firstOr(columns?, callback)`: return the first record, otherwise return the result of `callback`.

## Delete and restore models

```ts
await user.delete()
```

For models with soft deletes enabled, `delete()` sets the configured deleted-at
column. Otherwise it permanently deletes the record.

```ts
const article = await Article.query().withTrashed().find(1)

await article?.restore()
await article?.forceDelete()
```

- `restore()` clears the deleted-at column on a soft-deleted model.
- `forceDelete()` permanently deletes a model even when soft deletes are enabled.
- `deleteQuietly()`, `restoreQuietly()`, and `forceDeleteQuietly()` suppress lifecycle events.

## Model state

Arkorm keeps track of a model's original persisted attributes and the changes
made since it was loaded or last saved. This is useful when you need to decide
whether a model actually changed before performing expensive work.

Available helpers:

- `getOriginal(key?)`: read the original persisted value for one attribute or all original attributes.
- `isDirty(keyOrKeys?)`: check whether the model currently has unsaved changes.
- `isClean(keyOrKeys?)`: inverse of `isDirty(...)`.
- `wasChanged(keyOrKeys?)`: check whether the last successful persistence operation changed those attributes.
- `getChanges()`: read the attributes that changed during the last successful persistence operation.
- `getPrevious(key?)`: read the attribute snapshot that was persisted before the last successful operation.
- `wasRecentlyCreated`: `true` when the last successful save inserted a new record (rather than updating an existing one).
- `exists`: `true` when the model maps to a row in the database (loaded, or saved at least once); `false` for unsaved `new Model(...)` instances and after a hard delete.

```ts
const user = await User.query().firstOrFail()

user.isClean() // true
user.getOriginal('name') // original persisted value

user.setAttribute('name', 'Jane Updated')

user.isDirty() // true
user.isDirty('name') // true
user.wasChanged('name') // false, nothing has been persisted yet

await user.save()

user.isClean() // true
user.wasChanged('name') // true
user.getChanges() // { name: 'Jane Updated' }
user.getPrevious('name') // previous persisted value
user.getOriginal('name') // 'Jane Updated'
user.wasRecentlyCreated // false for an update; true after an insert
```

New models created with `new Model(...)` start dirty because they do not have a
persisted original snapshot yet. Models hydrated through `query()` start clean.

Relation loading does not mark a model dirty. Calling `load('posts')` attaches
related results to the instance, but Arkorm keeps dirty tracking focused on the
model's own persisted attributes.

## Comparing models

Use `is()` to compare model class and persisted primary key:

```ts
const first = new User({ id: 1 })
const second = new User({ id: 1 })

first.is(second) // true
first.isSame(second) // false
```

- `is()` and `isNot()` compare persisted identity.
- `isSame()` and `isNotSame()` compare JavaScript object identity.

## Visibility and appends

Use `hidden`, `visible`, and `appends` in model classes to shape serialization via `toObject()`.

`toObject()` applies casts, accessors, visibility, and appended attributes.
`toJSON()` returns the same serializable object:

```ts
export class User extends Model {
  protected hidden = ['password']
  protected appends = ['displayName']
}

JSON.stringify(user) // invokes toJSON()
```

Use `getRawAttributes()` when you need the stored values before casts and
accessors:

```ts
const raw = user.getRawAttributes()
const serialized = user.toObject()
```

For focused guides, see:

- [Mutators & Accessors](/guide/mutators)
- [Casting](/guide/casting)

## Soft deletes

```ts
export class Article extends Model {
  protected static override softDeletes = true
}
```

Use query helpers:

```ts
await Article.withTrashed().get()
await Article.onlyTrashed().get()
```

## Local scopes

Local scopes let you package a reusable query fragment directly on the model.
They are useful when a filter is model-specific, frequently reused, and easier
to understand as a named intent than as repeated `where(...)` clauses.

Define `scopeXxx` methods on the model prototype and call them with
`Model.scope('xxx', ...)` or from an existing query builder via `.scope('xxx', ...)`.

```ts
import { Model, QueryBuilder } from 'arkormx'

export class User extends Model {
  public scopeActive(query: QueryBuilder<User>) {
    return query.whereKey('isActive', 1)
  }

  public scopeWithEmailDomain(query: QueryBuilder<User>, domain: string) {
    return query.where({ email: { endsWith: `@${domain}` } })
  }
}
```

Usage:

```ts
const activeUsers = await User.scope('active').get()

const companyUsers = await User.query()
  .scope('active')
  .scope('withEmailDomain', 'example.com')
  .get()
```

Use local scopes when the logic belongs to the model itself. If the behavior
should apply automatically to every query, prefer a global scope instead.

## Global scopes

Global scopes are query constraints that Arkorm applies automatically every time
you call `Model.query()` for a specific model class. They are a good fit for
cross-cutting filters like active records, tenant isolation, or default sorting.

You can register them manually:

```ts
User.addGlobalScope('active', (query) => {
  query.whereKey('isActive', true)
})
```

Then every `User.query()` call starts from the scoped query:

```ts
const activeUsers = await User.query().get()
```

The cleaner pattern is to register global scopes in `boot()` so they are set up
once for the model class when Arkorm first touches it:

```ts
import { Model } from 'arkormx'

export class User extends Model {
  protected static override boot(): void {
    this.addGlobalScope('active', (query) => {
      query.whereKey('isActive', 1)
    })
  }
}
```

If you need the unscoped dataset for a specific flow, use
`Model.withoutGlobalScopes(...)`:

```ts
const allUsers = await User.withoutGlobalScopes(async () => {
  return await User.query().get()
})
```

Use global scopes carefully. They improve consistency, but they also change the
default shape of every query for the model, so they should represent rules that
are broadly true rather than ad hoc controller filters.

## Model events

Model events let you hook into the model lifecycle so you can normalize data,
trigger side effects, or centralize behavior close to the model instead of
duplicating it across services and controllers.

Arkorm dispatches events when a model is retrieved from storage and around the
main write operations.

Changes made to a model during `saving`, `creating`, or `updating` are included
in the pending database write. Events registered with `created`, `updated`, or
`saved` run after persistence.

### Registering listeners directly

```ts
User.on('creating', async (model) => {
  // mutate before insert
})

User.on('created', async (model) => {
  // react after insert
})
```

### Fluent event registration helpers

Every lifecycle event also has a convenience registration method, which reads
better inside model boot hooks:

```ts
User.created(async (model) => {
  // react after insert
})

User.retrieved((model) => {
  // inspect hydrated models loaded from the database
})
```

### Registering events in `booted()`

`booted()` is a good place to register model-specific listeners once per class:

```ts
import { Model } from 'arkormx'

export class User extends Model {
  protected static override booted(): void {
    this.creating((model) => {
      model.setAttribute('email', String(model.getAttribute('email')).toLowerCase())
    })

    this.created((model) => {
      console.log('created user', model.getAttribute('id'))
    })

    this.retrieved((model) => {
      console.log('loaded user', model.getAttribute('id'))
    })
  }
}
```

### Class-based dispatched events

If you prefer dedicated listener classes, use `dispatchesEvents`:

```ts
class SendWelcomeEmail {
  async handle(model: User) {
    await queueWelcomeEmail(model.getAttribute('email'))
  }
}

export class User extends Model {
  protected static override dispatchesEvents = {
    created: SendWelcomeEmail,
  }
}
```

### Quiet operations

When you need to persist a model without dispatching lifecycle events, use the
quiet helpers:

```ts
await user.saveQuietly()
await user.deleteQuietly()
await article.restoreQuietly()
await article.forceDeleteQuietly()

await User.withoutEvents(async () => {
  await user.save()
})
```

### Available events

Available events: `retrieved`, `saving`, `saved`, `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`, `restoring`, `restored`, `forceDeleting`, `forceDeleted`.

`retrieved` fires only for models hydrated from query results such as `get()`,
`first()`, and `find()`. It does not fire for `new Model(...)` or during create
operations before the model is queried again.
