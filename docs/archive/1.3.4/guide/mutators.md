# Mutators & Accessors

Arkormˣ provides flexible mutators and accessors for transforming attribute values on read and write. You can define these using either:

- Legacy method naming: `getXxxAttribute` / `setXxxAttribute`
- Eloquent-style Attribute objects: a method named after the attribute returning `Attribute.make({ get, set })`

## Attribute object style (recommended)

```ts
import { Attribute, Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  public name() {
    return Attribute.make({
      get: (value) => String(value ?? '').trim(),
      set: (value) => String(value ?? '').trim(),
    });
  }

  public displayName() {
    return Attribute.make({
      get: () => String(this.getAttribute('name')).toUpperCase(),
    });
  }
}
```

Usage:

```ts
const user = await User.query().firstOrFail();

user.setAttribute('name', '  Jane  ');
console.log(user.getAttribute('name')); // Jane
console.log(user.getAttribute('displayName')); // JANE
console.log(user.name); // Jane
console.log(user.displayName); // JANE
```

## Legacy method style

```ts
import { Model } from 'arkormx';

export class User extends Model<'users'> {
  protected static override delegate = 'users';

  public getNameAttribute(value: unknown): string {
    return String(value ?? '').trim();
  }

  public setNameAttribute(value: unknown): unknown {
    return String(value ?? '').trim();
  }
}
```

## Precedence rules

For a given key:

1. Attribute object mutator (`name()` returning `Attribute`) is used first.
2. Legacy `getXxxAttribute` / `setXxxAttribute` is used when no Attribute object exists.
3. Casts still apply in the model pipeline.

Read pipeline: cast `get` runs before mutator `get`.

Write pipeline: mutator `set` runs before cast `set`.

## Appended computed attributes

Use `appends` with an Attribute object accessor to expose computed fields in `toObject()` / `toJSON()`:

```ts
protected override appends = ['displayName']

public displayName () {
  return Attribute.make({
    get: () => String(this.getAttribute('name')).toUpperCase(),
  })
}
```
