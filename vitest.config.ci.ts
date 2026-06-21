import { defineConfig } from 'vitest/config'

export default defineConfig({
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
        statements: 60,
        functions: 65,
        branches: 55,
        lines: 60,
      },
      reportsDirectory: 'coverage',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,arkormx,prettier}.config.*',
        '**/.h3ravel/**',
      ],
    },
    env: {
      NODE_ENV: 'test',
    },
  },
})
