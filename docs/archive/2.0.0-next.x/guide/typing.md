# Typing

Arkormˣ uses your model generic and underlying row shape to infer strongly
typed query and attribute APIs.

## Recommended pattern

Use a model generic when you want stricter query and attribute typing:

```ts
import { Model } from 'arkormx';

type UserAttributes = {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
};

export class User extends Model<Record<string, never>, UserAttributes> {}
```

If your project already uses delegate-name generics, that still works. The 2.x
docs no longer treat explicit `delegate` overrides as the default model shape.

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

```sh
npx arkorm models:sync
```

The generated declarations follow Prisma schema types closely:

- Prisma enums are referenced through `@prisma/client` type imports.
- `Json` fields use `Record<string, unknown> | unknown[]`.
- Prisma list fields use `Array<...>`.
- If you manually narrow a generated declaration to a compatible subtype, a later sync leaves it untouched.

## Untyped fallback

If you omit generics, Arkormˣ still works but values become loosely typed:

```ts
class AnyModel extends Model {}
```
