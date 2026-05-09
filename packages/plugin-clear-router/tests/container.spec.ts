import { Controller, Request, Response } from 'clear-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { Router as ExpressRouter } from 'express'

import { Bind } from 'clear-router/decorators'
import { Router as ClearRouter } from 'clear-router/express'
import { Profile } from './models/Profile'
import { RouteBindingParamExtractor } from '../src/RouteBindingParamExtractor'
import { User } from './models/User'
import { clearRouterPlugin } from '../src'
import path from 'node:path'
import request from 'parasito'

describe('@resora/plugin-clear-router express', () => {
    let app: express.Application
    let router: ExpressRouter

    beforeEach(() => {
        vi.restoreAllMocks()

        ClearRouter.use(clearRouterPlugin, {
            modelsPath: path.join(process.cwd(), 'packages/plugin-clear-router/tests/models')
        })
        ClearRouter.routes = []
        ClearRouter.prefix = ''
        ClearRouter.groupMiddlewares = []
        ClearRouter.globalMiddlewares = []
        ClearRouter.routesByPathMethod = {}
        ClearRouter.routesByMethod = {}

        app = express()
        router = ExpressRouter()
        app.use(express.json())
    })

    const setup = () => {
        ClearRouter.apply(router)
        app.use(router)
    }

    it('resolves bound model arguments for controller actions', async () => {
        const firstOrFail = vi.fn(async () => User.hydrate({
            id: 1,
            name: 'Linus',
        }))
        const where = vi.fn(() => ({ firstOrFail }))

        vi.spyOn(User, 'query').mockReturnValue({ where } as any)

        class UserController extends Controller {
            @Bind()
            show (profile: Profile, req: Response, user: User) {
                return {
                    data: {
                        profileId: profile.getAttribute('id'),
                        responseStatus: req.statusCode,
                        userId: user.getAttribute('id'),
                        userName: user.getAttribute('name'),
                    },
                }
            }

            index (req: Request) {
                return { data: { url: req.url } }
            }
        }

        ClearRouter.get('/users/:user/profiles/:profile', [UserController, 'show'])

        setup()

        await request(app).get('/users/1/profiles/10')
            .expect(200)
            .expect({
                data: {
                    profileId: 7,
                    responseStatus: 200,
                    userId: 1,
                    userName: 'Linus',
                },
            })

        expect(where).toHaveBeenCalledWith({ id: '1' })
        expect(firstOrFail).toHaveBeenCalledOnce()
    })

    it('extracts custom route binding fields', () => {
        expect(RouteBindingParamExtractor.extract(
            '/profiles/{profile:slug}',
            '/profiles/lead-maintainer',
            {},
            'profile',
        )).toEqual({
            name: 'profile',
            value: 'lead-maintainer',
            field: 'slug',
        })
    })

    it('uses model-level binding resolvers when present', async () => {
        class ProfileController extends Controller {
            @Bind()
            show (profile: Profile) {
                return {
                    data: {
                        id: profile.getAttribute('id'),
                    },
                }
            }
        }

        ClearRouter.get('/profiles/:profile', [ProfileController, 'show'])
        setup()

        await request(app).get('/profiles/custom-profile')
            .expect(200)
            .expect({
                data: {
                    id: 7,
                },
            })
    })
})
