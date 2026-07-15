import { beforeEach, describe, expect, it } from 'vitest'

import { TableBuilder, configureArkormRuntime, resetArkormRuntimeForTests } from '../../src'

const findColumn = (table: TableBuilder, name: string) =>
  table.getColumns().find((column) => column.name === name)

describe('TableBuilder polymorphic columns', () => {
  beforeEach(() => resetArkormRuntimeForTests())

  it('maps morph attributes to the default snake_case relationship columns', () => {
    const table = new TableBuilder()
    table.morphs('commentable')

    expect(findColumn(table, 'commentableType')).toMatchObject({
      type: 'string',
      map: 'commentable_type',
      nullable: false,
    })
    expect(findColumn(table, 'commentableId')).toMatchObject({
      type: 'integer',
      map: 'commentable_id',
      nullable: false,
    })
  })

  it('maps UUID morph attributes and preserves nullable helpers', () => {
    const table = new TableBuilder()
    table.nullableUuidMorphs('followable')

    expect(findColumn(table, 'followableType')).toMatchObject({
      type: 'string',
      map: 'followable_type',
      nullable: true,
    })
    expect(findColumn(table, 'followableId')).toMatchObject({
      type: 'uuid',
      map: 'followable_id',
      nullable: true,
    })
  })

  it('omits redundant mappings when relationships use camelCase', () => {
    configureArkormRuntime(undefined, { naming: { case: 'camel' } })
    const table = new TableBuilder()
    table.uuidMorphs('followable')

    expect(findColumn(table, 'followableType')?.map).toBeUndefined()
    expect(findColumn(table, 'followableId')?.map).toBeUndefined()
  })
})
