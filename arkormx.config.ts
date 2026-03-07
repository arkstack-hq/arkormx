import type { PrismaClient } from '@prisma/client'
import { defineConfig } from './src'

declare global {
    var __ARKORMX_PRISMA__: PrismaClient | undefined
}

export default defineConfig({
    prisma: () => globalThis.__ARKORMX_PRISMA__ || {},
})