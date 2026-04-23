# Arkormˣ Roadmap & Implementation Status

This document tracks all implemented and upcoming features for Arkormˣ.

## Implemented Features

## Adapter Transition Window

- `Model.setClient(...)` and direct delegate-map bootstrapping are deprecated in the current `next` line.
- `Model.setAdapter(...)` with `createPrismaDatabaseAdapter(...)` or `createKyselyAdapter(...)` is the primary documented runtime path.
- Prisma compatibility remains supported and covered by CI through the Arkorm 2.x transition window.
- SQL-backed relation filters and aggregates now fail fast when a callback shape cannot be compiled into adapter specs instead of silently dropping to the generic in-memory path.
- Unconstrained `with(...)` eager loads can now route through an adapter-owned `relationLoads` seam when an adapter explicitly implements it.
- Earliest removal target for delegate-first runtime APIs is Arkorm 3.0 after migration docs, parity coverage, and adapter-first examples remain in place.

### Core ORM

- [x] Model base class with attribute casting, mutators, and serialization
- [x] Attribute casting system with built-in and custom casts via `Attribute({ get, set })` objects
- [x] Query builder with fluent API
- [x] Query ergonomics helpers (`latest`, `oldest`, `limit`, `offset`, `forPage`)
- [x] Existence helpers (`exists`, `doesntExist`)
- [x] Typed collection-based query results (`get()` returns `ArkormCollection`)
- [x] `LengthAwarePaginator` support via `paginate(perPage, page)`
- [x] `Paginator` support via `simplePaginate(perPage, page)`
- [x] Pagination URL options (`path`, `query`, `fragment`, `pageName`) via `URLDriver`
- [x] Framework-specific URL driver override via `arkormx.config.*`
- [x] Collection integration (collect.js)
- [x] Attribute visibility (`hidden` / `visible` / `appends`)
- [x] Local scopes
- [x] Soft deletes (`withTrashed`, `onlyTrashed`, `restore`, `forceDelete`)
- [x] Global scopes
- [x] Model lifecycle events (`retrieved`, `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`, etc.)

### Relationship Layer

- [x] Familiar relationships (`hasOne`, `hasMany`, `belongsTo`, `belongsToMany`, `hasOneThrough`, `hasManyThrough`, `morphOne`, `morphMany`, `morphToMany`)
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
- [x] Transaction support
- [x] Event hooks (`retrieved`, `creating`, `updating`, `deleting`, etc.)
- [x] CLI tooling for model/resource generation/runnging migrations and seeders
- [x] Improved error handling and messages
- [x] Documentation site
- [x] More advanced relationship constraints
- [x] Performance optimizations
- [x] Class based event listeners via `dispatchesEvents` Model property
- [x] Callback-based event listeners via `booted` and `boot` Model methods and `Model.event()` method
- [x] Quiet mode for suppressing events and global scopes via `Model.withoutEvents()` and `saveQuietly()`, `deleteQuietly()`, `restoreQuietly()`, etc. methods.
- [x] Model comparison operators (`is`, `isNot`) and identity checks (`isSame`, `isNotSame`)

## Eloquent Parity (Phased)

Eloquent features a broad list of methods that make it a powerful ORM. For Arkormˣ, the most relevant methods are those that map cleanly to our current `Model -> QueryBuilder -> delegate` architecture and keep adapter portability, we have prioritized these for implementation.

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

### Phase 4.5 — Insert and upsert write parity

- [x] `insert(values)`
- [x] `insertOrIgnore(values)`
- [x] `insertGetId(values, sequence?)`
- [x] `insertUsing(columns, query)`
- [x] `insertOrIgnoreUsing(columns, query)`
- [x] `updateFrom(values)`
- [x] `updateOrInsert(attributes, values)`
- [x] `upsert(values, uniqueBy, update?)`

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

### Phase 7 — Final Transition

- [x] Remove delegate-first runtime APIs from the primary `Model` surface
- [x] Remove `Model.setClient(...)` and direct delegate-map bootstrapping from the supported runtime path
- [x] Replace `Model.getDelegate()` usage in runtime code with adapter-owned execution paths only
- [x] Remove Prisma-shaped generic constraints from core model and query types
- [x] Replace `PrismaDelegateLike`-anchored `ModelStatic`, `QueryBuilder`, and helper typing with adapter-native types
- [x] Move transaction APIs to adapter-first contracts without requiring Prisma client callback types in core runtime APIs
- [x] Eliminate remaining runtime fallbacks that still depend on delegate-shaped behavior for relation execution
- [ ] Complete adapter-level relation load execution for the Kysely path
- [ ] Close the remaining Prisma compatibility adapter feature gaps or explicitly isolate them to compatibility-only behavior
- [ ] Ensure eager loading, relation aggregates, and relation filters run through Arkorm-owned specs end to end
- [ ] Remove or rename delegate-oriented metadata and internals where `table` or adapter terminology is now the real runtime contract
- [ ] Update docs, examples, and upgrade guides to mark the adapter-first migration as complete rather than transitional
- [ ] Add parity and regression coverage proving adapter-first behavior without delegate-only runtime APIs
- [ ] Define and execute the final removal checklist for merging `next` into `main` as the completed adapter-first baseline

Success criteria:

- Arkorm no longer depends on Prisma delegate semantics in its core runtime or public typing model
- adapter-first execution is the only primary runtime path for new code, including relation execution fallback paths
- Prisma support remains only as a compatibility adapter, not as a shaping abstraction for core internals
- `next` can merge into `main` as the fully completed adapter-first architecture

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
