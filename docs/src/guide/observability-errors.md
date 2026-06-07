# Observability and Errors

Arkorm exposes structured query events, adapter query inspection, and
context-rich exceptions so applications can log database behavior without
parsing error messages.

## Runtime query debugging

Set `debug: true` to use Arkorm's default query logger:

```ts
import { defineConfig } from 'arkormx';

export default defineConfig({
  adapter,
  debug: true,
});
```

For application logging or tracing, provide a callback:

```ts
import { defineConfig } from 'arkormx';

export default defineConfig({
  adapter,
  debug: (event) => {
    logger.debug({
      phase: event.phase,
      adapter: event.adapter,
      operation: event.operation,
      target: event.target,
      durationMs: event.durationMs,
      inspection: event.inspection,
      error: event.error,
    });
  },
});
```

Each `ArkormDebugEvent` has `type: 'query'` and one of these phases:

- `before`: emitted before adapter execution.
- `after`: emitted after successful execution and may include `durationMs`.
- `error`: emitted when execution fails and includes the original error.

Adapters can include an `inspection` object with SQL, parameters, or
adapter-specific detail.

## Inspecting without executing

Use `QueryBuilder.inspect()` to ask the current adapter for a representation of
a read query:

```ts
const inspection = User.query()
  .whereKey('id', 1)
  .select({ id: true, email: true })
  .inspect('selectOne');

console.log(inspection);
```

The inspection shape can include:

```ts
type AdapterQueryInspection = {
  adapter: string;
  operation: string;
  target?: string;
  sql?: string;
  parameters?: readonly unknown[];
  detail?: Record<string, unknown>;
};
```

`inspect()` supports `select`, `selectOne`, `count`, and `exists`. It returns
`null` when the adapter does not implement query inspection.

## Structured exceptions

All Arkorm-specific exceptions extend `ArkormException`. They can carry:

- `code`
- `operation`
- `model`
- `delegate`
- `relation`
- `scope`
- `meta`
- `cause`

Use `getContext()` for structured logging and `toJSON()` for serialization:

```ts
import { ArkormException } from 'arkormx';

try {
  await User.query().whereKey('id', 999).firstOrFail();
} catch (error) {
  if (error instanceof ArkormException) {
    logger.error({
      message: error.message,
      ...error.getContext(),
    });
  }
}
```

## Exception reference

| Exception | Typical cause |
| --- | --- |
| `ModelNotFoundException` | `firstOrFail()`, `valueOrFail()`, `deleteOrFail()`, or a required update found no record. |
| `QueryConstraintException` | A write is missing required constraints or a helper receives an invalid source. |
| `QueryExecutionException` | The adapter or underlying database client rejected query execution. |
| `UnsupportedAdapterFeatureException` | The active adapter cannot execute the requested query shape or feature. |
| `RelationResolutionException` | A relationship name or relationship execution path cannot be resolved. |
| `ScopeNotDefinedException` | `scope()` references a missing local scope. |
| `UniqueConstraintResolutionException` | Arkorm cannot determine a unique key for a write or inserted identifier. |
| `MissingDelegateException` | Prisma compatibility mode cannot resolve the requested delegate. |

## Query execution failures

`QueryExecutionException` keeps the original failure in `cause` and may expose
the adapter inspection that was available at execution time:

```ts
import { QueryExecutionException } from 'arkormx';

try {
  await User.query().where({ email }).get();
} catch (error) {
  if (error instanceof QueryExecutionException) {
    logger.error({
      inspection: error.getInspection(),
      cause: error.cause,
      context: error.getContext(),
    });
  }
}
```

Avoid matching database failures by message when a typed Arkorm exception and
structured context are available.
