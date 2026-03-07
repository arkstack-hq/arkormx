# Typing

Arkormˣ uses your model generic and Prisma delegate shape to infer strongly typed query and attribute APIs.

## Recommended pattern

Use the delegate key as the model generic and set static `delegate`:

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';
}
```

## Typed accessors

```ts
const user = await User.query().firstOrFail();

user.getAttribute('email');
user.setAttribute('name', 'Jane');
```

## Typed query helpers

```ts
await User.query().whereKey('isActive', true).whereIn('id', [1, 2, 3]).get();
```

`find` supports key-safe usage:

```ts
await User.query().find(1);
await User.query().find('jane@example.com', 'email');
```

## Direct property access

Arkormˣ supports runtime property sugar (`user.email`) via proxy.
For static TypeScript field completion on direct properties, sync declarations with:

```bash
arkormx models:sync
```

## Untyped fallback

If you omit generics, Arkormˣ still works but values become loosely typed:

```ts
class AnyModel extends Model {}
```
