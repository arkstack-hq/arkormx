# Casting

Arkormˣ supports attribute casting to automatically transform values as they are read from or written to the model. This is useful for normalizing data formats, such as converting database values to JavaScript types.

Use the `casts` map on models to normalize values as they are read/written.

## Built-in casts

Supported cast types:

- `string`
- `number`
- `boolean`
- `date`
- `json`
- `array`

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  protected override casts = {
    isActive: 'boolean',
    profile: 'json',
    createdAt: 'date',
    tags: 'array',
  } as const;
}
```

## Custom casts

You can define custom casts by providing an object or class with `get` and `set` methods. The `get` method transforms the raw value from the database into the desired format, while the `set` method transforms the value before it is stored in the database.

```ts
import { Model } from 'arkormx';

const centsCast = {
  get: (value: unknown) => Number(value ?? 0) / 100,
  set: (value: unknown) => Math.round(Number(value ?? 0) * 100),
};

export class Product extends Model<'products'> {
  protected static override delegate = 'products';

  protected override casts = {
    price: centsCast,
  } as const;
}
```

## Cast + mutator interaction

Arkormˣ applies casts and mutators in this order:

- Read (`getAttribute`): cast `get` first, then mutator/accessor `get`
- Write (`setAttribute`): mutator/accessor `set` first, then cast `set`

This keeps mutators expressive while preserving consistent storage formats.

## Property sugar

Proxy-based property access uses the same pipeline:

```ts
const user = await User.query().firstOrFail();

user.isActive = 1;
console.log(user.isActive); // true (boolean cast)
```
