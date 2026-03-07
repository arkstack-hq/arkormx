# Pagination

Arkorm provides both length-aware and simple pagination.

## Length-aware pagination

```ts
const page = await User.query().paginate(2, 15, {
  path: '/users',
  query: { role: 'admin' },
  fragment: 'list',
});

page.data();
page.total();
page.currentPage();
page.lastPage();
page.nextPageUrl();
```

## Simple pagination

```ts
const page = await User.query().simplePaginate(15, 2, {
  path: '/users',
  pageName: 'p',
});

page.data();
page.hasMorePages();
page.nextPageUrl();
```

## URL driver customization

```ts
import { URLDriver, defineConfig } from 'arkorm';

class AppURLDriver extends URLDriver {
  override url(page: number): string {
    return `/app${super.url(page)}`;
  }
}

export default defineConfig({
  prisma: () => prisma as unknown as Record<string, unknown>,
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
});
```
