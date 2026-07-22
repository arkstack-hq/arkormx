import { IModel } from './types'
import { Model } from 'arkormx'

export async function resolveRouteBinding(modelClass: IModel, value: unknown, field?: string) {
  if (typeof modelClass.prototype.resolveRouteBinding === 'function') {
    const instance = new modelClass()

    return await instance.resolveRouteBinding!(value, field)
  }

  const resolvedField = field ?? modelClass.getPrimaryKey()

  return await modelClass.query().findOrFail(value as string | number, resolvedField)
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
