import { defineConfig } from 'prisma/config'

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/arkorm_test?schema=public',
    },
})
