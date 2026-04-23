# Postgres Optimizations

This guide documents the Postgres-specific work from Phase 9 of our migration from Prisma delegates to an adapter-first architecture and the remaining JSON aggregation candidates that are worth revisiting later.

## What Is Adapter-Generic

These improvements stay behind Arkorm's adapter seam and are not tied to Postgres-specific SQL syntax in the public API:

- set-based eager loading from Phase 7
- SQL-backed relation filters and aggregates from Phase 8
- optional adapter capabilities such as `upsert`, `updateFirst`, and `deleteFirst`
- `QueryBuilder` choosing optimized write paths only when the active adapter advertises the required capability

## What Is Postgres-Specific

These optimizations currently depend on PostgreSQL syntax and therefore live only in the Kysely/Postgres adapter path:

- `ON CONFLICT DO NOTHING` for `insertOrIgnore`
- `ON CONFLICT (...) DO UPDATE` for `upsert` and object-based `updateOrInsert`
- `WITH target_row AS (...) UPDATE ... RETURNING` for single-row non-unique updates
- `WITH target_row AS (...) DELETE ... RETURNING` for single-row non-unique deletes

The public API does not change when these paths are enabled. Unsupported
compatibility adapters can still use the generic behavior, but SQL-capable
adapters now fail fast when a relation filter or aggregate callback cannot be
compiled into Arkorm relation specs.

## JSON Aggregation Candidates

These are the nested graph cases that are most likely to benefit from optional JSON aggregation later:

1. Read-only API payloads that serialize a shallow parent-with-children graph such as `User -> posts`.
2. Joined many-to-many read models where the caller needs a compact nested array such as `User -> roles`.
3. Dashboard-style list endpoints that need one row per parent plus a bounded nested preview collection.

These are not good candidates right now:

- write-heavy flows
- mutation paths that must preserve row-level events and hydration semantics
- deep mixed graphs where row explosion is easier to control with set-based eager loading

## Reproducible Benchmark

Run:

```bash
pnpm bench:postgres
```

The script uses the real PostgreSQL test database and compares the optimized Kysely/Postgres paths against legacy emulation patterns with equivalent behavior.

## Latest Baseline

The current Phase 9 baseline on the development test database is recorded after each intentional optimizer pass.

| Scenario                             | Time (ms) | SQL statements |
| ------------------------------------ | --------: | -------------: |
| Legacy upsert emulation (200 rows)   |    104.47 |            400 |
| Native ON CONFLICT upsert (200 rows) |      7.53 |              1 |
| Legacy single-row update/delete      |      5.62 |              4 |
| Native RETURNING update/delete       |     10.87 |              2 |

The update/delete timing is still noisy at this scale, but the benchmark confirms the intended reduction in round trips. The native path matters more as network latency grows or when these mutations are repeated in a request-heavy workload.

Treat these numbers as local regression baselines, not absolute performance claims.
