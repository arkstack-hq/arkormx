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

Define `scopeXxx` methods and call with `Model.scope('xxx', ...)`.

## Global scopes

```ts
User.addGlobalScope('active', (query) => {
  query.whereKey('isActive', true);
});
```

## Model events

```ts
User.on('creating', async (model) => {
  // mutate before insert
});

User.on('created', async (model) => {
  // react after insert
});
```

Available events: `saving`, `saved`, `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`, `restoring`, `restored`, `forceDeleting`, `forceDeleted`.
