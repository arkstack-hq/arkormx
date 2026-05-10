import { defineConfig } from 'tsdown'

export default defineConfig([
    {
        clean: true,
        exports: true,
        minify: false,
        tsconfig: 'tsconfig.json',
        entry: [
            'src/index.ts',
            'src/relationship/index.ts'
        ],
        platform: 'node',
        outDir: 'dist',
        format: ['esm', 'cjs'],
        deps: {
            skipNodeModulesBundle: true,
            neverBundle: [
                '@h3ravel/*'
            ]
        },
    },
    {
        dts: false,
        minify: false,
        tsconfig: 'tsconfig.json',
        entry: ['src/cli/index.ts'],
        platform: 'node',
        outDir: 'dist',
        format: ['esm'],
        deps: {
            skipNodeModulesBundle: true,
        },
        outputOptions: {
            entryFileNames: 'cli.mjs',
        },
    },
])