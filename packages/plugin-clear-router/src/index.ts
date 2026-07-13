import 'reflect-metadata'

import { getRouteBindingName, isModel, resolveRouteBinding } from './helpers'

import { Container, definePlugin } from 'clear-router/core'
import { RouteBindingParamExtractor } from './RouteBindingParamExtractor'

export const clearRouterPlugin = definePlugin({
  name: 'plugin-clear-router',
  setup({ configure, resolveArguments }) {
    configure({
      container: {
        enabled: true,
        autoDiscover: true,
      },
    })

    resolveArguments(async ({ request, tokens }) => {
      const container = Container.current()
      const boundModels = new Set<(typeof tokens)[number]>()
      const args: any[] = []

      for (const token of tokens) {
        if (!isModel(token)) {
          args.push(await container.resolveOrFail(token, request.ctx, true))
          continue
        }

        const binding = RouteBindingParamExtractor.extract(
          request.route.path,
          request.path,
          request.params,
          getRouteBindingName(token),
        )

        if (!binding) {
          args.push(await container.resolveOrFail(token, request.ctx, true))
          continue
        }

        if (!boundModels.has(token)) {
          container.bind(token, {
            scope: 'request',
            useFactory: async () => {
              return await resolveRouteBinding(token, binding.value, binding.field)
            },
          })
          boundModels.add(token)
        }

        args.push(await container.resolveOrFail(token, request.ctx, true))
      }

      return args
    })
  },
})
