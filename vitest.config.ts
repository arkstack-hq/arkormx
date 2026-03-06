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
                    setupFiles: ['tests/setup.ts', 'tests/postgres/setup.ts'],
                    include: ['**/tests/postgres/**/*.spec.{ts,tsx}'],
                    fileParallelism: false,
                    name: { label: 'postgres', color: 'green' },
                }
            },
            {
                test: {
                    setupFiles: 'tests/setup.ts',
                    include: [
                        '**/*.{test,spec}.?(c|m)[jt]s?(x)',
                        '!**/tests/postgres/**/*.spec.{ts,tsx}'
                    ],
                    name: { label: 'vitest', color: 'blue' },
                }
            }
        ],
        coverage: {
            reporter: ['text', 'json', 'html', 'lcov'],
            reportsDirectory: 'coverage',
            exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*', '**/.h3ravel/**'],
        },
        env: {
            NODE_ENV: 'test',
        },
    }
})