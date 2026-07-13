# @arkormx/plugin-clear-router

Clear Router plugin for resolving Arkormx models from route parameters.

```ts
import { Router } from 'clear-router/express'
import { clearRouterPlugin } from '@arkormx/plugin-clear-router'

await Router.use(clearRouterPlugin)
```

## What it does

When a controller action is decorated with `@Bind()`, the plugin checks each bound argument. ArkORM model arguments are hydrated from matching route parameters and registered in Clear Router's request container. Repeated arguments receive the same model instance for that request.

```ts
import { Bind } from 'clear-router/decorators'
import { Controller } from 'clear-router'
import { User } from './models/User'

class UserController extends Controller {
  @Bind()
  async show(user: User) {
    return {
      data: user,
    }
  }
}

Router.get('/users/:user', [UserController, 'show'])
```

For `/users/1`, the `user` argument is resolved with:

```ts
await User.query().where({ id: '1' }).firstOrFail()
```

Non-model arguments continue to resolve through the active Clear Router request container, preserving singleton, request, and transient provider lifetimes.

Model constructors are detected by their ArkORM static API rather than JavaScript constructor identity, so models loaded through jiti or another module runtime remain compatible.

The plugin configures Clear Router container binding automatically. Legacy `@Bind()` type inference still requires TypeScript decorator metadata; use explicit `@Bind(User)` tokens with standard TypeScript decorators.

## Route Parameter Names

The plugin derives the route parameter name from the model class name:

| Model class | Route parameter           |
| ----------- | ------------------------- |
| `User`      | `:user` or `{user}`       |
| `Profile`   | `:profile` or `{profile}` |
| `UserModel` | `:user` or `{user}`       |

Both Clear Router parameter styles are supported:

```ts
Router.get('/users/:user', [UserController, 'show'])
Router.get('/users/{user}', [UserController, 'show'])
```

## Custom Binding Fields

Use `:name:field` or `{name:field}` to resolve by a non-primary column:

```ts
Router.get('/users/{user:email}', [UserController, 'show'])
```

For `/users/jane@example.com`, the plugin runs:

```ts
await User.query().where({ email: 'jane@example.com' }).firstOrFail()
```

## Custom Model Resolution

Models can override the default lookup by defining `resolveRouteBinding`:

```ts
import { Model } from 'arkormx'

export class User extends Model {
  async resolveRouteBinding(value: unknown, field = 'id') {
    return await User.query()
      .whereKey(field as 'id', value as never)
      .firstOrFail()
  }
}
```

The method receives the raw route value and the binding field, if one was provided in the route.

## Development

```sh
pnpm test
pnpm build
```
