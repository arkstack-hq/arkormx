import { defineConfig } from 'tsdown'

export default defineConfig([
    {
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
        outDir: 'bin',
        format: ['esm'],
        skipNodeModulesBundle: true,
    },
])