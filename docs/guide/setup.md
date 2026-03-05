# Setup

This page contains copy-paste templates for a typical Arkorm + Prisma setup.

## 1. Create `arkorm.config.ts`

```ts
import { defineConfig } from 'arkorm';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
});
```

## 2. Define models

```ts
import { Model } from 'arkorm';

export class User extends Model<'users'> {
  protected static override delegate = 'users';
}

export class Article extends Model<'articles'> {
  protected static override delegate = 'articles';
  protected static override softDeletes = true;
}
```

## 3. Query usage

```ts
const users = await User.query().whereKey('isActive', 1).get();
const article = await Article.query().first();

users[0]?.getAttribute('email');
article?.getAttribute('deletedAt');
```

## Notes

- String generics map directly to Prisma delegates, so `Model<'user'>` and `Model<'users'>` are both fully typed.
- If you skip generics entirely (`class X extends Model {}`), attributes are intentionally `any` for non-TypeScript-friendly usage.
