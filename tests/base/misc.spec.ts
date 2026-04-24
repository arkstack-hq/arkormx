import { ArkormCollection, Model, createPrismaAdapter } from '../../src'
import { User, createCoreClient, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class DeprecatedClientUser extends Model<'users'> {
    protected static override table = 'users'

    public static bindClient (client: Record<string, unknown>) {
        this.setClient(client)
    }
}

describe('Misc integrations', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('does not use Model.getDelegate during normal runtime queries', async () => {
        const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)

        await expect(User.query().whereKey('id', 1).first()).resolves.toBeTruthy()

        expect(warningSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Model.getDelegate() is deprecated'),
            expect.anything(),
        )

        warningSpy.mockRestore()
    })

    it('does not use Model.getDelegate during relation fallback and eager loading', async () => {
        const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)

        const filtered = await User.query()
            .has('comments', '>=', 1)
            .orderBy({ id: 'asc' })
            .get()
        expect(filtered.all().map(user => user.getAttribute('id'))).toEqual([1])

        const eagerLoaded = await User.query()
            .with(['posts.comments'])
            .find(1)

        expect(eagerLoaded).toBeTruthy()
        expect(warningSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Model.getDelegate() is deprecated'),
            expect.anything(),
        )

        warningSpy.mockRestore()
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

    it('warns once when the deprecated setClient path is used', () => {
        const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)

        DeprecatedClientUser.bindClient(createCoreClient())
        DeprecatedClientUser.bindClient(createCoreClient())

        expect(warningSpy).toHaveBeenCalledTimes(1)
        expect(warningSpy).toHaveBeenCalledWith(
            expect.stringContaining('Model.setClient() is deprecated'),
            expect.objectContaining({
                code: 'ARKORM_SET_CLIENT_DEPRECATED',
                type: 'DeprecationWarning',
            })
        )

        warningSpy.mockRestore()
    })

    it('throws when applying an unknown scope', async () => {
        expect(() => User.scope('missing')).toThrow('Scope [missing] is not defined.')
    })
})
