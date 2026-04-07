# Models

Models are the core abstraction in Arkormˣ. They represent a Prisma delegate and provide attribute APIs, casts, mutators/accessors, scopes, events, and relationship definitions.

## Basic model

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';
}
```

## Attributes

```ts
const user = await User.query().firstOrFail();

const email = user.getAttribute('email');
user.setAttribute('name', 'Jane');
await user.save();
```

Arkormˣ also supports runtime property sugar:

```ts
user.name = 'Jane';
console.log(user.email);
```

## Model state

Arkormˣ keeps track of a model's original persisted attributes and the changes
made since it was loaded or last saved. This is useful when you need to decide
whether a model actually changed before performing expensive work.

Available helpers:

- `getOriginal(key?)`: read the original persisted value for one attribute or all original attributes.
- `isDirty(keyOrKeys?)`: check whether the model currently has unsaved changes.
- `isClean(keyOrKeys?)`: inverse of `isDirty(...)`.
- `wasChanged(keyOrKeys?)`: check whether the last successful persistence operation changed those attributes.

```ts
const user = await User.query().firstOrFail();

user.isClean(); // true
user.getOriginal('name'); // original persisted value

user.setAttribute('name', 'Jane Updated');

user.isDirty(); // true
user.isDirty('name'); // true
user.wasChanged('name'); // false, nothing has been persisted yet

await user.save();

user.isClean(); // true
user.wasChanged('name'); // true
user.getOriginal('name'); // 'Jane Updated'
```

New models created with `new Model(...)` start dirty because they do not have a
persisted original snapshot yet. Models hydrated through `query()` start clean.

Relation loading does not mark a model dirty. Calling `load('posts')` attaches
related results to the instance, but Arkorm keeps dirty tracking focused on the
model's own persisted attributes.

## Visibility and appends

Use `hidden`, `visible`, and `appends` in model classes to shape serialization via `toObject()`.

For focused guides, see:

- [Mutators & Accessors](/guide/mutators)
- [Casting](/guide/casting)

## Soft deletes

```ts
export class Article extends Model<'articles'> {
  protected static override delegate = 'articles';
  protected static override softDeletes = true;
}
```

Use query helpers:

```ts
await Article.withTrashed().get();
await Article.onlyTrashed().get();
```

## Local scopes

Local scopes let you package a reusable query fragment directly on the model.
They are useful when a filter is model-specific, frequently reused, and easier
to understand as a named intent than as repeated `where(...)` clauses.

Define `scopeXxx` methods on the model prototype and call them with
`Model.scope('xxx', ...)` or from an existing query builder via `.scope('xxx', ...)`.

```ts
import { Model, QueryBuilder } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  public scopeActive(query: QueryBuilder<User>) {
    return query.whereKey('isActive', 1);
  }

  public scopeWithEmailDomain(query: QueryBuilder<User>, domain: string) {
    return query.where({ email: { endsWith: `@${domain}` } });
  }
}
```

Usage:

```ts
const activeUsers = await User.scope('active').get();

const companyUsers = await User.query()
  .scope('active')
  .scope('withEmailDomain', 'example.com')
  .get();
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
  query.whereKey('isActive', true);
});
```

Then every `User.query()` call starts from the scoped query:

```ts
const activeUsers = await User.query().get();
```

The cleaner pattern is to register global scopes in `boot()` so they are set up
once for the model class when Arkorm first touches it:

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  protected static override boot(): void {
    this.addGlobalScope('active', (query) => {
      query.whereKey('isActive', 1);
    });
  }
}
```

If you need the unscoped dataset for a specific flow, use
`Model.withoutGlobalScopes(...)`:

```ts
const allUsers = await User.withoutGlobalScopes(async () => {
  return await User.query().get();
});
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

### Registering listeners directly

```ts
User.on('creating', async (model) => {
  // mutate before insert
});

User.on('created', async (model) => {
  // react after insert
});
```

### Fluent event registration helpers

Every lifecycle event also has a convenience registration method, which reads
better inside model boot hooks:

```ts
User.created(async (model) => {
  // react after insert
});

User.retrieved((model) => {
  // inspect hydrated models loaded from the database
});
```

### Registering events in `booted()`

`booted()` is a good place to register model-specific listeners once per class:

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  protected static override booted(): void {
    this.creating((model) => {
      model.setAttribute(
        'email',
        String(model.getAttribute('email')).toLowerCase(),
      );
    });

    this.created((model) => {
      console.log('created user', model.getAttribute('id'));
    });

    this.retrieved((model) => {
      console.log('loaded user', model.getAttribute('id'));
    });
  }
}
```

### Class-based dispatched events

If you prefer dedicated listener classes, use `dispatchesEvents`:

```ts
class SendWelcomeEmail {
  async handle(model: User) {
    await queueWelcomeEmail(model.getAttribute('email'));
  }
}

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  protected static override dispatchesEvents = {
    created: SendWelcomeEmail,
  };
}
```

### Quiet operations

When you need to persist a model without dispatching lifecycle events, use the
quiet helpers:

```ts
await user.saveQuietly();
await user.deleteQuietly();
await article.restoreQuietly();
await article.forceDeleteQuietly();

await User.withoutEvents(async () => {
  await user.save();
});
```

### Available events

Available events: `retrieved`, `saving`, `saved`, `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`, `restoring`, `restored`, `forceDeleting`, `forceDeleted`.

`retrieved` fires only for models hydrated from query results such as `get()`,
`first()`, and `find()`. It does not fire for `new Model(...)` or during create
operations before the model is queried again.
