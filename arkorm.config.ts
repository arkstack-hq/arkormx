import { defineConfig } from './src'

declare global {
    var __ARKORM_PRISMA__: Record<string, unknown> | undefined
}

export default defineConfig({
    prisma: () => globalThis.__ARKORM_PRISMA__ || {},
})