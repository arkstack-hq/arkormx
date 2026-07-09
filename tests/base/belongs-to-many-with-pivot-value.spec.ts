import { User, setupCoreRuntime } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

const loadUser = async () => {
  const user = await User.query().find(1)
  if (!user) throw new Error('Expected user to exist.')

  return user
}

describe('belongsToMany withPivotValue', () => {
  beforeEach(() => {
    setupCoreRuntime()
  })

  it('uses the value as the default pivot column when creating', async () => {
    const user = await loadUser()

    const created = await user
      .roles()
      .withPivotValue('approved', true)
      .withPivot('approved')
      .as('membership')
      .create({ id: 610, name: 'moderator' })

    expect(created.getAttribute('membership')).toMatchObject({ approved: true })
  })

  it('lets explicit pivot attributes override the fixed value', async () => {
    const user = await loadUser()

    const created = await user
      .roles()
      .withPivotValue('approved', true)
      .withPivot('approved')
      .as('membership')
      .create({ id: 611, name: 'contributor' }, { approved: false })

    expect(created.getAttribute('membership')).toMatchObject({ approved: false })
  })

  it('accepts an object of column/value pairs', async () => {
    const user = await loadUser()

    const created = await user
      .roles()
      .withPivotValue({ approved: true, priority: 7 })
      .withPivot('approved', 'priority')
      .as('membership')
      .create({ id: 612, name: 'lead' })

    expect(created.getAttribute('membership')).toMatchObject({ approved: true, priority: 7 })
  })

  it('constrains the relationship to rows matching the fixed value', async () => {
    const approved = await (await loadUser()).roles().withPivotValue('approved', true).getResults()
    expect(approved.all().map((role) => role.getAttribute('name'))).toEqual(['admin'])

    const unapproved = await (await loadUser())
      .roles()
      .withPivotValue('approved', false)
      .getResults()
    expect(unapproved.all().map((role) => role.getAttribute('name'))).toEqual(['editor'])
  })

  it('also sets the default on attach', async () => {
    const user = await loadUser()

    // Attach an existing role under the fixed pivot value, then read it back.
    await user.roles().withPivotValue('approved', true).attach(501)

    const found = await user
      .roles()
      .withPivot('approved')
      .as('membership')
      .withPivotValue('approved', true)
      .wherePivot('roleId', 501)
      .first()

    expect(found).not.toBeNull()
    expect(found?.getAttribute('membership')).toMatchObject({ approved: true })
  })
})
