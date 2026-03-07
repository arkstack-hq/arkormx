import type { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

declare global {
    var __ARKORM_PRISMA__: PrismaClient | undefined
}

dotenv.config({ path: '.env.test', quiet: true })

// console.log('Loaded environment variables:', {
//     RUN_POSTGRES_TESTS: process.env.RUN_POSTGRES_TESTS,
//     DATABASE_URL: process.env.DATABASE_URL,
//     NODE_ENV: process.env.NODE_ENV,
// })
