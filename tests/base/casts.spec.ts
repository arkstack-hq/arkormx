import { describe, expect, it } from 'vitest'

import { resolveCast } from '../../src/casts'

describe('Casts', () => {
    it('resolves string cast get/set', () => {
        const cast = resolveCast('string')

        expect(cast.get(123)).toBe('123')
        expect(cast.set(true)).toBe('true')
        expect(cast.get(null)).toBeNull()
        expect(cast.set(undefined)).toBeUndefined()
    })

    it('resolves number cast get/set', () => {
        const cast = resolveCast('number')

        expect(cast.get('42')).toBe(42)
        expect(cast.set('10.5')).toBe(10.5)
        expect(cast.get(null)).toBeNull()
        expect(cast.set(undefined)).toBeUndefined()
    })

    it('resolves boolean cast get/set', () => {
        const cast = resolveCast('boolean')

        expect(cast.get(1)).toBe(true)
        expect(cast.set(0)).toBe(false)
        expect(cast.get(null)).toBeNull()
        expect(cast.set(undefined)).toBeUndefined()
    })

    it('resolves date cast get/set', () => {
        const cast = resolveCast('date')

        const fromString = cast.get('2026-03-07T12:00:00.000Z') as Date
        expect(fromString).toBeInstanceOf(Date)
        expect(fromString.toISOString()).toBe('2026-03-07T12:00:00.000Z')

        const existingDate = new Date('2026-03-08T00:00:00.000Z')
        expect(cast.get(existingDate)).toBe(existingDate)
        expect(cast.set(existingDate)).toBe(existingDate)
    })

    it('resolves json cast get/set with graceful parse fallback', () => {
        const cast = resolveCast('json')

        expect(cast.get('{"name":"arkorm"}')).toEqual({ name: 'arkorm' })
        expect(cast.get('not-json')).toBe('not-json')

        expect(cast.set({ enabled: true })).toBe('{"enabled":true}')
        expect(cast.set('[1,2]')).toBe('[1,2]')
    })

    it('resolves array cast get/set across scalar, json string, and array input', () => {
        const cast = resolveCast('array')

        expect(cast.get([1, 2, 3])).toEqual([1, 2, 3])
        expect(cast.get('"one"')).toEqual(['one'])
        expect(cast.get('[1,2]')).toEqual([1, 2])
        expect(cast.get('raw')).toEqual(['raw'])
        expect(cast.get(7)).toEqual([7])
        expect(cast.get(null)).toBeNull()

        expect(cast.set([1, 2])).toEqual([1, 2])
        expect(cast.set('value')).toEqual(['value'])
        expect(cast.set(undefined)).toBeUndefined()
    })

    it('returns custom cast handlers unchanged', () => {
        const custom = {
            get: (value: unknown) => `custom-get:${String(value)}`,
            set: (value: unknown) => `custom-set:${String(value)}`,
        }

        const cast = resolveCast(custom)

        expect(cast).toBe(custom)
        expect(cast.get('a')).toBe('custom-get:a')
        expect(cast.set('b')).toBe('custom-set:b')
    })
})
