# Pagination

Arkormˣ provides both length-aware and simple pagination.

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
const page = await User.query().simplePaginate(2, 15, {
  path: '/users',
  pageName: 'p',
});

page.data();
page.hasMorePages();
page.nextPageUrl();
```

## URL driver customization

```ts
import { URLDriver, defineConfig } from 'arkormx';

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

## Runtime current page resolution

If your framework already stores the active request context elsewhere, you can
let Arkorm derive the current page when `paginate()` or `simplePaginate()` is
called without an explicit page argument.

```ts
import { configureArkormRuntime } from 'arkormx';

configureArkormRuntime(() => prisma, {
  pagination: {
    resolveCurrentPage: (pageName) => {
      const value = getCurrentRequestQueryValue(pageName);
      const page = Number(value);

      return Number.isInteger(page) && page > 0 ? page : undefined;
    },
  },
});

const page = await User.query().paginate(15);
```

An explicit page argument still wins over the runtime resolver.
