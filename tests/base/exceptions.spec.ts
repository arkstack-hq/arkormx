import {
    ArkormException,
    MissingDelegateException,
    Model,
    ModelNotFoundException,
    QueryConstraintException,
    RelationResolutionException,
    ScopeNotDefinedException,
    UniqueConstraintResolutionException,
    UnsupportedAdapterFeatureException,
} from '../../src'
import { User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Exceptions', () => {
    beforeEach(() => {
        setupCoreRuntime()
    })

    it('exposes structured ArkormException context', () => {
        const cause = new Error('root cause')
        const error = new ArkormException('Failed operation.', {
            code: 'TEST_ERROR',
            operation: 'unit-test',
            model: 'User',
            meta: {
                attempt: 1,
            },
            cause,
        })

        expect(error.getContext()).toMatchObject({
            code: 'TEST_ERROR',
            operation: 'unit-test',
            model: 'User',
            meta: {
                attempt: 1,
            },
            cause,
        })
        expect(error.toJSON()).toMatchObject({
            name: 'ArkormException',
            message: 'Failed operation.',
            code: 'TEST_ERROR',
        })
    })

    it('throws MissingDelegateException with delegate resolution context', () => {
        class Ghost extends Model<'ghost'> {
            protected static override delegate = 'ghosts'
        }

        let thrown: unknown
        try {
            Ghost.query()
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(MissingDelegateException)
        expect((thrown as MissingDelegateException).getContext()).toMatchObject({
            code: 'MISSING_DELEGATE',
            operation: 'getDelegate',
            model: 'Ghost',
            delegate: 'ghosts',
        })
    })

    it('throws QueryConstraintException for invalid update and insertUsing constraints', async () => {
        await expect(User.query().updateFrom({ name: 'Jane' } as never)).rejects.toBeInstanceOf(QueryConstraintException)
        await expect(User.query().insertUsing(['name'], null)).rejects.toBeInstanceOf(QueryConstraintException)
    })

    it('throws ScopeNotDefinedException and UnsupportedAdapterFeatureException with metadata', () => {
        expect(() => User.query().scope('missing')).toThrow(ScopeNotDefinedException)
        expect(() => User.query().whereRaw('id = ?', [1])).toThrow(UnsupportedAdapterFeatureException)
    })

    it('throws ModelNotFoundException and UniqueConstraintResolutionException with operation context', async () => {
        await expect(User.query().whereKey('id', 999).firstOrFail()).rejects.toBeInstanceOf(ModelNotFoundException)
        await expect(User.query().insertGetId({ name: 'Jane' } as never, 'uuid')).rejects.toBeInstanceOf(UniqueConstraintResolutionException)
    })

    it('throws RelationResolutionException when relationship resolution fails', async () => {
        await expect(User.query().has('missingRelation').get()).rejects.toBeInstanceOf(RelationResolutionException)
    })
})