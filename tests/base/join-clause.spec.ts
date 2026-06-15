import { UnsupportedAdapterFeatureException, createPrismaDatabaseAdapter } from '../../src'
import { User, createCoreClient, setupCoreRuntime } from './helpers/core-fixtures'
import { describe, expect, it } from 'vitest'

import { JoinClause } from '../../src/JoinClause'

describe('JoinClause', () => {
    it('builds column constraints with a default equality operator', () => {
        const clause = new JoinClause()
        clause.on('users.id', 'posts.userId')

        expect(clause.getConstraints()).toEqual([
            { type: 'column', boolean: 'and', first: 'users.id', operator: '=', second: 'posts.userId' },
        ])
    })

    it('builds column constraints with an explicit operator and or chaining', () => {
        const clause = new JoinClause()
        clause.on('users.id', '=', 'posts.userId').orOn('users.altId', '=', 'posts.userId')

        expect(clause.getConstraints()).toEqual([
            { type: 'column', boolean: 'and', first: 'users.id', operator: '=', second: 'posts.userId' },
            { type: 'column', boolean: 'or', first: 'users.altId', operator: '=', second: 'posts.userId' },
        ])
    })

    it('builds value, null and raw constraints', () => {
        const clause = new JoinClause()
        clause
            .where('posts.views', '>', 100)
            .where('posts.active', true)
            .whereNotNull('posts.publishedAt')
            .orWhereNull('posts.deletedAt')
            .onRaw('posts.score > ?', [10])

        expect(clause.getConstraints()).toEqual([
            { type: 'value', boolean: 'and', column: 'posts.views', operator: '>', value: 100 },
            { type: 'value', boolean: 'and', column: 'posts.active', operator: '=', value: true },
            { type: 'null', boolean: 'and', column: 'posts.publishedAt', not: true },
            { type: 'null', boolean: 'or', column: 'posts.deletedAt', not: false },
            { type: 'raw', boolean: 'and', sql: 'posts.score > ?', bindings: [10] },
        ])
    })

    it('nests grouped constraints supplied through a closure', () => {
        const clause = new JoinClause()
        clause.on('users.id', 'posts.userId').on(join => {
            join.on('posts.tenantId', 'users.tenantId').orWhere('posts.global', true)
        })

        const constraints = clause.getConstraints()
        expect(constraints[1]).toEqual({
            type: 'nested',
            boolean: 'and',
            constraints: [
                { type: 'column', boolean: 'and', first: 'posts.tenantId', operator: '=', second: 'users.tenantId' },
                { type: 'value', boolean: 'or', column: 'posts.global', operator: '=', value: true },
            ],
        })
    })

    it('throws when an "on" constraint is missing its second column', () => {
        const clause = new JoinClause()
        expect(() => clause.on('users.id')).toThrow('second column')
    })
})

describe('QueryBuilder join guard', () => {
    it('rejects join clauses on adapters without join support', () => {
        setupCoreRuntime()
        const adapter = createPrismaDatabaseAdapter(createCoreClient())
        User.setAdapter(adapter)

        expect(() => User.query().join('posts', 'users.id', '=', 'posts.userId'))
            .toThrow(UnsupportedAdapterFeatureException)
    })
})
