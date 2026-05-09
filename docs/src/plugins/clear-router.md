# Clear Router Plugin

Arkormˣ provides first class support for [Clear Router](https://arkstack-hq.github.io/clear-router) through the Clear Router plugin which connects Arkormˣ models to Clear Router route model binding, allowing controller method parameters to be resolved automatically from route parameters.

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

## Usage

Register the plugin with Clear Router:

```ts
import path from 'node:path';
import { ClearRouter } from 'clear-router';
import { clearRouterPlugin } from '@arkormx/plugin-clear-router';

ClearRouter.use(clearRouterPlugin);
```

## Route Model Binding

Once the plugin is registered, Clear Router can resolve Arkormˣ models directly inside controller methods.

```ts
import Profile from './models/Profile';
import { Bind } from 'clear-router/decorators';
import { Controller } from 'clear-router';

class ProfileController extends Controller {
  @Bind()
  show(profile: Profile) {
    return {
      data: {
        id: profile.getAttribute('id'),
        name: profile.name,
      },
    };
  }
}
```

Define the route using the route parameter:

```ts
ClearRouter.get('/profiles/:profile', [ProfileController, 'show']);
```

When a request matches:

```txt
GET /profiles/1
```

Clear Router will resolve the `:profile` route parameter into a `Profile` model instance before calling the controller method.

## Custom Model Path

Use `modelsPath` when your models live outside Arkormˣ’s configured model directory:

```ts
ClearRouter.use(clearRouterPlugin, {
  modelsPath: path.join(process.cwd(), 'src/models'),
});
```
