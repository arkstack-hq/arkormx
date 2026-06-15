import { describe, expect, it } from 'vitest'

import { TableBuilder } from '../../src'

const findColumn = (table: TableBuilder, name: string) =>
    table.getColumns().find(column => column.name === name)

describe('TableBuilder.timestamps', () => {
    it('defaults to camelCase attribute names without a map', () => {
        const table = new TableBuilder()
        table.timestamps()

        const createdAt = findColumn(table, 'createdAt')
        const updatedAt = findColumn(table, 'updatedAt')

        expect(createdAt).toMatchObject({ nullable: false, default: 'now()' })
        expect(createdAt?.map).toBeUndefined()
        expect(updatedAt).toMatchObject({ nullable: false, updatedAt: true })
        expect(updatedAt?.map).toBeUndefined()
    })

    it('supports a snake_case convention for the attribute names', () => {
        const table = new TableBuilder()
        table.timestamps('snake')

        expect(findColumn(table, 'created_at')).toMatchObject({ default: 'now()' })
        expect(findColumn(table, 'updated_at')).toMatchObject({ updatedAt: true })
        expect(findColumn(table, 'createdAt')).toBeUndefined()
    })

    it('maps camelCase attributes to snake_case database columns', () => {
        const table = new TableBuilder()
        table.timestamps('camel', 'snake')

        expect(findColumn(table, 'createdAt')?.map).toBe('created_at')
        expect(findColumn(table, 'updatedAt')?.map).toBe('updated_at')
    })

    it('accepts explicit attribute and map names', () => {
        const table = new TableBuilder()
        table.timestamps({ createdAt: 'createdOn' }, { createdAt: 'created_on' })

        const createdOn = findColumn(table, 'createdOn')
        expect(createdOn?.map).toBe('created_on')
        // The omitted updatedAt falls back to the default attribute name.
        expect(findColumn(table, 'updatedAt')).toBeDefined()
        expect(findColumn(table, 'updatedAt')?.map).toBeUndefined()
    })

    it('omits a map when it matches the attribute name', () => {
        const table = new TableBuilder()
        table.timestamps('camel', 'camel')

        expect(findColumn(table, 'createdAt')?.map).toBeUndefined()
        expect(findColumn(table, 'updatedAt')?.map).toBeUndefined()
    })
})
