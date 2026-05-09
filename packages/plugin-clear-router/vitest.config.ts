import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    resolve: {
        alias: {
            arkormx: fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/*.spec.ts'],
    },
})
