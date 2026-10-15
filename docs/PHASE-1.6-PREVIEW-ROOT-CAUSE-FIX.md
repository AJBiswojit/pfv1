# Phase 1.6 — preview showed the old hero: root cause and fix

**Status:** fixed, verified at the document/routing level and at the rendered-component level.
**No Phase 2 work started.** No commit was made (branch `arena/649fd845-pfv1`, HEAD `10890db`).

## 1. Root cause

The harness was correct; **the preview panel was never opening it.**

The preview panel loads the dev server's **root** — `https://{port}-{sandboxId}.e2b.app/`, i.e. `/`.
On that path the preview server was serving the **production entry document** `index.html`
(`<div id="root">` + `/src/main.jsx` → `App.jsx` → `<AtelierDesign />` → the existing
`HeroCarousel`). The harness lives in a *separate* document, `preview.html`, which only appears at
`/preview.html` — a path the panel never requests. So the page under review was the real storefront,
and "the old hero" was `HeroCarousel`, exactly as `AtelierDesign.jsx:39` still renders it.

Code path:

```
GET /                     → frontend/index.html        → /src/main.jsx     → App.jsx (L185 router)
                                                                             → <Route index element={<AtelierDesign />} />
                                                                             → <HeroCarousel slides={heroSlides} …/>   ← the old hero
GET /preview.html         → frontend/preview.html      → preview/main.jsx  → <HeroPreview /> → <HeroEditorial />  ← the Phase 1 hero
```

Evidence captured against the *running* preview server **before** the fix:

| Probe | Result |
|---|---|
| `curl /` | `<title>PRATIKSHYA FASHION — The Art of Textile \| by MediXO</title>`, `<div id="root">`, `<script src="/src/main.jsx">` → **the application** |
| `curl /preview.html` | `<div id="preview-root">`, `src/components/storefront/preview/main.jsx` → the harness |

No server-side redirect or rewrite existed for `/` (the response *is* `index.html`), which is why the
preview looked like the live homepage.

### Every hypothesis from the brief, checked

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Preview serving `index.html` / falling back to the app | **← THE CAUSE** | `/` returned the app document above; nothing rewrote `/` to the harness |
| `preview.html` loads `preview/main.jsx` | Correct | `200`, `<script src="/src/components/storefront/preview/main.jsx">` |
| `main.jsx` renders `HeroPreview` → `HeroEditorial` | Correct | Served module graph: `import HeroEditorial from "/src/components/storefront/home/HeroEditorial.jsx"`; SSR markup contained 92 `pf-hero*` occurrences and **0** `hero-carousel` / `swiper` |
| Intended `vite.preview.config.js` in use | Correct | Only one Vite process, started with `--config vite.preview.config.js`; the preview-only middleware served `/__preview-assets/hero-jewellery-tall.webp` (200, 109 522 B) and `/api/v1/media/objects/hero/hero001.avif` (200, 46 002 B) — assets no other config can serve |
| Stale Vite process or browser cache | Not the cause | `ps` showed exactly one server (PID chain `npm exec vite --config vite.preview.config.js …`). A hard reload is still advisable in the browser |
| Fixture mode vs. homepage rendering | Harness was rendering the app, not fixtures | Backend `/api/v1/home` → **500** (`ECONNREFUSED`, no Postgres/API), so fixture mode is the correct state — but the harness page was never reached |
| New hero hidden / unstyled / runtime error | Not the cause | The served stylesheet transforms with **101** `.pf-hero` rules; SSR of the real module graph renders the full hero markup (below) |
| Five layout controls switching the slide | Works by construction (state → list rotation); **not click-tested** | No browser or DOM library exists in this sandbox — see §5 |

## 2. Changes made (preview-only, minimal)

| File | Change |
|---|---|
| `frontend/preview/vite-preview-server.mjs` *(renamed from `vite-preview-media-assets.mjs`)* | Adds the fix: one dev-only middleware that rewrites `GET /` → `/preview.html` (query string preserved) and `GET /app` → `/index.html`. Media and fixture-asset serving unchanged. `apply: "serve"` — never runs in a build. |
| `frontend/vite.preview.config.js` | Imports/registers the renamed middleware (same single plugin, same base config spread). |
| `frontend/src/components/storefront/preview/HeroPreview.jsx` | Status row now names the mounted component — `hero component: HeroEditorial (Phase 1) — old HeroCarousel not mounted` — and the served entry — `entry: / → preview.html · untouched homepage: /app`. Selecting **Preview fixture** now makes **no backend call at all** (clean console without a database); Auto/Backend keep production behaviour. |
| `frontend/src/components/storefront/preview/__tests__/previewHarness.test.js` | +2 tests (12 total): the middleware must map `/` and `/app` correctly, and a new integration test boots the **real preview config** on an ephemeral port and asserts the served documents (`/` and `/preview.html` = harness; `/index.html` and `/app` = application). |
| `docs/PHASE-1.5-HERO-PREVIEW-HARNESS.md` | Updated for the rename and the root mapping. |

Nothing else changed: `index.html`, `vite.config.js`, `src/App.jsx`, `src/main.jsx`,
`AtelierDesign.jsx`, `HeroCarousel.jsx`, the hero component and its model, the design tokens, the
backend, the API contracts, auth/RBAC, commerce, and every dependency manifest/lockfile are
untouched (`git status` confirms). No second hero component and no second preview application were
created.

## 3. Preview URL and restart command

**URL: https://5173-idzjznx3prddkmwldi6wh.e2b.app/** — the harness now opens at the root.

```bash
cd frontend && npx vite --config vite.preview.config.js --host 0.0.0.0 --port 5173
```

* `/` → the preview harness (what the panel opens)
* `/app` or `/index.html` → the untouched production storefront (for the old-homepage check)
* `/preview.html` → the same harness by name
* `/?data=fixture`, `/?active=2` → flags survive the rewrite

The server was restarted after the change; the currently running process was started with the
command above. If your browser still shows the previous page, do a hard reload (the config rename
briefly interrupted the dev server, which Vite logged and recovered from on its own).

## 4. Evidence that the *new* component is what renders

Rendered through Vite's own SSR pipeline (the harness's real module graph, `MemoryRouter` + the
app's `index.css`), 12 855 characters of markup:

| Marker | Count |
|---|---|
| `pf-hero` (Phase 1 hero classes) | **92** |
| `pf-hero__title` / `pf-hero__line-inner` | 6 / 13 |
| `data-active-slide` / `data-slide-layout` / `data-hero-cta` | 1 / 1 / 1 |
| `hero-carousel`, `swiper` (old hero) | **0 / 0** |
| `Preview fixture — …NOT live backend data` | 3 (badge + labels) |
| `.pf-hero` rules in the served stylesheet | **101** |

Markup opens with the high-priority plate preload and the harness chrome
(`<h1 …>Editorial hero — Phase 1.5 preview</h1>`, layout/data/viewport controls, the fixture badge),
followed by the editorial hero itself. The integration test in §2 additionally proves the *served
document* at `/` is the harness and not the application — the exact regression that caused this bug.

Every image the harness can render also resolves on the running preview server (so there are no
broken plates behind a successful HTML response):

| URL | Status |
|---|---|
| `/api/v1/media/objects/hero/hero001…005.avif` | `200 image/avif` — 46 002 / 177 610 / 168 755 / 141 744 / 115 496 B |
| `/__preview-assets/hero-jewellery-tall.webp` (portrait art direction) | `200 image/webp` — 109 522 B |
| `/` and `/preview.html` (harness) · `/app` and `/index.html` (application) | `200 text/html` |

## 5. Visual verification — honest limitation

**I could not open a browser.** This sandbox has no browser, no headless Chromium and no DOM
library (`jsdom`/`happy-dom`/`playwright`/`puppeteer` are all absent), and installing one is outside
this phase's rules. So I make **no claim of visual inspection** — what I verified is the served
document, the module graph, the stylesheet transform, and the SSR-rendered markup above. The
platform preview is live at the URL in §3 for you to eyeball.

Quick check list (30 seconds):

1. Open the URL — the top bar should read **“Editorial hero — Phase 1.5 preview”** and show the
   *Preview fixture* badge plus five layout buttons. If you instead see the storefront's navigation
   and a slideshow with arrows/dots, you are on `/app` — reload the root URL.
2. The hero below the badge is the editorial one: full-bleed photograph, kicker rule + campaign
   kicker, serif headline with an italic second line, one burgundy CTA, and **no** arrows, dots,
   counter or pause button inside the hero.
3. Click `panel`, `right`, `split`, `top` — each rotates that slide into the active position; click
   `All five layouts` to see all five at once.
4. Switch `Viewport` to Tablet 834 / Mobile 390 — the hero renders inside a real iframe of that size
   (slide 4 swaps to the tall portrait plate).
5. Click inside the hero and press ← / →; enable “reduce motion” in devtools to watch autoplay stop.

Console/network expectations: with no backend, **Auto** mode logs failed `/api/v1/*` requests
(`ECONNREFUSED` → 500 from the dev proxy) — that is what puts the harness into labelled fixture mode.
Picking **Preview fixture** stops all API traffic; images and CSS all serve 200 (verified by request).

## 6. Tests, build, audits

| Gate | Result |
|---|---|
| `node --import ./scripts/node-loader/register.mjs --test "src/**/__tests__/*.test.js"` | **74 / 74 pass** (was 72; +2 preview tests) — hero-render 16, hero-model 29, preview **12**, design-system 17 |
| `npm run build` | **EXIT 0** — 3,407.88 kB / gzip 1,312.07 kB; **0** occurrences of `preview-root`, `__preview-assets`, `previewFixtures`, `vite.preview` or the harness in the bundle |
| `npm run audit:*` (16) | 15 EXIT 0; `audit:employee-management` EXIT 1 with the single known pre-existing assertion (unchanged baseline) |
| `npm run qa:*` (4) | 4 EXIT 0, “0 violation(s)” |
| Bare `npm test` | 434 / 412 pass / 21 fail / 1 skip — identical to the pre-existing failure set |
| `git diff --check` | EXIT 0 |
| `git diff --stat` | 5 tracked files, 232 insertions, 0 deletions — **unchanged** by Phase 1.6 |

## 7. Boundaries

* `AtelierDesign` and the live `/` route of the **application** are unchanged; the root rewrite
  exists only in the preview dev server. Proof: `vite.config.js` contains no rewrite, the production
  build contains no harness code, and `/app` + `/index.html` on the preview server still serve the
  original storefront.
* The Phase 1 hero, tokens and five-layout model are untouched.
* Phase 2 has not started: no other homepage section was migrated, and the customer homepage is
  still the original `AtelierDesign`.

**Stopping here — awaiting your review.**
