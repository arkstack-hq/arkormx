# Typing

Arkorm supports three model typing styles.

## 1. String generic (recommended)

Use a Prisma delegate key directly:

```ts
import { Model } from 'arkorm';

class User extends Model<'user'> {
  protected static override delegate = 'users';
}
```

This gives typed accessors:

```ts
const user = await User.query().firstOrFail();
user.getAttribute('email'); // string
user.setAttribute('name', 'Jane');
```

Arkorm resolves this directly against `PrismaClient` delegates with singular/plural fallback,
so `'article'` and `'articles'` both work without global augmentation.

## 2. String generic (plural form)

Plural delegate keys are equally supported:

```ts
class Article extends Model<'articles'> {
  protected static override delegate = 'articles';
}
```

## 3. Untyped model (fallback)

If you don’t pass a generic:

```ts
class AnyModel extends Model {}
```

Accessor values default to `any`:

```ts
const row = await AnyModel.query().first();
row?.getAttribute('id'); // any
```

## Typed query helpers

When a model is typed, helper methods are key/value safe:

```ts
User.query().whereKey('isActive', 1).whereIn('id', [1, 2, 3]);
```

`find` is also key-safe:

```ts
await User.query().find(1); // defaults to id
await User.query().find('jane@example.com', 'email');
```
