# Pagination

Arkorm provides both length-aware and simple pagination.

## Length-aware pagination

```ts
const page = await User.query().paginate(15, 2, {
  path: '/users',
  query: { role: 'admin' },
  fragment: 'list',
})

page.data.all()
page.meta.total
page.meta.currentPage
page.meta.lastPage
page.nextPageUrl()
```

## Simple pagination

```ts
const page = await User.query().simplePaginate(15, 2, {
  path: '/users',
  pageName: 'p',
})

page.data.all()
page.meta.hasMorePages
page.nextPageUrl()
```

## Metadata

`page.meta` describes the current page. Length-aware pages expose the full set;
simple pages omit `total` and `lastPage` (they never count the whole result set)
and add `hasMorePages`:

| Field          | Length-aware | Simple | Meaning                                                                          |
| -------------- | :----------: | :----: | -------------------------------------------------------------------------------- |
| `total`        |      ✅      |   —    | Total matching rows across all pages.                                            |
| `perPage`      |      ✅      |   ✅   | Requested page size.                                                             |
| `currentPage`  |      ✅      |   ✅   | The active page number.                                                          |
| `lastPage`     |      ✅      |   —    | Number of the final page.                                                        |
| `from` / `to`  |      ✅      |   ✅   | 1-based index of the first/last row on the page (`null` when the page is empty). |
| `hasMorePages` |      —       |   ✅   | Whether another page follows.                                                    |

## Page URLs

Both paginators build page links from the `path`/`query`/`pageName` options (or a
custom [URL driver](#url-driver-customization)):

```ts
page.url(3) // URL for an arbitrary page
page.nextPageUrl() // string | null
page.previousPageUrl() // string | null
page.getPageName() // the query param used for the page number
```

Length-aware pages additionally expose `firstPageUrl()` and `lastPageUrl()`.

## Serializing to JSON

`toJSON()` (and therefore `JSON.stringify(page)`) emits a `data` / `meta` /
`links` envelope ready to return from an API:

```ts
JSON.stringify(page)
// {
//   "data": [ ...serialized models... ],
//   "meta": { "total": 42, "perPage": 15, "currentPage": 2, "lastPage": 3, "from": 16, "to": 30 },
//   "links": { "first": "...", "last": "...", "prev": "...", "next": "..." }
// }
```

Simple pages emit the same shape without `first`/`last` links.

## URL driver customization

```ts
import { URLDriver, defineConfig } from 'arkormx'

class AppURLDriver extends URLDriver {
  override url(page: number): string {
    return `/app${super.url(page)}`
  }
}

export default defineConfig({
  adapter,
  pagination: {
    urlDriver: (options) => new AppURLDriver(options),
  },
})
```

## Runtime current page resolution

If your framework already stores the active request context elsewhere, you can
let Arkorm derive the current page when `paginate()` or `simplePaginate()` is
called without an explicit page argument.

```ts
import { defineConfig } from 'arkormx'

export default defineConfig({
  adapter,
  pagination: {
    resolveCurrentPage: (pageName) => {
      const value = getCurrentRequestQueryValue(pageName)
      const page = Number(value)

      return Number.isInteger(page) && page > 0 ? page : undefined
    },
  },
})

const page = await User.query().paginate(15)
```

An explicit page argument still wins over the runtime resolver.
