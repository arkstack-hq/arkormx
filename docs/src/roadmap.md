# Roadmap

This page tracks areas Arkorm intends to explore after the current PostgreSQL
and Prisma compatibility work. Priorities may change as adapter contracts, test coverage, and
community needs develop.

## More SQL databases

Expanding first-class SQL support is the highest-priority roadmap area. Each
new database adapter should support the core query builder, transactions,
migrations, schema introspection, and the shared adapter test suite before it
is considered production-ready.

### MySQL and MariaDB

Planned work includes:

- A Kysely-backed MySQL adapter.
- Validation against supported MySQL and MariaDB versions.
- MySQL-specific schema introspection and migration operations.
- Dialect-aware handling for generated keys, returning values, JSON fields,
  timestamps, and conflict operations.

### SQLite

Planned work includes:

- A Kysely-backed SQLite adapter.
- Support for local files and in-memory databases.
- SQLite-specific schema rebuilding for migration operations that cannot use
  direct `ALTER TABLE` statements.
- Coverage for generated keys, JSON serialization, date values, and foreign
  key behavior.

### Other SQL engines

Additional adapters and compatibility targets under consideration include:

- Microsoft SQL Server.
- CockroachDB and other PostgreSQL-compatible databases.
- Additional community-maintained Kysely dialects where the maintenance and
  testing requirements can be sustained.

Database compatibility will be documented per adapter. Compatibility with one
SQL dialect does not automatically imply full support for every database that
accepts similar SQL.

## Dialect-neutral migrations

The migration and schema APIs will continue moving database-specific behavior
behind adapter capabilities. Areas to improve include:

- Portable column and index definitions.
- Explicit handling for unsupported schema operations.
- Database-aware defaults and generated expressions.
- Cross-database migration tests.
- Clear migration previews before operations are applied.

## Query builder

Potential query-builder additions include:

- Parameter-bound raw select expressions.
- More typed aggregate and computed projections.
- Common table expressions and recursive queries.
- Window functions.
- Set operations such as `union` and `intersect`.
- Additional bulk-write and conflict-handling strategies.

Features that depend on database-specific syntax will remain capability-gated
instead of being presented as universally supported.

## Adapter ecosystem

The public adapter contract is intended to support integrations outside the
built-in adapters. Future work may include:

- A reusable adapter conformance test package.
- More examples for custom adapters and Kysely dialects.
- Better capability diagnostics at configuration time.
- Published compatibility tables for adapter and database versions.

See [Database Adapters](./guide/adapters.md) for the current adapter contract and
supported capability matrix.

## Suggesting features

Feature proposals should describe the use case, expected query behavior, and
target databases. Reproducible examples are especially helpful when behavior
differs between SQL dialects.

Roadmap items are considered complete only after implementation,
documentation, and automated database coverage are available.
