# Phase 2C — controlled storefront integration

**Status:** implemented behind a switch that is **OFF by default**, tested, and reversible to
`AtelierDesign` in one step. **The new homepage has NOT been enabled by default, nothing was
committed or pushed, and no later phase was started.** Awaiting review and approval.

Branch `arena/649fd845-pfv1`, HEAD `10890db` (unchanged — no commit was made).

---

## 1. Preview health gate (before any integration work)

The sandbox was recycled between sessions, so this gate began by restoring the dependency-ready
baseline: `frontend/node_modules/` (gitignored, snapshot-excluded) and `frontend/dist/` were gone,
and the first `npx vite` attempt tried to fetch an unrelated `vite@8.3.4` (it failed, and installed
nothing into the project). **`npm ci`** restored the lockfile's exact tree — `vite 7.3.2`,
`react 19.2.6`, 96 packages, `package.json` and `package-lock.json` untouched (`git status` clean
for both). No manifest, lockfile or dependency was changed.

| Check | Result |
| --- | --- |
| Server identity | `node …/frontend/node_modules/.bin/vite --config vite.preview.config.js --host 0.0.0.0 --port 5173`, cwd `/home/user/pfv1/frontend` — the intended repository, the intended config |
| `GET /` | 200 `text/html`, harness document (`#preview-root`, no `#root`, `noindex`), entry `/src/components/storefront/preview/main.jsx` |
| `GET /?view=hero` · `/?view=shell` · `/?view=home&data=fixture` | 200 each, harness document, same entry |
| `GET /app` | 200, the **application** document (`#root`, `/src/main.jsx`, no `preview-root`) |
| Dependency URLs (`/node_modules/.vite/deps/*.js?v=…`) | 4/4 → **200** (the class that blanked the page in the previous session) |
| Self-heal guard in the served document | present (the `504 Outdated Optimize Dep` diagnosis text is in the served HTML) |
| Browser console | **not inspectable — see §8.** No white screen, stale-dependency error, missing module or runtime exception is *observable* by any executable means available here: documents 200, entry 200, every dependency URL 200, and server-side renders of the real components throw nothing. |

**Distinguishing the four kinds of "success":** HTTP success (above) is not rendering; SSR success
(§6, §7) is not browser rendering; test success (§5) is not either. §7 contains **executed
production-build render evidence**; §8 states exactly what remains unverified.

---

## 2. Integration architecture

```
App.jsx (UNCHANGED: index → <AtelierDesign />, catch-all → <NotFound />)
  └─ CustomerLayout.jsx            ← the ONE production file changed (58+/14−)
       ├─ switch: config/storefrontHome.js → useEditorialHome()
       ├─ OFF (default): existing SiteHeader + <Outlet/> (AtelierDesign) + SiteFooter   ← unchanged behaviour
       └─ ON  (explicit only): <StorefrontHome/> + SiteFooter
                                  ├─ shell/AnnouncementBar        (2A, live PROMOTION placement)
                                  ├─ shell/StorefrontHeader       (2A, canonical taxonomy nav)
                                  ├─ home/HeroEditorial           (Phase 1, live heroSlides + HOME_HERO media)
                                  └─ home-sections/HomeSections   (2B, the ten sections in approved order)
```

`StorefrontHome` is mounted by exactly one module (`CustomerLayout`) and renders at most once (root
path only) — both asserted by test. It creates no provider, no context, no drawer and no data
client; it reads the same seams `AtelierDesign` reads.

### The switch — `src/config/storefrontHome.js`

| Request | How | Where it works |
| --- | --- | --- |
| **Default** | nothing set | every environment ⇒ **`atelier`** (the existing homepage) |
| Local review | `?home=editorial` on the URL | **development builds only** (`import.meta.env.DEV` is false in a build, so a customer editing the URL can never move the homepage — asserted) |
| Deploy decision | `VITE_STOREFRONT_HOME=editorial` at build time | dev and deployed builds |
| Rollback | `?home=atelier` (review) or omit/replace the variable and rebuild (deploy) | always |

Anything unrecognised (`?home=`, `?home=next`, `?home=EDITORIAL`, `?other=editorial`, a typo, an
empty value, a malformed query string) resolves to `atelier`. There is no input that leaves the
storefront without a homepage.

**Proof that the shipped build is OFF:** the production bundle inlines Vite's env object, and the
delivered `dist/index.html` contains
`{BASE_URL:"./",DEV:!1,MODE:"production",PROD:!0,SSR:!1}` — `DEV:false` and **no**
`VITE_STOREFRONT_HOME` key, so `env[STOREFRONT_HOME_VAR]` is `undefined` and the resolver returns
`atelier`. Rebuilding with `VITE_STOREFRONT_HOME=editorial` produced
`{…,VITE_STOREFRONT_HOME:"editorial"}` — the enable path, demonstrated end to end (§7).

Not lazy-loaded on purpose: this project's build uses `vite-plugin-singlefile`, so every chunk is
inlined into one document — code-splitting would change nothing about what ships.

---

## 3. Files changed, and why

| File | Change | Why |
| --- | --- | --- |
| `frontend/src/config/storefrontHome.js` | **New** (112 lines) | The switch: pure `resolveStorefrontHome({dev, envValue, search})`, the `useEditorialHome()` boundary hook, and the documented policy. |
| `frontend/src/components/storefront/StorefrontHome.jsx` | **New** (93 lines) | The composition: 2A shell + Phase 1 hero + 2B sections on the application's own data seams. No fixture, no provider, no commerce state. |
| `frontend/src/layouts/CustomerLayout.jsx` | **Modified** (58+/14−) | The narrowest boundary that resolves the three conflicts in §4 and the only place the composition is mounted. Functional change is three conditionals; the rest is the rationale. |
| `frontend/src/components/storefront/__tests__/homeIntegration.test.js` | **New** (15 tests) | §5. |
| `frontend/src/components/storefront/home/__tests__/heroEditorialRender.test.js` | **Modified** (1 test) | Its Phase 1 boundary assertion ("nothing but the preview harness imports the hero") is the exact boundary Phase 2C changes. The assertion now lists the two permitted importers and the reason; the new suite pins the stronger rule (composition mounted only by `CustomerLayout`, behind an off-by-default switch, hero not in `App.jsx`). No assertion was weakened or deleted. |
| `docs/PHASE-2C-CONTROLLED-HOMEPAGE-INTEGRATION.md` | **New** | This report. |

`git status`: the tracked production diff is still the five Phase 1 design-token files (232
insertions) **plus `layouts/CustomerLayout.jsx`** — the single production file this phase touches.
`App.jsx`, `AtelierDesign.jsx`, `HeroCarousel.jsx`, the 2A shell, the Phase 1 hero, the 2B sections,
`vite.config.js`, `index.html`, the manifests and everything under `backend/` are untouched.

---

## 4. Existing layout conflicts, and how they were resolved

The 2A shell was approved with three integration notes; all three are resolved at the layout
boundary, for the root route only:

| Conflict | Resolution | Evidence |
| --- | --- | --- |
| **Duplicate header** — `CustomerLayout` mounts the existing fixed `SiteHeader`, and the composition brings the 2A sticky header | The existing header (and `CheckoutHeader`) is simply not rendered for the one enabled route | Render on: one `data-storefront-header`, zero `fixed top-0 left-0 right-0 z-50` |
| **Top padding** — every customer route is pushed down by `pt-16 md:pt-20` for a header that is fixed | Padding is dropped only where the header it offsets is absent | Render on: zero `pt-16 md:pt-20`; render off: exactly one (unchanged) |
| **Blush canvas** — the shell expects the campaign canvas | The layout root takes `pf-shell__surface` (blush + espresso text) **for that route only** — not `body`, so no portal and no other customer route is repainted; the composition keeps the same class so it stays self-contained | Render on: `pf-shell__surface` present; off: absent |
| **Sticky header vs. route transition** — `PageTransition` animates `y` (a transform), and a transformed ancestor becomes the containing block for `position: sticky`, which would break the 2A header and its absolutely positioned mega panel | The composition is rendered **outside** `PageTransition` (the approved hero plays its own entrance reveal); every other route keeps its transition unchanged | Source-wired, and the layout diff is 3 conditionals |
| **Footer** — the approved design has none yet (2A migrated no footer) | The existing `SiteFooter` keeps rendering below the composition, exactly once | Render on and off: one `<footer>` |

Nothing was removed globally: with the switch off, every class, offset, header and background of the
customer layout is byte-for-byte the previous behaviour, and all other customer routes (product,
category, collection, cart, checkout, account, auth, search, explore, not-found) render through
exactly the path they did before.

---

## 5. Tests

New suite: `src/components/storefront/__tests__/homeIntegration.test.js` — **15/15 pass**, run with
`node --import ./scripts/node-loader/register.mjs --test "src/components/storefront/__tests__/homeIntegration.test.js"`.

It executes the real modules (Vite SSR) and asserts:

1. the switch is **off** by default in every combination that is not an explicit request (including
   `?home=`, wrong case, absent value, malformed query);
2. it enables only through the two documented paths, and the escape hatch wins over the variable;
3. the live resolver reads the browser URL **through the development gate only**;
4. the composition is mounted at the customer root only, by the customer layout alone (import scan
   over all of `src`, resolving relative specifiers);
5. `AtelierDesign` remains the fallback and the rollback, with `App.jsx` unchanged;
6. the root renders the routed page when nothing is asked for (a real mounted probe);
7. the integrated page renders one header, at most one announcement rail, and the approved order;
8. no fixture data, sample badge or preview chrome — including the two harness seam-markers inside
   reviewed components (`data-announcement-source`, the offer sample badge) being unreachable, and
   `isSample: true` existing only in the preview fixtures;
9. every link is a route the application registers (paths parsed from `App.jsx` + `routeManifest`),
   product links are `/product/{id}`, and no preview/legacy asset path leaks;
10. the existing cart/wishlist contexts are used, and no second commerce state is created;
11. an empty/unavailable backend renders honestly: one header, five nav groups, **no hero, no
    image-led section, no catalogue image, one `<img>` which is the brand mark**, no newsletter;
12. `App.jsx`, the portal layouts, the guards and the commerce routes are untouched, and the 2A
    shell is reachable only from the composition and the dev-only preview;
13. the **layout itself**, rendered with the switch off, shows the existing homepage and its shell;
14. the **layout itself**, rendered with `?home=editorial`, shows the integrated homepage once, over
    the same footer, with no duplicate header and no offset;
15. the switch is the only difference between those two renders.

---

## 6. Verification — tests, build, audits

| Gate | Result | Baseline comparison |
| --- | --- | --- |
| All `src/**/__tests__/*.test.js` (node loader) | **138 / 138 pass, 0 fail** | 123 before 2C; +15 new, none removed |
| `storefrontShell.test.js` (2A) | 17/17 | unchanged |
| `homeSectionsRender.test.js` (2B) | 31/31 | unchanged |
| `heroEditorialRender.test.js` (Phase 1) | 16/16 | 1 boundary assertion updated (§3) |
| `previewHarness.test.js` (1.5/2B.1) | 13/13 | unchanged |
| Bare `npm test` (legacy `tests/*.test.js`) | **434 tests · 412 pass · 21 fail · 1 skipped** | **byte-identical to the recorded baseline** — no new failure |
| `tests/brandLockup.test.js` | 5/5 | unchanged |
| `tests/phase6LocalMediaFlow.test.js` | 7 pass / 1 fail / 1 skip | the known pre-existing failure (reads an absent sibling checkout) |
| `npm run build` | **EXIT 0** — 2,714 modules, `dist/index.html` **3,511.37 kB** (gzip **1,336.29 kB**) | 2B build: 3,407.91 kB (gzip 1,312.07) — **+103.46 kB raw / +24.22 kB gzip**, entirely the integrated 2A/1/2B graph now being reachable from `index.html` |
| `npm run audit:*` / `qa:*` (20 scripts) | **19 EXIT 0**; `audit:employee-management` EXIT 1 with the single known pre-existing assertion `SUPER_ADMIN can access employee management = FAIL` | identical to the Phase 1/2A/2B baseline |
| `audit-product-performance` | EXIT 0 (PASS lines, media cache smoke check PASS) | unchanged |
| `git diff --check` | EXIT 0 | — |
| Dev-server HTTP | `/` (harness), `/?view=hero|shell|home&data=fixture`, `/app` → 200; every dependency URL 200; `5174/` and every customer route → 200 application document | — |

### What is in the built bundle, and what is not

| Must NOT be in the customer bundle | Count in `dist/index.html` |
| --- | --- |
| `preview-root`, `previewFixtures`, `__preview-assets`, `vite.preview` | 0 / 0 / 0 / 0 |
| `PREVIEW_FIXTURE_SECTIONS`, `previewSectionFixtures`, `PREVIEW_FIXTURE_LABEL` | 0 / 0 / 0 |
| `Preview fixture`, `NOT live backend data` (harness badges) | 0 / 0 |
| `data-home-surface="preview-fixture"` (production markup) | 0 (the composition renders `"live"`) |

The only two harness `fixture` strings left in reviewed components are **gated seam-markers**, and
their unreachability is now asserted by test: `AnnouncementBar`'s `data-announcement-source` falls
back to `live.status` unless the caller passes harness `items` (the composition passes none), and
`SectionOffer`'s "Sample offer" renders only when `isSample` is true — set in exactly one place in
the repository, `preview/previewSectionFixtures.js`.

**CSS integrity:** the inlined stylesheet (188,870 bytes) has **0** selectors that escape the
`.pf-*` namespaces, **0** bare/global selectors joined to campaign rules, **0** `:root` rules and no
`@import`; the 58 `p`/`a`/`h2` descendants are scoped inside a `.pf-*` class (e.g.
`.pf-shell__announce-track p`). Admin, Super-Admin, Employee, auth and the other customer routes
cannot be reached from that CSS.

---

## 7. Rendering evidence — executed, not inferred

Server-side rendering is not browser rendering, but these runs execute the **real** components and
the **real** switch. Two layers:

**A. Development render of the layout through the real route table** (index route = `AtelierDesign`,
exactly as `App.jsx` registers it):

| Marker | Switch off | `?home=editorial` |
| --- | ---: | ---: |
| existing header `fixed top-0 left-0 right-0 z-50` | 1 | **0** |
| existing offset `pt-16 md:pt-20` | 1 | **0** |
| 2A header `data-storefront-header` | **0** | **1** |
| campaign canvas `pf-shell__surface` | 0 | 2 (layout root + composition) |
| 2B `pf-sec-host` | **0** | **1** |
| `<footer>` | 1 | 1 |
| height | 24,408 chars | 13,022 chars (short page: no backend ⇒ no image-led sections) |

**B. Production-build render (the decisive one).** A temporary SSR entry was built with
`vite build --ssr` — a real production build, `DEV:false` — and then executed with
`react-dom/server`. The entry and its output directory were deleted afterwards; no scratch file,
config or manifest change remains.

| Marker | Default build (the delivered one) | Build with `VITE_STOREFRONT_HOME=editorial` |
| --- | ---: | ---: |
| existing header / offset | **1 / 1** | 0 / 0 |
| 2A header `data-storefront-header` | **0** | **1** |
| campaign canvas / 2B sections (`pf-sec-host`) | 0 / 0 | 2 / 1 |
| preview artefact (`preview-root`) | 0 | 0 |
| `<footer>` | 1 | 1 |

**Conclusion, stated plainly: the shipped configuration renders the existing homepage; only an
explicit flag renders the integrated one; and the rollback is the same switch.**

---

## 8. Browser verification — status and limitations

**No browser exists in this environment** (no Chromium/Chrome/Firefox; no Playwright, Puppeteer,
jsdom, happy-dom or linkedom in `node_modules`; installing one is outside this phase's rules, and
`npx playwright` cannot install here). Therefore:

* I did **not** open the page, and I make **no visual claim** — not for layout, overflow, sticky
  behaviour, the mega menu, the mobile drawer, the hero's animation, or the desktop/tablet/mobile
  breakpoints at 1280 / 834 / 390.
* I could not read the browser console. What replaces it: documents and every module 200, the entry
  executes its graph on a fresh load, SSR of every real surface throws nothing, and the earlier
  blank-page failure class (stale dependency hashes) is now both prevented and self-healing.
* Everything in §5–§7 is executable evidence; §9 is written for a human to confirm visually.

---

## 9. How to review — enable, compare, roll back

Two servers are running in this sandbox:

| URL | What it is |
| --- | --- |
| **https://5174-idzjznx3prddkmwldi6wh.e2b.app/** | **The real application** (`npm run dev`, `vite.config.js`, no preview middleware) — the honest review surface, at the real root path |
| https://5173-idzjznx3prddkmwldi6wh.e2b.app/ | The Phase 1.5/2A/2B preview harness (unchanged): `/`, `/?view=hero`, `/?view=shell`, `/?view=home&data=fixture`, `/app` |

**Compare, side by side (development only):**

| To see | Open |
| --- | --- |
| The **existing** homepage (the default, exactly as customers have it) | `https://5174-idzjznx3prddkmwldi6wh.e2b.app/` |
| The **integrated** homepage (2A shell + Phase 1 hero + 2B sections) | `https://5174-idzjznx3prddkmwldi6wh.e2b.app/?home=editorial` |
| Back to the existing homepage | `…/?home=atelier` (or drop the parameter) |
| Any other customer route (unchanged either way) | `/women`, `/product/:id`, `/cart`, `/signin`, `/account` — the switch only ever affects `/` |


**Local commands**

```bash
# review (dev): the switch is a URL parameter on the root path only
cd frontend && npm run dev                 # http://localhost:5173/                 → AtelierDesign
                                           # http://localhost:5173/?home=editorial  → integrated homepage
# (in this sandbox the harness already holds 5173, so the review server runs on 5174:
#  npm run dev -- --port 5174)

# deploy decision: enable for real, per build
cd frontend && VITE_STOREFRONT_HOME=editorial npm run build

# rollback: rebuild without it (or with VITE_STOREFRONT_HOME=atelier)
cd frontend && npm run build
```

**What to look at while reviewing the integrated page** (the items only a human can judge): the
sticky header at the top, the mega menu columns and the Collections group, the mobile drawer at a
390px frame, the announcement rail (it only appears when the Admin Portal has an active PROMOTION
placement — with no backend it correctly renders nothing), the hero's five layouts, and the
sections' spacing at 1280 / 834 / 390. With no backend reachable, the page is deliberately short:
shell + the copy-led sections, no invented products, prices or imagery.

---

## 10. Canonical data and commerce behaviour preserved

* **One data path.** `StorefrontHome` reads `heroSlides` (`GET /home` proxy), the HOME_HERO
  marketing register (`useMarketingMedia`), the catalogue store (`useCatalog`, so sections update
  when the snapshot lands) and the existing cart/wishlist contexts — the same seams `AtelierDesign`
  uses. Every 2B section keeps reading the services it already read (taxonomy repository, covers,
  offer repository, `selectNewArrivalProducts`, `productHref`).
* **No second anything.** The composition creates no provider, context, router, catalogue, cart,
  wishlist, pricing path, API client or `fetch`; it imports exactly two contexts (`CartContext`,
  `WishlistContext`) — both the app's own — and nothing else from `src/context/`. Asserted.
* **Commerce untouched.** Cart drawer, wishlist, checkout, payments, orders, inventory, auth, RBAC
  and the portals were not modified; verified by diff, by the 20 audit/QA scripts and by the 138
  `src` tests.
* **Empty is honest.** No hero without slides; image-led sections render nothing when their plates
  cannot resolve; the rail prints the catalogue's own deterministic note; no fallback product,
  price, headline or campaign is authored in production code.
* **Fixtures stay in the harness** (§6) and no fixture module is reachable from the customer graph.

## 11. Missing capabilities recorded (not implemented, per scope)

1. **Newsletter (source section 11)** — still no subscribe endpoint, service or contract. No form is
   rendered, no address is discarded, no API was invented. Needs a separate, approved backend phase.
2. **Service/trust strip (source section 12)** — still no managed content source for service copy,
   and `/about`, `/contact`, `/privacy`, `/terms` are not routed in `App.jsx`. The strip stays
   data-driven and renders nothing in production.
3. **Footer** — 2A migrated none, so the existing `SiteFooter` renders below the composition. A
   storefront footer that matches the approved direction is a later phase.
4. Pre-existing contract gaps unchanged: no `eyebrow`/`lines`/`layout` per hero slide, no
   sales-ranking signal, no managed section headings.

## 12. Boundary confirmation

* The produced homepage is **not** switched on by default: verified in the built bundle (§2), by
  executed renders (§7) and by tests (§5).
* `AtelierDesign` is untouched and still the index route in `App.jsx` — the integration is a
  layout-level, switch-driven replacement, not a deletion and not a route edit.
* No commit, no push, no branch reset, no file/image deleted, renamed or moved.
* No dependency installed or upgraded (only `npm ci` from the existing lockfile), no manifest or
  lockfile change, no `vite.config.js`, `index.html`, `.env` or backend/DB change.
* No production fixture data, badge or preview control crosses into the customer experience.
* No Phase 2D or later work was started.

**Stopping here for your review.** Recommended before any default switch: a human pass over
`https://5174-…e2b.app/?home=editorial` at desktop / tablet / mobile, and a decision on the four
missing capabilities in §11.
