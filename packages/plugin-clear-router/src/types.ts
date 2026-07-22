import { Model } from 'arkormx'

export interface Options {
  /**
   * @deprecated Model discovery is no longer required. The plugin resolves the
   * model tokens declared by the controller method directly.
   */
  modelsPath?: string
}

export type IModel = (new (attrs?: Record<string, unknown>) => Model) & {
  prototype: RouteBindableModel
  query: (typeof Model)['query']
  getPrimaryKey: (typeof Model)['getPrimaryKey']
}

export interface ExtractedRouteBinding {
  name: string
  value: unknown
  field?: string
}

export type RouteParams = Record<string, unknown>

export type RouteBindableModel = Model & {
  resolveRouteBinding?: (value: unknown, field?: string) => unknown | Promise<unknown>
}
