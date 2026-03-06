# Arkorm Roadmap & Implementation Status

This document tracks all implemented and upcoming features for Arkorm.

## Implemented Features

- [x] Model base class with attribute casting, mutators, and serialization
- [x] Query builder with fluent API
- [x] Typed collection-based query results (`get()` returns `ArkormCollection`)
- [x] Eloquent-style relationships (hasOne, hasMany, belongsTo, belongsToMany, hasOneThrough, hasManyThrough, morphOne, morphMany, morphToMany)
- [x] Eager loading with constraints
- [x] Fluent relationship query chaining (`relation.where(...).orderBy(...).getResults()`)
- [x] Relationship execution helpers (`relation.get()` and `relation.first()`)
- [x] Pagination support
- [x] Collection integration (collect.js)
- [x] Attribute visibility (hidden/visible/appends)
- [x] Local scopes
- [x] Soft deletes (withTrashed, onlyTrashed, restore, forceDelete)
- [x] Prisma delegate adapter/helper
- [x] Database adapter layer (Model.setAdapter + PrismaAdapter)
- [x] Prisma schema + migration workflow
- [x] PostgreSQL integration test suite (real DB)
- [x] CI PostgreSQL service integration tests
- [x] Publish pipeline PostgreSQL integration gate
- [x] Comprehensive test suite
- [x] Dedicated relationship coverage in both core and PostgreSQL test suites
- [x] TypeScript strict mode compatibility

## Upcoming / Planned Features

- [ ] Global scopes
- [ ] Transaction support
- [ ] Event hooks (creating, updating, deleting, etc.)
- [ ] Validation integration
- [ ] CLI tooling for model/resource generation
- [ ] Improved error handling and messages
- [ ] Documentation site
- [ ] More advanced relationship constraints
- [ ] Performance optimizations
- [ ] Additional database adapters (non-Prisma drivers)

## Eloquent Parity (Phased)

Eloquent features a broad list of methods that make it a powerful ORM. For Arkorm, the most relevant methods are those that map cleanly to our current `Model -> QueryBuilder -> delegate` architecture and keep adapter portability, we have prioritized these for implementation.

### Phase 1 — High-impact, low-risk query ergonomics

- [ ] `latest(column = 'createdAt')` (alias for `orderBy({ column: 'desc' })`)
- [ ] `oldest(column = 'createdAt')` (alias for `orderBy({ column: 'asc' })`)
- [ ] `limit(value)` (alias for `take(value)`)
- [ ] `offset(value)` (alias for `skip(value)`)
- [ ] `forPage(page, perPage)` (page helper over `skip/take`)
- [ ] `exists()` (fast existence check via constrained `findFirst`)
- [ ] `doesntExist()` (negation of `exists()`)

### Phase 2 — Core filtering parity for day-to-day usage

- [ ] `orWhere(...)`
- [ ] `whereNot(...)` / `orWhereNot(...)`
- [ ] `whereNull(column)` / `whereNotNull(column)`
- [ ] `whereBetween(column, [min, max])`
- [ ] `whereDate/whereMonth/whereYear` (initial date helpers)

### Phase 3 — Read helpers and utility shortcuts

- [ ] `findOr(id, callback)`
- [ ] `value(column)` (first row column value)
- [ ] `pluck(column, key?)`
- [ ] `inRandomOrder()`
- [ ] `reorder(column?, direction?)`

### Phase 4 — Aggregates and advanced querying

- [ ] `min(column)`
- [ ] `max(column)`
- [ ] `sum(column)`
- [ ] `avg(column)`
- [ ] `whereRaw(...)` / `orWhereRaw(...)` (adapter-gated)

### Out of scope (for now)

These are lower priority until global scopes, events, and transactions are stable:

- Chunking/lazy/cursor APIs (`chunk`, `lazy`, `cursorPaginate`, etc.)
- SQL-specific join family (`join*`, `crossJoin*`, lateral joins)
- Macro system parity (`macro`, `mixin`, `flushMacros`)

## Status Legend

- [x] Implemented
- [ ] Planned / Not yet implemented

---

_This document will be updated as features are implemented._
