import { defineConfig } from 'tsdown'

export default defineConfig({
    exports: true,
    minify: false,
    tsconfig: 'tsconfig.json',
    entry: ['src/index.ts'],
    platform: 'node',
    outDir: 'dist',
    format: ['esm', 'cjs'],
    skipNodeModulesBundle: true,
})