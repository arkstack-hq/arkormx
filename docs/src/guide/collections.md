# Collections

Every method that returns multiple records hands you an `ArkormCollection`
rather than a plain array:

- `Model.query().get()` and `Model.all()`
- relationship reads (`user.posts().get()`, eager-loaded `hasMany`/`belongsToMany` results)
- `Model.query().pluck(column)`
- `DB.raw(...)`
- a paginator's `page.data`

`ArkormCollection` extends the [`@h3ravel/collect.js`](https://github.com/h3ravel/collect.js)
`Collection`, which mirrors Laravel's Collection API. It is iterable and fluent —
every transforming method returns a new collection, so calls chain.

```ts
const users = await User.query().get()

users.count() // number of items
users.isEmpty() // boolean
users.all() // plain array of models
```

## Getting items out

```ts
users.all() // model[] — the underlying array
users.first() // first model, or undefined
users.first((user) => user.getAttribute('isActive')) // first match
users.last()
users.firstOrFail() // throws when empty
users.get(0) // by index
users.sole((u) => u.getAttribute('email') === 'jane@example.com') // exactly one or throws
```

## Transforming

```ts
users.map((user) => user.getAttribute('email')) // Collection of emails
users.filter((user) => user.getAttribute('isActive'))
users.reject((user) => user.getAttribute('isActive')) // inverse of filter
users.each((user) => log(user)) // side effects, returns the collection
users.reduce((carry, user) => carry + user.getAttribute('score'), 0)
users.flatMap((user) => user.tags)
users.tap((c) => console.log(c.count())) // peek without breaking the chain
```

## Keys, grouping, and plucking

```ts
users.pluck('email') // Collection of email values
users.pluck('email', 'id') // Collection keyed by id
users.keyBy('id') // dictionary keyed by a column/callback
users.groupBy('role') // groups into { role => Collection }
users.partition((user) => user.getAttribute('isActive')) // [active, inactive]
users.chunk(100) // Collection of Collections of up to 100
```

## Filtering by attribute

Collections carry their own `where` helpers that operate on the loaded items (no
database round-trip — distinct from the query builder's `where`):

```ts
users.where('role', 'admin')
users.whereIn('role', ['admin', 'editor'])
users.whereNotNull('email')
users.whereBetween('score', [10, 100])
users.only(['id', 'email']) // keep only these keys per item
users.except(['password'])
```

## Aggregates

```ts
users.count()
users.sum('score')
users.avg('score') // alias: average
users.min('score')
users.max('score')
users.countBy('role') // { admin: 3, editor: 2 }
```

## Ordering and uniqueness

```ts
users.sortBy('score') // ascending
users.sortByDesc('score')
users.sort() // natural order
users.reverse()
users.unique('email')
users.duplicates('email')
users.shuffle()
```

## Combining and mutating

```ts
active.merge(inactive)
active.concat(otherArray)
collection.push(model)
collection.prepend(model)
collection.take(5) // first 5 (negative takes from the end)
collection.skip(5)
collection.forPage(2, 15) // page 2, 15 per page
```

## Serialization

```ts
users.toArray() // deep plain array (models become plain objects)
users.toJson() // JSON string
JSON.stringify(users) // uses the collection's JSON representation
```

Because `ArkormCollection` is a full [collect.js](https://github.com/h3ravel/collect.js)
`Collection`, every method from that library is available here — the list above
is the commonly used subset. Reach for the query builder when you want the
database to do the work (filtering, sorting, aggregating at scale), and reach for
collection methods when you are shaping data already loaded into memory.
