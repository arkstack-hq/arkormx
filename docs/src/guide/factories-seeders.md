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

### Dependent attributes

Definition values can use another factory. Arkorm creates the related model and
assigns its primary key to the attribute:

```ts
export class PostFactory extends ModelFactory<Post> {
  protected model = Post;

  protected definition(sequence: number) {
    return {
      title: `Post ${sequence}`,
      userId: User.factory(),
      userType: async (attributes) => {
        const user = await User.query().find(attributes.userId);

        return user?.getAttribute('type');
      },
    };
  }
}
```

Attribute resolver functions run in definition order and receive attributes
that have already been resolved. Factory-valued attributes and async resolvers
require `makeAsync()`, `makeManyAsync()`, `create()`, or `createMany()`.

### Factory states

Use `state()` for one-off transformations:

```ts
await User.factory()
  .state((attributes) => ({
    ...attributes,
    isActive: false,
  }))
  .create();
```

Expose reusable states as methods on the factory:

```ts
export class UserFactory extends ModelFactory<User> {
  protected model = User;

  protected definition(sequence: number) {
    return {
      name: `User ${sequence}`,
      email: `user${sequence}@example.com`,
      isActive: true,
    };
  }

  public suspended() {
    return this.state((attributes) => ({
      ...attributes,
      isActive: false,
      suspendedAt: new Date(),
    }));
  }
}

await User.factory<UserFactory>().suspended().create();
```

States are applied in the order they are added. Explicit attributes passed to
`make()` or `create()` are merged after states.

### Factory callbacks

Register `afterMaking` and `afterCreating` callbacks inside `configure()`:

```ts
export class UserFactory extends ModelFactory<User> {
  protected model = User;

  protected configure() {
    this.afterMaking((user) => {
      user.setAttribute('source', 'factory');
    });

    this.afterCreating(async (user) => {
      await AuditLog.query().create({
        userId: user.getAttribute('id'),
        action: 'factory-created',
      });
    });
  }

  protected definition(sequence: number) {
    return {
      name: `User ${sequence}`,
      email: `user${sequence}@example.com`,
    };
  }
}
```

`configure()` runs once for each factory instance. Async callbacks are
supported by async factory methods; synchronous `make()` rejects an async
`afterMaking` callback.

### Factory relationships

#### Has Many and Many to Many Relationships

Use `has()` for has-one or has-many relations:

```ts
await User.factory().has(Post.factory(3), 'posts').create();
```

### Pivot Table Attributes

Use `hasAttached()` for many-to-many relations and pivot attributes:

```ts
await User.factory()
  .hasAttached(Role.factory(2), { approved: true }, 'roles')
  .create();
```

#### Belongs To Relationships

Use `for()` to create or associate a belongs-to parent:

```ts
await Post.factory().for(User.factory(), 'user').create();
```

The relationship name is optional when it can be inferred from the related
model name. Pass it explicitly when the model method uses a different name.

Use `recycle()` to reuse existing models instead of creating another related
record:

```ts
const user = await User.query().firstOrFail();

await Post.factory().for(User.factory(), 'user').recycle(user).create();
```

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

When a seeder calls other seeders through `this.call()`, the CLI reports every
seeder that ran, including the root and nested seeders:

```text
Seeded  DatabaseSeeder
Seeded  UserSeeder
Seeded  RoleSeeder
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
