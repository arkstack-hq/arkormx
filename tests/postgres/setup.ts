import { afterAll, beforeAll } from 'vitest'
import { connectPostgresRuntime, disconnectPostgresRuntime } from './helpers/fixtures'

beforeAll(async () => {
    await connectPostgresRuntime()
})

afterAll(async () => {
    await disconnectPostgresRuntime()
})
