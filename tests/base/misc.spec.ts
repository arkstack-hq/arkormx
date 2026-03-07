import { ArkormCollection, createPrismaAdapter } from '../../src'
import { User, createCoreClient, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Misc integrations', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('integrates collections with ArkormCollection', () => {
        const collection = ArkormCollection.make([{ id: 1 }, { id: 2 }])
        expect(collection.all().length).toBe(2)
    })

    it('creates a Prisma delegate adapter', () => {
        const adapter = createPrismaAdapter(createCoreClient())
        expect(adapter.users).toBeDefined()
        expect(typeof adapter.users.findMany).toBe('function')
    })

    it('throws when applying an unknown scope', async () => {
        expect(() => User.scope('missing')).toThrow('Scope [missing] is not defined.')
    })
})
