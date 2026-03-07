import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],

    test: {
        root: './',
        passWithNoTests: true,
        environment: 'node',
        projects: [
            {
                test: {
                    setupFiles: ['tests/base/setup.ts', 'tests/postgres/setup.ts'],
                    include: ['**/tests/postgres/**/*.spec.{ts,tsx}'],
                    fileParallelism: false,
                    name: { label: 'postgres', color: 'green' },
                }
            },
            {
                test: {
                    setupFiles: 'tests/base/setup.ts',
                    include: [
                        '**/*.{test,spec}.{ts,tsx,js,jsx}',
                        '!**/tests/postgres/**/*.spec.{ts,tsx}'
                    ],
                    name: { label: 'base', color: 'blue' },
                }
            }
        ],
        env: {
            NODE_ENV: 'test',
        },
    }
})