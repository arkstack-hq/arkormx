import { DbUser, acquirePostgresTestLock, releasePostgresTestLock, seedPostgresFixtures } from './helpers/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ArkormCollection } from '../../src'

describe('PostgreSQL misc integrations', () => {
    beforeEach(async () => {
        await acquirePostgresTestLock()
        await seedPostgresFixtures()
    })

    afterEach(async () => {
        await releasePostgresTestLock()
    })

    it('integrates collections with collect.js', () => {
        const collection = ArkormCollection.make([{ id: 1 }, { id: 2 }])
        expect(collection.all().length).toBe(2)
    })

    it('throws when applying an unknown scope', () => {
        expect(() => DbUser.scope('missing')).toThrow('Scope [missing] is not defined.')
    })
})
