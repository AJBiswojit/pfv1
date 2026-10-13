# Phase 1 — Design System Foundation + Editorial Hero

Status: **complete, awaiting review.** Nothing is mounted, no route changed, no portal touched,
no Phase 2 work started.

Branch `arena/649fd845-pfv1`, starting commit `10890db` ("New home page pushed", the Phase 0
baseline commit — verified identical to the Phase 1 pre-flight HEAD, clean tree).

---

## 1. Files created

| File | Lines | Purpose |
| --- | --- | --- |
| `frontend/src/design-system/hooks/useMediaQuery.js` | 48 | Media-query subscription (used by the hero for reduced motion). |
| `frontend/src/design-system/hooks/useScrolled.js` | 30 | Passive scroll-position flag. Foundation for the Phase 2 campaign header. |
| `frontend/src/design-system/hooks/useLockBody.js` | 36 | Self-restoring body scroll lock. Foundation for the Phase 2 mobile panel. |
| `frontend/src/design-system/hooks/useFocusTrap.js` | 59 | Tab cycling inside a panel + focus restoration. Foundation for Phase 2. |
| `frontend/src/design-system/hooks/useEscape.js` | 30 | ESCAPE handler bound only while a panel is open. Foundation for Phase 2. |
| `frontend/src/design-system/components/InView.jsx` | 107 | Replayable scroll reveal with hysteresis (enter line ≠ reset line). |
| `frontend/src/design-system/components/Reveal.jsx` | 167 | `MaskReveal`, `LineReveal`, `FadeUp` — the editorial entrance language. |
| `frontend/src/design-system/components/ArrowLink.jsx` | 78 | Editorial arrow link (router-aware) + the hand-drawn `Arrow`. |
| `frontend/src/design-system/components/SectionLabel.jsx` | 39 | Micro label with optional numeral and hairline rule. |
| `frontend/src/components/storefront/home/heroModel.js` | 248 | Pure hero model: layout order, line breaking, media resolution, navigation maths, pause model. |
| `frontend/src/components/storefront/home/HeroEditorial.jsx` | 424 | The editorial hero component. |
| `frontend/src/components/storefront/home/hero-editorial.css` | 461 | Hero geometry, namespaced `.pf-hero*` (see §7). |
| `frontend/src/components/storefront/home/__tests__/heroModel.test.js` | 308 | Model + hero source-contract tests. |
| `frontend/src/components/storefront/home/__tests__/heroEditorialRender.test.js` | 279 | Server-rendered hero tests + Phase 1 boundary tests. |
| `frontend/src/design-system/__tests__/designSystemFoundation.test.js` | 306 | Token mirror, hooks, primitives, namespacing tests. |

## 2. Files modified (additive only — 231 insertions, 0 deletions)

| File | Change |
| --- | --- |
| `frontend/src/index.css` | Campaign palette + motion curves appended **inside the existing `@theme` block**. No existing token edited, no new global selector (`html`/`body`/`*` rule counts verified unchanged). |
| `frontend/src/design-system/tokens.js` | New `campaign` palette + `campaignClasses`, included in the `tokens` aggregate. `colors` untouched. |
| `frontend/src/design-system/typography.js` | New `campaign` type scale, included in the `typography` aggregate. No existing scale changed. |
| `frontend/src/design-system/motion.js` | New `campaign` motion tokens, included in the `motionTokens` aggregate. |
| `frontend/src/design-system/index.js` | Exports the new primitives and hooks. Every pre-existing export retained (asserted by test). |

Not touched, by evidence: `src/App.jsx`, `src/pages/AtelierDesign.jsx`,
`src/components/storefront/HeroCarousel.jsx`, every Admin / Super Admin / Employee surface,
all API clients, the whole `backend/` tree, `package.json`, `package-lock.json`, `.gitignore`,
and every file/image in `home-page/`.

---

## 3. Dependency-ready baseline (no upgrades, no manifest edits)

| Step | Result |
| --- | --- |
| `git rev-parse` / `git log` / `git status` | root `/home/user/pfv1`, branch `arena/649fd845-pfv1`, HEAD `10890db`, tree clean, no ignored files before install. |
| `git diff --stat 10890db..HEAD` | empty — nothing changed since the Phase 0 report. |
| `cd frontend && npm ci` | **exit 0**, "added 128 packages, audited 129", 6 pre-existing advisories, lockfile untouched. |
| `cd backend && python3 -m venv .venv` | exit 0 (Python 3.11.2, pip 23.0.1). |
| `.venv/bin/pip install -r requirements.txt` | **exit 0**, 86 packages, no version conflicts, requirements file unchanged. |
| `.venv/bin/python -c "import app.main"` | OK (created the gitignored `backend/logs/`). |

**Disclosure (tooling, not a code change):** `pytest 9.1.1` and `pytest-asyncio 1.4.0` were
installed **into `backend/.venv` only** so the backend suite could run at all;
`requirements.txt` was **not** edited. If the project wants backend tests to be runnable from a
clean checkout, that is a separate, approved change.

## 4. Verification

### 4.1 Post-install baseline vs Phase 0

| Check | Phase 0 | After install |
| --- | --- | --- |
| `npm test` | 408 / 383 pass / 24 fail / 1 skip | **434 / 412 pass / 21 fail / 1 skip** |
| `npm run build` | could not run (`vite: not found`) | **exit 0**, 2,705 modules, `dist/index.html` 3,402.50 kB (gzip 1,310.88 kB) |
| `qa:*` (4 scripts) | 4 × exit 1 (no `vite`) | **4 × exit 0** — "0 violation(s)" |
| 17 audits | 16 pass, `audit:employee-management` fail | **same** |
| backend pytest | could not run | 802 collected / 42 modules; 756 pass / 22 fail / 24 skip / 1 collection error |

The improvement is explained entirely by dependencies now being present; nothing was "fixed".

### 4.2 After the Phase 1 code

| Check | Result |
| --- | --- |
| `npm test` | 434 tests / **412 pass / 21 fail / 1 skip** — byte-identical failure set to the post-install baseline (diffed test-name by test-name). |
| `npm test -- "src/**/__tests__/*.test.js"` | **494 tests / 472 pass / 21 fail / 1 skip** — the suite plus all 60 Phase 1 tests; the same 21 pre-existing failures. |
| `npm run build` | **exit 0**, 3,407.86 kB (gzip 1,312.06 kB) — +5.36 kB raw / +1.18 kB gzip from the new design-system exports; hero code is not in the graph because nothing imports it. |
| 16 `audit:*` + `audit-product-performance` + 4 `qa:*` | **20 × exit 0**; `audit:employee-management` exits 1 with its known single assertion: `SUPER_ADMIN can access employee management = FAIL`. |
| `npm run audit:hero-runtime` | exit 0 — the live hero's media contract is unaffected. |
| `backend` | `import app.main` OK; `pytest --collect-only` still Errors on the same pre-existing module (`tests/unit/test_unified_rbac_consolidation.py`, imports `ACCOUNT_LEVEL_SUPER_ADMIN`… i.e. a missing export in `app.core.rbac`). No Postgres available, so DB-backed checks remain unverified. |

### 4.3 Phase 1 tests

`node --import ./scripts/node-loader/register.mjs --test "src/**/__tests__/*.test.js"` (60 tests,
all passing), or the whole suite with
`npm test -- "src/**/__tests__/*.test.js"`.

**Placement decision.** `frontend/.gitignore` ignores `tests/`, and `npm test` globs only
`tests/*.test.js`. New tests therefore live under `src/**/__tests__/` — a verified non-ignored
path — and run through the same runner and loaders with the extra glob above. **`.gitignore` and
`package.json` were not modified.** Two options need your decision later: either add the
`src/**/__tests__/*.test.js` glob to the `test` script (a `package.json` edit), or move the files
into `tests/` and force-add them (`git add -f`, the existing precedent). Both are outside what
Phase 1 was allowed to change unilaterally.

Covered: backend slide rendering, slide-order preservation, empty response → nothing rendered,
media resolution (slide plate → HOME_HERO register → drop), no legacy public-image path,
`mobileImage` art direction, masked headline lines with one italic closing line,
kicker/CTA absence handling, one action per slide, no visible control/counter/progress/pager,
live-region behaviour, sizer reservation, accessibility attributes, autoplay pause model,
swipe threshold maths, layout sequence, jump-free wrapping, the CSS/JS token mirror, the primitives,
the barrel, hero stylesheet namespacing, and that nothing imports or mounts the hero
(`App.jsx` still routes `index → AtelierDesign`).

**Not covered, honestly:** real-browser interaction. Hover/focus/visibility/scroll pause,
touch swipe, the 7-second timer, focus rings and horizontal overflow are verified by the pure
pause model, by the source-wiring assertions, and by the ported geometry — not by a browser,
because this environment has no headless browser and Phase 1 added no dependency for one.
The hero also has not been visually compared side-by-side with Project B. Both belong to the
Phase 2 review.

---

## 5. Design tokens (additive)

CSS mirror: the Phase 1 block inside `@theme` in `src/index.css`. JS mirror:
`campaign` in `design-system/tokens.js`, `typography.campaign`, `motionTokens.campaign`.

| Token | Value | Use |
| --- | --- | --- |
| `burgundy` | `#65081F` | Brand accent, panels, primary CTA. |
| `burgundyDeep` | `#420619` | CTA hover, panel gradient end. |
| `burgundyNight` | `#2A0410` | Darkest gradient end. |
| `blushCanvas` | `#F7EEED` | Campaign background, light CTA. |
| `blushWarm` | `#E9D0C1` | Secondary background, split panel. |
| `blushSoft` / `blushPaper` | `#F2E2DB` / `#FBF6F5` | Inserts. |
| `cocoaMuted` | `#A0705C` | Kickers, labels. |
| `neutralSoft` | `#CAAFA5` | Labels and kickers on dark. |
| `espresso` / `espressoSoft` / `espressoMeta` | `#3A1806` / `#5B3A2A` / `#8A6555` | Headlines, body, meta. |
| `night` / `nightSoft` | `#2B1105` / `#3F1907` | Bridal / jewellery depth. |
| `line` / `lineStrong` / `lineOnDark` | burgundy and blush alphas | Hairlines, panel frames, the `top` divider. |
| `ease-silk` / `ease-editorial` / `ease-editorial-inout` | B's three curves | Slide, reveal and hover motion. |

**Font-loading limitation (documented, not worked around).** Project B sets supporting text in
`Manrope Variable`. This application loads only Cormorant Garamond, Instrument Sans and Playfair
Display from `index.html`, and Phase 1 forbids adding font packages. The campaign scale therefore
uses Cormorant Garamond for display and Instrument Sans for supporting text — the same serif/sans
pairing, with the sans substituted. Adding Manrope needs either a dependency or an `index.html`
edit, both outside Phase 1; it is flagged for approval.

## 6. Primitive parity with Project B

| B primitive / hook | Ported | Deliberate difference |
| --- | --- | --- |
| `Reveal.jsx` (`MaskReveal`, `LineReveal`, `FadeUp`) | yes | Line masks use inline styles instead of B's global `.line-mask` / `.line-inner` classes; reduced motion shows content immediately. |
| `InView.jsx` (`useReplayInView`, `InView` proxy) | yes | Uses the shared motion viewport tokens; reduced motion via the new `useMediaQuery`. |
| `ArrowLink.jsx` | yes | B's global `.arrow-link` stylesheet replaced by Tailwind utilities; still renders through the app router. |
| `SectionLabel.jsx` | yes | B's `::after` rule is an explicit `aria-hidden` span; no global `.label` class. |
| `useMediaQuery`, `useScrolled`, `useLockBody`, `useFocusTrap`, `useEscape` | yes | SSR-safe; `useFocusTrap`/`useLockBody` restore exactly the state they changed. In the hero only `useMediaQuery` is consumed today; the rest are the Phase 2 header/panel foundation. |

## 7. Hero — data contract and behaviour

Props stay exactly the existing homepage contract: `slides` (from `GET /home` → `heroSlides`,
normalised by `src/data/catalog/hero.js`) and `heroMedia` (the HOME_HERO marketing register).

| B field | Backend source | Notes |
| --- | --- | --- |
| `primary` (CTA) | `cta` + `href` | Rendered once; absent label or href ⇒ no action at all. |
| `copy` | `body` (backend `subtitle`) | |
| `kicker` | `eyebrow` | Empty ⇒ the kicker row is omitted, never faked. |
| `lines[]` | derived from `title` | `\n` wins; otherwise balanced two-line break. |
| `italicLine` | derived | Closing line of a two-line headline. |
| `layout` | derived | B's order by index: `left`, `panel`, `right`, `split`, `top` (cycles beyond five). |
| `image` / `focal` | `image` / `objectPosition` | Resolved by `hero.js`; falls back to the HOME_HERO register only when the slide brings no plate. |
| `imageTall` / `focalTall` | optional `mobileImage` | Used as the container-query portrait plate when present; otherwise the wide plate serves every frame. |
| `label` | `title` | Accessible slide name; `Campaign N` when no title. |

Presentation: five layouts with B's exact geometry (panel widths, per-layout scrims, `top` band
with hairline divider, tablet 52/46% split, stacked mobile with 58svh stage and invisible sizers),
masked headline lines, burgundy/blush offset panels, 1.5 s first-paint clip-path reveal plus a 14%
directional reveal on later slides, image settle scale, and the container-query portrait swap.

Behaviour: 7 s autoplay that pauses on hover, keyboard focus, offscreen and hidden tab, resuming
with the elapsed time preserved; `ArrowLeft`/`ArrowRight`; 48 px horizontal swipe with a 1.3×
vertical-rejection ratio; reduced motion disables autoplay and the spatial reveals.

Accessibility: `aria-roledescription="carousel"` with arrow-key hints, one `role="group"`
`aria-roledescription="slide"` region (`"1 of 5: <title>"`), a focus ring on the section, and a
screen-reader status announced **only while paused**.

No visible counter, progress bar, pause control or prev/next UI exists in the component.

Empty response ⇒ the hero renders **nothing**: no mock copy, no fallback plate, no placeholder frame.

## 8. Remaining limitations and backend-contract gaps

1. **No backend fields for `layout`, `lines`, `italicLine`, `imageTall`.** Derived on the frontend
   and documented; no backend change was proposed or made. If you want Admin/Super-Admin control
   over art direction, the schema needs `layout` and a second (portrait) plate per slide.
2. **One CTA per slide.** B's second action (`secondary`) has no backend field, so `ArrowLink`
   ships as a primitive but the hero renders a single action rather than inventing a second
   destination.
3. **`eyebrow` is always empty today.** The mapper in `src/data/catalog/hero.js` defaults it to `""`,
   so every live slide currently renders without a kicker.
4. **Manrope not loaded** (§5).
5. **No brand mark / favicon selected.** The application ships no favicon and Project B's mark
   file was not ported; unchanged from Phase 0.
6. **Hero CSS is a separate namespaced stylesheet** (`hero-editorial.css`, every selector `.pf-hero*`,
   custom properties declared inside `.pf-hero`). It is not a global sheet, but it is a new file
   rather than pure utility classes — chosen to preserve B's container-query and clamp geometry
   faithfully. A test asserts no selector escapes the namespace.
7. **Not visually verified in a browser** (§4.3).
8. **Postgres-backed checks remain unverified** — no database was configured and no data was modified.

## 9. Phase 1 boundary — confirmations

- `App.jsx` index route still `<Route index element={<AtelierDesign />} />`; asserted by test.
- `AtelierDesign.jsx`, `HeroCarousel.jsx` and every other pre-existing source file are unmodified:
  the tracked diff is 231 insertions / 0 deletions across exactly the 5 files in §2, plus the new
  files in §1 and this report.
- No customer, Admin, Super Admin or Employee behaviour changed; no API client, RBAC, cart,
  checkout, payment, order, inventory or database code was touched.
- No file or image was deleted, renamed or moved in either application.
- No TypeScript; no new dependency; no font package; `package.json` / `package-lock.json` untouched.
- No Phase 2 work started (no header, footer, announcements, categories, product rails, bridal,
  jewellery, bestsellers, newsletter or trust strip).
- Gitignored build/tooling artifacts left in place: `frontend/node_modules/`, `frontend/dist/`,
  `backend/.venv/`, `backend/.pytest_cache/`, `backend/**/__pycache__/`, `backend/logs/*.log`.

**Stop after Phase 1 — awaiting review before Phase 2.**
