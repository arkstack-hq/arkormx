import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],

    test: {
        root: './',
        passWithNoTests: true,
        environment: 'node',
        include: ['**/*.{test,spec}.{ts,tsx,js,jsx}'],
        fileParallelism: false,
        setupFiles: ['tests/base/setup.ts', 'tests/postgres/setup.ts'],
        coverage: {
            enabled: true,
            reporter: ['text', 'json', 'html', 'lcov'],
            thresholds: {
                statements: 80,
                functions: 85,
                branches: 65,
                lines: 80,
            },
            reportsDirectory: 'coverage',
            exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,arkorm,prettier}.config.*', '**/.h3ravel/**'],
        },
        env: {
            NODE_ENV: 'test',
        },
    }
})