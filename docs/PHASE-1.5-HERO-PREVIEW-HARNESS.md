# Phase 1.5 — Editorial hero preview harness

**Status:** complete, awaiting review. **No Phase 2 work was started.** No commit was made
(branch `arena/649fd845-pfv1`, HEAD `10890db`, working tree preserved).

## 1. Live preview

| | |
|---|---|
| **URL** | **https://5173-idzjznx3prddkmwldi6wh.e2b.app/** (Phase 1.6: the preview server now serves the harness at its root, which is what a live-preview panel opens) |
| **Startup command** | `cd frontend && npx vite --config vite.preview.config.js --host 0.0.0.0 --port 5173` |
| **Dev server** | Vite v7.3.2, listening on `0.0.0.0:5173`, no warnings |

`npm run dev` and `npm run build` are **not** changed — they still use `vite.config.js` exactly
as before. The preview config only adds a serve-only middleware (see §3).

HTTP checks against the running server (from inside the sandbox):

| Request | Result |
|---|---|
| `/preview.html` | `200 text/html` |
| `/` (the real application) | `200 text/html`, `<title>PRATIKSHYA FASHION — The Art of Textile…</title>` |
| `/src/App.jsx` | `200` and still mounts `AtelierDesign` |
| `/src/components/storefront/preview/main.jsx` | `200 text/javascript` |
| `/src/components/storefront/home/HeroEditorial.jsx` | `200 text/javascript` (64.8 kB transformed) |
| `/src/index.css` | `200` (Tailwind theme + Phase 1 tokens, 209.9 kB transformed) |
| `/api/v1/media/objects/hero/hero001.avif` | `200 image/avif`, 46 002 B |
| `/__preview-assets/hero-jewellery-tall.webp` | `200 image/webp`, 109 522 B |

I could not open a browser myself, so **no visual judgement is claimed here** — the numbers and
status codes above are what I verified. The page is live in the platform preview for you to look at.

> **Phase 1.6 update:** the preview panel opens the dev server **root**, which initially served the
> production `index.html` (the old hero). The preview config now maps `/` → the harness; the rest of
> this section is otherwise unchanged. See `docs/PHASE-1.6-PREVIEW-ROOT-CAUSE-FIX.md`.

## 2. Files created (all under `frontend/`, all untracked)

| Path | Purpose |
|---|---|
| `preview.html` | Dev-only entry document (`noindex`). Not a build input, not linked from the app. |
| `preview/` (`vite-preview-server.mjs`, renamed in Phase 1.6 from `vite-preview-media-assets.mjs`) | Serve-only middleware: maps the server root to the harness, plus canonical media URLs and `home-page/` design assets. Used only by `vite.preview.config.js`. |
| `vite.preview.config.js` | `vite.config.js` + that one middleware. Nothing else changes. |
| `src/components/storefront/preview/HeroPreview.jsx` | The harness: renders the real `HeroEditorial` plus preview-only chrome. |
| `src/components/storefront/preview/main.jsx` | Mounts the harness with the app's own `index.css` and a `MemoryRouter`. |
| `src/components/storefront/preview/previewFixtures.js` | The clearly labelled preview-only slide data. |
| `src/components/storefront/preview/__tests__/previewHarness.test.js` | 10 tests pinning isolation + data honesty. |

**Modified (Phase 1 code, no new files removed):**

| Path | Change |
|---|---|
| `src/components/storefront/home/HeroEditorial.jsx` | Correctness fix — see §7. |
| `src/components/storefront/home/heroModel.js` | New `heroSlideKey` export (+ barrel entry) backing that fix. |
| `…/home/__tests__/heroModel.test.js` | +1 test for `heroSlideKey`, +1 source-contract test for the new dependency key (29 tests). |
| `…/home/__tests__/heroEditorialRender.test.js` | One line: the "nothing mounts the hero" scan now excludes the dev-only preview directory, with a comment explaining why. |
| `docs/PHASE-1.5-HERO-PREVIEW-HARNESS.md` | This report. |

Nothing else was touched: no manifest or lockfile, no `.env`, no `vite.config.js`, no
`src/App.jsx`, no `index.html`, no `AtelierDesign.jsx`, no `HeroCarousel.jsx`, no backend file,
no asset (nothing was added, renamed or deleted in either application).

## 3. Real backend data versus fixtures

The harness is wired to the **production data path** and prefers it:

```jsx
const heroMedia  = useMarketingMedia(MARKETING_PLACEMENTS.HOME_HERO); // same as AtelierDesign.jsx:30
const liveSlides = Array.from(heroSlides);                            // src/data/catalog/hero.js
useEffect(() => { if (getCatalogState().status === "idle") hydrateCatalog(); }, []);
```

`liveSlides` is the exact array `AtelierDesign.jsx:39` passes to `HeroCarousel`;
`heroMedia` is the exact value it passes as the second prop. No second API client, no new
endpoint, no direct `fetch`, no mock repository.

**In this sandbox there is no Postgres**, so `hydrateCatalog()` ends in `error`/`partial`
(`app/main.py`'s lifespan migration guard aborts the API), and no `/home` slides exist. The
harness therefore falls back to `previewFixtures.js`, and it says so, in words, in a badge above
the hero:

> **Preview fixture — canonical hero content + home-page campaign copy. NOT live backend data.**

Provenance of every fixture value (documented in the file itself):

* `title`, `body`, `cta`, `mediaId`, `image` — this project's **own canonical hero content**, i.e.
  exactly what `GET /home` returns from the backend's canonical fallback when no home-hero row is
  curated. Plates are addressed by their canonical **object keys** through the app's single media
  seam (`mediaObjectUrl("hero/hero001.avif")`); the file contains **no** authored asset path and no
  legacy public-image prefix.
* `eyebrow` — the campaign kickers from the approved `home-page/` design (the live contract defaults
  `eyebrow` to `""`).
* `mobileImage` on slide 4 — the approved `home-page/` portrait plate, served through the
  preview-only `/__preview-assets/…` namespace by the dev-only middleware (a read-only static file
  handler over `home-page/public/images/` and `public/images/`; no writes, no uploads).

Switching:

* **Auto (backend first)** — default: live slides when the API returns any, fixtures otherwise.
* **Backend only** — the mode to use the moment a real API is reachable; with no backend it shows
  the honest empty state (hero renders nothing) plus the catalogue error text.
* **Preview fixture** — force the labelled fixtures.

The dev middleware also serves `/api/v1/media/objects/<key>` from the approved local asset library
when the bytes exist locally (`public/images/hero/hero001–005.avif`), which is why the fixture plates
load at all; anything else falls through to the ordinary `/api` → `localhost:8000` proxy.

## 4. Reviewing the five layouts and breakpoints

All controls live **outside** the hero, in the harness chrome; the hero itself still has exactly one
action per slide and no counter, progress bar, pause button or arrow UI (asserted by test).

* **Layouts** — the `Layout` group shows `Production order`, `left`, `panel`, `right`, `split`,
  `top`. Each button rotates the list so that slide becomes the *active* one, which is the slide the
  layout applies to. `left` = slide 1, `panel` = slide 2 (light panel treatment), `right` = slide 3,
  `split` = slide 4 (portrait art direction), `top` = slide 5.
  Direct links: `?active=0|1|2|3|4` (`?active=0` = untouched production order) — they work on both
  `/` and `/preview.html`, since the root is rewritten with its query string intact.
  The untouched application is still served beside the harness at `/app` and `/index.html`.
* **All five at once** — the `View → All five layouts` button stacks one hero per layout, each
  labelled with its layout name and slide title (a fast side-by-side scroll-through).
* **Breakpoints** — the `Viewport` group (`Responsive width`, `Desktop 1280`, `Tablet 834`,
  `Mobile 390`) renders the hero inside a **real iframe** of that size, so media queries, container
  queries and `svh` units resolve against a genuine viewport — not a scaled-down screenshot.
  `Responsive width` renders it full-bleed in the page so you can drag the browser window instead.
* **Portrait / tall art direction** — slide 4 (`split`) carries `mobileImage`; narrow or
  portrait/square frames swap to the tall plate. Compare `Mobile 390` against `Desktop 1280`.
* **Keyboard** — click inside the hero, then `←` / `→`.
* **Touch** — swipe horizontally (48 px threshold, and the gesture must beat vertical drift by
  ×1.3). Use the `Mobile 390` frame in device-emulation mode.
* **Reduced motion** — emulate `prefers-reduced-motion: reduce` in devtools (or the OS setting): the
  status badge flips to `reduce`, autoplay stops and the spatial reveals settle instantly.
* **Autoplay / pause semantics** — advances every 7 s; pauses on hover, on keyboard focus, while the
  hero is out of view, and while the tab is hidden. The status row also live-reports viewport size
  and `catalogue: ready|partial|error`.

## 5. Verification

| Gate | Result |
|---|---|
| Harness suites (`node --import ./scripts/node-loader/register.mjs --test "src/**/__tests__/*.test.js"`) | **72 / 72 pass, 0 fail** — 16 hero-render + 29 hero-model + 10 preview + 17 design-system |
| `npm run build` | **EXIT 0** — `dist/index.html` 3,407.88 kB / gzip 1,312.07 kB; **0** references to `preview.html`, `__preview-assets`, `previewFixtures`, `vite.preview` in the bundle |
| Bare `npm test` | 434 tests / **412 pass / 21 fail / 1 skip** — the exact Phase 1 / post-install failure set (3 stale RBAC files + environment-only failures), unchanged |
| `npm run audit:*` (16 scripts) | 15 EXIT 0. `audit:employee-management` EXIT 1 with the single known pre-existing assertion `SUPER_ADMIN can access employee management = FAIL` — identical to the Phase 0/Phase 1 baseline |
| `npm run qa:*` (4 scripts) | 4 EXIT 0, `0 violation(s)` |
| `tests/phase6LocalMediaFlow.test.js` | 7 pass / 1 fail / 1 skip — the failure reads `../pratikshya-backend/app/config.py`, a path that does not exist in this checkout (pre-existing layout mismatch, unrelated to this work); the "no module depends on public/images" and "approved literals only" assertions pass |
| `git diff --check` | EXIT 0 (no whitespace errors) |
| `git diff --stat` | 5 files, 232 insertions, 0 deletions — **unchanged by Phase 1.5** (all five were last written during Phase 1 close-out) |

## 6. Production surfaces untouched

* `src/App.jsx` — byte-identical (not in `git status`). The index route is still `<AtelierDesign />`
  and the catch-all is still `<NotFound />`; the harness is **not** in the route table.
* `AtelierDesign.jsx`, `HeroCarousel.jsx`, all portals, Auth/RBAC/route guards, the API clients, the
  cart/checkout/order flows, the backend and the database — not modified (nothing under `backend/`,
  `src/pages/`, `src/services/api/`, `package.json` or `package-lock.json` appears in `git status`).
* Production builds cannot reach the harness three ways over: it is a separate HTML entry that
  `npm run build` never reads, `vite.config.js` never references it, and `HeroPreview` returns `null`
  unless `import.meta.env.DEV`.
* The harness adds no Tailwind class and no global CSS (all chrome is inline; `styles.css`-free), so
  it cannot shift Admin/Employee styling.
* Removal is a delete: `preview.html`, `vite.preview.config.js`, `preview/`,
  `src/components/storefront/preview/`. The only Phase-1 change made for it is the one-line
  exclusion in a Phase 1 test (revertable, and harmless to leave).

## 7. Fixes, limitations and blockers

**Correctness fix carried into Phase 1 code (disclosed because it changes hero behaviour).**
`slides` arrives as `heroSlides`, a live proxy whose identity never changes as the backend response
lands. `HeroEditorial` memoised `normalizeHeroSlides(slides, heroMedia)` on `[slides, heroMedia]`, so
the first (empty) model was pinned and the hero would have stayed blank after hydration. It now
memoises on a content signature, `heroSlideKey(slideItems)` (`{id}:{image||mobileImage}` per slide),
exactly the approach the existing `HeroCarousel` already uses (`HeroCarousel.jsx` slideKey).
Verified by `heroModel.test.js` (72/72) and by the build.

**Real-media verification is impossible here.** No Postgres ⇒ the API cannot start ⇒ no `/home`, no
`/marketing/hero` payload and no `backend/storage/media/` bytes. The harness proves the *contract*
end-to-end (object key → `mediaObjectUrl` → `/api/v1/media/objects/…` → bytes), and the fixture
badge states plainly that what you are looking at is not backend data. When a database-backed
backend is available, switch the Data group to **Backend only** and the same harness renders the five
real slides in production order.

**Other open items (unchanged from Phase 1, none blocking this review):**

* Manrope is still not loaded by `frontend/index.html` (only Cormorant Garamond, Instrument Sans,
  Playfair Display) — fixing it needs an `index.html` edit or a font dependency, both out of scope.
* The backend hero contract has no `eyebrow` / `lines` / `layout` / `tone` fields, so headline
  breaking and the italic accent line are derived client-side.
* Untested in a browser by me: the harness's own chrome (button switching, iframe frames). The hero
  render path is covered by SSR tests; I did not open a browser, so please eyeball it in the live
  preview.
* Bare `npm test` cannot see `src/**/__tests__/**` (that glob lives in `tests/`, which
  `frontend/.gitignore:23` ignores) — unchanged policy, not touched by this phase.

**Stopping here** — awaiting review and approval before any Phase 2 work (no other homepage section
was migrated, and the live homepage is still the original `AtelierDesign`).
