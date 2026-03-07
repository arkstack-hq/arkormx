import type { PrismaClient } from '@prisma/client'
import { defineConfig } from './src'

declare global {
    var __ARKORM_PRISMA__: PrismaClient | undefined
}

export default defineConfig({
    prisma: () => globalThis.__ARKORM_PRISMA__ || {},
})