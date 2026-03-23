# Arkorm Migration Plan: Prisma to Kysely

## Goal

Port Arkorm from a Prisma-centered execution model to a Kysely-backed SQL adapter while preserving Arkorm's public Eloquent-style API.

The migration would improve:

- relationship loading efficiency
- control over generated SQL
- support for set-based eager loading and aggregates
- scalability for complex relation graphs

The public API should remain centered on:

- `Model`
- `QueryBuilder`
- relation classes such as `HasManyRelation`, `BelongsToRelation`, and `BelongsToManyRelation`

## Why Migrate

Arkorm currently models database access around Prisma-like delegates. That works for basic CRUD, but it becomes a poor fit for relation-heavy ORM behavior.

Current pain points:

- relations are resolved through multiple delegate calls instead of set-based SQL
- many-to-many relationships already require a pivot query and a second related-model query
- eager loading is applied model-by-model after hydration, which trends toward N+1 query behavior
- relationship aggregates and relation filters are difficult to push fully into SQL when the backend API is delegate-shaped

Kysely is a better execution substrate because it is:

- SQL-native
- strongly typed
- flexible enough for joins, subqueries, CTEs, and JSON aggregation
- low-level enough that Arkorm can remain the actual ORM abstraction

## Recommended Stack

Core recommendation:

- `kysely`

Database driver recommendation:

- Postgres-first: `postgres` or `pg`

Suggested default:

- `kysely`
- `postgres`

Reasoning:

- Kysely gives Arkorm control over SQL compilation and execution strategy
- Arkorm keeps ownership of models, relations, hydration, scopes, soft deletes, and serialization
- The backend becomes an adapter layer instead of another ORM hidden under Arkorm

## Migration Principles

1. Preserve the Arkorm public API where possible.
2. Replace the Prisma delegate dependency at the adapter boundary, not at the model API.
3. Move relation execution from per-model resolution to set-based loading.
4. Push aggregates and relationship filters into SQL when practical.
5. Keep the migration incremental so the package can continue to ship during the transition.

## Current Architecture Constraints

The current design couples several core paths to a Prisma-like delegate contract:

- `Model.getDelegate()` resolves a runtime delegate by name
- `Model.query()` constructs `QueryBuilder` with that delegate
- `QueryBuilder` calls methods like `findMany`, `findFirst`, `create`, `update`, and `delete`
- relation classes often compose queries by issuing more delegate calls

That backend shape is too narrow for efficient ORM-style relation loading.

## Target Architecture

Replace the implicit Prisma delegate contract with a real Arkorm adapter contract.

### Proposed Layers

1. Public ORM layer

- `Model`
- `QueryBuilder`
- relation classes
- scopes
- soft delete behavior
- hydration and serialization

2. Intermediate query representation

- Arkorm query state
- relation load plans
- aggregate specifications
- model metadata

3. Adapter layer

- SQL adapter interface
- Kysely implementation
- transaction integration
- dialect-specific helpers where necessary

4. Database driver

- Postgres driver for actual execution

## Proposed Adapter Contract

Introduce a backend contract that is centered on Arkorm behavior instead of Prisma delegates.

Example shape:

```ts
interface DatabaseAdapter {
  select<TModel>(spec: SelectSpec<TModel>): Promise<Record<string, unknown>[]>;
  selectOne<TModel>(
    spec: SelectSpec<TModel>,
  ): Promise<Record<string, unknown> | null>;
  insert<TModel>(spec: InsertSpec<TModel>): Promise<Record<string, unknown>>;
  insertMany<TModel>(spec: InsertManySpec<TModel>): Promise<number>;
  update<TModel>(
    spec: UpdateSpec<TModel>,
  ): Promise<Record<string, unknown> | null>;
  updateMany<TModel>(spec: UpdateManySpec<TModel>): Promise<number>;
  delete<TModel>(
    spec: DeleteSpec<TModel>,
  ): Promise<Record<string, unknown> | null>;
  deleteMany<TModel>(spec: DeleteManySpec<TModel>): Promise<number>;
  count<TModel>(spec: AggregateSpec<TModel>): Promise<number>;
  exists<TModel>(spec: SelectSpec<TModel>): Promise<boolean>;
  loadRelations<TModel>(spec: RelationLoadSpec<TModel>): Promise<void>;
  transaction<T>(
    callback: (adapter: DatabaseAdapter) => Promise<T>,
  ): Promise<T>;
}
```

This contract should not mimic Prisma method-for-method. It should describe what Arkorm needs to do.

## Metadata Needed for SQL Compilation

To compile efficient SQL, Arkorm will need reliable model metadata beyond the current delegate naming pattern.

Recommended metadata additions:

- table name
- primary key
- column map when property names differ from column names
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

## QueryBuilder Refactor Outline

`QueryBuilder` should stop holding a raw Prisma-like delegate and instead hold:

- a model reference
- query state
- an adapter reference

### Responsibilities to Preserve

- fluent query chaining
- scopes
- soft delete filters
- pagination helpers
- hydration into model instances

### Responsibilities to Move Downward

- SQL generation
- execution strategy
- relation batching
- aggregate pushdown

### Recommended Refactor Steps

1. Introduce internal query spec types in `src/types`
2. Make `QueryBuilder` build specs rather than invoke delegate methods directly
3. Implement a compatibility adapter that temporarily wraps Prisma delegates
4. Implement the Kysely adapter against the same contract
5. Switch runtime configuration to use adapters as the primary backend entry point

## Eager Loading Redesign

This is the highest-value change.

Current behavior loads relations per model instance after the base query returns. That should be replaced with set-based loaders.

### Target Strategy by Relation Type

#### BelongsTo

Current shape:

- collect foreign keys from parent models
- execute one query using `WHERE owner_key IN (...)`
- map results back to each parent

#### HasMany

Current shape:

- collect parent primary keys
- execute one query using `WHERE foreign_key IN (...)`
- group children by foreign key
- assign grouped collections to parents

#### HasOne

Same as `HasMany`, but select the first grouped child per parent.

#### BelongsToMany

Preferred shape:

- query pivot table joined to related table for all parent ids in one statement
- return rows keyed by parent id
- group and hydrate related models per parent

For Postgres, this can later be optimized further using JSON aggregation where beneficial.

#### HasManyThrough and HasOneThrough

Use explicit joins through the intermediate table instead of nested round trips.

#### Morph Relations

Batch by morph type and morph id. These will likely remain more complex, but should still be set-based rather than model-by-model.

## Relationship Aggregates

Current aggregate features such as:

- `withCount`
- `withExists`
- `withSum`
- `withAvg`
- `withMin`
- `withMax`

should move to SQL-backed implementations.

### Recommended Implementation Strategy

For simple cases:

- use subqueries in the select list
- or use grouped joins when cardinality is manageable

Examples:

- `withCount('posts')` -> correlated count subquery
- `withExists('posts')` -> correlated exists subquery
- `withSum('orders', 'amount')` -> correlated aggregate subquery

This avoids fetching whole relation collections just to compute counts or sums.

## Relationship Filters

Features such as:

- `has`
- `whereHas`
- `doesntHave`
- `orWhereHas`

should compile into SQL predicates instead of post-query in-memory filtering.

Preferred SQL forms:

- `EXISTS (...)`
- `NOT EXISTS (...)`
- correlated count subqueries when exact count comparisons are required

This is a major improvement over loading candidate models and filtering them in application code.

## Transaction Model

Arkorm currently supports transaction scoping. Preserve that API, but bind it to adapter-managed transactions.

Target behavior:

- `Model.transaction()` delegates to the adapter transaction API
- nested transactions reuse the same transaction context where appropriate
- `Model.getDelegate()` should eventually disappear in favor of adapter-backed model access

## Runtime Configuration Changes

Current setup is oriented around a runtime Prisma client.

Target setup should support something like:

```ts
Model.setAdapter(createKyselyAdapter(db, config));
```

Transition support may include:

```ts
Model.setAdapter(createPrismaCompatibilityAdapter(prisma));
```

That allows Arkorm to ship the new abstraction without a flag day rewrite.

## Phased Migration Plan

### Phase 1: Introduce the Adapter Boundary

Deliverables:

- define `DatabaseAdapter` types in `src/types`
- add `Model.setAdapter()` as the primary runtime entry point if not already present in the desired shape
- refactor `QueryBuilder` to depend on the adapter contract internally
- implement a Prisma compatibility adapter so current behavior keeps working

Success criteria:

- public API remains unchanged
- existing tests continue to pass on Prisma-backed runtime

### Phase 2: Add Model Metadata for SQL Compilation

Deliverables:

- formalize table name and primary key metadata
- define relation metadata structures
- add optional column mapping metadata
- document naming conventions and overrides

Success criteria:

- enough metadata exists to build SQL queries without relying on delegate inference

### Phase 3: Implement the Kysely Adapter

Deliverables:

- create `createKyselyAdapter()`
- implement select, insert, update, delete, count, exists, and transaction methods
- support soft deletes in adapter-aware query compilation

Success criteria:

- core CRUD and pagination tests pass on Kysely

### Phase 4: Rewrite Eager Loading as Set-Based Loaders

Deliverables:

- create relation loader utilities per relation type
- batch `belongsTo`, `hasOne`, and `hasMany`
- batch `belongsToMany` through joined pivot queries
- wire `Model.load()` and `QueryBuilder.with()` into the new loader path

Success criteria:

- eager loading no longer issues relation queries per model instance for supported relation types

### Phase 5: Push Aggregates and Relation Filters into SQL

Deliverables:

- SQL-backed `has` and `whereHas`
- SQL-backed `withCount`, `withExists`, `withSum`, `withAvg`, `withMin`, `withMax`
- fallback strategy only for cases not yet expressible in SQL

Success criteria:

- relation aggregates and filters stop depending on in-memory post-processing for common cases

### Phase 6: Optimize Postgres-Specific Paths

Deliverables:

- optional JSON aggregation for nested graph fetches
- better `RETURNING` support
- conflict handling for upserts and insert-ignore patterns
- dialect-specific performance tuning where appropriate

Success criteria:

- Arkorm performs well for common Postgres-heavy workloads

### Phase 7: Deprecate Prisma-Centered Runtime APIs

Deliverables:

- deprecate `setClient()` and direct delegate assumptions
- update docs to show adapter-first setup
- keep compatibility layer for a transition window

Success criteria:

- adapter-first runtime becomes the primary documented and tested path

## Compatibility Strategy

To reduce migration risk, keep both backends temporarily:

- Prisma compatibility adapter
- Kysely adapter

This allows:

- running the same test suite across both backends
- incremental migration of features
- easier isolation of regressions

## Testing Plan

### Base Coverage

Ensure the existing test suite continues to validate:

- CRUD operations
- scopes
- soft deletes
- attribute mutators and casts
- serialization
- pagination

### New Coverage to Add

- eager loading query-count behavior for `belongsTo`, `hasMany`, and `belongsToMany`
- aggregate correctness for `withCount`, `withExists`, `withSum`, `withAvg`, `withMin`, `withMax`
- relation filter correctness for `has` and `whereHas`
- transaction behavior under the new adapter
- metadata override behavior for table and key mapping

### Important Validation Goal

Measure not just correctness, but query shape and round-trip count.

For example:

- eager loading 100 parents with one `hasMany` relation should not perform 101 relation queries
- many-to-many eager loading should not issue one pivot query per parent

## Risks

### Risk 1: Over-correcting Toward Giant Single Queries

Not every relation graph should become one SQL statement. Large joined queries can produce row explosion and poor memory behavior.

Mitigation:

- prefer set-based batched loading as the default
- reserve single-statement graph fetches for shallow or aggregation-friendly cases

### Risk 2: Insufficient Metadata

If Arkorm keeps relying on naming conventions alone, SQL compilation will be brittle.

Mitigation:

- formalize table, key, and relation metadata early

### Risk 3: Leaking Backend-Specific Semantics Upward

The public API should not become Kysely-flavored.

Mitigation:

- keep Kysely inside the adapter layer
- expose Arkorm concepts, not query-builder internals

### Risk 4: Regressions During Incremental Port

Mitigation:

- keep Prisma compatibility adapter during transition
- run the same tests on both implementations where possible

## Recommended Initial Implementation Order

If work starts immediately, the order should be:

1. Add adapter contract types.
2. Refactor `QueryBuilder` to compile internal specs instead of calling delegates directly.
3. Create a Prisma compatibility adapter.
4. Add table and primary key metadata support.
5. Implement the Kysely adapter for CRUD and count/exists.
6. Replace eager loading with batched relation loaders.
7. Push `has`, `whereHas`, and aggregate methods into SQL.
8. Deprecate delegate-first runtime APIs.

## Definition of Done

The migration is complete when:

- Arkorm no longer depends on Prisma delegate semantics internally
- Kysely is the primary backend implementation
- eager loading for core relation types is batched and set-based
- common relation aggregates and filters are SQL-backed
- the existing public Arkorm API remains stable or only minimally changed
- documentation and tests reflect adapter-first usage

## Short-Term Next Step

The first implementation task should be to define the new adapter interfaces and query spec types, then refactor `QueryBuilder` to target that interface while preserving current behavior through a Prisma compatibility adapter.
