import { Model } from 'arkormx'

export interface Options {
    /** 
     * Absolute path or path relative to cwd where models are stored 
     * 
     * @default arkormx default paths.models config
     */
    modelsPath?: string
}

export type IModel = (new (attrs?: Record<string, unknown>) => Model) & {
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
