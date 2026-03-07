# Factories and Seeders

Arkormˣ includes class-based factories and seeders for test data and local bootstrap flows.

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

```bash
arkormx seed
arkormx seed DatabaseSeeder
arkormx seed --all
```
