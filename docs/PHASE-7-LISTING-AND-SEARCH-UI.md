# Phase 7 — The Shop, Listing & Search Surface

**Directive:** Core Project Directive — UI-First Migration, Preserve Existing Functionality.
The approved design (`home-page/`) owns presentation; this application owns the catalogue,
the query engine, the URL, the filters, the wishlist and the bag. Phase 7 adopts the
design's **listing shell** and binds it to that engine.

**Status:** implemented, tested and measured in a real browser; **uncommitted** (see
§0). No backend behaviour, API contract, authentication, pricing, inventory or commerce
rule was changed.

---

## 0 · Base, and what this report cannot pretend about

| | |
|---|---|
| Branch | `arena/649fd845-pfv1` |
| HEAD | `10890db` (a fresh clone) |
| Approved starting point | `7fdab32` — **lost**: the sandbox recycled the checkout after it was created, and the new clone's object store does not contain it |
| Origin tip | `1d64755` (PR #37, still open) |
| Pushed? | **No. Nothing was pushed, no PR was opened, no merge was made.** |
| Committed? | **No.** Phase 7 lives in the worktree (untracked new files + modified tracked files, §11) |

Everything in this report describes the worktree as it stands. If the base has to be
restored, the recorded recipe is: re-fetch `1d64755` and `git merge --ff-only` (which refuses
while locally-added untracked files exist — tar-backup, remove the 231 added paths,
`git checkout --` the 6 modified tracked files, merge, then restore the 16 files that carry
newer Phase 3–6 content; 215 of the 231 were byte-identical and the whole tree was verified
with an 1816-file md5 manifest), then re-create the 36-file Phase 6 commit from the
worktree — **announced, never silent**.

---

## 1 · What was inspected before anything was edited

* the design's shop: `home-page/src/pages/Shop.jsx` (75 lines, `mode='category'|'search'`,
  its own `getProductsFor`/`searchProducts`/`sortProducts`, four local `SORTS`, a local
  `?type=` chip filter), `components/product/{ProductCard,WishlistButton,Price}.jsx`,
  `components/ui/Button.jsx`, and the class inventory of
  `styles/{tokens,base,layout,shopping,pages}.css` (`.chip`, `.chip--sm`, `.is-active`,
  `.drawer*`, `.btn*`, `.crumbs`, `.empty*`, `.grid-4`, `.pcard*`);
* the production listing space: `pages/{Shop,Explore,SearchResults,CatalogueListing,CategoryPage}.jsx`,
  the customer routes in `App.jsx`, `hooks/useCatalogueQuery.js` (the engine),
  `data/products/{query,taxonomy,explore,facets,index}.js` (the registers),
  `components/storefront/*` (the production listing UI), `components/explore/*`,
  `config/navigationConfig.js`, `services/api/{productsApi,searchApi}.js`;
* the port as it stood: `pages/Shop.jsx`, `listingScope.js`, `aarna.listing.css`,
  `scripts/aarna-port.js` (its CLOSURE/REPLACED/ADDED contract and its rewrites).

**Route/scope inventory (the directive's "38 paths", resolved exactly):**

| | |
|---|---|
| Listing routes the customer router registers | **45** |
| …of those, carrying a navigation scope in the manifest | **39** |
| …of those, production pages the port does **not** take over | **6** — `/account`, `/account/wishlist`, `/about`, `/contact`, `/privacy`, `/terms` (`CategoryPage`) |
| `navigationScopes` keys in the taxonomy register | 69, of which the router registers 39 |
| `audit:frontend-catalog`'s own denominator | **38 taxonomy paths, 38 routes with a scope — PASS** |

So the audit's 38 is the *taxonomy-path* count and it passes; the 39-of-45 figure is the
router's listing-route table. The 30 unregistered `navigationScopes` keys
(`/jewellery`, `/women/cotton-sarees`, …) are not routes in this application today — a
pre-existing audit finding, not a gap the port introduced, and the port does not invent
them either.

---

## 2 · What the port's listing is

**Adopted from the design** (unchanged markup and classes): the `.shop container` shell,
`.crumbs` trail, `label` eyebrow + `display shop__title`, the `shop__count` line, the
`shop__bar` with `shop__types` chips and the `shop__sort` select, the `.grid-4` product
grid through the design's own `ProductCard`, `.empty` states, and the `chip`/`drawer`
vocabulary for everything the design has no control for.

**Bound to this application** (never re-implemented):

| concern | source |
|---|---|
| scope of a path | `components/shop/listingScope.js` — the same registers `pages/CatalogueListing.jsx` reads (category/collection routes → taxonomy repository, ACTIVE only → `resolveNavigationScope` + `getRouteMeta` + `collectionPlates`), `null` → the design's 404 |
| products, filters, sort, search, paging | `hooks/useCatalogueQuery.js` (one URL, one result set, server-side paging) |
| facet counts | `data/products/facets.js::buildFacets(scoped, filters, scopeFilters)` — the production panel's own builder |
| sort comparators | `data/products/taxonomy.js::sortOptions` (all eight) |
| sibling-level navigation | `components/storefront/CategoryTabs.jsx::deriveTabs` |
| cards | `toDesignProduct` (the port's catalogue boundary) + `useProductCovers` (canonical product media set) + `InventoryContext.getAvailability` + `offerRepository.getProductOfferBadge` |
| search suggestions | `config/navigationConfig.js::searchSuggestions`, and `pages/SearchResults.jsx`'s own empty-search title (`Find your piece`) |
| Explore offers and inserts | `offerRepository` + `data/products/explore.js::{buildExploreStream,getExploreOffers}` + `services/explore/explorePlacements.js` |
| bag and wishlist | `CartContext` / `WishlistContext` through the port's existing `state/ShopContext.jsx` adapter |

**Added where the design had nothing** (its catalogue was an in-memory array): a skeleton
first-fetch state, an unreachable-catalogue state with the engine's own `retry`, a
filtered-to-zero state with `clearFilters`, the paged "Showing N of total · M more" line
and a filter drawer — all in the design's own blocks and classes, none of them inventing a
product, a price or a stock figure.

---

## 3 · Files

| file | lines | what it is |
|---|---|---|
| `frontend/src/components/aarna/pages/Shop.jsx` | 379 | **generated** by the port tool (rewrite 20) — never hand-edited |
| `frontend/src/components/aarna/components/shop/listingScope.js` | 184 | path → scope, through the production registers |
| `frontend/src/components/aarna/components/shop/ListingControls.jsx` | 246 | the design's `.chip` + `.drawer` refine surface |
| `frontend/src/components/aarna/aarna.listing.css` | 242 | the port's own listing chrome, every rule `.aan-root`-scoped, tokens only |
| `frontend/src/components/aarna/__tests__/aarnaListingPage.test.js` | 375 | the listing suite (13 tests) |
| `frontend/scripts/aarna-port.js` | — | rewrite 20: `SHOP_EDITS` (7 edits), `SHOP_STATES`, `shop-listing` registration, closure pin **44**, `ADDED` unchanged |
| `frontend/src/components/aarna/AarnaStorefront.jsx` | — | the six listing routes + the legacy `/collection/:slug` redirect + the catch-all, and the stylesheet import |
| `frontend/src/config/storefrontHome.js` | — | `AARNA_LISTING_PATHS` / `isAarnaListingPath` / `useAarnaListing` / `useAarnaStorefront` |
| `frontend/src/layouts/CustomerLayout.jsx` | — | reads the single boundary (`const aarna = useAarnaStorefront()`) |

**Deliberate pin moves** (each one deliberate, none of them a weakening):

1. `scripts/aarna-port.js` closure pin `pages/Shop.jsx` 45 → **44** (measured by `--copy`,
   never guessed).
2. `aarnaIntegration.test.js` — the layout assertion moved from the two per-surface hooks
   (`/useAarnaHome/`, `/useAarnaProduct/`) to the single boundary
   (`const aarna = useAarnaStorefront();`) **plus a negative assertion** that the layout
   does not go back to one hook per surface.
3. `aarnaListingPage.test.js` — the search wrapper's class pin moved `shoplist__search` →
   `listing-search` (the class the rewritten stylesheet styles), and the `chipLabel`
   import assertion moved from the page to `ListingControls.jsx`, where the chips are.

---

## 4 · Verification

### 4.1 Suites and gates (all in this worktree)

| gate | result |
|---|---|
| `node --import ./scripts/node-loader/register-jsx.mjs --test "src/components/aarna/__tests__/*.test.js"` | **81/81 pass, 0 fail** (shell 13, parity 16, integration 15, live catalogue 7, product page 17, **listing 13**) |
| `node --import ./scripts/node-loader/register-jsx.mjs --test "src/**/__tests__/*.test.js"` | **234/234 pass, 0 fail** |
| `npm test` (frontend) | **434 = 412 pass / 21 fail / 1 skip** — byte-for-byte the recorded pre-existing baseline (the same 18 guard failures and the 3 stale RBAC suites; none touched by Phase 7) |
| `node scripts/aarna-port.js --check` | **exit 0** — “the port matches the design (53 copied files, 88885 bytes of CSS)” |
| `npm run build` | **exit 0 — 3,703.84 kB / gzip 1,381.99 kB** (approved base: 3,687.50 / 1,377.73; the listing page, controls and stylesheet are the delta) |
| `npm run audit:frontend-catalog` | **PASS** (canonical ids/SKUs, taxonomy references, universal validation, canonical media, **38 listing routes / 38 scopes**, no embedded inventory) |
| `git diff --check` | exit 0 |

The listing suite covers: switch on/off on every listing route, the boundary classifier,
`resolveListingScope` against the registers (including `null` for unknown slugs), the
register's own breadcrumb, `Loading…` on first render with no product, price or stock in
the markup, the eight comparators (and the absence of the design's local `featured`), the
search surface and its suggestions, the source-level bans (`getProductsFor`,
`searchProducts`, `sortProducts`, `const SORTS`), the engine/media/tabs imports, and the
stylesheet's `.aan-root`-scoped, hex-free rules.

### 4.2 The browser probe — `.p7/tools/p7.mjs`

Run against the real dev server with the real bundle; **every `/api/v1/` catalogue request
is intercepted** by the backend-shaped fixture `.p7/tools/p7-catalogue.mjs` (no backend
runs in this sandbox). Every reading below is therefore *intercepted-fixture* evidence, not
a live-backend integration test.

**65 readings, 0 false.** Screenshots in `.p7/evidence/` (desktop 1440×900 and mobile
390×844); raw readings in `.p7/evidence/phase7-probe-results.json`.

| what | reading |
|---|---|
| switch off, same URL | production Atelier page: 0 `.aan-root`, its own heading, no design shell |
| switch on `/shop` | `.shop container`, trail `Home / Shop`, eyebrow `Shop`, title `All Pieces`, count `14 pieces`, 12 cards, prices rendered |
| refine | drawer “Refine 14 pieces”, **8 groups / 22 counted options** (`Style: anarkalis (2)`, price bands, `Size`, `Colour`), foot `Show 14 pieces`; pressing an option → URL carries the choice, chip reads `Remove filter Style: anarkalis`, results `14 → 2`; `Clear all` restores URL and count |
| sort | eight comparators; `price-asc` orders the rows ascending |
| paging | `Showing 12 of 14 · 2 more`; Load more asks for page 2 (`Showing 2 of 14 · 12 more`) |
| search | empty `/search` → title `Find your piece` + the application's five suggestions; a suggestion press → `/search?home=aarna&q=Banarasi+Saree`, field filled, title `“Banarasi Saree”`, `1 piece`, the matching row; a no-match term → `Nothing matched that search.` + `Browse all pieces` |
| scopes | `/category/sarees` → `Sarees`/`Category`/`7 cards`; `/women/sarees/silk` → eyebrow `Women · Sarees`, title `Silk Sarees`, trail with the parent link; `/collections/silk-classics` → `Silk Classics`; `/category/not-a-category` → the 404, no invented listing |
| explore | house-offer rail from the register (`UTSAV10 · 10% OFF`); an empty register prints no rail; the listing is still the shell |
| catalogue down | “We couldn’t load this edit.” + `Try again` / `Browse all pieces`; healing the outage and pressing the engine's own retry restores 12 cards and `14 pieces` |
| a card | wishlist button flips (`aria-pressed false → true`, client-only for a guest — by contract); quick add opens the design's picker, and the design's bag drawer shows the application's line and count (`Katan Silk Saree in Ivory`, `₹18,900`, `Shopping bag, 1 items`) |
| mobile | 2 columns, **0 horizontal overflow**, full-width refine drawer with all 8 groups, search surface |
| silence | no page errors, no console errors, no failed requests except the sandbox's blocked `fonts.googleapis.com` and the 500s the outage scenario asks for |

### 4.3 Two real defects the browser found, and the fixes

Both were introduced by Phase 7 and were invisible to the unit harness — it seeds the
catalogue before mounting, so the states below never render there:

1. **The empty listing/search state crashed the page.** The rewrite's empty branch read
   `emptyTitle`/`emptyBody`, which the page never defines — any zero-result listing or
   no-match search threw `ReferenceError: emptyTitle is not defined` and rendered nothing
   below the header. Fixed by giving the branch the design's own copy for the two cases it
   has (a search with no match; an edit with no pieces yet) plus one case the design never
   had — a listing the shopper's own filters emptied — which offers `clearFilters` instead
   of prose about photographs.
2. **A category or collection listing stayed 404 when the taxonomy arrived late.** The
   scope was resolved once, from registers that hydrate *after* first paint; `/category/:slug`
   and `/collections/:slug` therefore rendered the design's 404 permanently, while
   navigation paths (register-based) were fine. Fixed by resolving the scope against the
   catalogue revision (`useCatalogueRevision`), the same subscription the rest of the port
   uses.

Both fixes are now covered by the probe (§4.2), and the page still passes `--check` and the
suites.

### 4.4 Behaviour that is this application's own, and is not a defect

* **A signed-out bag and wishlist are client-only** (`CartContext`: “Guest — client-only
  cart (stock validated server-side at checkout)”, with the same `getMaxQuantity` clamp and
  an honest refusal for an unavailable piece; `WishlistContext`: guests get a client-side
  wishlist because the backend has no guest contract). The probe therefore records **no**
  API call for a guest's card press, and the bag line the drawer shows is the
  application's own guest state — not a fabricated success.
* **“Load more” moves to the next page** (`useCatalogueQuery` re-queries with `page=2` and
  renders that page) — the production listing's own semantics, unchanged by the port.
* **Search goes through `/api/v1/search`** (`searchApi.apiSearch`), not a `/products` query.
* **Explore's inserts render nothing when the media library holds no marketing media** —
  the placement resolver returns `null` and the production Explore grid does exactly the
  same; this branch is therefore *unexercised* by the probe, and is reported as such
  rather than as “empty”.
* **The production Shop heading** reads `Every piece inthe atelier` in the raw DOM text
  because the design writes it on two lines with a `<br />`; that is a reading artifact,
  not a copy defect, and nothing was changed for it.

---

## 5 · Not verified, and why

* **No backend, database, Redis or Docker in this sandbox.** Every catalogue response in
  §4.2 is intercepted: the readings prove the ported page's own behaviour against
  backend-shaped data, and prove nothing about the backend's filtering, relevance or
  paging.
* **Signed-in cart/wishlist sync, coupon application and checkout** are untouched by
  Phase 7 and were not re-exercised here (Phase 4/5 cover them; Phase 5 is the
  contract-audit phase).
* **The storefront switch-off was verified on `/shop` in the browser**; the other
  production routes are covered by the route tables and `audit:frontend-catalog`.
* **`VITE_STOREFRONT_HOME=aarna`** is covered by unit tests (`resolveStorefrontHome`), not
  by a browser run with the variable set — the dev server would have to be restarted with
  it, and the deployment default is deliberately unchanged.
* The ported page builds its facet counts locally (`buildFacets`, from the rows the
  backend returned), exactly as the production `CatalogueBrowser` does; the API's own
  `facets` payload is fetched by the engine but not used by either surface. Faithful to
  production, and worth knowing when the backend's facet counts are trusted.

---

## 6 · Change set (worktree; nothing committed or pushed)

**Added (Phase 7):** `components/aarna/components/shop/listingScope.js`,
`components/aarna/components/shop/ListingControls.jsx`,
`components/aarna/aarna.listing.css`, `__tests__/aarnaListingPage.test.js`, and the
untracked tooling/evidence under `.p7/` (`tools/p7.mjs`, `tools/p7-catalogue.mjs`,
`evidence/*` — **not** to be committed).

**Modified (Phase 7):** `components/aarna/AarnaStorefront.jsx`,
`components/aarna/pages/Shop.jsx` (regenerated), `config/storefrontHome.js`,
`layouts/CustomerLayout.jsx`, `scripts/aarna-port.js`,
`__tests__/aarnaIntegration.test.js`.

**Note on git state:** the whole `frontend/src/components/aarna/` tree is untracked in this
clone (the commit that added it was `7fdab32`, which the recycle destroyed), alongside the
Phase 3–6 work. No commit was made, per the standing instruction; the review is yours
before anything is staged.

---

## 7 · What Phase 7 did **not** do

* no Phase 8 work, no other phase started;
* no backend, contract, auth, pricing, inventory or commerce change;
* no new dependency, no TypeScript, no `home-page/` edit, no change to either
  `.gitignore`, no deployment variable changed, Atelier remains the production default;
* no commit, no push, no PR, no merge.
