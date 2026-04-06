# Arkorm Migration Plan: Delegate Runtime to Adapter-First SQL

## Goal

Move Arkorm from its current Prisma-delegate-centered runtime to an adapter-first architecture that can support a Kysely-backed SQL implementation without changing Arkorm's public Eloquent-style API.

The long-term public API should remain centered on:

- `Model`
- `QueryBuilder`
- relation classes such as `HasManyRelation`, `BelongsToRelation`, and `BelongsToManyRelation`

The backend should become an implementation detail behind an Arkorm-owned adapter contract.

## Why This Plan Exists

Arkorm currently works, but its execution model is still shaped around Prisma-like delegates. That backend shape is good enough for basic CRUD, but it limits how far Arkorm can go as a real ORM.

This migration is intended to improve:

- relationship loading efficiency
- control over generated SQL
- support for set-based eager loading and aggregates
- scalability for complex relation graphs
- long-term backend portability beyond Prisma

## Current State Snapshot

As of this revision, Arkorm is in an active transition from delegate-first execution to adapter-first runtime planning.

What exists today:

- `Model.query()` now resolves a runtime adapter and passes it into `QueryBuilder`.
- `QueryBuilder` now compiles its core read and write operations into Arkorm-owned specs and executes them through the adapter seam.
- the Prisma compatibility adapter now handles the current Prisma-like runtime behind the Arkorm adapter contract.
- several relation classes still call `getDelegate()` directly for through and pivot operations.
- relation aggregates and relation filters are still constrained by transitional delegate-shaped execution and in-memory fallback behavior.
- `UnsupportedAdapterFeatureException` now reflects explicit adapter capability boundaries rather than QueryBuilder-level delegate fallbacks.

This means the adapter boundary now exists for core model operations and QueryBuilder execution, but relation execution and SQL-backed relation planning still need to be migrated before Arkorm can be considered adapter-first end to end.

## Concrete Code Hotspots

The migration should be planned around the files that currently define the runtime shape:

- `src/Model.ts`
- `src/QueryBuilder.ts`
- `src/relationship/BelongsToManyRelation.ts`
- `src/relationship/HasManyThroughRelation.ts`
- `src/relationship/HasOneThroughRelation.ts`
- `src/relationship/MorphToManyRelation.ts`
- `src/helpers/runtime-config.ts`
- `src/types/model.ts`
- `src/types/core.ts`

These files currently encode most of the delegate assumptions that need to be removed or isolated.

## Target Architecture

The target architecture should be adapter-first, with Arkorm owning query intent and backend implementations owning execution.

### Desired Layers

1. Public ORM layer

- `Model`
- `QueryBuilder`
- relation classes
- scopes
- soft delete behavior
- hydration and serialization

2. Internal Arkorm query layer

- query state
- query spec types
- relation load plans
- aggregate specifications
- model metadata

3. Adapter layer

- Arkorm-defined database adapter contract
- Prisma compatibility adapter
- Kysely adapter
- transaction integration
- dialect-specific helpers where necessary

4. Driver layer

- Postgres driver for actual SQL execution
- room for other SQL dialects later if the adapter contract stays clean

## Migration Principles

1. Preserve the Arkorm public API where practical.
2. Replace delegate assumptions at the adapter boundary instead of leaking backend semantics upward.
3. Move relation execution from model-by-model loading to set-based loading.
4. Push aggregates and relation filters into SQL when practical.
5. Keep the migration incremental enough that Arkorm can continue shipping during the transition.
6. Prefer Arkorm-native abstractions over a one-to-one mirror of Prisma or Kysely APIs.

## Revised Problem Statement

The main problem is not Prisma itself. The main problem is that Arkorm internal execution is shaped like a delegate wrapper instead of a full ORM planning layer.

That creates several constraints:

- `QueryBuilder` is coupled to delegate method names and delegate argument shapes.
- relation classes perform extra round trips directly instead of going through a central load planner.
- relation aggregates are hard to express efficiently because the execution layer is not SQL-native.
- `has` and `whereHas` are difficult to push down cleanly because Arkorm does not yet compile relationship intent into backend-agnostic specs.

Kysely is the recommended target backend because it gives Arkorm SQL control without taking ownership of the ORM abstraction.

## Recommended Backend Stack

Core recommendation:

- `kysely`

Postgres-first driver recommendation:

- `postgres` or `pg`

Suggested default target:

- `kysely`
- `postgres`

Reasoning:

- Kysely is SQL-native and type-safe.
- Arkorm keeps ownership of models, relations, scopes, serialization, hydration, and soft deletes.
- Kysely is flexible enough for joins, subqueries, CTEs, JSON aggregation, and correlated aggregate queries.

## Adapter Contract Direction

Arkorm should define a backend contract around ORM behavior, not around Prisma delegate methods.

The contract should support at least these capability groups:

- select one
- select many
- insert one
- insert many
- update one
- update many
- delete one
- delete many
- count
- exists
- transaction

It should also leave room for richer features later:

- relation batch loading
- aggregate projection
- existence and count subqueries
- raw predicates only when explicitly supported by the adapter

The adapter API should be described in Arkorm types under `src/types`, not buried inside runtime code.

## Internal Query Spec Direction

Before Kysely can be introduced cleanly, Arkorm needs internal query specification types.

`QueryBuilder` should build Arkorm-owned specs rather than immediately calling delegate methods.

Minimum useful spec areas:

- model or table target
- selected columns or projections
- where conditions
- ordering
- pagination
- include or eager-load plan
- aggregate plan
- mutation payloads
- unique row targeting
- soft delete behavior

These specs do not need to be perfect on day one. They just need to be expressive enough to support current behavior through a Prisma compatibility adapter.

## Metadata Needed for SQL Compilation

To compile efficient SQL, Arkorm will need metadata beyond the current delegate naming conventions.

Recommended metadata:

- table name
- primary key
- optional column map when property names differ from column names
- soft delete column metadata
- relation metadata
- pivot table metadata for many-to-many relations
- morph type and morph id metadata for polymorphic relations

Possible direction:

```ts
class User extends Model {
  protected static override table = 'users';
  protected static override primaryKey = 'id';
}
```

This metadata should be introduced early, but in a way that does not break existing naming conventions immediately.

## QueryBuilder Refactor Strategy

`QueryBuilder` is the critical seam.

Today it holds:

- a delegate reference
- query state tightly coupled to delegate argument shapes

It should eventually hold:

- a model reference
- Arkorm query state
- an adapter reference

### Responsibilities to Keep in QueryBuilder

- fluent chaining
- scopes
- soft delete semantics
- pagination helpers
- hydration orchestration
- eager-load intent registration

### Responsibilities to Move Downward

- backend-specific execution
- SQL generation
- batch relation execution
- aggregate pushdown
- backend capability checks

## Relation Loading Redesign

This is the highest-value runtime improvement, but it should come after the adapter boundary exists.

Current relation loading is still too tied to per-model delegate calls, especially for through and pivot-based relations.

### Target Loading Strategy

#### BelongsTo

- collect foreign keys from parents
- execute one related query using `IN (...)`
- map related rows back to parents

#### HasMany

- collect parent keys
- execute one child query using `IN (...)`
- group children by foreign key

#### HasOne

- same batch approach as `HasMany`
- choose the first related row per parent

#### BelongsToMany

- query pivot and related data in one joined operation where practical
- otherwise at least batch the pivot phase and related phase instead of resolving per parent

#### HasManyThrough and HasOneThrough

- replace nested through-round-trips with explicit join-based or batched-through execution

#### Morph Relations

- batch by morph type and morph id
- keep these later in the migration because they are more complex

The goal is not one giant SQL statement for every graph. The goal is predictable set-based loading with bounded round trips.

## Aggregates and Relation Filters

These should move to SQL-backed execution after the adapter boundary and base CRUD work are stable.

Features in scope:

- `withCount`
- `withExists`
- `withSum`
- `withAvg`
- `withMin`
- `withMax`
- `has`
- `whereHas`
- `doesntHave`
- `orWhereHas`

Preferred SQL forms:

- correlated `EXISTS (...)`
- `NOT EXISTS (...)`
- correlated aggregate subqueries
- grouped joins only when they do not distort result shape

The point is to stop materializing whole relation collections merely to compute counts, sums, or existence checks.

## Transaction Model Direction

Arkorm transaction scoping should remain part of the public API.

Target behavior:

- `Model.transaction()` delegates to adapter-managed transactions
- nested transactions reuse the current adapter transaction context where appropriate
- runtime transaction scoping stays in Arkorm helpers, but no longer depends on raw delegate semantics

## Runtime Configuration Direction

The runtime should move from client-first to adapter-first configuration.

Target primary setup:

```ts
Model.setAdapter(createKyselyAdapter(db, config));
```

Transition setup:

```ts
Model.setAdapter(createPrismaCompatibilityAdapter(prisma));
```

Compatibility support can continue to infer delegates for a transition period, but that should stop being the primary documented runtime path.

## Phased Migration Plan

### Phase 0: Freeze the Architectural Baseline

Deliverables:

- document current delegate-first execution points in `Model`, `QueryBuilder`, and relation classes
- add repository notes for known delegate-only paths
- confirm the current base and postgres test suites are green before refactoring begins

Implementation checklist:

- [ ] audit `src/Model.ts` for delegate-only entry points and note them inline in the plan or repo memory
- [ ] audit `src/QueryBuilder.ts` for direct delegate method usage and group those usages by operation type
- [ ] audit relation classes for direct `getDelegate()` calls, especially pivot and through relations
- [ ] identify runtime-config code paths that assume a Prisma client instead of a generic adapter
- [ ] record the current green test command set for base and postgres coverage
- [ ] decide which current behaviors are compatibility guarantees versus behaviors that may change during migration

Success criteria:

- the team agrees on the exact current seams to refactor
- this migration plan matches the codebase instead of an aspirational future state

### Phase 1: Introduce Arkorm Adapter Types

Status: completed

Deliverables:

- define `DatabaseAdapter` and related spec types in `src/types`
- define capability types or feature flags for optional adapter features
- define row, mutation, select, and transaction spec shapes at the Arkorm layer

Implementation checklist:

- [x] add adapter contract types under `src/types`
- [x] define select, mutation, aggregate, relation-load, and transaction spec types
- [x] define adapter capability flags or feature descriptors for optional features
- [x] define shared row and result types that are not Prisma-specific
- [x] review existing type exports and decide where the new adapter types should be re-exported
- [x] add type-level tests or compile-only fixtures for the new public and internal type shapes

Completed in code:

- `src/types/adapter.ts` now defines Arkorm-owned adapter, spec, condition, relation, and transaction types
- adapter types are re-exported via `src/types/index.ts` and `src/index.ts`
- compile coverage exists via `tests/types/adapter-types.fixture.ts`

Success criteria:

- adapter shapes are represented in types without changing runtime behavior yet

### Phase 2: Add a Prisma Compatibility Adapter

Status: completed

Deliverables:

- implement a compatibility adapter that wraps the current Prisma-like delegate flow
- move current delegate execution behind that adapter
- keep Prisma-backed tests passing with no public API break

Implementation checklist:

- [x] create a Prisma compatibility adapter module in `src`
- [x] map Arkorm select specs to existing Prisma delegate calls
- [x] map create, update, delete, count, and exists operations through the compatibility adapter
- [x] add transaction bridging so adapter-managed transactions still use the current Prisma transaction context correctly
- [x] preserve current soft delete expectations at the adapter boundary
- [x] add focused tests that compare compatibility-adapter behavior to current delegate behavior

Completed in code:

- `src/adapters/PrismaDatabaseAdapter.ts` implements the compatibility adapter
- `src/adapters/index.ts`, `src/helpers/prisma.ts`, and `src/index.ts` export the adapter factories and mapping helpers
- focused verification lives in `tests/base/prisma-database-adapter.spec.ts`

Success criteria:

- Arkorm still behaves the same, but the runtime calls an adapter instead of a delegate directly

### Phase 3: Refactor QueryBuilder to Emit Arkorm Specs

Status: completed

Deliverables:

- make `QueryBuilder` build Arkorm-owned specs instead of delegate-shaped arguments
- keep fluent chaining and scope behavior intact
- route select, create, update, delete, count, and exists through the adapter contract

Implementation checklist:

- [x] identify all methods in `QueryBuilder` that currently build Prisma-shaped args objects
- [x] replace internal delegate-arg state with Arkorm-owned query state structures
- [x] add one or more internal spec-builder methods for read, write, and aggregate paths
- [x] route execution methods through the adapter instead of calling delegate methods directly
- [x] preserve scope, pagination, eager-load intent, and soft-delete behavior during the refactor for current read-path coverage
- [x] remove or isolate Prisma-specific type dependencies from `QueryBuilder` where practical

Completed in code:

- `Model.query()` now resolves and passes a runtime adapter into `QueryBuilder`
- `ModelStatic` exposes `getAdapter()` and `setAdapter()` so the adapter seam exists at the model layer
- `QueryBuilder` can translate current read-state into Arkorm `SelectSpec` and `AggregateSpec`
- `QueryBuilder` now stores its core filter, order, select, and pagination state in Arkorm-owned fields instead of the old delegate-shaped `args` object for those paths
- read-style operations now use the adapter seam when the query shape is supported: `get`, `first`, `value`, `pluck`, `count`, `exists`, `min`, `max`, `sum`, and `avg`
- core write operations now use the adapter seam when the contract supports them: `create`, `insert`, `insertGetId`, `update`, `updateFrom`, `updateOrInsert`, `upsert`, and `delete`
- duplicate-ignore insert flows now also use the adapter seam via `InsertManySpec.ignoreDuplicates`: `insertOrIgnore` and `insertOrIgnoreUsing`
- Arkorm eager-load intent (`with(...)`) remains separate from explicit include planning, and `include(...)` now compiles into Arkorm-owned `relationLoads` plans instead of QueryBuilder-held delegate include state
- raw where clauses now stay in Arkorm query state universally; unsupported adapters fail through adapter capability checks instead of QueryBuilder dropping back to delegate raw-where helpers
- non-unique update and delete target resolution now uses adapter-backed id lookup
- top-level unsupported nested `select(...)` and `orderBy(...)` shapes now fail fast instead of silently falling back to delegate-shaped argument state
- core QueryBuilder execution now requires a configured adapter and no longer issues direct delegate reads or writes itself
- focused regression coverage was added to `tests/base/query-builder.spec.ts`

Success criteria:

- `QueryBuilder` is no longer the place where backend argument shapes are defined

### Phase 4: Remove Direct Delegate Access from Relation Classes

Deliverables:

- replace direct `getDelegate()` calls inside through and pivot relations
- introduce centralized relation-loading utilities or planner hooks
- make relation classes express relation intent rather than backend calls

Implementation checklist:

- [ ] inventory every relation class that bypasses `QueryBuilder` or the future adapter
- [ ] define relation-load plan types for direct, pivot, through, and morph relations
- [ ] move pivot and through query execution out of relation classes and into shared loader utilities
- [ ] ensure relation classes still own relation metadata and mapping logic but no longer own backend execution
- [ ] add focused tests for belongs-to-many and through relations before removing direct delegate access
- [ ] confirm that no relation class still reaches into `getDelegate()` after the refactor

Success criteria:

- relation classes no longer reach around the adapter boundary for pivot or through queries

### Phase 5: Add Model Metadata Needed for SQL Compilation

Deliverables:

- formalize table name and primary key metadata
- add optional column mapping metadata
- define relation metadata structures for SQL compilation
- keep convention-based fallback behavior for transition compatibility

Implementation checklist:

- [ ] define table and primary-key metadata APIs on `Model`
- [ ] add optional column mapping support for attribute-to-column translation
- [ ] formalize relation metadata structures that loaders and adapters can consume
- [ ] ensure soft delete metadata is represented explicitly instead of inferred ad hoc
- [ ] add fallback behavior so existing models without explicit metadata still work
- [ ] document the metadata APIs and naming-convention fallback rules

Success criteria:

- Arkorm can plan SQL without relying solely on delegate naming inference

### Phase 6: Implement the Kysely Adapter for Core CRUD

Deliverables:

- create `createKyselyAdapter()`
- implement select, insert, update, delete, count, exists, and transaction support
- preserve soft delete behavior through adapter-aware query planning

Implementation checklist:

- [ ] add Kysely and the chosen Postgres driver dependencies
- [ ] create a Kysely adapter module and its runtime factory
- [ ] implement select-one and select-many execution from Arkorm read specs
- [ ] implement insert, update, delete, count, and exists from Arkorm specs
- [ ] preserve soft delete semantics without changing the public query API
- [ ] add CRUD parity tests that run against both the Prisma compatibility adapter and Kysely adapter

Success criteria:

- core CRUD and pagination tests pass on Kysely-backed runtime

### Phase 7: Rewrite Eager Loading as Set-Based Loaders

Deliverables:

- batch `belongsTo`, `hasOne`, and `hasMany`
- batch `belongsToMany` using pivot-aware set-based loading
- add through-relation batching or join-based execution
- wire `Model.load()` and `QueryBuilder.with()` into the new loading path

Implementation checklist:

- [ ] design a shared eager-load planner that groups parent models by relation request
- [ ] implement batched loaders for `belongsTo`, `hasMany`, and `hasOne`
- [ ] implement pivot-aware batching for `belongsToMany`
- [ ] implement through-relation loading without nested per-parent round trips
- [ ] integrate the loaders into `Model.load()` and `QueryBuilder.with()`
- [ ] add query-count assertions so eager loading regressions are caught by tests

Success criteria:

- eager loading no longer scales linearly with the number of loaded parent models for supported relation types

### Phase 8: Push Aggregates and Relation Filters into SQL

Deliverables:

- SQL-backed `has`, `whereHas`, `doesntHave`, and `orWhereHas`
- SQL-backed `withCount`, `withExists`, `withSum`, `withAvg`, `withMin`, and `withMax`
- fallback only for unsupported edge cases

Implementation checklist:

- [ ] define internal aggregate and relation-filter spec shapes if Phase 1 did not already cover them fully
- [ ] compile `has` and `whereHas` into SQL-friendly existence or count predicates
- [ ] compile `withCount` and `withExists` into select-list subqueries or equivalent SQL
- [ ] compile sum, avg, min, and max relation aggregates into SQL-backed expressions
- [ ] keep edge-case fallback behavior explicit and adapter-capability-aware
- [ ] add correctness tests and query-shape tests for all aggregate and relation-filter helpers

Success criteria:

- common relation filters and aggregates no longer depend on post-query in-memory processing

### Phase 9: Optimize Postgres-Specific Paths

Deliverables:

- optional JSON aggregation for selected nested graph cases
- strong `RETURNING` support
- conflict handling for upserts and insert-ignore flows
- dialect-specific performance tuning where justified

Implementation checklist:

- [ ] identify which eager-load or nested graph cases materially benefit from JSON aggregation
- [ ] add `RETURNING`-aware implementations where Postgres can avoid extra round trips
- [ ] implement conflict-handling helpers for upsert and insert-ignore style flows
- [ ] benchmark representative Postgres-heavy workloads before and after optimizations
- [ ] keep Postgres-specific behavior behind adapter or dialect-specific seams
- [ ] document which optimizations are Postgres-specific versus adapter-generic

Success criteria:

- Arkorm performs well for common Postgres-heavy workloads without polluting the public API

### Phase 10: Deprecate Delegate-First Runtime APIs

Deliverables:

- deprecate `setClient()` and direct delegate assumptions
- update docs to show adapter-first setup
- keep Prisma compatibility adapter during the transition window

Implementation checklist:

- [ ] mark delegate-first runtime APIs as deprecated in code and docs
- [ ] update examples, guides, and README content to show adapter-first setup first
- [ ] add migration notes for existing Prisma-client users moving to the compatibility adapter
- [ ] keep compatibility coverage in CI for the agreed transition window
- [ ] define the removal criteria and target release for delegate-first runtime APIs
- [ ] announce the compatibility window and deprecation path in release notes or roadmap docs

Success criteria:

- adapter-first setup is the primary documented and tested runtime path

## Compatibility Strategy

During the migration, keep both backends temporarily:

- Prisma compatibility adapter
- Kysely adapter

This enables:

- running the same behavioral tests across both implementations
- incremental delivery instead of a flag-day rewrite
- easier regression isolation when behavior diverges

## Testing Plan

### Existing Coverage to Preserve

The existing suite should continue to validate:

- CRUD operations
- scopes
- soft deletes
- mutators and casts
- serialization
- pagination
- transaction behavior

### Coverage to Add During Migration

- eager loading query-count behavior for `belongsTo`, `hasMany`, and `belongsToMany`
- through-relation correctness under the new loading path
- aggregate correctness for `withCount`, `withExists`, `withSum`, `withAvg`, `withMin`, and `withMax`
- relation filter correctness for `has`, `whereHas`, and `doesntHave`
- metadata override behavior for table and key mapping
- parity tests that run the same behavior against Prisma compatibility and Kysely adapters

### Important Validation Goal

Measure not only correctness but also query shape and round-trip count.

Examples:

- eager loading 100 parents with one `hasMany` relation should not perform 101 relation queries
- many-to-many eager loading should not issue one pivot query per parent
- aggregate helpers should not fetch whole related collections merely to count or sum them

## Risks

### Risk 1: Refactoring QueryBuilder Too Late

If Kysely is introduced before Arkorm owns its own query specs, backend-specific logic will leak everywhere.

Mitigation:

- make adapter types and query spec types the first real architectural deliverable

### Risk 2: Leaving Relation Classes Delegate-Aware

Even after a compatibility adapter exists, direct delegate calls inside relation classes would keep the architecture split-brained.

Mitigation:

- treat relation classes as a first-class migration scope, not a cleanup task for later

### Risk 3: Over-correcting Toward Giant Single Queries

Not every relation graph should become one SQL statement. Large joins can create row explosion and poor memory behavior.

Mitigation:

- prefer set-based batching as the default strategy
- reserve single-statement graph fetches for shallow or aggregation-friendly cases

### Risk 4: Insufficient Metadata

If Arkorm continues relying only on naming conventions, SQL compilation will remain brittle.

Mitigation:

- formalize table, key, and relation metadata before advanced SQL features land

### Risk 5: Regressions During the Compatibility Window

Mitigation:

- keep the Prisma compatibility adapter during the transition
- run the same behavior-focused tests across both implementations where possible

## Recommended Initial Execution Order

If implementation starts now, the practical order should be:

1. Freeze the current architecture and document the exact delegate-only seams.
2. Define adapter contract types and Arkorm query spec types.
3. Build the Prisma compatibility adapter.
4. Refactor `QueryBuilder` to target the adapter contract.
5. Remove direct delegate access from relation classes.
6. Add table, key, and relation metadata support.
7. Implement the Kysely adapter for CRUD, count, exists, and transactions.
8. Replace eager loading with set-based relation loaders.
9. Push aggregates and relation filters into SQL.
10. Deprecate delegate-first runtime APIs.

## Definition of Done

The migration is complete when:

- Arkorm no longer depends on Prisma delegate semantics internally
- `Model` and `QueryBuilder` are adapter-first internally
- relation classes no longer call delegates directly
- Kysely is the primary backend implementation
- eager loading for core relation types is batched and set-based
- common relation aggregates and filters are SQL-backed
- documentation and tests reflect adapter-first usage

## Immediate Next Step

The first implementation task should be to define the Arkorm adapter interfaces and query spec types, then route current delegate-backed behavior through a Prisma compatibility adapter before attempting any Kysely CRUD or relation-loader work.
