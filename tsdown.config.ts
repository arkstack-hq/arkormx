import { defineConfig } from 'tsdown'

export default defineConfig([
    {
        clean: true,
        exports: true,
        minify: true,
        tsconfig: 'tsconfig.json',
        entry: ['src/index.ts'],
        platform: 'node',
        outDir: 'dist',
        format: ['esm', 'cjs'],
        skipNodeModulesBundle: true,
    },
    {
        dts: false,
        minify: true,
        tsconfig: 'tsconfig.json',
        entry: ['src/cli/index.ts'],
        platform: 'node',
        outDir: 'dist',
        format: ['esm'],
        skipNodeModulesBundle: true,
        outputOptions: {
            entryFileNames: 'cli.mjs',
        },
    },
])