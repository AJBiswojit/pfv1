# UI-First Migration — Directive Audit & Phase Plan

**Read-only inspection. No feature was modified to produce this document.**

This is the "inspect and report the relevant existing functionality before changing it" step the directive
mandates. It answers three questions with evidence from the repository:

1. What is the new approved design, and how much of the application currently follows it?
2. For each remaining design surface, what real production functionality sits behind it and must be
   preserved?
3. Which parts of the design must **not** be adopted, because they are prototype stubs that would replace
   working functionality with a hardcoded state?

Nothing here is a proposal to rewrite anything. Every phase below is scoped as *adopt this presentation,
keep this behaviour*.

---

## 1 · What the new approved design is, and what has actually been adopted

The design source is `home-page/` (read-only, per the standing constraint). Its corpus is **60 `.js`/`.jsx`
files**. The port to date is:

| | Count | Detail |
|---|---|---|
| Copied verbatim + transformed (CLOSURE) | **50** | the shell (`Layout`, `Header`, `MegaMenu`, `MobileMenu`, `Footer`, `AnnouncementBar`), the shopping overlays (`CartDrawer`, `QuickViewModal`, `SearchOverlay`), all 12 home sections, the `ui/*` and `product/*` primitives, `hooks/*`, `utils/*`, `services/catalog.js`, `data/index.js`, `aarna.css` |
| Replaced by an app adapter | **4** | `mock/data/products.js` → **live backend catalogue**, `mock/data/promotions.js` → **the real offer register**, `state/ShopContext.jsx` → **this app's CartContext + WishlistContext**, `services/newsletter.js` → **capability disabled** (no subscription service exists) |
| Hand-written app-side additions | **8** | `AarnaStorefront.jsx`, `router/` (the path boundary), `aarna.css` bundle, `aarna.host.css`, `designFonts.js`, `mock/data/site.js`, `utils/mediaFallback.js` |
| Named rewrites applied to design files | **17** | routing, fetch-priority, logo-plate, offer-copy, promo-feedback, add-to-bag-feedback, layout-slot, newsletter-capability, art-base, footer-facts, saree/kurti-curation, barrel, content-facts, live-catalogue, media-fallback, bestsellers-note |

**The decisive fact: the port currently mounts `Home.jsx` and nothing else.**

```
components/aarna/AarnaStorefront.jsx   →   <Layout><Home /></Layout>
```

`Layout` renders the design's full shell *and an `<Outlet />`* — the design was built to host child routes.
Today that outlet is never used: `AarnaStorefront` passes `Home` as a child. Every customer surface other
than the homepage is still the legacy (Atelier) UI.

**How the port is exposed today:** `layouts/CustomerLayout.jsx` mounts it at the customer root only when the
switch is on (`?home=aarna` in development, `VITE_STOREFRONT_HOME=aarna` in a deployed build), per
`config/storefrontHome.js`. With the switch off, nothing in `components/aarna/` is reachable.

### The gap, exactly

Of the design's 9 pages, **1 is adopted** (`Home`) and **8 are not**. Two further un-ported files —
`components/ui/Img.jsx` and `hooks/useMediaQuery.js` — are **imported by nothing** in the design corpus
(verified by grep), so they are dead code and need no port. The remaining design corpus is therefore
**exactly 8 pages**:

`Product.jsx` (103 ln) · `Shop.jsx` (75) · `Account.jsx` (50) · `Checkout.jsx` (34) · `Wishlist.jsx` (29) ·
`TrackOrder.jsx` (26) · `Info.jsx` (21) · `NotFound.jsx` (10)

---

## 2 · What already works in our favour

The port solved this exact problem once, for the homepage, and the seams it built are reusable.

**The catalogue boundary is already real.** `components/aarna/services/catalog.js` — imported by
`Product.jsx`, `Shop.jsx`, `Wishlist.jsx` — is backed by the **replaced** `mock/data/products.js`, which maps
the live backend catalogue into the design's product shape (price/compareAt from `price`/`originalPrice`,
images through the app's media resolver, `options` from real sizes with per-value availability, `featured`
from `isFeatured || isBestseller`, fabric/craft/description verbatim). Its whole surface —
`getProductBySlug`, `getProductsFor`, `getByIds`, `searchProducts`, `sortProducts`, `getRelated`,
`requiresOption` — already answers from real data, and returns **empty** rather than sample rows when the
backend is unreachable.

**The product primitives are already ported and already real.** `ProductCard`, `Price`, `OptionSelector`,
`WishlistButton` and `useAddToBag` all exist in the port; `useAddToBag` was rewired in Phase 4 so it never
claims a successful add that the cart refused (`add-to-bag-feedback`).

**The cart/wishlist adapter is already real.** `state/ShopContext.jsx` exposes exactly what the design's
un-ported pages consume — `lines[key,id,option,qty,product]`, `totals{subtotal,discount,total,count,promo,
priced}`, `wishlist[]`, `setQty`, `removeLine`, `applyPromo`, `removePromo`, `clearCart`, `toggleWish`,
`isWished` — all backed by this app's `CartContext` and `WishlistContext`.

**The path boundary already exists.** `router/routes.js` translates the design's URL vocabulary
(`/shop/sarees`, `/pages/our-story`, `/product/<slug>`) onto this app's registered routes, resolving live
taxonomy first and never guessing. A ported page's links therefore already land on real destinations.

**Consequence:** `Product.jsx`, `Shop.jsx` and `Wishlist.jsx` are *assembled almost entirely from pieces that
are already ported and already wired to real data*. Their migration is genuine adoption, not a rewrite.
`Checkout.jsx`, `Account.jsx`, `TrackOrder.jsx` and `Info.jsx` are a different kind of job — see §4.

---

## 3 · Remaining design page → the real functionality it must preserve

Sizes are the production side, in lines, because that is the functionality the design does not show.

| Design page | Production route(s) | Production implementation | Preserved behaviour that the design does **not** draw |
|---|---|---|---|
| **Product** (103) | `/product/:productId` | `ProductDetail` 250 + `ProductGallery` 441 + `ProductPurchasePanel` 512 + `ProductDetailsAccordion` 134 + `ProductRecommendations` 63 + `RecommendationSections` 27 = **1,779** | media gallery (thumbs/zoom), variant + colour + size selection, **stock ceilings and `increaseDisabled`**, availability states incl. sold-out and "Currently unavailable", real wishlist sync, recommendations from live data, taxonomy breadcrumbs, per-product SEO/document title, media fallback for missing images |
| **Shop** (75) | `/shop`, `/explore`, `/search`, `/category/:slug`, `/collections/:slug`, `/collections`, + 38 navigation-scope paths | `Shop` 163 + `Explore` 42 + `SearchResults` 126 + `CatalogueListing` 202 + `CategoryPage` 133 = **~790** | live taxonomy routing, pagination, server-backed search, filter state, URL-addressable state, loading/error/empty states per surface |
| **Checkout** (34) | `/cart`, `/checkout`, `/order-success` | `Cart` 227 + `Checkout` 153 + `components/checkout/*` 1,583 + `OrderSuccess` 306 = **~2,270** | the entire real flow: saved + guest addresses, delivery method, coupon apply/remove with server revalidation, COD vs online, **order-first → Razorpay → server-side HMAC verification**, idempotent attempts, `ProtectedRoute` gating with `returnTo`, server-authoritative totals, server-confirmed payment before the bag is cleared |
| **Account** (50) | `/account` + 12 sub-routes | 13 pages in `pages/account/` = **5,278** | profile, addresses (CRUD + default), orders list, order detail, **returns** (`OrderReturn` 648), **tracking** (`OrderTracking` 338), settings, security (password/sessions), preferences, **AI Mirror**, **AI Shopping Assistant**, **Instagram Rewards** |
| **Wishlist** (29) | `/wishlist`, `/account/wishlist` | `Wishlist` **286** | backend-synced wishlist for signed-in customers, local for guests, honest unavailable-product state, add-to-bag from the list |
| **TrackOrder** (26) | *no standalone route* — `/account/orders/:id/tracking` | `OrderTracking` **338** + `GET /orders/{id}/tracking` | real persisted status history + admin-recorded carrier/tracking number; the frontend prints no scans and no projected dates that were not recorded |
| **Info** (21) | `/about`, `/contact`, `/privacy`, `/terms` (+ manifest entries) | manifest-driven via `routeManifest` → `CategoryPage` / `CatalogueListing` | the real published policy/contact content, rendered from the app's own navigation manifest |
| **NotFound** (10) | `*` | `NotFound` **61** | the app's 404 surface |

---

## 4 · The design's non-home pages are prototype stubs — four must not be adopted as written

This is the single most important finding of the audit. Four design pages **contain no real functionality by
construction**, and their own copy says so. Adopting them verbatim would violate mandatory rules 5 and 7.

| Design page | What it actually does | Its own words | What we must do instead |
|---|---|---|---|
| **`Checkout.jsx`** | renders a static order-summary list from `useShop()` and **cannot place an order** | *"Payments are not connected in this prototype, so no order can be placed. Connect a payment gateway and order service in `src/services` to enable checkout."* — *"Delivery: Calculated with address"* | take the **presentation vocabulary only** (crumbs, `label`, `display` title, line rows, `totals` definition list, note styling) and apply it to the real multi-step checkout, which already exists and works |
| **`Account.jsx`** | a localStorage sign-in with client-side regex validation | *"Accounts are simulated in this prototype and stored only in your browser"* / *"Prototype — no server account is created."* | take the **header + tile grid vocabulary**, keep real JWT auth, RBAC and the 13 real account pages |
| **`TrackOrder.jsx`** | a form that always reports failure | *"This prototype isn't connected to an order system yet"* | take the **form and result styling**, wire to the real `GET /orders/{id}/tracking` |
| **`Info.jsx`** | renders `infoPages` mock copy | *"Placeholder policy — replace with the business's actual returns policy before launch."* / *"This prototype does not process real orders…"* | take the **article layout**, render the real manifest content |
| `Product.jsx`, `Shop.jsx`, `Wishlist.jsx` | bind to `services/catalog.js` and `ShopContext` | — | **already real** (§2): the port replaced the mock catalogue and the mock shop state underneath them |
| `NotFound.jsx` | a 404 with a Button | — | portable as-is |

**Rule 4 cuts the other way too.** These production capabilities have **no design counterpart at all** and
must be retained and given a UI in the same visual language rather than dropped: order returns, order
tracking, account security/settings/preferences, the three account extra features (AI Mirror, AI Shopping
Assistant, Instagram Rewards), all five auth screens, and the staff portals.

---

## 5 · Proposed phase plan

Ordered by **design completeness × functional risk** — the two pages whose data boundary is already real come
first, the money path comes after, the largest surface comes last.

| Phase | Scope | Design provides | Risk | Why here |
|---|---|---|---|---|
| **6 · Product detail** | `/product/:productId` | a complete PDP: crumbs, gallery, sticky info, price, description, option selector, quantity, add-to-bag, wishlist, three accordions, related rail | **low** | every component it imports is already ported and already wired to the live catalogue; the only new page-level decisions are how the production extras (stock ceiling, availability, gallery behaviour, SEO) appear in the design's layout |
| **7 · Shop / listing / search** | `/shop`, `/explore`, `/search`, `/category/:slug`, `/collections/:slug`, the 38 navigation-scope paths | crumbs, label, display title, result count, type chips, sort select, responsive grid, empty state | **low–med** | same already-real data boundary; work is pagination, filters, URL state and the loading/error/empty states the design does not show |
| **8 · Cart → Checkout → Order success** | `/cart`, `/checkout`, `/order-success` | **summary/totals vocabulary only** | **high** | the real flow must be re-skinned, not ported; touches payment, idempotency, auth gating and server-authoritative totals. Phase 5 just audited and fixed this contract — do it here, carefully |
| **9 · Wishlist · Info pages · NotFound** | `/wishlist`, `/about`, `/contact`, `/privacy`, `/terms`, `*` | wishlist grid + empty state; article layout; 404 | **low** | small, self-contained; Info maps the design's layout onto real manifest content |
| **10 · Account** | `/account` × 13 | header + a three-tile grid | **high, large** | 5,278 lines, and most of it (returns, tracking, AI features) has no design counterpart — rule 4 applies page by page |
| **— · Staff portals** | 201 routes · 81 page files · **26,346 lines** | **nothing** | — | the design covers no staff surface at all; see §7, question 2 |

Every phase keeps its existing gates (frontend suites, `npm test`, `npm run build`,
`audit:frontend-catalog`, `aarna-port --check`, `git diff --check`) plus a per-phase regression suite for the
functionality it re-skins.

---

## 6 · Rules this audit commits the migration to

Carried directly from the directive, made concrete for this codebase:

1. **Never hand-edit a ported (CLOSURE) file.** Port changes are named `REWRITES`; a new rewrite on a pinned
   file requires a pin bump, and `--copy` prints `FAIL <n>` on a mismatch.
2. **Never let a design component talk to mock data.** If a design page needs a capability, it gets an app
   adapter (`REPLACED`) or is not ported.
3. **Never fabricate a state to match a mockup** — no local order, no simulated sign-in, no "order not found"
   that is really "no backend", no invented badge, rating, stock or delivery date. The port already holds this
   line in five places (§1, §4).
4. **Retain every route, permission, validation and workflow** the design does not draw (§3, §4).
5. **Do not touch backend behaviour, API contracts, schemas, auth, payments or business rules** for visual
   convenience.
6. **Missing or failed images must never break layout** — `utils/mediaFallback.js` is the established seam.
7. **`home-page/` stays read-only**; it is the visual source of truth, never an edit target.

---

## 7 · Decisions — approved

Approved before Phase 6 began:

1. **First phase: Phase 6 — product detail.** A complete design surface over an already-real data boundary.
2. **Staff portals: in scope, but last.** The storefront migrates first; the portals (201 routes, 81 page
   files, ~26,346 lines) are re-skinned afterwards against the same visual system, and — since the design
   covers no staff surface — that phase needs its own design input rather than an invented one.
3. **Exposure: extend the `?home=aarna` switch.** The switch will render not only the homepage but the
   migrated pages as well, so the new design becomes a complete, testable storefront while the production
   default (Atelier) and the deployment env vars stay exactly as they are. Re-skinning the production routes
   in place remains explicitly **not** authorised.

---

## 8 · Limitations of this audit

* Read-only and static. Nothing was rendered, so this document makes **no visual claim** about any un-ported
  page; the design's own source is the reference.
* Line counts are a proxy for surface area, not a difficulty estimate.
* The design corpus was checked by walking `home-page/src` (excluding `mock/assets`) and diffing against the
  port's `CLOSURE`/`REPLACED`/`ADDED` lists — a file present in all three is accounted for; anything else
  would have been reported.
* Phase 5's findings still stand and are not repeated here: a live PostgreSQL and the Razorpay network API
  remain unavailable in this environment, so no phase below can claim a real end-to-end payment.
