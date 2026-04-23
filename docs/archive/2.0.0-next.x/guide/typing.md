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

export class User extends Model<UserAttributes> {}
```

`Model<UserAttributes>` is the preferred 2.x typing path for adapter-first
projects. If your project already uses delegate-name generics, that still
works, but it is no longer the recommended default.

For advanced Arkorm helper typing, prefer the neutral query-schema helper names
over the older delegate-shaped ones. `ModelQuerySchemaLike`,
`QuerySchemaWhere`, `QuerySchemaRow`, `QuerySchemaCreateData`,
`QuerySchemaUpdateData`, and `QuerySchemaForModel` are now the primary type
surface. For attribute-backed helper schemas, prefer `AttributeQuerySchema`.
The older `Delegate*` names, `DelegateForModelSchema`, and
`AttributeSchemaDelegate` still exist as deprecated aliases during the 2.x
transition window.

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

When the active adapter supports schema introspection, `models:sync` reads the
database structure directly. Otherwise it falls back to the Prisma schema.

Generated declarations follow the available schema source closely:

- Database and Prisma `Json` fields use `Record<string, unknown> | unknown[]`.
- Array/list fields use `Array<...>`.
- Prisma enums are referenced through `@prisma/client` type imports when the Prisma schema is the source.
- Database enums are emitted as string-literal unions when adapter introspection is the source.
- For non-Prisma adapter projects, `models:sync` can restore enum types defined in migration classes from `.arkormx/column-mappings.json` even when the database introspection payload is incomplete.
- If you manually narrow a generated declaration to a compatible subtype, a later sync leaves it untouched.

## Column mapping metadata

For non-Prisma adapters, mapped columns created in migration classes are persisted in `.arkormx/column-mappings.json`.

That lets runtime attribute access keep using logical model keys while the adapter translates them to physical column names created through calls such as `table.string('emailVerificationCode').map('email_verification_code')`.

Explicit model `columns` metadata still wins over the persisted artifact when both are present.

## Untyped fallback

If you omit generics, Arkormˣ still works but values become loosely typed:

```ts
class AnyModel extends Model {}
```
