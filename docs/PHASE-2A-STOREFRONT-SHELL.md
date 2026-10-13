# Phase 2A — announcement bar, header, navigation, mega menu, mobile menu

**Status:** implemented and verified as isolated components; **not mounted in production** — the
shell is reachable only through the development-only preview until you approve integration.
**No Phase 2B work started.** No commit was made (branch `arena/649fd845-pfv1`, HEAD `10890db`).

---

## 1. Files created and modified

**Created (all untracked, all additive):**

| Path | What it is |
|---|---|
| `frontend/src/components/storefront/shell/AnnouncementBar.jsx` | B's announcement rail, driven by the storefront's data hook. |
| `frontend/src/components/storefront/shell/StorefrontHeader.jsx` | B's header: brand lockup, primary rail, utility cluster, mega/search/account/mobile wiring. |
| `frontend/src/components/storefront/shell/StorefrontMegaMenu.jsx` | B's mega panel: serif link columns + editorial feature. |
| `frontend/src/components/storefront/shell/StorefrontMobileNav.jsx` | B's left-hand mobile drawer, on the shared lock/trap/escape primitives. |
| `frontend/src/components/storefront/shell/storefront-shell.css` | Every rule namespaced `.pf-shell*`; palette/type/motion read from the app's theme variables. |
| `frontend/src/components/storefront/shell/__tests__/storefrontShell.test.js` | 17 tests (§6). |
| `frontend/src/hooks/useStorefrontAnnouncements.js` | Reads the PROMOTION marketing placement through the existing public service. |
| `frontend/src/components/storefront/preview/ShellPreview.jsx` | Dev-only preview of the shell above the Phase 1 hero. |

**Modified (all inside the Phase 1.5/1.6 preview harness, or the report set):**

| Path | Change |
|---|---|
| `…/preview/previewFixtures.js` | Adds `PREVIEW_FIXTURE_ANNOUNCEMENTS` (B's own approved announcement copy), clearly labelled preview-only. |
| `…/preview/main.jsx` | `?view=shell` renders the shell preview; `?view=hero` renders the Phase 1 hero preview. *(Updated after the preview review: a bare `/` now opens the full homepage composition, see the note in `PHASE-2B-HOMEPAGE-CONTENT-SECTIONS.md` §5.1 — later correction, nothing else here changed.)* |
| `docs/PHASE-2A-STOREFRONT-SHELL.md` | This report. |

**Nothing else changed.** `git diff --stat` is still exactly the five Phase 1 design-system files
(232 insertions, 0 deletions). No new tracked file, no manifest or lockfile edit, no `.env`, no
`vite.config.js`, no `index.html`, no `src/App.jsx`, no `CustomerLayout`, and **no file under
`frontend/src/components/shell/`** (the previous header/nav/menu are byte-identical to the reviewed
baseline — asserted by a test).

---

## 2. What was migrated

| Element | Project B source | Result |
|---|---|---|
| Announcement bar | `components/layout/AnnouncementBar.jsx` + `styles/layout.css` §Announcement | Ported: 34px plum rail, 11px/0.14em uppercase, ellipsised single line, 4.5s rotation, hover/focus pause, session dismissal, `aria-live="off"`, 10px at ≤599px. |
| Desktop header | `Header.jsx` + §Header | Ported: sticky, blush at 86% with `backdrop-filter`, hairline + shadow once scrolled (`useScrolled(24)`), opaque while a panel is open, 3-column grid with the lockup centred, 64px (56px ≤899px), 1023px rail swap. |
| Scrolled / hover states | B's `is-scrolled`, `has-mega`, 160ms close timer | Ported; the panel's own pointer entry cancels the timer, so moving from the rail into the panel never closes it, and the panel is absolutely positioned so opening it never shifts layout. |
| Search / account / bag | B's icon rail and pill bag button | Ported visually; **drives the existing** `SearchPanel`, `AccountDropdown` and cart drawer. |
| Mega menu | `navigation/MegaMenu.jsx` + §Mega | Ported: 1fr/380px spread, staggered serif columns, 3/4 zooming plate, kicker + italic title + "View the edit" action, 8px drop-in. |
| Mobile menu | `navigation/MobileMenu.jsx` + §Scrim & mobile menu | Ported: plum scrim, 420px drawer entering **from the left**, compact lockup, search affordance, serif accordions opening over the group's plate, three-up foot. |
| Interactions | B's `useLockBody` / `useEscape` / `useFocusTrap` / `useScrolled` | Reused from the design system (Phase 1 ported them). Nothing was re-implemented: body lock, ESCAPE dismissal, TAB cycling, `data-autofocus`, focus restoration. |

**Not migrated (out of scope, per §7):** footer, homepage route switch, hero redesign, banners,
lookbooks, promotion/trust/newsletter sections, any backend endpoint, any new settings surface.

---

## 3. Real data sources

### Announcement bar — the PROMOTION marketing placement

There is **no announcement, ticker or storefront-settings endpoint** in this codebase (verified by
grep across `backend/app`: no announcement/settings/ticker model, schema, route or response field).
What *does* exist, and is already admin-managed, is the marketing-media placement register:

* `backend/app/schemas/media/marketing.py` — `MARKETING_PLACEMENT_VALUES` includes **`PROMOTION`**;
  every row may carry `title`, `subtitle`, `cta_label`, `cta_href`, `sort_order`, `is_active`.
* `backend/app/api/v1/marketing_media.py` — **public** `GET /marketing/placements/{placement}`
  (`active_only=True`).
* `frontend/src/config/mediaTypes.js` — `MARKETING_PLACEMENTS.PROMOTION`, documented as
  `live: true`, surface "Seasonal promotion artwork".
* `frontend/src/services/api/marketingMediaApi.js` — the existing `apiGetMarketingPlacement`
  (scope `"none"`). Phase 2A is its first storefront consumer.

So the bar prints **the words the Marketing desk typed into the Admin Portal** — `title`, or
`subtitle` when there is no title — in `sort_order`, deduplicated, capped at six. With no rows, or
with no backend at all, the list is empty and **the bar renders nothing**: no fallback copy, no
client-side campaign, no retry loop, one request per page load (shared between mounts).

### Navigation — the canonical taxonomy

`primaryNavigation` (`frontend/src/config/navigationConfig.js`), built from
`departments`/`catalogueRoutes` in `frontend/src/data/catalog/taxonomy.js` plus the taxonomy
repository's active collections. Groups: **women, bridal, men, kids, collections**; every leaf is a
`routeManifest` path. Asserted by test: every `<a href>` the header renders is a canonical route of
this application, and none of Project B's mock destinations (`/shop/*`, `/wishlist`,
`/track-order`) appears anywhere.

Mega/mobile feature plates use the existing `resolveNavigationEditorialImage(group)` chain (curated
placement → published product media → authored catalogue plate → collection cover → `null`), and the
plate is painted by the existing `MediaFrame`/`PratikshyaImage`, which keeps a neutral plate instead
of inventing imagery.

---

## 4. Missing backend capability discovered

1. **A purpose-built announcements source.** The bar is honest but indirect: it borrows the
   `PROMOTION` placement. If the house wants scheduling, an expiry date, per-locale copy or a bar
   that is independent of campaign artwork, that is a small backend addition (a settings row or an
   announcement table) — **not made in this phase**, as instructed.
2. **A per-surface storefront settings API** — still absent (first noted in Phase 1).
3. Unchanged from Phase 1: no public hero-richness fields (`eyebrow`/`lines`/`layout`/`tone`), no
   newsletter/subscribe endpoint, no public bestsellers or product-placement API.

---

## 5. Preview URL and startup command

```bash
cd frontend && npx vite --config vite.preview.config.js --host 0.0.0.0 --port 5173
```

| URL | Shows |
|---|---|
| **https://5173-idzjznx3prddkmwldi6wh.e2b.app/?view=shell** | **Phase 2A shell preview** (announcement + header + mega + mobile over the Phase 1 hero) |
| `…/?view=shell&data=fixture` | Same, forcing the labelled preview-only announcement copy |
| `…/?view=hero` | The Phase 1.5/1.6 hero preview, unchanged |
| `…/app` or `…/index.html` | The untouched production storefront (`AtelierDesign`, old `HeroCarousel`) |

The shell preview's Viewport buttons (Responsive / Desktop 1280 / Tablet 834 / Mobile 390) load the
surface in **real iframes**, so the 1023px rail swap, the ≤899px header height, the ≤599px rules and
the mobile drawer are judged at their true viewport.

### How to review each piece

1. **Announcement bar** — top rail. Rotates every 4.5s (hover or focus it to hold a message); the ×
   dismisses it for the session (reload clears it). With Data = *Auto* and no backend it shows the
   **labelled fixture** with a red badge; with a live backend and PROMOTION rows it shows the real
   copy with a green badge, and with no rows it disappears entirely.
2. **Header** — scroll: the hairline and shadow appear; the lockup stays centred; the ceremony group
   (*Bridal*) is the italic serif accent.
3. **Mega menu** — hover or Tab onto Women / Bridal / Men / Kids / Collections. Check: columns and
   destinations; the feature plate; pointer travel from the rail into the panel (stays open);
   ESCAPE and clicking a link (closes); Tab through the panel then out (closes); Collections shows
   its feature alone until the catalogue hydrates.
4. **Mobile menu** — switch to Mobile 390, tap the burger (top left): the drawer enters from the
   left, the first group is open, the page behind cannot scroll, TAB cycles inside, ESCAPE or the ×
   closes it and focus returns to the burger, and the search row opens the real search panel.
5. **Bag / search / account** — the bag opens the real cart drawer, search opens the real panel, the
   account icon opens the real dropdown (and routes to `/signin` when signed out).
6. **Reduced motion** — the shell only fades/slides short distances; set the OS/devtools preference
   to check nothing depends on motion.

---

## 6. Verification

| Gate | Result |
|---|---|
| New suites — `node --import ./scripts/node-loader/register.mjs --test "src/**/__tests__/*.test.js"` | **91 / 91 pass** (Phase 2A **17**, preview 12, hero-render 16, hero-model 29, design-system 17) |
| `npm run build` | **EXIT 0** — 3,407.88 kB / gzip 1,312.07 kB; **0** occurrences of `pf-shell` or `StorefrontHeader` in `dist/index.html` (nothing mounts the new shell yet) |
| Bare `npm test` | 434 / **412 pass / 21 fail / 1 skip** — byte-identical to the recorded baseline (3 stale RBAC files + environment-only failures), no new failure |
| `tests/brandLockup.test.js` | 5 / 5 pass (the shared `Brand` seam and the production header are untouched) |
| `tests/phase6LocalMediaFlow.test.js` | 7 pass / 1 fail / 1 skip — the known pre-existing failure (reads `../pratikshya-backend/app/config.py`, absent in this checkout) |
| `npm run audit:*` (16) | 15 EXIT 0; `audit:employee-management` EXIT 1 with the single known pre-existing assertion. `audit:media` "Component path violations 0", `audit:hero-runtime` PASS 0 violations |
| `npm run qa:*` (4) | 4 EXIT 0, "0 violation(s)" (including `qa:navigation-editorial`, which renders the *existing* MegaMenu) |
| `git diff --check` | EXIT 0 |
| `git status` | only the expected additive paths; no portal, backend, manifest or shell file touched |
| Rendered-component evidence | SSR of the shell preview: 1 header, 5 nav groups, brand lockup, announcement rail, **77** `.pf-hero` nodes, **0** old-hero markers (`hero-carousel`/`swiper`); the hero preview still renders identically (12,855 chars) |
| HTTP | `/`, `/?view=shell`, embed URLs and `/app` all 200; every new module and the shell stylesheet transform |

### Browser verification — honest limitation

**I still cannot open a browser** (no Chromium, no jsdom/playwright/puppeteer in this sandbox, and
installing one is outside this phase's rules). Everything above is document/module/SSR evidence
plus the live URLs. **The interaction behaviours listed in §5 are implemented and code-reviewed but
not yet observed in a real browser** — please exercise them at the preview URL; I have not claimed
visual sign-off.

---

## 7. Regressions, deviations and blockers

**No known regressions.** The tracked diff is unchanged, the baseline failure set is unchanged, and
nothing that existed before this phase was deleted or rewired.

**Deliberate deviations from Project B (all reversible, all reasoned):**

1. **Brand lockup** — the header uses the canonical `<Brand variant="lockup" wordmark={brand.name}>`
   seam (the real `src/assets/pratikshya_logo.png` mark + wordmark) at the shared `default` scale,
   rather than B's hand-authored stacked "PRATIKSHYA / — FASHION —" wordmark. Reason: that mark is
   rendered by one component for every portal, and a second lockup would fork it (the repo already
   has a regression test forbidding surfaces from inventing their own logo/wordmark). If the client
   wants B's exact ruled, stacked wordmark, the correct place is **inside `Brand` itself** — a
   shared-seam change for a later approved phase, with portal screenshots before/after.
2. **Rail density 1024–1199px.** The production IA has five primary groups where B authored four, so
   that band tightens the gap (12px) and the type (10.5px/0.14em; accent 17px) instead of dropping a
   group. Nothing is hidden in that band; below 1024px the rail is the mobile drawer, as in B.
3. **Mega columns** use `repeat(auto-fit, minmax(170px, 220px))` instead of a fixed three-track grid,
   so the two- and three-column groups the taxonomy actually defines keep B's 220px measure without
   reserving an empty track.
4. **Mega feature caption omitted** — B's panel carries kicker, title and action; the department
   description already heads its own listing page.
5. **No page scrim behind the mega panel** — B has none (the header turns opaque instead); only the
   search panel dims the page, and that dim sits behind the header (`z-index: -10`) exactly as the
   previous shell did.
6. **Mobile panel content** — sign-out and the account shortcuts from the previous drawer are
   preserved as a compact authenticated row plus the foot's Account/Wishlist/Bag columns, and the
   legal links remain; B's standalone italic "The Bridal Edit" entry is absent because Bridal is
   itself a primary group here.
7. **Search panel and account dropdown are reused unchanged**; their visual re-skin under B's
   language is a later-phase decision, not a Phase 2A one.

**Integration notes for the approved phase (not done now):**

* The new header is **sticky and in flow** (B's model); the current shell is **fixed** and every
  customer route is pushed down by `CustomerLayout`'s `pt-16 md:pt-20` (and `AtelierDesign` uses
  `header.offset`). Switching the shell therefore means removing that offset in the same change —
  a one-line, easily reversible edit, deliberately left out of Phase 2A.
* The shell expects the campaign canvas (`blush-canvas`) as its page background. The preview applies
  it through a scoped `.pf-shell__surface` class; the eventual integration should apply it at the
  layout level rather than on `body`, so no portal is repainted.
* Below ~330px the centred lockup and the two remaining icons are tight; `overflow-x: clip` on the
  header guarantees no horizontal page scroll. Real 320px comfort needs the lockup to shrink inside
  `Brand` (see deviation 1).

---

## 8. Boundary confirmation

* **Homepage & routes**: `src/App.jsx` is byte-identical — index route still `<AtelierDesign />`,
  `CustomerLayout` still mounts the existing `SiteHeader`, and the catch-all is still `<NotFound />`.
  `src/components/shell/*` is byte-identical. The new shell is referenced by **no production module**
  (0 hits in the built bundle).
* **Portals**: Admin, Super Admin and Employee route definitions, guards and shells untouched;
  no new provider, API client, catalogue store, cart, wishlist or auth implementation was added
  (asserted by test — the components contain no `createContext`, `apiClient`, `fetch`, `useCart` or
  `localStorage`).
* **Auth/RBAC**: only the existing `useAuth` / `AuthProvider` are read. No guard, role or session
  logic was changed.
* **Commerce**: cart and wishlist counts arrive as props from the existing contexts; the bag button
  calls the existing `onOpenCart`; no pricing, checkout, order or inventory code was touched.
* **Backend/database**: untouched — no endpoint, schema, migration or settings API added; no file
  under `backend/` appears in `git status`.
* **Manifests**: `package.json`, `package-lock.json` and `vite.config.js` are unchanged; no
  dependency was added.
* **Assets**: nothing added, renamed or deleted in either application; the shell references no file
  path at all (no `/images/…` literal anywhere in the new code).

## 9. Stop condition

Phase 2A ends here. **Phase 2B and every later section remain untouched**, the live homepage is
still the original `AtelierDesign`, and the new shell is reachable only through the development-only
preview. Awaiting your review and approval before integration or any further migration.
