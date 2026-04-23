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

Example table structure:

```txt
users
  id - integer
  name - string

profiles
  id - integer
  user_id - integer, unique, references users.id
  bio - string | null
```

```ts
class User extends Model {
  profile() {
    return this.hasOne(Profile, 'userId', 'id');
  }
}
```

### hasMany

Use `hasMany` when the current model owns many related records.

Example table structure:

```txt
users
  id - integer
  name - string

posts
  id - integer
  author_id - integer, references users.id
  title - string
```

```ts
class User extends Model {
  posts() {
    return this.hasMany(Post, 'authorId', 'id');
  }
}
```

### belongsTo

Use `belongsTo` on the child side that contains the foreign key.

Example table structure:

```txt
users
  id - integer
  name - string

posts
  id - integer
  author_id - integer, references users.id
  title - string
```

```ts
class Post extends Model {
  author() {
    return this.belongsTo(User, 'authorId', 'id');
  }
}
```

### belongsToMany

Use `belongsToMany` for many-to-many relations through a pivot table.

Example table structure:

```txt
users
  id - integer
  name - string

roles
  id - integer
  name - string, unique

role_users
  user_id - integer, references users.id
  role_id - integer, references roles.id
  approved - boolean
  priority - integer | null
  assigned_at - datetime | null
  revoked_at - datetime | null
  created_at - datetime | null
  updated_at - datetime | null
  primary key - (user_id, role_id)
```

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

#### Pivot helpers

- `withPivot(...columns)` includes additional pivot columns on each related model.
- `withTimestamps(createdAtColumn = 'createdAt', updatedAtColumn = 'updatedAt')` includes pivot timestamps.
- `as(accessor)` renames the pivot payload accessor from the default `pivot`.
- `using(PivotModel)` hydrates the pivot payload into a custom class.
- `wherePivot(column, value)` adds an equality filter on the pivot table.
- `wherePivot(column, operator, value)` adds an operator-based pivot filter.
- `wherePivotNotIn(column, values)` excludes pivot rows by value list.
- `wherePivotBetween(column, [min, max])` constrains pivot rows to a range.
- `wherePivotNotBetween(column, [min, max])` excludes pivot rows inside a range.
- `wherePivotNull(column)` requires a null pivot column.
- `wherePivotNotNull(column)` requires a non-null pivot column.

```ts
import { PivotModel } from 'arkormx';

class MembershipPivot extends PivotModel {
  isActive() {
    return this.revokedAt == null;
  }
}

class User extends Model {
  roles() {
    return this.belongsToMany(Role, 'roleUsers', 'userId', 'roleId', 'id', 'id')
      .as('membership')
      .using(MembershipPivot)
      .withPivot('approved', 'priority', 'assignedAt', 'revokedAt')
      .withTimestamps()
      .wherePivot('approved', true)
      .wherePivotBetween('priority', [1, 5])
      .wherePivotNull('revokedAt');
  }
}

const roles = await user.roles().getResults();

roles.all()[0]?.getAttribute('membership');
```

When you call `withPivot()`, `withTimestamps()`, `as()`, or `using()`, Arkorm attaches the pivot payload to the related model during direct relation execution and eager loading.

### hasOneThrough

Use `hasOneThrough` to access one distant relation via an intermediate model.

Example table structure:

```txt
mechanics
  id - integer
  name - string

cars
  id - integer
  mechanic_id - integer, references mechanics.id

owners
  id - integer
  car_id - integer, unique, references cars.id
  name - string
```

```ts
class Mechanic extends Model {
  carOwner() {
    return this.hasOneThrough(Owner, Car, 'mechanicId', 'carId', 'id', 'id');
  }
}
```

### hasManyThrough

Use `hasManyThrough` to access many distant relations via an intermediate model.

Example table structure:

```txt
countries
  id - integer
  name - string

users
  id - integer
  country_id - integer, references countries.id
  name - string

posts
  id - integer
  author_id - integer, references users.id
  title - string
```

```ts
class Country extends Model {
  posts() {
    return this.hasManyThrough(Post, User, 'countryId', 'authorId', 'id', 'id');
  }
}
```

### morphOne

Use `morphOne` for one polymorphic relation.

Example table structure:

```txt
users
  id - integer
  name - string

images
  id - integer
  imageable_id - integer
  imageable_type - string
  url - string
```

```ts
class User extends Model {
  avatar() {
    return this.morphOne(Image, 'imageable', 'id');
  }
}
```

### morphMany

Use `morphMany` for many polymorphic related records.

Example table structure:

```txt
posts
  id - integer
  title - string

comments
  id - integer
  commentable_id - integer
  commentable_type - string
  body - string
```

```ts
class Post extends Model {
  comments() {
    return this.morphMany(Comment, 'commentable', 'id');
  }
}
```

### morphToMany

Use `morphToMany` for polymorphic many-to-many relation through a pivot table.

Example table structure:

```txt
posts
  id - integer
  title - string

tags
  id - integer
  name - string, unique

taggables
  taggable_id - integer
  taggable_type - string
  tag_id - integer, references tags.id
  primary key - (taggable_id, taggable_type, tag_id)
```

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

await User.query().with(['requester', 'pocket', 'consents', 'consents.user']).get();

await User.query()
  .with({
    posts: (query) => query.latest().limit(5),
  })
  .get();

const user = await User.query().firstOrFail();

await user.load(['posts.comments']);
```

Use dotted relation paths when a child relationship should be eager loaded from
an already eager loaded parent. For example, `consents.user` first loads
`consents` and then eager loads `user` on every consent model in that result set.

Arkorm now throws a `RelationResolutionException` when an eager loaded
relationship path does not exist. That applies to both direct names such as
`with(['missing'])` and nested paths such as `load(['consents.missing'])`.

For adapter authors, unconstrained `with(...)` graphs can now route through the
adapter `relationLoads` seam when the adapter explicitly advertises that
capability. Constrained eager loading callbacks and direct `Model.load(...)`
still use Arkorm's generic set-based eager loader until later migration steps.

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

On SQL-backed adapters, keep relation filter callbacks predicate-focused. Query
shapes such as nested eager loading, pagination, or other non-filter
modifications inside `whereHas(...)` callbacks are not compiled into adapter
relation specs and now fail fast instead of silently falling back to generic
in-memory relation execution.

The remaining generic relation execution paths, including constrained eager
loading and `Model.load(...)`, run through Arkorm's adapter-backed relation
loaders rather than the deprecated delegate runtime APIs. Adapter feature parity
is still an active migration task, but relation execution itself no longer
depends on `Model.getDelegate()`.

## Direct relation execution

```ts
const user = await User.query().firstOrFail();

await user.posts().get();
await user.posts().first();
await user.posts().where({ published: true }).getResults();
```
