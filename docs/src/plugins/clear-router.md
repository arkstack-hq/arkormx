# Clear Router Plugin

Arkorm provides first class support for [Clear Router](https://arkstack-hq.github.io/clear-router) through the [Clear Router plugin](https://www.npmjs.com/package/@arkormx/plugin-clear-router) which connects Arkorm models to Clear Router route model binding, allowing controller method parameters to be resolved automatically from route parameters.

## Installation

::: code-group

```bash [pnpm]
pnpm add arkormx @arkormx/plugin-clear-router
```

```bash [npm]
npm install arkormx @arkormx/plugin-clear-router
```

```bash [yarn]
yarn add arkormx @arkormx/plugin-clear-router
```

:::

### Decorator Metadata

TypeScript 5.2+ standard decorators work without additional compiler settings when model tokens are passed explicitly:

```ts
@Bind(Profile)
show(profile: Profile) {}
```

To infer parameter types from tokenless `@Bind()`, enable legacy decorator metadata:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

The plugin imports `reflect-metadata`, so no additional runtime import is required. See Clear Router's [container binding documentation](https://arkstack-hq.github.io/clear-router/guide/container-binding#typescript-5-2-decorators) for both decorator modes.

## Usage

Register the plugin with Clear Router:

```ts
import { ClearRouter } from 'clear-router'
import { clearRouterPlugin } from '@arkormx/plugin-clear-router'

await ClearRouter.use(clearRouterPlugin)
```

## Route Model Binding

Once the plugin is registered, Clear Router can resolve Arkorm models directly inside controller methods.

```ts
import Profile from './models/Profile'
import { Bind } from 'clear-router/decorators'
import { Controller } from 'clear-router'

class ProfileController extends Controller {
  @Bind()
  show(profile: Profile) {
    return {
      data: {
        id: profile.getAttribute('id'),
        name: profile.name,
      },
    }
  }
}
```

Define the route using the route parameter:

```ts
ClearRouter.get('/profiles/:profile', [ProfileController, 'show'])
```

When a request matches:

```txt
GET /profiles/1
```

Clear Router will resolve the `:profile` route parameter into a `Profile` model instance before calling the controller method.

Route-bound models use Clear Router's request scope. Resolving the same model token more than once during a request returns the same hydrated instance. Other controller arguments retain their configured singleton, request, or transient container lifetime.

The plugin uses the model token declared by the controller, so it does not need to scan or dynamically import a models directory. Structural model detection also supports model classes loaded through jiti or another module runtime.

With TypeScript 5.2+ standard decorators, pass model tokens explicitly:

```ts
class ProfileController extends Controller {
  @Bind(Profile)
  show(profile: Profile) {
    return { data: profile }
  }
}
```
