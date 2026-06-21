# Troubleshooting

## `Database delegate [...] is not configured`

This is specific to Prisma compatibility mode.

- Ensure your model table/delegate resolves to a Prisma client delegate.
- Pass an explicit mapping to `createPrismaDatabaseAdapter()` when names differ.
- Ensure `arkormx.config.*` is loaded and `client` returns a valid Prisma client.

## `Query execution requires a configured database adapter`

- Ensure `arkormx.config.*` exports `defineConfig({ adapter })`.
- Ensure the config file is loaded from the project root.
- For manual bootstrap, call `Model.setAdapter()` or `DB.setAdapter()` before querying.

## `UnsupportedAdapterFeatureException`

The active adapter cannot execute the requested feature or query shape.

- Check the [adapter capability matrix](./adapters.md#capability-matrix).
- Use structured filters instead of `whereRaw()` on Prisma compatibility.
- Use `query.inspect()` to verify that the query can be normalized.
- Do not advertise a custom adapter capability without implementing it.

## Debug a failed query

Enable structured query events:

```ts
export default defineConfig({
  adapter,
  debug: (event) => {
    console.debug(event)
  },
})
```

See [Observability and Errors](./observability-errors.md) for exception context
and `QueryExecutionException` inspection.

## No seeder or migration classes found

- Verify `paths.seeders` or `paths.migrations` config values.
- Verify files export classes that extend `Seeder` / `Migration`.

## TypeScript migration/seeders/etc fail in CLI

- Set `paths.buildOutput` to build output root.
- Preserve source structure in build output.
- Ensure compiled `.js`/`.mjs`/`.cjs` files exist for source `.ts` files.

## Generated files are JS unexpectedly

- `outputExt: 'ts'` requires TypeScript to be installed in the project.
- If TypeScript is not resolvable, Arkorm safely falls back to JS generation.

## Model fields not typed (`user.id`)

- Run `arkorm models:sync` to inject `declare` fields from adapter
  introspection or `schema.prisma` into model classes.
