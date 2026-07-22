import { Controller, Request, Response } from 'clear-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { Router as ExpressRouter } from 'express'

import { Bind } from 'clear-router/decorators'
import { Router as ClearRouter } from 'clear-router/express'
import { Container } from 'clear-router/core'
import { Profile } from './models/Profile'
import { RouteBindingParamExtractor } from '../src/RouteBindingParamExtractor'
import { User } from './models/User'
import { clearRouterPlugin } from '../src'
import { isModel } from '../src/helpers'
import request from 'parasito'

describe('@arkorm/plugin-clear-router express', () => {
  let app: express.Application
  let router: ExpressRouter

  beforeEach(async () => {
    vi.restoreAllMocks()
    Container.clear()
    ClearRouter.reset()

    await ClearRouter.use(clearRouterPlugin)

    app = express()
    router = ExpressRouter()
    app.use(express.json())
  })

  const setup = () => {
    ClearRouter.apply(router)
    app.use(router)
  }

  it('resolves bound model arguments for controller actions', async () => {
    const findOrFail = vi.fn(async () =>
      User.hydrate({
        id: 1,
        name: 'Linus',
      }),
    )

    vi.spyOn(User, 'query').mockReturnValue({ findOrFail } as any)

    class UserController extends Controller {
      // TODO: Review typescript configuration for full legacy decorators support so we can remove explicit binding.
      @Bind(Profile, Response, User)
      show(profile: Profile, req: Response, user: User) {
        return {
          data: {
            profileId: profile.getAttribute('id'),
            responseStatus: req.statusCode,
            userId: user.getAttribute('id'),
            userName: user.getAttribute('name'),
          },
        }
      }

      index(req: Request) {
        return { data: { url: req.url } }
      }
    }

    ClearRouter.get('/users/:user/profiles/:profile', [UserController, 'show'])

    setup()

    await request(app)
      .get('/users/1/profiles/10')
      .expect(200)
      .expect({
        data: {
          profileId: 7,
          responseStatus: 200,
          userId: 1,
          userName: 'Linus',
        },
      })

    expect(findOrFail).toHaveBeenCalledWith('1', 'id')
    expect(findOrFail).toHaveBeenCalledOnce()
  })

  it('extracts custom route binding fields', () => {
    expect(
      RouteBindingParamExtractor.extract(
        '/profiles/{profile:slug}',
        '/profiles/lead-maintainer',
        {},
        'profile',
      ),
    ).toEqual({
      name: 'profile',
      value: 'lead-maintainer',
      field: 'slug',
    })
  })

  it('uses model-level binding resolvers when present', async () => {
    class ProfileController extends Controller {
      // TODO: Review typescript configuration for full legacy decorators support so we can remove explicit binding.
      @Bind(Profile)
      show(profile: Profile) {
        return {
          data: {
            id: profile.getAttribute('id'),
          },
        }
      }
    }

    ClearRouter.get('/profiles/:profile', [ProfileController, 'show'])
    setup()

    await request(app)
      .get('/profiles/custom-profile')
      .expect(200)
      .expect({
        data: {
          id: 7,
        },
      })
  })

  it('resolves a model from tokenless decorator metadata', async () => {
    class ProfileController extends Controller {
      @Bind()
      show(profile: Profile) {
        return {
          data: {
            id: profile.getAttribute('id'),
            routeValue: profile.getAttribute('routeValue'),
          },
        }
      }
    }

    expect(Reflect.getMetadata('design:paramtypes', ProfileController.prototype, 'show')).toEqual([
      Profile,
    ])

    ClearRouter.get('/profiles/:profile', [ProfileController, 'show'])
    setup()

    await request(app)
      .get('/profiles/metadata-profile')
      .expect(200)
      .expect({
        data: {
          id: 7,
          routeValue: 'metadata-profile',
        },
      })
  })

  it('reuses a route-bound model within the same request', async () => {
    const findOrFail = vi.fn(async () => User.hydrate({ id: 1, name: 'Ada' }))
    vi.spyOn(User, 'query').mockReturnValue({ findOrFail } as any)

    class UserController extends Controller {
      @Bind(User, User)
      show(first: User, second: User) {
        return {
          data: {
            sameInstance: first === second,
            id: first.getAttribute('id'),
          },
        }
      }
    }

    ClearRouter.get('/users/:user', [UserController, 'show'])
    setup()

    await request(app)
      .get('/users/1')
      .expect(200)
      .expect({ data: { sameInstance: true, id: 1 } })

    expect(findOrFail).toHaveBeenCalledOnce()
  })

  it('isolates route-bound models across concurrent requests', async () => {
    const findOrFail = vi.fn(async (value: string) => User.hydrate({ id: Number(value) }))
    vi.spyOn(User, 'query').mockReturnValue({ findOrFail } as any)

    class UserController extends Controller {
      @Bind(User)
      show(user: User) {
        return { data: { id: user.getAttribute('id') } }
      }
    }

    ClearRouter.get('/users/:user', [UserController, 'show'])
    setup()

    const [first, second] = await Promise.all([
      request(app).get('/users/1'),
      request(app).get('/users/2'),
    ])

    expect(first.body).toEqual({ data: { id: 1 } })
    expect(second.body).toEqual({ data: { id: 2 } })
    expect(findOrFail).toHaveBeenCalledWith('1', 'id')
    expect(findOrFail).toHaveBeenCalledWith('2', 'id')
  })

  it('does not instantiate a model when the route has no matching binding', async () => {
    let constructions = 0

    class UnboundModel extends User {
      constructor(attributes?: Record<string, unknown>) {
        super(attributes)
        constructions++
      }
    }

    class UnboundController extends Controller {
      @Bind(UnboundModel)
      show(_model: UnboundModel) {
        return { data: { resolved: true } }
      }
    }

    ClearRouter.get('/unbound', [UnboundController, 'show'])
    setup()
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: 'unresolved' })
    })

    await request(app)
      .get('/unbound')
      .expect(500)
      .expect({ error: 'unresolved' })

    expect(constructions).toBe(0)
  })

  it('preserves request-scoped non-model dependencies', async () => {
    class RequestService {
      constructor(readonly id: string) {}
    }

    Container.bind(RequestService, {
      scope: 'request',
      useFactory: (ctx) => new RequestService(ctx.clearRequest.param('id')),
    })

    class ServiceController extends Controller {
      @Bind(RequestService, RequestService)
      show(first: RequestService, second: RequestService) {
        return { data: { id: first.id, sameInstance: first === second } }
      }
    }

    ClearRouter.get('/services/:id', [ServiceController, 'show'])
    setup()

    await request(app)
      .get('/services/42')
      .expect(200)
      .expect({ data: { id: '42', sameInstance: true } })
  })

  it('recognizes model constructors loaded through a separate module runtime', () => {
    class LoaderModel {
      static query() {}
      static hydrate() {}
      static getPrimaryKey() {
        return 'id'
      }
    }

    expect(isModel(LoaderModel)).toBe(true)
  })
})
