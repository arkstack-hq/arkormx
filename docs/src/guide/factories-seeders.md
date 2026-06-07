# Factories and Seeders

Arkorm includes class-based factories and seeders for test data and local bootstrap flows.

## Factories

### Create a factory

```ts
import { ModelFactory } from 'arkormx';
import { User } from '../../src/models/User';

export class UserFactory extends ModelFactory<User> {
  protected model = User;

  protected definition(sequence: number) {
    return {
      name: `User ${sequence}`,
      email: `user${sequence}@example.com`,
    };
  }
}
```

### Use from model

```ts
User.setFactory(UserFactory);

await User.factory().create();
await User.factory(10).createMany();
```

### Async definitions

Factory definitions can perform async work, use `makeAsync()` when a definition
or state returns a promise.

```ts
export class PostFactory extends ModelFactory<Post> {
  protected model = Post;

  protected async definition(sequence: number) {
    const user = await User.factory().create();

    return {
      title: `Post ${sequence}`,
      userId: user.getAttribute('id'),
    };
  }
}

await Post.factory().makeAsync();
await Post.factory().create();
await Post.factory(10).makeManyAsync();
await Post.factory(10).createMany();
```

Calling `make()` on a factory with an async definition or async state throws and
points callers to `makeAsync()`, `makeManyAsync()`, `create()`, or
`createMany()`.

## Seeders

```ts
import { Seeder } from 'arkormx';

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder, RoleSeeder);
    await this.call([PermissionSeeder]);
  }
}
```

Run seeders through CLI:

```sh
npx arkorm seed
npx arkorm seed DatabaseSeeder
npx arkorm seed --all
```

## Package and plugin discovery

Packages can add their own discovery paths without replacing the application's
configured `paths.*` values:

```ts
import {
  loadFactoriesFrom,
  loadModelsFrom,
  loadSeedersFrom,
  registerPaths,
} from 'arkormx';

loadSeedersFrom('./packages/audit/database/seeders');
loadFactoriesFrom('./packages/audit/database/factories');
loadModelsFrom('./packages/audit/src/models');

registerPaths({
  seeders: './packages/billing/database/seeders',
  factories: './packages/billing/database/factories',
});
```

The focused discovery helpers are also exposed on the `Arkorm` class:

```ts
import { Arkorm } from 'arkormx';

Arkorm.loadSeedersFrom('./packages/audit/database/seeders');
Arkorm.loadFactoriesFrom('./packages/audit/database/factories');
Arkorm.loadModelsFrom('./packages/audit/src/models');
```

The `seed` command includes seeders from the configured seeder directory plus
any directories registered with `loadSeedersFrom(...)`.

## Explicit registration

If a package exposes concrete classes instead of files to scan, register them
directly:

```ts
import { registerFactories, registerModels, registerSeeders } from 'arkormx';
import { AuditLogFactory } from './database/factories/AuditLogFactory';
import { AuditSeeder } from './database/seeders/AuditSeeder';
import { AuditLog } from './src/models/AuditLog';

registerSeeders(AuditSeeder);
registerModels(AuditLog);
registerFactories(AuditLogFactory);
```

The equivalent `Arkorm` class API is:

```ts
import { Arkorm } from 'arkormx';

const arkorm = new Arkorm();

arkorm.registerSeeders(AuditSeeder);
arkorm.registerModels(AuditLog);
arkorm.registerFactories(AuditLogFactory);
```

Explicit seeders can be run by name:

```sh
npx arkorm seed AuditSeeder
```
