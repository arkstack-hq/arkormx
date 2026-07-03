# Relationships

Arkorm supports relationships with eager loading and constrained relationship querying.

## Define relationships

```ts
class User extends Model {
  posts() {
    return this.hasMany(Post, 'authorId', 'id')
  }
}

class Post extends Model {
  author() {
    return this.belongsTo(User, 'authorId', 'id')
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
- [`morphTo`](#morphto)
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
    return this.hasOne(Profile, 'userId', 'id')
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
    return this.hasMany(Post, 'authorId', 'id')
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
    return this.belongsTo(User, 'authorId', 'id')
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
    return this.belongsToMany(Role, 'roleUsers', 'userId', 'roleId', 'id', 'id')
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
import { PivotModel } from 'arkormx'

class MembershipPivot extends PivotModel {
  isActive() {
    return this.revokedAt == null
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
      .wherePivotNull('revokedAt')
  }
}

const roles = await user.roles().getResults()

roles.all()[0]?.getAttribute('membership')
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
    return this.hasOneThrough(Owner, Car, 'mechanicId', 'carId', 'id', 'id')
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
    return this.hasManyThrough(Post, User, 'countryId', 'authorId', 'id', 'id')
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
    return this.morphOne(Image, 'imageable')
  }
}
```

Arkorm infers `imageable_id` and `imageable_type` using `naming.case`. Override
the inferred columns and local key with positional arguments:

```ts
return this.morphOne(Image, 'imageable', 'owner_id', 'owner_type', 'uuid')
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
    return this.morphMany(Comment, 'commentable')
  }
}
```

`morphMany` uses the same argument order as `morphOne`:

```ts
morphMany(related, name, idColumn?, typeColumn?, localKey?);
```

### morphTo

Use `morphTo` on the inverse side of a polymorphic relation:

```ts
class Image extends Model {
  imageable() {
    return this.morphTo('imageable')
  }
}
```

ArkORM infers `imageable_type` and `imageable_id` using `naming.case`. You can
override the type column, ID column, and related owner key with positional
arguments:

```ts
return this.morphTo('imageable', 'imageable_type', 'imageable_id', 'id')
```

The second argument can instead be a model constructor. This keeps the
conventional type column, narrows the relation result type, and allows that
model to resolve without runtime registration:

```ts
return this.morphTo('imageable', User, 'imageable_id', 'id')
```

The value in the type column must match a registered model class name. ArkORM
automatically registers exported model classes found in the configured
`paths.models` directory and directories added with `loadModelsFrom()`. Register
models directly when they live outside those paths or are bundled:

```ts
registerModels(User, Post)
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
    return this.morphToMany(Tag, 'taggable')
  }
}
```

With the conventional pivot structure above, only the related model and pivot
name are required. Arkorm infers:

- Pivot table `taggables` from the plural form of `taggable`
- Morph columns `taggable_id` and `taggable_type`
- Related pivot key `tag_id` from the related `Tag` model and its `id` key
- Parent and related keys from each model's configured primary key

Inferred pivot columns respect `naming.case`. With `case: 'camel'`, the same
relationship uses `taggableId`, `taggableType`, and `tagId`.

For a non-conventional pivot schema, each inferred value can still be
overridden:

```ts
return this.morphToMany(
  Tag,
  'taggable',
  'custom_tag_links',
  'owner_id',
  'owner_type',
  'tag_reference_id',
  'uuid',
  'tag_uuid',
)
```

The complete positional signature is:

```ts
morphToMany(
  related,
  name,
  table?,
  foreignPivotKey?,
  typeColumn?,
  relatedPivotKey?,
  parentKey?,
  relatedKey?,
);
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
    })
  }
}
```

`withDefault()` accepts:

- A plain object of related model attributes
- An instance of the related model
- A callback that returns either of the above

```ts
user.profile().withDefault(new Profile({ bio: 'Not provided yet' }))

user.avatar().withDefault((parent) => ({
  url: `/images/default-${parent.getAttribute('id')}.png`,
}))
```

## Eager loading

```ts
await User.query().with('posts').get()

await User.query().with(['requester', 'pocket', 'consents', 'consents.user']).get()

await User.query()
  .with({
    profile: true,
    posts: (query) => query.latest().limit(5),
  })
  .get()

const user = await User.query().firstOrFail()

await user.load(['posts.comments'])
await user.loadCount(['posts', 'comments'])
await user.loadMissing({ profile: true, posts: (query) => query.latest() })
await user.loadMorph('parentable', {
  Photo: ['tags'],
  Post: ['comments'],
})
```

Use dotted relation paths when a child relationship should be eager loaded from
an already eager loaded parent. For example, `consents.user` first loads
`consents` and then eager loads `user` on every consent model in that result set.

Arkorm now throws a `RelationResolutionException` when an eager loaded
relationship path does not exist. That applies to both direct names such as
`with(['missing'])` and nested paths such as `load(['consents.missing'])`.

For adapter authors, unconstrained `with(...)` graphs can now route through the
adapter `relationLoads` seam when the adapter explicitly advertises that
capability. The Kysely adapter now implements that seam for both unconstrained
and constrained eager loads by consuming `RelationLoadPlan` specs and then
delegating execution through Arkorm's set-based eager loader. `Model.load(...)`
uses that same plan path. The Prisma compatibility adapter intentionally does
not advertise `relationLoads`, so eager loads there continue to use Arkorm's
generic loader on the compatibility path.

## Relationship filters and aggregates

```ts
await User.query().has('posts').get()
await User.query()
  .whereHas('posts', (q) => q.whereKey('published', true))
  .get()
await User.query().withCount('posts').get()
await User.query().withExists('posts').get()
await User.query().withSum('posts', 'views').get()
await User.query()
  .withCount({
    posts: true,
    comments: (query) => query.whereKey('approved', true),
  })
  .get()
await User.query().withSum('comments as total_votes', 'votes').get()
```

Use `loadCount(...)` when you already have a model instance and want to attach
relationship counts without reloading the related records. Count attributes use
the same names as `withCount(...)`, such as `postsCount`.

Use `loadSum(...)` the same way when you need sum aggregates on an existing
model instance. Aggregate helpers accept Laravel-style aliases with
`relation as alias`, and object syntax accepts `true` for an unconstrained
relation or a callback for a constrained relation.

Use `loadMorph(...)` when a polymorphic relation is already available and each
resolved model type needs a different nested eager load map. The keys are model
class names, such as `Photo` or `Post`.

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
const user = await User.query().firstOrFail()

await user.posts().get()
await user.posts().first()
await user.posts().where({ published: true }).getResults()
```

Relation objects expose the query operations most commonly needed for related
records:

```ts
await user.posts().count()
await user.posts().exists()
await user.posts().doesntExist()
await user.posts().firstOrFail()
await user.posts().find(100)
await user.posts().findMany([100, 101])
await user.posts().findOr(100, () => null)
await user.posts().findOrFail(100)
await user.posts().firstWhere('title', 'Welcome')
await user.posts().paginate(15)
await user.posts().simplePaginate(15)
```

### Constraining a relationship query

A relation query proxies the [Query Builder](/guide/query-builder): almost every
builder method is available on a relationship and returns the relation for
chaining, so you can constrain related records before fetching them. Terminate
the chain with a read (`get()`/`getResults()`, `first()`, `count()`,
`paginate()`, …).

```ts
const recent = await user
  .posts()
  .where({ published: true })
  .whereNotNull('publishedAt')
  .whereJsonContains('meta', { featured: true })
  .orderBy({ publishedAt: 'desc' })
  .limit(5)
  .get()
```

The families carried over from the query builder include:

- **Where clauses** — `where`, `orWhere`, `whereNot`, `orWhereNot`, `whereNull`,
  `whereNotNull`, `whereIn`/`orWhereIn`/`whereNotIn`/`orWhereNotIn`, `whereBetween`,
  `whereColumn`, `whereKey`/`whereKeyNot`, `whereExists`, `whereRaw`/`orWhereRaw`.
- **String matching** — `whereLike`/`orWhereLike`/`whereNotLike`/`orWhereNotLike`,
  `whereStartsWith`/`whereEndsWith`.
- **Dates** — `whereDate`, `whereMonth`, `whereYear`, `whereTime`, `whereDay`, and
  the relative-date helpers (`wherePast`, `whereFuture`, `whereToday`, …).
- **JSON** — `whereJsonContains`/`whereJsonDoesntContain`,
  `whereJsonContainsKey`/`whereJsonDoesntContainKey`, `whereJsonLength`,
  `whereJsonOverlaps`, and their `orWhere` variants.
- **Full-text** — `whereFullText`/`orWhereFullText`.
- **Ordering & limits** — `orderBy`, `latest`, `oldest`, `inRandomOrder`,
  `reorder`, `skip`/`offset`, `take`/`limit`, `forPage`.
- **Selection, grouping & loading** — `select`/`addSelect`, `distinct`, `groupBy`,
  `having`/`orHaving`/`havingRaw`/`orHavingRaw`, `include`, `with` (nested eager
  loads), `scope` (named model scopes).
- **Soft deletes** — `withTrashed`, `onlyTrashed`, `withoutTrashed`.

For an escape hatch, `constrain(query => …)` injects a raw query-builder callback:

```ts
await user
  .posts()
  .constrain((query) => query.whereRaw('char_length(title) > ?', [10]))
  .get()
```

See the [Query Builder](/guide/query-builder) guide for the full semantics of
each method.

## Creating related records

`make()` and `makeMany()` apply the relationship's foreign-key attributes
without saving:

```ts
const draft = user.posts().make({
  title: 'Draft',
})

const drafts = user.posts().makeMany([{ title: 'First draft' }, { title: 'Second draft' }])
```

Use `create()` and `createMany()` to persist immediately:

```ts
const post = await user.posts().create({
  title: 'Published',
})

const posts = await user.posts().createMany([{ title: 'One' }, { title: 'Two' }])
```

Existing model instances can be persisted through the relation:

```ts
await user.posts().save(post)
await user.posts().saveMany(posts)
```

Quiet variants, `saveQuietly()` and `saveManyQuietly()`, suppress model
lifecycle events.

## Find or create

```ts
const unsaved = await user.posts().firstOrNew({ slug: 'welcome' }, { title: 'Welcome' })

const persisted = await user.posts().firstOrCreate({ slug: 'welcome' }, { title: 'Welcome' })

const updated = await user.posts().updateOrCreate({ slug: 'welcome' }, { title: 'Updated welcome' })
```

Relation `upsert()` accepts the same unique-key and update-column arguments as
the query builder while automatically adding relationship creation attributes.

## Many-to-many writes

`belongsToMany()` relations support pivot writes:

```ts
await user.roles().attach(role, {
  approved: true,
})

await user.roles().detach(role)

await user.roles().sync([role, anotherRole])
```

`attach()` accepts a related model or key plus optional pivot attributes.
`detach()` removes selected related keys, or all pivot rows when called without
an argument. `sync()` makes the pivot rows match the supplied models or keys.

`sync()` returns a summary of what changed:

```ts
const changes = await user.roles().sync([role, anotherRole])
// { attached: number, detached: number, updated: number }
```

To set pivot columns per row, pass an object keyed by the related id:

```ts
await user.roles().sync({
  [role.id]: { approved: true },
  [anotherRole.id]: { approved: false },
})
```

`create()` and `save()` on a many-to-many relation also take pivot attributes as
a second argument, written alongside the new pivot row:

```ts
await user.roles().create({ name: 'editor' }, { approved: true })
await user.roles().save(existingRole, { approved: false })
```
