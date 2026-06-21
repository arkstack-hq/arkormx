import { ExtractedRouteBinding, RouteParams } from './types'

export class RouteBindingParamExtractor {
  public static extract(
    routePath: string,
    requestPath: string,
    params: RouteParams,
    bindingName: string,
  ): ExtractedRouteBinding | undefined {
    const routeSegments = this.normalizePath(routePath)
    const requestSegments = this.normalizePath(requestPath)

    const positionalParams = routeSegments
      .map((segment, index) => {
        const match = this.getRouteParamMatch(segment)

        if (!match) {
          return undefined
        }

        return {
          name: match.name,
          field: match.field,
          value: requestSegments[index],
        }
      })
      .filter((param: any): param is ExtractedRouteBinding => {
        return Boolean(param)
      })

    const matched = positionalParams.find((param) => {
      return param?.name === bindingName
    })

    if (matched) {
      return matched
    }

    const fallbackValues = Object.values(params)
    const bindingIndex = positionalParams.findIndex((param) => {
      return param?.name === bindingName
    })

    if (bindingIndex >= 0) {
      return {
        name: bindingName,
        value: fallbackValues[bindingIndex],
      }
    }

    return undefined
  }

  private static normalizePath(path: string): string[] {
    return path.split('/').filter(Boolean)
  }

  private static getRouteParamMatch(segment: string): { name: string; field?: string } | undefined {
    const colonMatch = segment.match(/^:([^/?#:]+)(?::([^/?#]+))?$/)

    if (colonMatch) {
      return {
        name: colonMatch[1],
        field: colonMatch[2],
      }
    }

    const braceMatch = segment.match(/^\{([^}:]+)(?::([^}]+))?\}$/)

    if (braceMatch) {
      return {
        name: braceMatch[1],
        field: braceMatch[2],
      }
    }

    return undefined
  }
}
