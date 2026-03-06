import { User, setupCoreRuntime } from './helpers/core-fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Model lifecycle and serialization', () => {
    beforeEach(() => {
        setupCoreRuntime()
        User.clearGlobalScopes()
        User.clearEventListeners()
    })

    afterEach(() => {
        User.clearGlobalScopes()
        User.clearEventListeners()
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

    it('supports global scopes', async () => {
        User.addGlobalScope('active', query => query.whereKey('isActive', 1))

        const activeUsers = await User.query().get()
        expect(activeUsers.all().length).toBe(1)
        expect(activeUsers.all()[0]?.getAttribute('email')).toBe('jane@example.com')

        User.removeGlobalScope('active')
        const allUsers = await User.query().get()
        expect(allUsers.all().length).toBe(2)
    })

    it('dispatches lifecycle events', async () => {
        const events: string[] = []
        User.on('saving', () => void events.push('saving'))
        User.on('creating', () => void events.push('creating'))
        User.on('created', () => void events.push('created'))
        User.on('saved', () => void events.push('saved'))
        User.on('updating', () => void events.push('updating'))
        User.on('updated', () => void events.push('updated'))
        User.on('deleting', () => void events.push('deleting'))
        User.on('deleted', () => void events.push('deleted'))

        const newUser = new User({ name: 'Mia', email: 'mia@example.com', isActive: 1 })
        await newUser.save()

        const existing = await User.query().find(1)
        expect(existing).not.toBeNull()
        const existingUser = existing as User
        existingUser.setAttribute('name', 'Jane Updated')
        await existingUser.save()
        await existingUser.delete()

        expect(events).toEqual([
            'saving', 'creating', 'created', 'saved',
            'saving', 'updating', 'updated', 'saved',
            'deleting', 'deleted',
        ])
    })
})
