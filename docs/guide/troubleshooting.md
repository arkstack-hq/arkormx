# Troubleshooting

## `Database delegate [...] is not configured`

- Ensure your model `delegate` matches your Prisma client delegate.
- Ensure `arkorm.config.*` is loaded and `prisma` returns a valid client.

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

- Run `arkorm models:sync` to inject `declare` fields from `schema.prisma` into model classes.
