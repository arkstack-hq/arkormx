# Expressions & Aggregation

Arkorm ships a composable SQL expression builder so you can group and aggregate
over **computed values** — JSON fields, `CASE` expressions, arithmetic, joined
columns — instead of loading rows into memory and reducing them in JavaScript.

Expressions are compiled by SQL-backed adapters (Kysely/PostgreSQL). The Prisma
compatibility adapter rejects them with `UnsupportedAdapterFeatureException`.

## The expression builder

Import the primitives from `arkormx`:

```ts
import { col, val, raw, caseWhen, coalesce, json, sum, count, avg, min, max, where } from 'arkormx'
```

| Builder                       | SQL                                             |
| ----------------------------- | ----------------------------------------------- |
| `col('type')`                 | column reference (`"type"`, or `table.column`)  |
| `val('airtime')`              | a **bound** literal (never interpolated)        |
| `raw('sum(amount)', [])`      | escape hatch with positional `?` bindings       |
| `caseWhen(cond, a).else(b)`   | `CASE WHEN … THEN … ELSE … END`                 |
| `coalesce(a, b, …)`           | `COALESCE(a, b, …)` (bare strings are columns)  |
| `json('meta', 'billType')`    | JSON extraction — see below                     |
| `sum` / `count` / `avg` / `min` / `max` | aggregates — see below                |

Expressions are **immutable** — every operator returns a new expression — and
expose a fluent operator surface:

```ts
col('name').like('card%')                 // "name" like 'card%'
col('status').eq('failed')                // "status" = 'failed'
col('id').in([1, 2, 3])                   // "id" in (1, 2, 3)
col('deletedAt').isNull()                 // "deletedAt" is null
col('price').times(col('quantity'))       // ("price" * "quantity")
a.and(b) / a.or(b)                         // logical composition
```

They can be used anywhere the query builder accepts a projection or predicate:
`select`, `where` / `orWhere`, `groupBy`, `orderBy`, and `having`.

```ts
const tier = caseWhen(col('isActive').eq(1), 'active').else('inactive')

await User.query()
  .select({ tier, total: count() })
  .where(col('name').like('a%'))
  .groupBy(tier)
  .orderBy(tier, 'desc')
  .getRows()
```

## JSON value extraction

`json(column, ...path)` extracts a scalar from a JSON/JSONB column (`->>` for a
single key, `#>>` for a nested path), with optional casts. Unlike the
`whereJson*` containment predicates, these produce **values** usable in
projections, grouping, ordering, and aggregates.

```ts
json('metadata', 'billType')              // ("metadata"::jsonb ->> 'billType')
json('metadata', 'address', 'city')       // nested path via #>>
json('metadata', 'score').asNumber()      // ::numeric
json('metadata', 'vip').asBoolean()       // ::boolean

await Ledger.query()
  .select({ billType: json('metadata', 'billType') })
  .groupBy(json('metadata', 'billType'))
  .getRows()
```

## Aggregates and filtered aggregates

`sum`, `count`, `avg`, `min`, and `max` build aggregate expressions. A bare
string argument is treated as a column; `count()` with no argument is `COUNT(*)`.

Each aggregate exposes `.filter(predicate)`, compiled to PostgreSQL
`FILTER (WHERE …)` so you can compute several partitions of the same rows in one
query:

```ts
const boundary = new Date('2026-01-01')

await Ledger.query()
  .select({
    category: effectiveCategory,
    current: sum('amount').filter(where('createdAt', '>=', boundary)),
    previous: sum('amount').filter(where('createdAt', '<', boundary)),
  })
  .groupBy('category')
  .getRows()
```

On adapters without `FILTER` support, the same result is expressible with a
`CASE` aggregate: `sum(caseWhen(pred, col('amount')).else(0))`.

## Grouping

`groupBy` accepts model columns, expressions, and select aliases; `groupByRaw`
is the raw escape hatch (mirrors `whereRaw` / `havingRaw`).

```ts
query.groupBy('status')                        // a column
query.groupBy(tier)                            // an expression
query.groupBy('tier')                          // a select alias
query.groupByRaw('date("createdAt")')          // raw fragment
```

When the grouped expression is also projected, Arkorm groups by the **output
alias** (`GROUP BY "tier"`) rather than repeating the expression — PostgreSQL
cannot match a re-bound duplicate expression against the `SELECT` list.

`having` / `havingRaw` compose with expression grouping and accept expressions:

```ts
query.groupBy(tier).having(count(), '>', 5)
```

## Reading grouped rows

A grouped aggregate is neither a scalar nor a model instance — it is a plain row
shaped like `{ <group keys>, <aggregates> }`. Two terminals return them:

```ts
// 1. select() + groupBy() + getRows()
const rows = await Ledger.query()
  .select({ category: effectiveCategory, total: sum('amount') })
  .groupBy('category')
  .getRows<{ category: string; total: number }>()

// 2. Prisma-style groupBy — the row type is inferred from the spec
const stats = await Transaction.query().groupBy({
  by: ['category'],
  _sum: { amount: true },
  _count: true,
})
// stats: Array<{ category: string; _sum: { amount: number | null }; _count: number }>
```

Numeric aggregates (`_sum`, `_avg`, `_count`) are returned as numbers.

## Computed / virtual attributes

Declare derived fields once on the model as `static computed`. Each factory
receives the expression builder and returns an expression; the name is then
usable in `select`, `where`, `groupBy`, `orderBy`, and `having`, and is expanded
inline during query building.

```ts
class Transaction extends Model {
  static computed = {
    category: (e) =>
      e.coalesce(
        e.col('override.category'),
        e.caseWhen(e.json('metadata', 'billType').in(['airtime', 'data']), 'airtime_data')
          .when(e.json('metadata', 'billType').in(['electricity']), 'utilities')
          .else('other'),
      ),
  }
}

await Transaction.query()
  .where({ status: 'successful', category: 'airtime_data' })
  .groupBy('category')
  .getRows()
```

Computed attributes keep category logic in one place instead of duplicating it
across query sites. They can reference joined tables via `table.column`
references (add the join yourself).

## Generated columns

When a derived value depends only on a row's own columns, a database
[generated column](./migrations-cli.md#generated-columns) gives you zero
write-path code, guaranteed consistency, and a fast, indexable `GROUP BY`.
