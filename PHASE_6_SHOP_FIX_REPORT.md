# PHASE 6 — Shop Page Runtime Crash Fix (product/collection data contract)

## Symptom

```
Uncaught TypeError: Cannot read properties of undefined (reading 'title')
  at Shop (src/pages/Shop.jsx:79:27)
An error occurred in the <Shop> component.
```

The Shop page rendered blank.

## Root cause

`frontend/src/pages/Shop.jsx` treated an **optional backend lookup as a
guaranteed record**:

```js
const featured = collectionRoutes.featured;      // may be undefined
const featuredImage = resolveCollectionCover(featured);
const featuredHref = collectionHref(taxonomyRepository.findCollection("featured")) ?? "/collections/featured";
...
alt={featured.title}                             // ← line 79, the throw
```

`collectionRoutes` (`src/data/products/taxonomy.js`) is a live Proxy over the
backend-fed catalog store:

```js
get: (_, key) => {
  const collection = getCollectionById(String(key));
  return collection ? collectionScope(collection) : undefined;   // honest miss
}
```

`getCollectionById("featured")` reads `state.collections`, hydrated from
`GET /collections?status=ACTIVE`. That array is:

* **empty on first paint** — `hydrateCatalog()` is asynchronous (fired from
  `App.jsx`), while `Shop` renders synchronously; and
* **still without a `featured` entry** whenever the backend catalogue simply
  has no ACTIVE collection whose id/slug is `featured`.

So `collectionRoutes.featured` is `undefined` on every first render of
`/shop`, and `featured.title` threw before any product data was involved.

The undefined value therefore originated in the *taxonomy/collection* read
model, not in product normalization. Product records (`GET /products` →
`toStorefrontProduct`) were never at fault; `products.filter(...)`,
`categoryCounts` and `CatalogueBrowser` were already null-safe. This is the
same crash class as the Phase 5/earlier taxonomy fix, on the one call site
that had not been converted to the null-safe seam.

## Fix

Smallest correct change, at the consuming layer, using the **existing**
null-safe routing seam (`resolveCollectionRoute`, already used by
`CatalogueBrowser`):

```js
const featuredRoute = resolveCollectionRoute("featured");
const featured = featuredRoute ? collectionRoutes[featuredRoute.collection.slug] ?? null : null;
const featuredImage = featured ? resolveCollectionCover(featured) : null;
const featuredHref = featuredRoute?.href ?? null;
```

and the featured-edit section renders only when the backend actually carries
the record:

```jsx
{featured && featuredHref ? ( <AtelierSection …/> ) : null}
```

* No normalization, API adapter, catalog store or backend code was changed.
* No fabricated title, eyebrow, description, price, id or product.
* The hardcoded `"/collections/featured"` href fallback was removed — a link
  is only offered for a routable ACTIVE record.
* When the record *is* present, the edit renders exactly as before, from the
  server's own `name` / `eyebrow` / `description` / `slug`.

## Regression test

`frontend/tests/shopFeaturedEditRender.test.js` server-renders the real
`Shop` page through Vite's SSR pipeline against the real catalog store:

1. empty snapshot (pre-hydration / backend miss) → renders, no throw;
2. hydrated with a backend `featured` collection → renders the **server's**
   title, description and `/collections/featured` route, and the featured
   count from the server product snapshot;
3. hydrated without one → page renders, edit omitted, nothing invented;
4. source guard: no fabricated title/href fallbacks in `Shop.jsx`.

Verified to fail (3 of 4) against the pre-fix file and pass after.

## Hero media observation — `HERO RUNTIME MEDIA count: 0`

`resolveHomepageHeroMedia()` admits only marketing media *records* on the
`HOME_HERO` placement carrying the `HERO` usage role and the hero mapping
method. Those records live in the media register, which Phase 6 classified as
**BLOCKED / BACKEND_GAP** (`media_media_asset` declares no business columns,
so no hero assignments can exist). `count: 0` is therefore the honest,
expected state of the current backend data — not a frontend defect. No hero
assets were invented and the media migration was not touched.

## Media / storage integrity

* `frontend/public/images` — **238 files, untouched** (`git status` clean for
  that tree).
* `backend/storage/media` is git-ignored runtime state and is not materialised
  in this workspace clone, so the 238/238 checksum comparison could not be
  re-run here; the Phase 6 test that performs it skips with
  `backend storage/media not present in this workspace`.
* `STORAGE_PROVIDER=local` unchanged; no S3 credentials added.
* Product media still resolves through the canonical
  `/api/v1/media/objects/…` URL (verified in an SSR render: the homepage
  product plate emitted `src="/api/v1/media/objects/products/p1/cover.jpg"`).
