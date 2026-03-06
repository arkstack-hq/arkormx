# Arkorm Roadmap & Implementation Status

This document tracks all implemented and upcoming features for Arkorm.

## Implemented Features

### Core ORM

- [x] Model base class with attribute casting, mutators, and serialization
- [x] Query builder with fluent API
- [x] Query ergonomics helpers (`latest`, `oldest`, `limit`, `offset`, `forPage`)
- [x] Existence helpers (`exists`, `doesntExist`)
- [x] Typed collection-based query results (`get()` returns `ArkormCollection`)
- [x] `LengthAwarePaginator` support via `paginate(page, perPage)`
- [x] `Paginator` support via `simplePaginate(perPage, page)`
- [x] Pagination URL options (`path`, `query`, `fragment`, `pageName`) via `URLDriver`
- [x] Framework-specific URL driver override via `arkorm.config.*`
- [x] Collection integration (collect.js)
- [x] Attribute visibility (`hidden` / `visible` / `appends`)
- [x] Local scopes
- [x] Soft deletes (`withTrashed`, `onlyTrashed`, `restore`, `forceDelete`)
- [x] Global scopes
- [x] Model lifecycle events (`creating`, `created`, `updating`, `updated`, `deleting`, `deleted`, etc.)

### Relationship Layer

- [x] Eloquent-style relationships (`hasOne`, `hasMany`, `belongsTo`, `belongsToMany`, `hasOneThrough`, `hasManyThrough`, `morphOne`, `morphMany`, `morphToMany`)
- [x] Eager loading with constraints
- [x] Fluent relationship query chaining (`relation.where(...).orderBy(...).getResults()`)
- [x] Relationship execution helpers (`relation.get()` and `relation.first()`)

### Adapter & Runtime

- [x] Prisma delegate adapter/helper
- [x] Database adapter layer (`Model.setAdapter` + PrismaAdapter)
- [x] Prisma schema + migration workflow

### Testing & Quality

- [x] Comprehensive test suite
- [x] Dedicated relationship coverage in both core and PostgreSQL test suites
- [x] PostgreSQL integration test suite (real DB)
- [x] CI PostgreSQL service integration tests
- [x] Publish pipeline PostgreSQL integration gate
- [x] TypeScript strict mode compatibility

## Upcoming / Planned Features

- [x] Global scopes
- [ ] Transaction support
- [x] Event hooks (creating, updating, deleting, etc.)
- [ ] Validation integration
- [x] CLI tooling for model/resource generation/runnging migrations and seeders
- [ ] Improved error handling and messages
- [ ] Documentation site
- [x] More advanced relationship constraints
- [ ] Performance optimizations

## Eloquent Parity (Phased)

Eloquent features a broad list of methods that make it a powerful ORM. For Arkorm, the most relevant methods are those that map cleanly to our current `Model -> QueryBuilder -> delegate` architecture and keep adapter portability, we have prioritized these for implementation.

### Phase 1 — High-impact, low-risk query ergonomics

- [x] `latest(column = 'createdAt')` (alias for `orderBy({ column: 'desc' })`)
- [x] `oldest(column = 'createdAt')` (alias for `orderBy({ column: 'asc' })`)
- [x] `limit(value)` (alias for `take(value)`)
- [x] `offset(value)` (alias for `skip(value)`)
- [x] `forPage(page, perPage)` (page helper over `skip/take`)
- [x] `exists()` (fast existence check via constrained `findFirst`)
- [x] `doesntExist()` (negation of `exists()`)

### Phase 2 — Core filtering parity for day-to-day usage

- [x] `orWhere(...)`
- [x] `whereNot(...)` / `orWhereNot(...)`
- [x] `whereNull(column)` / `whereNotNull(column)`
- [x] `whereBetween(column, [min, max])`
- [x] `whereDate/whereMonth/whereYear` (initial date helpers)
- [x] `whereKeyNot(key, value)`
- [x] `firstWhere(column, operator?, value?)`
- [x] `orWhereIn(...)` / `whereNotIn(...)` / `orWhereNotIn(...)`

### Phase 3 — Read helpers and utility shortcuts

- [x] `findOr(id, callback)`
- [x] `value(column)` (first row column value)
- [x] `valueOrFail(column)`
- [x] `pluck(column, key?)`
- [x] `inRandomOrder()`
- [x] `reorder(column?, direction?)`
- [x] `when(value, callback, default?)` / `unless(value, callback, default?)`
- [x] `tap(callback)` / `pipe(callback)`

### Phase 4 — Aggregates and advanced querying

- [x] `min(column)`
- [x] `max(column)`
- [x] `sum(column)`
- [x] `avg(column)`
- [x] `whereRaw(...)` / `orWhereRaw(...)` (adapter-gated)
- [x] `existsOr(callback)` / `doesntExistOr(callback)`

### Phase 5 — Relationship existence/query parity

- [x] `has(...)` / `orHas(...)`
- [x] `doesntHave(...)` / `orDoesntHave(...)`
- [x] `whereHas(...)` / `orWhereHas(...)`
- [x] `whereDoesntHave(...)` / `orWhereDoesntHave(...)`
- [x] `withCount(...)`
- [x] `withExists(...)`
- [x] `withSum(...)` / `withAvg(...)` / `withMin(...)` / `withMax(...)`

### Phase 6 — Database migration, seeding and factory helpers

- [x] Factory definitions and helpers
- [x] Seeder classes and execution helpers
- [x] Migration file generation and schema builder

### Out of scope

Lower priority until global scopes, events, and transactions are stable:

- Chunking/lazy/cursor APIs (`chunk`, `lazy`, `cursorPaginate`, etc.)
- SQL-specific join family (`join*`, `crossJoin*`, lateral joins)
- Macro system parity (`macro`, `mixin`, `flushMacros`)

## Status Legend

- [x] Implemented
- [ ] Planned / Not yet implemented

---

_This document will be updated as features are implemented._
