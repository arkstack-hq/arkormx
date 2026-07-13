import { IModel, RouteBindableModel } from './types'

import { Model } from 'arkormx'

export async function resolveRouteBinding(modelClass: IModel, value: unknown, field?: string) {
  const instance = new modelClass() as RouteBindableModel

  if (typeof instance.resolveRouteBinding === 'function') {
    return await instance.resolveRouteBinding(value, field)
  }

  const resolvedField = field ?? modelClass.getPrimaryKey()

  return await modelClass
    .query()
    .where({ [resolvedField]: value as string | number })
    .firstOrFail()
}

export const isModel = (cls: any): cls is IModel => {
  if (typeof cls !== 'function') return false

  return (
    cls === Model ||
    (typeof cls.query === 'function' &&
      typeof cls.hydrate === 'function' &&
      typeof cls.getPrimaryKey === 'function')
  )
}

export const getRouteBindingName = (modelClass: IModel): string => {
  return modelClass.name.replace(/Model$/, '').replace(/^[A-Z]/, (letter) => letter.toLowerCase())
}
