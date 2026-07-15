# Factories and Seeders

Arkorm includes class-based factories and seeders for test data and local bootstrap flows.

## Factories

### Create a factory

```ts
import { ModelFactory } from 'arkormx'
import type { User } from '../../src/models/User'

export class UserFactory extends ModelFactory<User> {
  protected definition(sequence: number) {
    return {
      name: `User ${sequence}`,
      email: `user${sequence}@example.com`,
    }
  }
}
```

When a model declares this factory through `factoryClass` (or `setFactory()`),
`Model.factory()` injects the model constructor into the factory. The factory can
therefore use a type-only model import and avoid a runtime model → factory → model
cycle. Directly instantiated factories can call `.setModel(User)`; defining the
legacy `protected model = User` property remains supported.

### Use from model

```ts
User.setFactory(UserFactory)

await User.factory().create()
await User.factory(10).createMany()
```

## Seeders

```ts
import { Seeder } from 'arkormx'

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder, RoleSeeder)
    await this.call([PermissionSeeder])
  }
}
```

Run seeders through CLI:

```sh
npx arkorm seed
npx arkorm seed DatabaseSeeder
npx arkorm seed --all
```
