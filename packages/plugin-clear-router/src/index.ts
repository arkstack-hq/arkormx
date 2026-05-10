import 'clear-router/decorators/setup'

import { getRouteBindingName, isModel, resolveRouteBinding } from './helpers'

import { Container } from 'clear-router/decorators'
import { Options } from './types'
import { RouteBindingParamExtractor } from './RouteBindingParamExtractor'
import { definePlugin } from 'clear-router/core'

export const clearRouterPlugin = definePlugin<Options>({
    name: 'plugin-clear-router',
    async setup ({ resolveArguments }) {
        resolveArguments(async ({
            request,
            tokens,
        }) => {
            return await Promise.all(tokens.map(async (token) => {
                if (!isModel(token)) {
                    return await Container.resolve(
                        token,
                        request.ctx,
                        true
                    )
                }

                const binding = RouteBindingParamExtractor.extract(
                    request.route.path,
                    request.path,
                    request.params,
                    getRouteBindingName(token),
                )

                if (!binding) {
                    return await Container.resolve(
                        token,
                        request.ctx,
                        true
                    )
                }

                return await resolveRouteBinding(token, binding.value, binding.field)
            }))
        })
    },
})
