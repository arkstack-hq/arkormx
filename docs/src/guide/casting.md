# Casting

Arkorm supports attribute casting to automatically transform values as they are read from or written to the model. This is useful for normalizing data formats, such as converting database values to JavaScript types.

Use the `casts` map on models to normalize values as they are read/written.

## Built-in casts

Supported cast types:

- `string`
- `number`
- `boolean`
- `date` — casts to a native JavaScript `Date`.
- `datetime` — casts to a `DateTime` instance from `@h3ravel/support`.
- `json`
- `array`

```ts
import { Model } from 'arkormx'

export class User extends Model {
  protected override casts = {
    isActive: 'boolean',
    profile: 'json',
    createdAt: 'date',
    publishedAt: 'datetime',
    tags: 'array',
  } as const
}
```

The `datetime` cast reads values into a `DateTime` (a dayjs-backed wrapper) for
ergonomic date manipulation, and writes them back as a native `Date` for
persistence. Import `DateTime` from `@h3ravel/support` when you need to
construct or type values:

```ts
import { DateTime } from '@h3ravel/support'

const user = await User.query().findOrFail(1)
const publishedAt = user.getAttribute('publishedAt') as DateTime
publishedAt.add(7, 'day') // DateTime helpers are available

user.setAttribute('publishedAt', DateTime.now())
await user.save() // persisted as a Date
```

## Custom casts

You can define custom casts by providing an object or class with `get` and `set` methods. The `get` method transforms the raw value from the database into the desired format, while the `set` method transforms the value before it is stored in the database.

```ts
import { Model } from 'arkormx'

const centsCast = {
  get: (value: unknown) => Number(value ?? 0) / 100,
  set: (value: unknown) => Math.round(Number(value ?? 0) * 100),
}

export class Product extends Model {
  protected override casts = {
    price: centsCast,
  } as const
}
```

The `set` transform is applied once when you assign a value and `get` once when
you read it, so a cast round-trips correctly through `save()` — reading `price`
right after `product.fill({ price: 100 }).save()` returns `100`, not the stored
`10000`. There is no need to re-fetch the row for the value to read back
correctly, even for non-idempotent casts (money, arrays) where re-applying `set`
would corrupt the value.

## Cast + mutator interaction

Arkorm applies casts and mutators in this order:

- Read (`getAttribute`): cast `get` first, then mutator/accessor `get`
- Write (`setAttribute`): mutator/accessor `set` first, then cast `set`

This keeps mutators expressive while preserving consistent storage formats.

## Property sugar

Proxy-based property access uses the same pipeline:

```ts
const user = await User.query().firstOrFail()

user.isActive = 1
console.log(user.isActive) // true (boolean cast)
```
