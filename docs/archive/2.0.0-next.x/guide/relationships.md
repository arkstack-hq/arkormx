# Relationships

Arkormˣ supports relationships with eager loading and constrained relationship querying.

## Define relationships

```ts
class User extends Model {
  posts() {
    return this.hasMany(Post, 'authorId', 'id');
  }
}

class Post extends Model {
  author() {
    return this.belongsTo(User, 'authorId', 'id');
  }
}
```

Supported relationships:

- [`hasOne`](#hasone)
- [`hasMany`](#hasmany)
- [`belongsTo`](#belongsto)
- [`belongsToMany`](#belongstomany)
- [`hasOneThrough`](#hasonethrough)
- [`hasManyThrough`](#hasmanythrough)
- [`morphOne`](#morphone)
- [`morphMany`](#morphmany)
- [`morphToMany`](#morphtomany)

## Supported relationship patterns

### hasOne

Use `hasOne` when the current model owns exactly one related record.

```ts
class User extends Model {
  profile() {
    return this.hasOne(Profile, 'userId', 'id');
  }
}
```

### hasMany

Use `hasMany` when the current model owns many related records.

```ts
class User extends Model {
  posts() {
    return this.hasMany(Post, 'authorId', 'id');
  }
}
```

### belongsTo

Use `belongsTo` on the child side that contains the foreign key.

```ts
class Post extends Model {
  author() {
    return this.belongsTo(User, 'authorId', 'id');
  }
}
```

### belongsToMany

Use `belongsToMany` for many-to-many relations through a pivot table.

```ts
class User extends Model {
  roles() {
    return this.belongsToMany(
      Role,
      'roleUsers',
      'userId',
      'roleId',
      'id',
      'id',
    );
  }
}
```

### hasOneThrough

Use `hasOneThrough` to access one distant relation via an intermediate model.

```ts
class Mechanic extends Model {
  carOwner() {
    return this.hasOneThrough(Owner, Car, 'mechanicId', 'carId', 'id', 'id');
  }
}
```

### hasManyThrough

Use `hasManyThrough` to access many distant relations via an intermediate model.

```ts
class Country extends Model {
  posts() {
    return this.hasManyThrough(Post, User, 'countryId', 'authorId', 'id', 'id');
  }
}
```

### morphOne

Use `morphOne` for one polymorphic relation.

```ts
class User extends Model {
  avatar() {
    return this.morphOne(Image, 'imageable', 'id');
  }
}
```

### morphMany

Use `morphMany` for many polymorphic related records.

```ts
class Post extends Model {
  comments() {
    return this.morphMany(Comment, 'commentable', 'id');
  }
}
```

### morphToMany

Use `morphToMany` for polymorphic many-to-many relation through a pivot table.

```ts
class Post extends Model {
  tags() {
    return this.morphToMany(
      Tag,
      'taggable',
      'taggables',
      'taggableId',
      'tagId',
      'id',
      'id',
    );
  }
}
```

## Default related models

Single-result relationships support `withDefault()`:

- `belongsTo`
- `hasOne`
- `hasOneThrough`
- `morphOne`

Use it when a missing related record should resolve to a fallback model instead of `null`.

```ts
class Profile extends Model {
  user() {
    return this.belongsTo(User, 'userId').withDefault({
      name: 'Guest User',
      email: 'guest@example.com',
    });
  }
}
```

`withDefault()` accepts:

- A plain object of related model attributes
- An instance of the related model
- A callback that returns either of the above

```ts
user.profile().withDefault(new Profile({ bio: 'Not provided yet' }));

user.avatar().withDefault((parent) => ({
  url: `/images/default-${parent.getAttribute('id')}.png`,
}));
```

## Eager loading

```ts
await User.query().with('posts').get();

await User.query()
  .with({
    posts: (query) => query.latest().limit(5),
  })
  .get();
```

## Relationship filters and aggregates

```ts
await User.query().has('posts').get();
await User.query()
  .whereHas('posts', (q) => q.whereKey('published', true))
  .get();
await User.query().withCount('posts').get();
await User.query().withExists('posts').get();
await User.query().withSum('posts', 'views').get();
```

## Direct relation execution

```ts
const user = await User.query().firstOrFail();

await user.posts().get();
await user.posts().first();
await user.posts().where({ published: true }).getResults();
```
