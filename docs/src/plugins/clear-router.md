# Clear Router Plugin

Arkormˣ provides first class support for [Clear Router](https://arkstack-tmp.github.io/clear-router) through the [Clear Router plugin](https://www.npmjs.com/package/@arkormx/plugin-clear-router) which connects Arkormˣ models to Clear Router route model binding, allowing controller method parameters to be resolved automatically from route parameters.

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

### Enable Legacy Metadata

Clear Router's container binding feature depends heavily on legacy metadata for full support, update your project's `tsconfig.json` file and set `experimentalDecorators` and `emitDecoratorMetadata` to `true` to enable legacy metadata support.

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

While this gives you complete access to how Clear Router's container binding feature is intended to be used, it is not required as [TypeScript 5.2+ Decorators](https://arkstack-tmp.github.io/clear-router/guide/container-binding#typescript-5-2-decorators) are also supported.

## Usage

Register the plugin with Clear Router:

```ts
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
