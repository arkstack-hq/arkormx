import { defineConfig } from 'vitest/config'
import swc from 'vite-plugin-swc-transform'

export default defineConfig({
    plugins: [
        swc({
            swcOptions: {
                jsc: {
                    target: 'es2022',
                    transform: {
                        legacyDecorator: true,
                        decoratorMetadata: true,
                        useDefineForClassFields: false,
                    },
                    externalHelpers: true,
                    parser: {
                        decorators: true,
                        syntax: 'typescript'

                    }
                },
            },
        }),
    ],
    resolve: {
        alias: {
            'src': './src',
        },
        tsconfigPaths: true,
    } as never,
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