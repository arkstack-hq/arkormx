# Production Deployment

This guide covers running Arkormˣ safely in production environments.

## 1. Build strategy

Use a build process that preserves source folder structure in output, especially for:

- `database/migrations`
- `database/seeders`
- `src/models` (if runtime imports rely on model files)

Example with tsdown:

```ts
// tsdown.config.js
export default {
  unbundle: true,
};
```

## 2. Runtime config

```ts
export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
  paths: {
    migrations: './database/migrations',
    seeders: './database/seeders',
    buildOutput: './dist',
  },
});
```

## 3. Generated extension policy

- `outputExt: 'ts'` (default): generate TS files when TypeScript is installed.
- Automatic fallback: generate JS files when TypeScript is not installed.

## 4. Runtime resolution behavior

For TS source references, Arkormˣ will try to resolve equivalent runtime scripts in your build output directory in this order:

1. Same path with `.js`
2. Same path with `.cjs`
3. Same path with `.mjs`
4. Equivalent path under `paths.buildOutput`

## 5. Operational checks

- Ensure `prisma generate` and migration steps run in CI/CD.
- Validate CLI commands against built artifacts in staging before production rollout.
