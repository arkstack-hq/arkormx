import { User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Model lifecycle and serialization', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('applies mutators, casts, and serialization rules', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const model = user as User
        expect(model.getAttribute('name')).toBe('Jane')
        expect(model.getAttribute('isActive')).toBe(true)
        expect(model.getAttribute('meta')).toEqual({ tier: 'pro' })
        expect(model.getAttribute('createdAt')).toBeInstanceOf(Date)

        const serialized = model.toObject()
        expect(serialized.password).toBeUndefined()
        expect(serialized.displayName).toBe('JANE')
        expect(typeof serialized.createdAt).toBe('string')
        expect(model.toJSON()).toEqual(serialized)
    })

    it('persists updates through save()', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const model = user as User
        model.setAttribute('name', '  Jane Updated  ')
        await model.save()

        const reloaded = await User.query().find(1)
        expect(reloaded?.getAttribute('name')).toBe('Jane Updated')
    })

    it('returns a copy from getRawAttributes()', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()

        const raw = (user as User).getRawAttributes()
        raw.name = 'Mutated Outside'

        expect((user as User).getAttribute('name')).toBe('Jane')
    })

    it('throws when deleting or force deleting without an id', async () => {
        const user = new User({ name: 'No Id' })

        await expect(user.delete()).rejects.toThrow('Cannot delete a model without an id.')
        await expect(user.forceDelete()).rejects.toThrow('Cannot force delete a model without an id.')
    })
})
