# PRATIKSHYA FASHION — Homepage Content Control Center
## Comprehensive Functional, UI/UX, Configuration-Workflow and Data-Safety Audit

**Surface audited:** `/super-admin/media/marketing` (also mounted at `/admin/media/marketing` and `/employee/media/marketing`)
**Audit type:** Evidence-based, read-only. **No application file was modified, no API/DB/config record was touched, nothing was committed.**
**Branch:** `arena/c72d2349-pfv1` @ `43bf640` (working tree clean before and after)
**Date:** 2026-10-23

---

## 0. How this audit was performed — and what it could not do

### 0.1 Evidence classes used in this report

Every finding carries an explicit evidence class so nothing is presented as more certain than it is.

| Class | Meaning |
|---|---|
| **SOURCE** | Traced unambiguously through the actual implementation (`file:line` cited). |
| **EXECUTED** | A command was run in this session; its real output is quoted. |
| **PROBE** | A purpose-built, out-of-tree Node/Vite script imported the **real** application modules and rendered them; output quoted verbatim. No application file was written. |
| **DERIVED** | Deterministically implied by source (e.g. CSS grid order), but not visually observed. |
| **SUSPECTED / OPINION** | A judgement or a hypothesis that this audit could not prove. |

### 0.2 What was inspected

| Area | Files |
|---|---|
| Page shell / navigation | `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` (121 L) |
| Section editor | `frontend/src/components/admin/homepage/SectionContentEditor.jsx` (171 L) |
| Hero editor | `frontend/src/components/admin/BackendHomeHeroPanel.jsx` (167 L) |
| Preview | `…/SectionPreview.jsx` (148 L), `…/PreviewErrorBoundary.jsx` |
| Pickers | `…/RegisteredMediaPicker.jsx` (88 L), `…/PublishedProductPicker.jsx` (77 L) |
| Client model / services | `services/homepage/homepageContentModel.js` (97 L), `homepageContentService.js` (84 L), `services/api/homepageApi.js` (46 L), `marketingMediaApi.js`, `mediaApi.js`, `catalogStore.js`, `catalogRecordSafety.js` |
| Storefront consumers | `customer/pages/Home.jsx`, `customer/components/sections/*.jsx` (12), `storefront/home/{HomepageSection,homepageSectionModel,customerHomeHeroModel,heroModel}.jsx`, `customer/mock/data/products.js` |
| Backend contract | `api/v1/homepage.py` (167 L), `api/v1/marketing_media.py`, `services/media/homepage_content_service.py` (606 L), `services/media/marketing_media_service.py` (353 L), `schemas/media/homepage.py` (178 L), `schemas/media/marketing.py`, `models/media/{homepage_section,marketing_media}.py`, `services/catalog/{explore_service,product_service}.py`, `core/rbac.py` |
| Design system | `index.css` (`@theme`**,** `.pf-staff` scope), `design-system/tokens.js`, `AdminPage.jsx`, `AdminPanel.jsx`, `PortalShell.jsx`, `AtelierButton.jsx` |
| Prior audits | `docs/PHASE-2-HOMEPAGE-CONTENT-CENTER.md`, `docs/PHASE-3-HOMEPAGE-PERSISTENCE-REPORT.md`, `docs/audit/homepage-admin-audit.md`, `docs/audit/homepage-admin-verification.md` |

### 0.3 What was **executed** (real output, not inferred)

**Frontend control-centre suites** (temporary `npm ci`, removed afterwards):

```
node --import ./scripts/node-loader/register.mjs --test \
  src/components/admin/homepage/__tests__/homepageAllSections.test.js \
  src/components/admin/homepage/__tests__/homepageContentControl.test.js \
  src/components/admin/homepage/__tests__/homepagePersistence.test.js
→ # tests 117  # pass 116  # fail 1
```

The single failure is **pre-existing and environmental**: `homepageContentControl.test.js:136` — *“section inventory matches all twelve reference components in order”* — reads `../home-page/src/pages/Home.jsx`, and the `home-page/` reference directory is **absent** from this checkout (`readFileSync` ENOENT). It does not indicate a defect in the control centre.

**Storefront consumer suites** (same temporary install):

```
node --import ./scripts/node-loader/register.mjs --test \
  src/components/storefront/home/__tests__/homepageSectionsRender.test.js \
  …/heroModel.test.js …/heroEditorialRender.test.js …/homepageLoading.test.js \
  src/components/storefront/home-sections/__tests__/homeSectionsRender.test.js \
  src/components/storefront/__tests__/homeIntegration.test.js \
  src/design-system/__tests__/designSystemFoundation.test.js
→ # tests 131  # pass 131  # fail 0
```

**Backend homepage/marketing contract tests** (temporary venv, `DATABASE_URL` unset, **no database connection**):

```
PYTHONPATH=backend pytest -o addopts='' -q \
  backend/verification/unit/test_homepage_content.py \
  backend/tests/unit/test_marketing_media.py
→ 1 failed, 100 passed   (failure: test_migration_graph_one_new_head — stale head assertion, see F-26)
```

**Runtime PROBE 1 — does the Preview tab show the operator’s edit?**
Real `SectionPreview` + `MemoryRouter` + `renderToStaticMarkup`, section `promotion`, an existing saved `intro` row plus an edited draft:

```
PROBE 1 contains OLD SAVED HEADING: true
PROBE 1 contains EDITED DRAFT HEADING: false
```

**Runtime PROBE 2 — what taxonomy does a curated product actually carry?**
Real `toDesignProduct` from `customer/mock/data/products.js`:

```
banarasi  → { department: 'women',      type: 'banarasi',      collections: ['women','sarees','banarasi','silk-classics'] }
kurti     → { department: 'essentials', type: 'kurtis-suits',  collections: [...,'kurtis'] }
jhumka    → { department: 'jewellery',  type: 'jewellery',     collections: ['bridal','finishing-touches','jewellery','necklaces','maang-tikka','jhumkas','rings'] }
```

### 0.4 What could **not** be done — stated explicitly

1. **No real browser.** No Chromium/Firefox/Playwright binary exists in this sandbox and the allowed egress hosts do not include a browser download. **Therefore no viewport was inspected at 1366×768, wide desktop, tablet or mobile widths.** All layout findings are **DERIVED** from class lists and grid definitions, never from a screenshot. Contrast ratios are quoted from the token comments (`index.css`, verified by reading them) rather than measured in a browser.
2. **No database, no migrations.** PostgreSQL is not available; no migration was executed, no row was read or written. All persistence claims are traced from source and from the committed test contracts.
3. **No live API trace against a real server.** No `uvicorn` was started; endpoint behaviour is read from the route + service code, and cross-checked against the mocked-contract suites above.
4. **No real upload, no S3/CDN.** Storage-existence checks (`object_exists`) were read, not executed.

Every claim below is therefore one of SOURCE / EXECUTED / PROBE / DERIVED / SUSPECTED. Where a browser would be required to confirm, the finding says so.

---

## 1. Executive summary

1. **The page is not one editor; it is three different systems wearing one page title.** Hero is a *marketing-media placement* (`media_marketing_media`, `media.*` grants, one activation gate). The other eleven sections are a *typed section registry* (`homepage_section(_item)`, `marketing.*` + `media.assign/delete`, two activation gates). A third, retired placement pipeline still exists in code and vocabulary. The UI exposes all three under one "Homepage Content Control Center" heading with one generic sentence of explanation.
2. **The single biggest usability defect is the preview.** PROBE 1 proves that when you edit an entry that already exists, the Preview tab renders the **saved** value and silently discards your edit — the exact opposite of what a preview is for. Worse, preview is **gated behind a durable production write**: you must click *“Configure section (initially hidden)”* before any preview exists.
3. **Publishing a section takes four writes and three decisions that the UI never summarises.** `configure (inactive)` → `create entry (inactive)` → `activate entry` → `activate section`. Nothing on screen says how many steps remain, and each step has a different control in a different part of the panel.
4. **The two "Register media" entry points lead to the wrong place.** The header button goes to the **product-only** upload page (`AdminMediaUpload` hard-codes `initialScope=PRODUCT`, `allowScopeChange={false}`). The page that can actually register hero/marketing art is behind *Media → “Advanced: homepage placement art”*.
5. **65 typed slots across 11 sections are presented with raw backend vocabulary.** Slots read `intro`, `women-products`, `lookbook-1`, `everyday-kurtis`, `featured`; copy fields read `eyebrow`, `ctaLabel`, `ctaHref`, `altText`. Capacities are shown as `(1/1 filled — full)`. There is no thumbnail in the entry list, and a media entry without a title displays a **raw asset UUID**.
6. **Two permission vocabularies govern one page.** `marketing.view/manage` for sections, `media.view/upload/assign/delete` for hero. An employee needs **four** grants to add one hero slide. A half-granted account sees a *silently disabled* Activate button with no reason given.
7. **Failure states collapse.** For the eleven sections a 403 (no permission) and a 503 (outage) both render as `Status unavailable`; only the hero distinguishes `Requires media access`. Editors lose typed work on a 409 because the only recovery path is *reload*, which resets the form.
8. **The data model is safer than its UI suggests, and must not be “simplified”.** Revision CAS, inactive-first creation, typed-slot exclusivity, the closed 12-key registry, media-asset referencing (never raw URLs), product publication re-checking and the closed public DTO are all load-bearing. Every recommendation in §7 is chosen to leave them untouched.
9. **Storefront filter chrome can contradict what the admin curated.** PROBE 2 proves a bridal-jewellery product’s `type` is `jewellery`, so the Jewellery Theatre’s *Necklaces / Jhumkas / Rings / Maang Tikka* tabs can never match it, and Bestsellers’ *Sarees* tab can only match a subcategory literally named `sarees`. The curator works correctly; the consumer-side filters are the mismatch.
10. **Almost all of the fixable complexity is frontend-only.** Of the 26 findings below, **22 are removable without touching a route, DTO, table, default, permission or stored row.**

---

## 2. The section registry, verified from the repository

### 2.1 The three "registries" that must agree (they do, today)

| Registry | File | What it controls |
|---|---|---|
| Typed slot registry `REGISTRY` (+ `SECTION_KEYS`, `GROUPS`) | `backend/app/schemas/media/homepage.py:14-34` | Which keys exist, which slots each accepts, capacities, reorder groups, DB check constraint, public DTO literal |
| UI section list `HOMEPAGE_SECTIONS` | `frontend/src/services/homepage/homepageContentModel.js:8-21` | Order, display titles, legacy placement names, `product` flag |
| Storefront order | `frontend/src/components/customer/pages/Home.jsx:17-31` | The rendered sequence (hero + 11 wrapped sections) |

The backend is the authority: `PublicSection.key` is a `Literal[...]` of exactly twelve keys and `HomepageContentPublic.sections` is pinned to `min_length=12, max_length=12`. **Any registry rename, removal or reorder changes the public contract** — this is a hard data-safety boundary (§6).

### 2.2 Verified inventory — twelve sections, 65 typed slots

| # | UI title | `sectionKey` | Legacy `placement` (retired unless hero) | TEXT slots | MEDIA slots | PRODUCT slots (capacity) | Product capacity |
|---|---|---|---|---|---|---|---|
| 1 | Home hero | `hero` | `HOME_HERO` (**live**) | — | 2 asset refs: image + mobile image | — | — |
| 2 | Category collage | `categories` | *(none — no legacy placement)* | 1 (`intro`) | 4 (`women`,`men`,`kids`,`essentials`) | 4 × cap 4 | 16 |
| 3 | Saree lookbook | `sarees` | `SAREE_SECTION` (retired) | 5 (`intro` + 4 collection rows) | 3 (`lookbook-1..3`) | 1 × cap 4 | 4 |
| 4 | Bridal campaign | `bridal` | `BRIDAL_SECTION` (retired) | 1 | 3 (`bride`,`groom`,`couple`) | 2 × cap 4 | 8 |
| 5 | Jewellery theatre | `jewellery` | `JEWELLERY_SECTION` (retired) | 1 | 1 (`campaign`) | 1 × cap 24 | 24 |
| 6 | Promotion banner | `promotion` | `PROMOTION` (retired) | 1 | 1 (`campaign`) | — | 0 |
| 7 | Men’s editorial | `men` | `GROOM_SECTION` (retired) | 5 (`intro` + 4 type rows) | 1 (`campaign`) | 2 (`featured` cap 1, `products` cap 4) | 5 |
| 8 | Kids playground | `kids` | `KIDS_SECTION` (retired) | 4 (`intro` + 3 choice chips) | 3 (`main`,`girls`,`boys`) | 1 × cap 24 | 24 |
| 9 | Bestsellers | `bestsellers` | *(none)* | 1 | **0** | 1 × cap 8 | 8 |
| 10 | Kurti lookbook | `kurtis` | *(none)* | 1 | 4 (mood keys) | 5 × cap 4 | 20 |
| 11 | Newsletter | `newsletter` | *(none)* | 2 (`intro`,`fine-print`) | 1 (`campaign`) | — | 0 |
| 12 | Trust strip | `trust` | *(none)* | 5 (one per assurance) | 0 | — | 0 |

**Totals:** 65 slot definitions — 27 TEXT, 23 MEDIA, 15 PRODUCT (109 product seats). Two synthetic reorder groups exist and are **not** DB slots: `("trust","trust-items","TEXT")` and `("sarees","lookbook","MEDIA")` (`schemas/media/homepage.py:35-38`).

**Verified differences from the brief:** the brief’s names are correct except that the repository spells the hero panel `HOME_HERO — Hero carousel`, the men’s section legacy placement is `GROOM_SECTION` (not `MEN_SECTION`), and the UI titles include a typographic apostrophe in **Men’s editorial**. Section **#1 is the only one on the marketing-media pipeline**; #2–#12 are all on the typed-section pipeline.

---

## 3. Section-by-section audit (all twelve)

Format: purpose → fields → required/optional/conditional → content types → validation → save/reload/preview/activation → API + persistence → authorisation → states → dependencies → saved vs. configured vs. active vs. public.

> **Shared behaviour for #2–#12** (stated once, then only the differences per section): selection writes nothing; the editor loads via `GET /{scope}/homepage/sections/{key}`; the first write must be `PUT …/{key}` with `expectedRevision: 0` (“Configure section (initially hidden)”, native `confirm()`); entries are created with `isActive:false`; each successful write returns the whole section and triggers `hydrateCatalog({force:true})`; any stale revision ⇒ 409 ⇒ save disabled until **Reload section and public content** (which discards the draft); preview requires a configured section and renders **saved** items first (PROBE 1).

### 3.1 Home hero — `hero` / `HOME_HERO`

- **Purpose & storefront representation.** Full-bleed 5-layout carousel (`customer/components/sections/Hero.jsx`) fed by `/home → heroSlides`, built by `explore_service._build_hero_slides_from_db` from **active** `media_marketing_media` rows in `sort_order`. Slide *layout* is not stored: it is applied by index (`HERO_LAYOUT_SEQUENCE`, `heroModel.js`), so adding/reordering slides silently re-assigns layouts.
- **Fields.** `title`, `subtitle`, `ctaLabel`, `ctaHref`, `altText`, plus two asset references (`mediaAssetId`, `mobileMediaAssetId`), `sortOrder`, `isActive`, `placement`. Copy is entered with human labels in this panel (`Title`, `Subtitle`, `CTA label`, `CTA destination`, `Media alt text`) — the only panel that gets this right.
- **Required / optional / conditional.** `objectKey` is required by `MarketingMediaCreate`; the UI derives it from the picked asset. `mediaAssetId` becomes required whenever the *reference changes* (`marketing_media_service.update` → `registered_asset`). `mobileMediaAssetId` is optional and only accepted for `HOME_HERO`; it must resolve to a `hero/`, `marketing/` or `products/` registered asset.
- **Content types.** MEDIA and TEXT are **views over the same row**, not separate records. PRODUCT is not a slot — the tab correctly says *“This section does not accept product placements.”*
- **Validation.** `altText`/copy lengths enforced only by the DB columns (`String(255/500/100)`); `ctaHref` passes `safe_cta` (site-relative only, single slash, no control chars, ≤8 rounds of percent-decoding). **There is no CTA label↔destination pairing rule** for hero (contrast: sections enforce it — see F-13).
- **Save / reload / preview / activation.** Save → `POST`/`PATCH /admin/marketing/media`; success message *“Saved to backend. Reloading authoritative placement; public refresh requested.”*; `Refresh placement` re-reads. **There is no Preview tab for hero at all** — `SectionPreview` short-circuits to *“Hero preview not available in this editor.”* Deactivate/activate is a per-row button; ordering is Move up / Move down per row.
- **API / persistence.** `GET|POST /admin/marketing/media`, `PATCH|DELETE /admin/marketing/media/{id}`, `PUT /admin/marketing/media/reorder` (admin scope); employee equivalents `/employee/homepage/hero/items[|/{id}|/reorder]`. Table `media_marketing_media`; unique `(placement, object_key)`.
- **Authorisation.** Admin: `media.view` to read, `media.upload` to create, `media.assign` to edit/activate/reorder, `media.delete` to remove. Employee: **`marketing.view` + `marketing.manage` + `media.view` + `media.upload`** to create (`employeeHeroRequest` → `hero_access(write=True)` + `media.upload`).
- **States.** Loading (`Loading HOME_HERO from backend…`), error + Retry, empty (*“No saved entries… the backend may return its canonical fallback”*), read-only notice (*“media.assign is required…”*). No dirty indicator on the row, only *“Pending — unsaved changes”* inside the open form; `beforeunload` guard active while dirty.
- **Dependencies.** A hero row renders **from `object_key`, not from the asset row**. Deleting the asset leaves the row pointing at a key that may 404 — write-time validation is not re-applied at read-time (contrast: sections validate through `asset_projection` on every read).
- **Saved ≠ configured ≠ active ≠ public.** Saved = row exists. Active = `is_active` true. Public = row is returned by `/home.heroSlides`, which additionally requires the `marketing_media` read to succeed; **zero active rows ⇒ empty carousel ⇒ `<Hero>` is not mounted at all** (`CustomerHomeHero` returns `null` when `slides.length === 0`). There is no canonical fallback in the current implementation.

### 3.2 Category collage — `categories`

- **Purpose.** Four-tile asymmetric collage (`CategoryCollage.jsx`) — `women`, `men`, `kids`, `essentials`. Each tile = MEDIA art + tile label from `title`, note from `subtitle`, link from `ctaHref`, count from the matching `{slot}-products` list.
- **Fields.** TEXT `intro` (eyebrow/title/subtitle/CTA); MEDIA ×4 (title, subtitle, ctaHref, altText); PRODUCT ×4 (`women-products`… each cap 4).
- **Constraints that matter.** The layout is **four fixed tiles**: a collage with 1–3 tiles configured renders a visibly unbalanced grid with no fallback (the component maps whatever `mediaList()` returns). MEDIA tiles have **no reorder control** — position is the registry index, and the `evidences`/entrance animation is keyed to `women|men|kids|essentials`.
- **Validation.** Slot capacity 1 for TEXT/MEDIA, enforced twice: registry capacity and the partial unique index `uq_homepage_singleton_slot` (`content_type <> 'PRODUCT'`).
- **Public behaviour.** `count` comes from the curated product list length; with no products the tile says *“0 pieces”* — no fallback, no hiding.
- **Unique risk.** The tile **count is derived from curation, not from the catalogue**. An admin who fills art but no products publishes “0 pieces” tiles.

### 3.3 Saree lookbook — `sarees`

- **Purpose.** Editorial lookbook (`SareeLookbook.jsx`): one dominant frame + a scrolling strip of three frames (`lookbook-1..3`), four collection rows (`silk-classics`, `everyday-elegance`, `festive-sarees`, `contemporary-drapes`), and a four-product rail (`products`, cap 4).
- **Fields / constraints.** `intro` title is split on `\n` for the masked line reveal (`LineReveal lines={content.intro.title.split('\n')}`) — **newlines are semantically meaningful here and nowhere documented in the UI**. The strip captions use `title || subtitle`.
- **Ordering.** The **only** section besides trust where MEDIA can be reordered, and it is reordered as one group (`sarees + lookbook + MEDIA`). The endpoint requires **exact current membership**; adding a 4th frame is impossible (cap 3) but the UI offers **only** “Move entry up”.
- **Validation quirks.** `frames[0]` is the dominant plate: if only `lookbook-2` is configured, the main frame is empty and the strip starts at page 2 — a half-configured lookbook looks broken rather than hidden.
- **Public behaviour.** The product rail is intentionally static copy *“Two silks, and the pieces we’d wear with them.”* + *“Complete the drape”* — **hard-coded strings that no field controls**, while the surrounding copy is authored. This is a real content-control gap (an editor cannot change its own section’s sub-headings).

### 3.4 Bridal campaign — `bridal`

- **Purpose.** Dark editorial triptych (`BridalCampaign.jsx`): `bride` (dominant), `couple` (arch inset), `groom` (offset), plus `bride-products` / `groom-products` (cap 4 each) used **only** to print a “From ₹X” line.
- **Fields.** Each MEDIA slot uses eyebrow (kicker) + title (masked headline, `\n`-split) + subtitle + CTA + altText. This is the richest per-media-slot copy contract in the system and the UI presents all six fields identically for every slot of every section.
- **Constraints.** All three media slots are structural: a missing `couple` renders an empty arch figure with a caption but no image; a missing `bride` renders a blank dominant panel. There is no reorder (fixed composition).
- **Dependencies / conditional display.** `From ₹X` appears **only** if the curated product list is non-empty — so the price line is a side-effect of curation, not a field.

### 3.5 Jewellery theatre — `jewellery`

- **Purpose.** Stage + hover-to-inspect product tiles (`JewelleryTheatre.jsx`): one `campaign` image, a 24-seat `products` rail, and five **storefront filter tabs** (`all`, `necklaces`, `jhumkas`, `bangles`, `rings`, `maang-tikka`).
- **The verified mismatch.** The tabs filter on `p.type`, which `toDesignProduct` sets to the **canonical subcategory slug**. PROBE 2 shows a bridal-jewellery product carries `type: 'jewellery'`. Therefore **Necklaces, Jhumkas, Rings and Maang Tikka can never match a canonical product**, and their counters render `0`. Only `bangles` aligns with a canonical subcategory (`bridal/finishing-touches/bangles`). The admin curates correctly; the consumer chrome lies about the inventory.
- **Capacity.** 24 seats is the largest single-slot capacity in the system; with the current one-at-a-time checkbox + save flow, filling it is **24 select→save round-trips** (see F-11).
- **Validation / states.** Same typed rules. The section’s own `intro` CTA doubles as the “all jewellery” tile (`jewel__more`), which is non-obvious: the last tile in the grid is a link whose label comes from the eyebrow CTA.

### 3.6 Promotion banner — `promotion`

- **Purpose.** Editorial campaign spread (`PromoBanner.jsx`) with a hard-coded `06` index chip and one portrait image.
- **Boundary.** Explicitly **editorial only**: the section cannot create a discount, coupon, code or expiry. The editor repeats this twice (page-level banner + editor footer). The **announcement bar is a different system** (`useStorefrontAnnouncements` reads `GET /marketing/placements/PROMOTION`, which is retired and read-only), so the admin cannot change announcement text from anywhere (documented previously as B-06 Option A in `docs/audit/homepage-admin-verification.md`).
- **Constraints.** Exactly 2 slots (1 TEXT + 1 MEDIA). `Deactivate section` removes the banner; there is no scheduling, no date range, no A/B.

### 3.7 Men’s editorial — `men`

- **Purpose.** Editorial head + campaign image with a floating product tag + 4-card grid (`MensEditorial.jsx`).
- **Slots.** `intro`; four **type rows** `kurtas`, `bandhgalas`, `sherwanis`, `accessories` (rendered as `<ul className="men__types">` links); `campaign`; `featured` (cap 1, renders one floating tag over the image); `products` (cap 4).
- **Verified taxonomy mismatch (same class as 3.5).** The canonical men’s subcategories are `kurta-pajama`, `nehru-jackets`, `groom-collection`. Three of the four type-row names (`bandhgalas`, `sherwanis`, `accessories`) do not exist in the canonical taxonomy, so those rows are **pure authored copy**, not catalogue-driven — which is fine, but the slot names imply a taxonomy that does not exist.
- **Constraint.** `featured` is capacity 1: selecting a second product in the UI *replaces* the first (see F-11).

### 3.8 Kids playground — `kids`

- **Purpose.** Playful collage (`main`, `girls`, `boys` rotated tiles) + up to 24 products + three chips (`girls`, `boys`, `festive` TEXT).
- **Constraint.** `main` is the anchor; `girls`/`boys` mini-tiles use `title` as visible label and `ctaHref` as destination — an empty `ctaHref` renders the tile as a `<span>` (image, not clickable) with **no visual affordance that it is inert**.
- **Capacity.** 24 products with no multi-select (F-11) is the worst cost/benefit in the system.

### 3.9 Bestsellers — `bestsellers`

- **Purpose.** 8-seat product rail with six client-side filter tabs and a callout note.
- **Verified mismatch (same class).** `FILTERS = all, women, sarees, men, kids, jewellery` compare against `p.department === filter || p.type === filter`. Since `department` is one of `women|men|kids|jewellery|essentials` (PROBE 2), the **`sarees` tab can only match a subcategory literally named `sarees`** (i.e. `/bridal/the-bride/sarees`), never `women/sarees/banarasi|cotton|silk`. The section also has **no MEDIA slot**, so the MEDIA tab is a dead end (F-32).
- **Honesty.** The section states the backend exposes no sales ranking; the copy “Bestsellers” is therefore a curation label, not a ranking — an important semantic the editor does not surface.
- **Only 1 TEXT + 1 PRODUCT slot** — the simplest section in the system, yet it carries the same four-write publish flow.

### 3.10 Kurti lookbook — `kurtis`

- **Purpose.** Four **mood** tabs; each mood is one MEDIA slot (`everyday-kurtis`, `anarkalis`, `festive-kurtis`, `kurta-sets`) *plus* a same-named PRODUCT list (cap 4) and a `pairings` fill list (cap 4).
- **Why this is the best-designed section.** Moods, imagery and product lists share one key, so the admin’s mental model (“this mood = this art + these pieces”) maps 1:1 onto the data. It is the pattern worth reusing (§7 C).
- **Constraint.** The mood tab label is `title || key` — an untitled mood renders the raw slot key (`everyday-kurtis`) to customers. Mood count is fixed at 4 by the registry; a 5th mood requires a backend change.
- **Storefront behaviour.** `B-15` recovery is implemented: `active` resolves to the first configured mood when the selection is missing (`KurtiLookbook.jsx:20-27`, covered by storefront test *“kurtis: the initial mood is the first CONFIGURED slot”*).

### 3.11 Newsletter — `newsletter`

- **Purpose.** Arch image + copy + email capture + fine print.
- **Boundary.** Subscription is **not connected** (`services/newsletter.js` → `newsletterAvailable()` false; the form renders disabled with *“Newsletter sign-up opens once the subscription service is connected.”*). The editor states this twice.
- **Slots.** `intro`, `fine-print` (rendered as `subtitle || title`), `campaign` image.
- **Constraint.** The fine print is a whole slot for one line of legal copy — the admin must pick `fine-print` in the slot dropdown and type into `subtitle` (not `title`) for it to appear. This is the least discoverable mapping in the system.

### 3.12 Trust strip — `trust`

- **Purpose.** Five assurance items with fixed icons keyed by slot name (`delivery→truck`, `authentic→badge`, `secure→lock`, `returns→returns`, `help→help`).
- **Constraints.** Exactly five slots, one per assurance, each capacity 1. **Slot names are the icon contract**: renaming `delivery` would break the icon mapping at runtime. Ordering is reorderable as one group (`trust-items`), but the icon set is not.
- **No `intro` slot.** `trust` is the only section without an `intro`, so the generic editor shows no heading field — correct, but the UI does not explain why.
- **Public behaviour.** Icon is not a field; there is no way to change an assurance’s icon from the UI.

---

## 4. UI/UX complexity audit

### 4.A Information architecture

**What the page actually puts on screen (top → bottom):** page eyebrow + 44 px serif H1 + description + 0–3 header links → a bordered "Production homepage selection is unchanged…" banner (3 sentences) → an optional amber employee notice → a 2-column grid → a 230 px **section list of 12 buttons**, each with a 2-digit numeral and a status sub-label → the workspace: section H2 + one-line technical subtitle + a `role="status"` pending line → a **3-button content-type switch** → (optional) newsletter notice → the editor panel → inside it: status line `Backend controlled · ready · revision 7` → **Edit/Preview tabs** → Reload button → message/error → entry list → create form → pickers → caveat paragraphs.

| Question | Verdict | Evidence |
|---|---|---|
| Is the purpose obvious? | **Partly.** The H1 says *“Homepage Content Control Center”*; the one useful sentence (*“unconfigured or inactive sections are hidden on the storefront”*) is buried mid-banner. | `AdminMarketingMedia.jsx:80-91` |
| Section list vs. content editor vs. media library vs. product lifecycle — clear? | **No.** Three of the four are separate pages reached by header links, but the links are plain bordered `<Link>` chips that read like tabs; “Register media” goes to the **wrong** page (F-03); and the *legacy* placement concept is still in the section data (`placement: 'SAREE_SECTION'`) with no UI meaning. | `AdminMarketingMedia.jsx:76-80`; `homepageContentModel.js:8-21` |
| Too many navigation levels? | **Three levels of "where am I"** (sidebar → page → 12-item list → 3 type tabs → slot dropdown → entry). The slot dropdown is a *fourth* selection model competing with the type tabs. | `SectionContentEditor.jsx:157` |
| Does the selected section stay visually obvious? | **Weakly.** Only `border-l-2 border-pf-gold-deep` on an *ivory-on-ivory* background, plus `aria-current`. No bold, no fill, no scroll-into-view. At 12 rows the eye has to hunt. | `AdminMarketingMedia.jsx:105-110` |
| Is the total number of controls overwhelming? | **Yes at first use:** 12 nav buttons + 3 type buttons + 1 Reload + 1 Configure/Activate + 2 tabs + per-entry 3–4 buttons + slot `<select>` + 6 copy inputs + picker (search + scope + N tiles + 2 paging buttons) + 3 form buttons ≈ **30–40 interactive elements** for one section. | counts from the two components |

**Structural criticism (DERIVED):** the section list is a **vertical list of 12 rows inside the content column**, not a rail. On `<lg` (`grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]`) it stacks above the workspace, consuming roughly 12 × 56 px ≈ 670 px before the editor begins. On a 390 px phone the operator must scroll past the entire inventory to reach the thing they just clicked.

### 4.B Configuration workflow — measured in interactions

Counted from the actual handlers (`AdminMarketingMedia`, `SectionContentEditor`, `BackendHomeHeroPanel`).

**Task 1 — change the Saree lookbook headline (first time)**
1. Sidebar **Media** → **Homepage Content** 2. Click **Saree lookbook** 3. Click **TEXT** 4. Click **Configure section (initially hidden)** 5. Accept native `confirm()` 6. Wait for save + full reload 7. Open the **Slot** dropdown (5 options) 8. Choose `intro` 9. Type into the field labelled `title` 10. **Save section entry** 11. **Activate entry** 12. **Activate section**
→ **12 actions, 1 native dialog, 4 writes, 3 status reads.** Nothing tells the operator they are 3 of 3 steps from live.

**Task 2 — replace a hero image**
1. Page opens on hero 2. **Edit entry** 3. *(asset picker)* find the new image among 24 tiles, page/search 4. Click it 5. **Save to backend**
→ 5 actions **if the image is already registered**. If not (the normal case for new campaign art): leave the page → **Media** → scroll to *“Advanced: homepage placement art”* → choose namespace → pick file → *Upload and register* → back to Homepage Content → re-find section → re-open entry. **+7 actions and 2 full page navigations.** The header *“Register media”* button cannot help (F-03).

**Task 3 — add a product to Bestsellers**
1. Section 2. **PRODUCT** 3. Configure (first time) 4. Type a query 5. Wait for debounce+server 6. Tick the checkbox 7. **Save section entry** 8. **Activate entry** 9. **Activate section**
→ 9 actions per product, **repeated for each of up to 8**, with **no multi-select** (F-11).

**Task 4 — remove a media entry**
1. **Remove entry** 2. Accept `confirm()` → 2 actions. Compare **Deactivate section** → 1 action, **no** confirmation, immediate storefront impact.

**Task 5 — preview a section before saving**
As implemented: impossible before configuring (F-02), and after configuring the preview shows the **saved** value, not the edit (F-01). The tab is labelled *“Preview — not saved”* while rendering saved content — a **false statement on screen**.

**Task 6 — verify persistence**
1. **Reload section and public content** (banner text: *“Reload and reconcile before another write”*) — this resets the form. There is no “last saved at / by” and no per-entry “saved” timestamp; `updatedAt` exists in the API but is never displayed.

**Task 7 — activate / deactivate a section**
1. **Activate section** (or **Deactivate section**) → 1 write, no confirmation, no preview of the consequence. If any MEDIA entry is active and the actor lacks `media.assign`, the button is **silently disabled** (F-09).

### 4.C Forms and content selection

| Check | Result | Evidence |
|---|---|---|
| Labels describe business meaning | **No** for 6 of 6 copy fields and every slot. Labels are the literal keys `eyebrow`, `title`, `subtitle`, `ctaLabel`, `ctaHref`, `altText`; slots are `intro`, `women-products`, `lookbook-1`, `fine-print`, `trust-items`. Hero alone uses human labels. | `SectionContentEditor.jsx:11,128,157` vs `BackendHomeHeroPanel.jsx:23-26` |
| Helper text useful & concise | **Absent** for every field. The only guidance is 3 paragraphs at the *bottom* of the panel (newsletter/promotion) far from the fields. | `SectionContentEditor.jsx:170-171` |
| Related fields grouped | **No.** All six copy fields are a flat list in key order; `altText` sits beside `eyebrow` although one is decorative metadata and one is a visible kicker. Slot is chosen *above* the copy, asset/product picker *below* the copy. | `:157-161` |
| Conditional fields at the right time | **Partly.** Product fields never appear for PRODUCT (correct: products cannot carry copy). But every MEDIA slot shows all six copy fields, including `altText` for slots that never render it (e.g. `categories` tiles use `altText`, but `sarees` strip captions use `title||subtitle` and ignore `ctaLabel`). | per-section components |
| Selectors show names/thumbnails/identifiers | **Media picker yes** (thumbnail + objectKey + owning product name/SKU + scope filter + server search — genuinely good). **Product picker partly** (image + name + raw `id`, no SKU, no price). **Entry list no** (text only; no thumbnail). | `RegisteredMediaPicker.jsx:70-80`; `PublishedProductPicker.jsx:60-66`; `SectionContentEditor.jsx:128` |
| Raw UUIDs / internal keys exposed | **Yes, three ways:** (a) `row.mediaAssetId` is printed when a media entry has no title; (b) the status line prints `revision 7`; (c) `revision` appears again in the copy of a 409. | `:105,128` |
| Required fields / invalid values explained | **No.** No `required`, no `aria-invalid`, no inline message, no `maxLength` mirroring backend limits (100/255/500/100/500/2000). A 422 arrives as one paragraph above the list. | `:160-166` |
| Selected content obvious | **Partly.** Selected media tiles get a gold border + `aria-pressed`; the selected media asset also prints `Selected: <objectKey> · not saved yet`. Selected product is only a ticked checkbox that may be scrolled off-screen. | `RegisteredMediaPicker.jsx:50` |
| Duplicate / redundant controls | **Yes:** Reload exists twice (page-level “Refresh placement” and editor “Reload section and public content”); newsletter/promotion caveats print twice; `Edit entry` + `Save section entry` + `Cancel entry changes` + `Cancel entry changes` reset semantics overlap with `Reload`. | `:117,121,122,169-170` |

### 4.D Layout and visual consistency

| Aspect | Observation | Evidence |
|---|---|---|
| Spacing rhythm | The page uses `gap-6`; the editor uses `space-y-4`; the form `space-y-3`; pickers `space-y-3` + a nested `grid gap-2`. Four rhythms in one column. | `AdminMarketingMedia.jsx:96`; `SectionContentEditor.jsx:104,147`; `RegisteredMediaPicker.jsx:49` |
| Card proportions / density | Every entry is a `border p-3` **unstyled** block; hero entries are `bg-pf-card p-3` cards in a 2-col grid. The two pipelines therefore look like different products. | `:127-143` vs `BackendHomeHeroPanel.jsx:100-118` |
| Heading hierarchy | H1 (44) → H2 section (24, `font-display`) → `<h3>` inside form (browser default ~18.7 px bold, **not** `font-display`) → `AdminPanel` H2 when hero. The h3 in the form breaks the serif scale. | `SectionContentEditor.jsx:160` |
| Icon alignment / sizing | The page has **no icons at all** except the sidebar; adjacent media screens use `lucide` 13–16 px chips. Buttons here are text-only, so the page reads as a different generation of the design system. | `AdminMarketingMedia.jsx` (no lucide import) vs `AdminMediaLibrary.jsx` |
| Button hierarchy | `const button = 'border border-pf-border px-3 py-2 text-xs'` — **one** class for primary, destructive, toggle and paging. *Save*, *Remove entry*, *Activate section* and *Move entry up* are visually identical. No burgundy primary, no gold focus plate, no danger tone. | `SectionContentEditor.jsx:13`; `BackendHomeHeroPanel.jsx:27` |
| Tabs / badges / borders | Type switch uses `border-pf-burgundy bg-pf-burgundy text-pf-ivory` when active (good) but the Edit/Preview tabs use the **same neutral** class for both states — the selected tab is only distinguishable by `aria-selected`. | `:106-111` |
| Nested cards | `AdminPage` → banner card → grid → editor bordered panel → form block → fieldset → picker fieldset. **5 nested bordered regions**; on mobile they are 5 stacked full-width boxes. | DERIVED |
| Overflow / wrapping | `break-all` is used on `objectKey` and on `Selected:` — a long key will wrap mid-token, which is correct; but `row.title || … || row.mediaAssetId` is **not** `break-all`, so a 36-char UUID in the entry line can force horizontal scrolling in a narrow column. | `:128` (no `break-all`) vs `RegisteredMediaPicker.jsx:50` |
| Empty space / cramped | The 230 px rail is mostly empty for short titles; the workspace column contains 40+ controls in a single 640–900 px measure. | DERIVED |
| Atelier design-system consistency | **Partially compliant.** `AdminPage`/`AdminPanel` are the current generation (radius 14, gold eyebrow rule, 26 px serif). Everything inside the editors is previous-generation: square borders, `text-xs`, no radius, no gold. That is a **visible seam** — the page looks like two products bolted together. | `AdminPanel.jsx` vs `SectionContentEditor.jsx` |

### 4.E Status, feedback and user confidence

| Distinction the operator must make | Can they? | Evidence |
|---|---|---|
| Unsaved vs saved | **Partly.** A text line `{dirty ? 'Pending changes — not saved.' : 'No unsaved entry changes.'}` and a separate page-level line. There is no dirty marker on the entry or the section; the entry list looks identical. | `:105,166` |
| Configured vs incomplete | **No.** The only signals are `state` (`missing/inactive/empty/ready`) and per-row `warning`. “Configured but 1 of 4 tiles” reads `ready` if **any** active row exists. | `homepage_content_service.content()`: `state = 'ready' if active_count else 'empty'` |
| Active vs inactive | **Yes** at section and row level, as `Active`/`Inactive` words and the nav sub-label. But a row can be `Active` while the *section* is inactive — the row list does not say “this row is not yet visible”. | `:128-132` |
| Preview vs live | **No.** The preview is labelled *“Preview — not saved”* but shows saved content (F-01), has no viewport switch, no mobile frame, no “this is the draft” cue. | PROBE 1 |
| Success vs failure | **Mostly yes**, and unusually honest: four distinct messages (`Saved; authoritative content reloaded…`, `Saved; staff reload failed…`, `Saved; public refresh failed…`, `saved… but public refresh incomplete`) plus a separate `Could not confirm save/refresh`. This is the strongest part of the UI. | `:74-80` |
| In progress vs stalled | **Weak.** `busy` swaps one button label to `Saving…`; there is no spinner, no skeleton, and no timeout. A hung request leaves every control disabled with `busy` true. | `:79,164` |
| Recoverable vs needs intervention | **No.** A 422 (fix your input) and a 409 (someone else saved) and a 503 (backend down) all land in one `role="alert"` paragraph; only 409/0 add the reload line. | `:73-75` |

### 4.F Accessibility and responsive usability

| Check | Result | Evidence |
|---|---|---|
| Keyboard reachability | All controls are native `button`/`input`/`select` → reachable. But **the section list is 12 sequential tabbable buttons** and there is no skip link or roving model; reaching the editor by keyboard costs 12–15 tab presses on every visit. | DERIVED |
| Visible focus | **Yes** and well done globally: `.pf-staff :focus-visible { outline: 2px solid var(--color-pf-gold-text); … box-shadow … }`, with a gold variant on burgundy. | `index.css` `.pf-staff :focus-visible` |
| Tab semantics | **Incorrect.** `role="tablist"` + `role="tab"` + `aria-selected` with **no** `aria-controls`, no `role="tabpanel"`, no `id`s, and no ArrowLeft/Right handling → screen readers announce a tab list that does not behave like one. | `SectionContentEditor.jsx:106-111` |
| `aria-pressed` on type switch | Correct for toggle buttons (`role="group"` + `aria-pressed`). | `AdminMarketingMedia.jsx:113-115` |
| Names on icon-only controls | None present (no icon-only controls here). | — |
| Section nav semantics | `aria-current="true"` on a `<button>` — permitted, but the *state* is only colour. No `aria-describedby` linking the status sub-label. | `:107` |
| Contrast | Text tokens are the accessible ones (`--color-pf-muted #6F5D52` = 5.97:1 card; `--color-pf-gold-text #865E20` = 5.52:1; pale gold reserved for decoration). **But** the page uses `text-pf-muted` for 10–11 px status text and `border-pf-border` (#EDE4D8) for *structural* boundaries — the token file explicitly says `pf-border` is decorative-only and `pf-border-strong` is for inputs. Inputs here use the decorative one. | `index.css` token comments; `SectionContentEditor.jsx:160` |
| Form errors | Not associated with fields (`aria-describedby` absent), not announced per field, no `aria-invalid`. | `:166` |
| Modal / confirm focus handling | No modal exists. Destructive confirmations are **native `window.confirm`** (3 call sites) — accessible but unstyled, blocking and non-themeable. | `:111,122,134`; `BackendHomeHeroPanel.jsx:44,113` |
| Responsive | Rail stacks above the workspace at `<lg` (F-17); the 2-col hero card grid becomes 1-col (`lg:grid-cols-2`) — fine; the media picker grid is `grid-cols-2 md:grid-cols-3` inside an already-narrow column → **~150 px tiles at 768 px**, i.e. thumbnails too small to identify art. | DERIVED, `RegisteredMediaPicker.jsx:71` |
| Browser verification | **NOT PERFORMED.** No browser binary exists in this sandbox (see §0.4). No viewport claim in this report is a browser observation. | — |

---

## 5. Component and code complexity audit

### 5.1 Ownership map

| Responsibility | File(s) | Assessment |
|---|---|---|
| Section registry (UI order/titles) | `services/homepage/homepageContentModel.js:8-21` | Duplicates backend `REGISTRY` **keys and order**; no automated check ties the two together except a mocked test. |
| Selected section + type + pending gate + nav status | `pages/admin/media/AdminMarketingMedia.jsx:30-115` | Cohesive but overloaded: auth, actor selection, two status fetches, label derivation, layout and the pipeline switch all in one 121-line component. |
| Non-hero configuration/persistence | `components/admin/homepage/SectionContentEditor.jsx` | **The densest component in the system:** load, CAS, dirty, unload guard, slot occupancy, capacity, permission gating, create/edit/delete/activate/reorder, error/reload recovery, preview host and the whole form — 171 lines, ~20 state hooks. |
| Hero configuration/persistence | `components/admin/BackendHomeHeroPanel.jsx` | A **near-duplicate** of the above for a different API (own `busyRef`, `generation`, `mounted`, `discard`, message object). Same concepts, different code. |
| Media selection | `RegisteredMediaPicker.jsx` | Clean, focused, the best component on the page. |
| Product selection | `PublishedProductPicker.jsx` | Accepts two roles (inspection panel vs. editor picker) via `onSelect ? … : …`; the dual mode is the root of F-11/F-24. |
| Preview | `SectionPreview.jsx` + `PreviewErrorBoundary.jsx` | Reuses real storefront components (excellent) but merges draft **after** saved items, which the adapter then ignores (F-01); fabricates art for empty slots (F-12). |
| Client model / orchestration | `homepageContentModel.js`, `homepageContentService.js`, `homepageApi.js` | Well-factored; the only leak is `staffHomepageAccess` mixing two permission vocabularies. |
| Storefront consumption | `customer/pages/Home.jsx`, 12 section components, `HomepageSection.jsx`, `homepageSectionModel.js` | The `HomepageSection` boundary (hidden/loading/unavailable/configured) is genuinely good design and is what makes a draft-preview rewrite cheap. |
| Backend | `homepage_content_service.py` (606 L) + `marketing_media_service.py` (353 L) | Two services for one page; `content()` is the single read path for *both* the list and one section (`get()` → `content()`). |

### 5.2 Where the complexity actually comes from

| Cause | Verdict | Concrete evidence |
|---|---|---|
| **Duplicated implementations** | **Major.** Two editors (sections vs hero) implement load/dirty/CAS/confirm/message independently; two pickers implement debounce+page+state independently; two status fetches in the page. | `SectionContentEditor.jsx` vs `BackendHomeHeroPanel.jsx`; `RegisteredMediaPicker.jsx` vs `PublishedProductPicker.jsx` |
| **Inconsistent interaction patterns** | **Major.** Copy labels human (hero) vs raw keys (sections); confirmation on entry removal but not section deactivation; `role="tab"` for one tab strip and `aria-pressed` for another; two different success-message grammars. | §4.C, §4.D |
| **Overloaded components** | **Yes.** `SectionContentEditor` holds ~20 `useState`s and 7 responsibilities. | `:30-40` |
| **Unclear common vs section-specific split** | **Major.** Everything is generic; the only section-specific code is a `group` expression (`trust-items` / `lookbook`) and **two hard-coded caveat paragraphs**. Section differences (which slots are structural, which labels are visible) live in the **storefront components**, not in the editor. | `:136,169-170` |
| **Unnecessary state / indirect flow** | **Moderate.** `type` lives in the parent while `slot`/`draft` live in the child, and the parent remounts the child via `key={`${section.id}-${type}`}` — so the "one editor" is really 3–36 mounted instances with no continuity. | `AdminMarketingMedia.jsx:118` |
| **Confusing naming / leaky abstraction** | **Major.** `placement`, `sectionKey`, `slotKey`, `contentType`, `group`, `revision`, `state`, `configured`, `isActive`, `expectedRevision` are all exposed to the operator. `HOMEPAGE_SECTIONS[].live` exists and is **only true for hero**, implying the other 11 are not live (they are) — the field is now unused by the nav but still feeds the model. | `homepageContentModel.js:9` |
| **Backend-contract limits** | **Real but small.** (a) Product entries are one-per-row, so capacity 24 means 24 rows; (b) §3's slot taxonomy vs. storefront filter vocabularies; (c) `get(key)` rebuilds all sections; (d) hero is a separate pipeline. **None of these require a schema change to fix the UX.** | §3, F-27 |

### 5.3 Is a new architecture needed?

**No.** The frozen contracts (registry, CAS, typed slots, asset IDs, publication re-check, public DTO) are correct and already covered by tests. The verified complexity is concentrated in **presentation, labels, preview composition and publish state**, all of which sit in **four frontend files**. A rewrite would put §6's guarantees at risk for no functional gain.

---

## 6. Data integrity, security and regression risks

### 6.1 What must not change (per proposed simplification)

| Invariant | Where it lives | Must stay identical because |
|---|---|---|
| The 12 section keys, their **order**, and their exact spelling | `REGISTRY`, `SECTION_KEYS`, `ck_homepage_section_key`, `PublicSection.key` Literal, `HOMEPAGE_SECTIONS`, `Home.jsx` order | Order drives `sort_order` on create (`REGISTRY[key].index(spec)`), the storefront sequence, and a 12-exactly public DTO. A rename is a migration **and** an API break. |
| Slot keys and capacities | `REGISTRY` values, `uq_homepage_singleton_slot`, `ck_homepage_item_type` | Stored rows reference `slot_key`; a rename orphans them (they would surface as `warning: invalid_slot`). |
| The two synthetic reorder groups (`trust-items`, `lookbook`) | `GROUPS` + `SectionContentEditor` `group` expression | The reorder endpoint validates **exact membership**; changing the group name would 409 every reorder. |
| Legacy `placement` vocabulary (13 values, 12 retired) | `MARKETING_PLACEMENT_VALUES`, `RETIRED_PLACEMENTS` | `_validate_placement` runs on **reads** too (`GET /marketing/placements/{placement}`); pruning values turns working public reads into 422s and would strand stored rows. |
| Revision CAS (`expectedRevision`, 409, no auto-retry) | `homepage_content_service.write`, `SectionContentEditor.run` | Removing or batching it would silently overwrite another operator's work. |
| Inactive-first creation | `ItemCreate.is_active` default false; UI sends `isActive:false` | Prevents half-authored content from being visible. |
| Media reference = **asset id**, never a URL | `ItemFields.media_asset_id`, `registered_asset`, `asset_projection` | The only thing that guarantees a published slot points at a verified, existing, image object. |
| Product reference re-checked on **read** | `ProductService.homepage_products_by_ids` inside `content()` | An unpublished/archived product disappears from the storefront without touching homepage rows. **Do not “cache” this away.** |
| Section-level media grant on activation | `check_media_grant` in `configure`/`create`/`patch`/`delete`/`reorder` | Prevents a copy-only editor from exposing someone else's media. Keep the disabled-state mirror — but **explain** it (F-09). |
| Public DTO shape | `PublicMedia`, `PublicItem`, `PublicSection`, `HomepageContentPublic` | `status: Literal["uploaded"]` and the 12-section length are contract, not UI. |
| `media_asset_id` deletion semantics | `homepage_section_item` FK `ON DELETE CASCADE` vs `media_marketing_media` FK `ON DELETE SET NULL` | **Different by design today** — see F-19. Do not “harmonise” either way without a data decision. |
| Existing media references and product IDs | all rows | No proposed change touches rows; **no migration is proposed in this audit at all.** |
| Product approval/publishing | `product_service` lifecycle | The homepage never writes product state; keep it that way. |
| Employee-assignment and media-upload authorization fixes | `media.py::_require_employee_product_assignment`, `_require_employee_media_write` | Explicitly out of scope for any homepage change; §7 touches no media route. |

### 6.2 Purely presentational vs. behaviour-altering

| Change class | Examples in §7 | Touches persistence? |
|---|---|---|
| **Presentational only** (safe) | Business slot labels, field labels + helper text, per-field errors, thumbnails in the entry list, a sticky action bar, focus ring tokens, responsive rail, `role="tab"` fixes | No |
| **Frontend behaviour, no contract change** | Draft-merge preview, preview before configure, publish-step summary, multi-select product staging, reorder down, explain disabled controls, differentiate 403/503 | No — still the same requests |
| **Would alter behaviour/persistence — NOT proposed** | Bulk “publish section” endpoint, slot renaming, dropping the configure step, merging hero into the section pipeline, auto-creating missing media slots, silent default-inheritance for unconfigured sections | Yes |

---

## 7. Findings register

Severity: **Critical** = blocks or corrupts the task; **High** = causes wrong/unsafe configuration or lost work; **Medium** = significant friction or misleading state; **Low** = polish/consistency.

### 7.1 Confirmed defects (SOURCE / EXECUTED / PROBE)

#### F-01 · Preview shows saved content, not the operator’s edit
- **Severity:** High · **Category:** Functional (preview honesty) · **Sections:** all 11 non-hero
- **Files:** `components/admin/homepage/SectionPreview.jsx:88-141` (`buildSyntheticSection` pushes `section.items` first, then `draft`), `components/storefront/home/homepageSectionModel.js:29-33` (`text()`/`media()` take `[0]`)
- **Current behaviour:** editing an entry that already exists renders the **saved** value; the draft the operator is looking at in the form is discarded by the `[0]` selector. The panel still prints *“Preview — not saved”*.
- **Why it is wrong:** the preview asserts a state that is the opposite of the truth; an operator will approve copy they cannot see.
- **Evidence (PROBE 1):** `contains OLD SAVED HEADING: true` / `contains EDITED DRAFT HEADING: false`.
- **Recommendation:** build the preview from a **draft-merged item array** — replace the edited item by `id` (or append with `isActive:true` for a new one) *before* passing to `adaptHomepageSection`. Keep the real storefront components.
- **Frontend-only?** **Yes.**
- **Regression risk:** low; the adapter is shared with the storefront and must not be modified — compose a synthetic array instead (as `buildSyntheticSection` already does).

#### F-02 · Preview is gated behind a durable production write
- **Severity:** High · **Category:** UX (workflow) · **Sections:** all 11
- **Files:** `SectionContentEditor.jsx:107-121` (`if (!section?.configured) return 'Preview — not saved · Hidden until configured'`), `:122-124` (Configure button is the only path)
- **Current behaviour:** to see any preview the operator must first `PUT` a real `homepage_section` row. Preview therefore changes production state.
- **Why it is wrong:** “look before you leap” is inverted; a preview action must be read-only.
- **Recommendation:** render `SectionPreview` for unconfigured sections using a purely local synthetic section (`configured:true, state:'ready'`), with a banner *“Preview of unsaved content — this section is not configured yet”*. No request.
- **Frontend-only?** **Yes.**
- **Regression risk:** none to persistence; keep the existing configured path as-is.

#### F-03 · “Register media” leads to the product-only uploader
- **Severity:** High · **Category:** UX (dead-end navigation) · **Sections:** hero + every MEDIA slot
- **Files:** `AdminMarketingMedia.jsx:78` (`to={`${prefix}/media/upload`}`), `AdminMediaUpload.jsx:30-36` (`initialScope={MEDIA_SCOPES.PRODUCT} allowScopeChange={false}`), placement registration actually lives in `AdminMediaLibrary.jsx:132-156` → `PlacementAssetPanel.jsx`
- **Current behaviour:** the button an operator presses when art is missing opens a page that **cannot** register hero/marketing art; the real control is behind a disclosure labelled *“Advanced: homepage placement art”* on a different page.
- **Recommendation:** point the button at the placement panel (`/media#placement-art`, expanded) or **embed upload+register inline** in the MEDIA tab (the panel is 168 lines and already does both).
- **Frontend-only?** **Yes** (uses existing `POST /media/objects` + `POST /media/register-placement`).
- **Regression risk:** none; both endpoints and permissions already exist.

#### F-04 · Hero has no preview at all
- **Severity:** High · **Category:** UX · **Sections:** hero
- **Files:** `SectionPreview.jsx:144` (`if (sectionKey === 'hero') return <p>Hero preview not available in this editor.</p>`); hero renders `BackendHomeHeroPanel`, which has no Preview tab
- **Why it matters:** the hero is the most visually sensitive section (5 layouts assigned by index, scrims, focal points) and the only one with zero visual feedback.
- **Recommendation:** mount the real `Hero` component with `slides` derived from the in-flight rows (reuse `customerHomeHeroSlides`). `Hero` is already render-safe under `MemoryRouter` (storefront tests cover it).
- **Frontend-only?** **Yes.**
- **Regression risk:** low; must pass `MotionConfig reducedMotion="always"` like `SectionPreview` already does.

#### F-05 · A 403 and a 503 look identical for the 11 sections
- **Severity:** Medium · **Category:** UX (status) · **Sections:** #2–#12
- **Files:** `homepageContentModel.js:24-31` (`sectionStatusLabel(undefined) → 'Status unavailable'`), `AdminMarketingMedia.jsx:56-70` (`next.sections = list.ok ? … : null`), contrast hero `:61-63` which maps `403 → 'Requires media access'`
- **Current behaviour:** `!statuses.sections` ⇒ every section reads `Status unavailable`, whether the actor lacks `marketing.view` or the backend is down.
- **Recommendation:** keep the HTTP status from `homepageRequest` and render three labels: `Requires marketing.view` (403) · `Status unavailable, retry` (5xx/0) · the real state.
- **Frontend-only?** **Yes.**
- **Regression risk:** low; `handleError` already returns `status` (`apiClient.js:137-147`).

#### F-06 · Entry list prints raw asset UUIDs and has no thumbnail
- **Severity:** Medium · **Category:** UX (content selection) · **Sections:** #2–#12 MEDIA
- **Files:** `SectionContentEditor.jsx:128`
- **Current behaviour:** `{row.slotKey} · {row.title || row.product?.name || row.productId || row.mediaAssetId} · {row.isActive ? 'Active' : 'Inactive'}` — an untitled media entry shows a 36-char UUID in a non-`break-all` line (risk of horizontal overflow), and the art itself is invisible in the list.
- **Recommendation:** entry card = 56×56 thumbnail (from `row.media.url`, already in the read payload) + business slot label + title (or *“Untitled media entry”*) + `Active/Inactive` chip + overflow menu.
- **Frontend-only?** **Yes.**
- **Regression risk:** none.

#### F-07 · Duplicated, near-identical editors
- **Severity:** Medium · **Category:** Functional/complexity · **Sections:** hero vs all
- **Files:** `SectionContentEditor.jsx` (171 L) and `BackendHomeHeroPanel.jsx` (167 L); both implement load/dirty/busy/confirm/`beforeunload`/save+reload messages.
- **Why it is risky:** the two have **already drifted**: hero distinguishes 403, sections do not; hero labels copy in words, sections use keys; hero confirms on discard, sections rely on `beforeunload` only.
- **Recommendation:** extract *presentation-only* shared primitives — `EntryRow`, `DirtyBanner`, `SaveBar`, `copyField` labels — and let each panel keep its own transport. Do **not** unify the services.
- **Frontend-only?** **Yes.**
- **Regression risk:** medium — both panels are covered by `homepageContentControl.test.js` + `homepagePersistence.test.js` (14 tests) + `homepageAllSections.test.js`; keep those green.

#### F-08 · Six raw camelCase labels, no helper text, no length limits
- **Severity:** Medium · **Category:** UX (forms) · **Sections:** #2–#12
- **Files:** `SectionContentEditor.jsx:11,160`
- **Current behaviour:** `<label>{field}<input/></label>` for `eyebrow|title|subtitle|ctaLabel|ctaHref|altText`; no `maxLength` although the backend enforces 100/255/500/100/500/2000.
- **Recommendation:** a single `COPY_FIELDS` descriptor map — `{ key, label, help, maxLength, multiline }` — e.g. `eyebrow → “Kicker (small label above the title)” · 100`, `altText → “Image description for screen readers” · 2000`, `ctaHref → “Link target — must start with /” · 500`; `subtitle` becomes a `<textarea>`. Live counter at 80 % of the limit.
- **Frontend-only?** **Yes** (lengths are already in `schemas/media/homepage.py:76-82`; mirroring them is safe because the server still validates).
- **Regression risk:** low; `homepageAllSections.test.js` locates fields by label text (`fill(tree,'title',…)`) — either keep the `title` label or update that helper.

#### F-09 · “Activate section” is silently disabled by a media rule
- **Severity:** Medium · **Category:** UX (permission clarity) · **Sections:** #2–#12 with active MEDIA
- **Files:** `SectionContentEditor.jsx:125` (`… || (!section.isActive && section.items.some(r => r.contentType==='MEDIA' && r.isActive) && !access.mediaAssign)`)
- **Why it is confusing:** the button simply does nothing and no text explains the precondition; the server would enforce the same rule, so the UI is right to disable it — but silently.
- **Recommendation:** replace with an inline explanation + a disabled button with `aria-describedby`: *“This section has an active media entry. Activating it needs media.assign (ask an administrator).”*
- **Frontend-only?** **Yes.**
- **Regression risk:** none (same gate, same request).

#### F-10 · Four writes and three implicit decisions to publish one section
- **Severity:** High · **Category:** UX (workflow) · **Sections:** #2–#12
- **Files:** `:122` (configure), `:149-155` (create inactive), `:132` (activate entry), `:125` (activate section); backend mirrors the gates (`homepage_content_service.write`)
- **Why it is wrong:** the operator is never told “you are 2 of 3 steps from live”, and each step is a differently named button in a different region.
- **Recommendation:** add a **publish summary** derived from the section payload (no new API): `Draft · 2 entries, 1 active · section inactive` + `Publish` (runs the existing activate calls **in sequence in the current order**) and a checklist `① Set the 4 collage tiles ② Activate entries ③ Activate section`. Keep every underlying call identical.
- **Frontend-only?** **Yes** — this is sequencing of existing requests, not a new contract.
- **Regression risk:** medium — 3 sequential writes must respect the revision returned by each response; the current code already replaces `section` with each response, so a chained helper must do the same and stop on the first failure.

#### F-11 · Product picker is a single-select disguised as multi-select; capacity 24 = 24 round-trips
- **Severity:** High · **Category:** Functional/UX · **Sections:** jewellery (24), kids (24), kurtis (5×4), categories (4×4), bestsellers (8)
- **Files:** `PublishedProductPicker.jsx:60-64` (`onChange={e => onSelect ? onSelect(e.target.checked ? product : null) : …}`); `SectionContentEditor.jsx:162`
- **Current behaviour:** the grid renders checkboxes, so the natural reading is multi-select; ticking a second product **replaces** the first selection because the parent stores one `product`. Each save stores **one** row.
- **Recommendation (two-tier, both frontend-only):**
  1. **Stage many, save once**: let the picker hold a set and have the editor create N entries sequentially (each with the revision returned by the previous) behind one *“Add 6 products”* button.
  2. While staging, label the control *“Selected 6 · will be added as 6 entries”* and disable already-used products (duplicate assignment is a server 409 today).
- **Frontend-only?** **Yes** for (1) as a client-side loop. **Backend change** only if a true bulk endpoint is wanted (not recommended now).
- **Regression risk:** medium — must stop on the first 409 and report exactly which products saved; the existing CAS prevents silent partial states but the operator needs the list.

#### F-12 · Preview fabricates art for empty media slots
- **Severity:** Medium · **Category:** Functional (honesty) · **Sections:** categories, sarees, bridal, jewellery, promotion, men, kids, kurtis, newsletter
- **Files:** `SectionPreview.jsx:106-130` (`requiredMediaSlots` loop pushes the **same** `url` into every missing slot)
- **Why it is wrong:** a 1-of-4 collage previews as a complete 4-tile collage using one image four times; the operator cannot see that 3 tiles are missing.
- **Recommendation:** render missing slots as a labelled placeholder (*“Women tile — no image chosen”*) instead of duplicating the chosen one; add a per-section “structural slots” list (already implied by the storefront components) and show `2 of 4 tiles set`.
- **Frontend-only?** **Yes.**
- **Regression risk:** none.

#### F-13 · Hero accepts a CTA label with no destination and then silently hides it
- **Severity:** Medium · **Category:** Functional (silent data loss) · **Sections:** hero
- **Files:** `schemas/media/homepage.py:127-133` (`HeroCopyDTO` has **no** pairing validator) vs `:104-108` (`validate_shape` enforces the pair for sections); storefront `heroModel.js::readCta` requires both label **and** href.
- **Current behaviour:** saving `ctaLabel: "Shop Now"` with an empty `ctaHref` succeeds; `/home` returns the label; `readCta` discards it; the button never renders. The admin believes a CTA exists.
- **Recommendation:** mirror the section rule in the **admin form only** (client-side `safeCtaHref` + pairing) and show a note; do **not** add a backend validator without a data decision, because existing rows may already hold orphan labels.
- **Frontend-only?** **Yes** (validation only).
- **Regression risk:** low; a stored orphan label stays readable.

#### F-14 · Errors are a single paragraph, unrelated to the field that caused them
- **Severity:** Medium · **Category:** UX (validation) · **Sections:** #2–#12
- **Files:** `SectionContentEditor.jsx:73-75,166`
- **Evidence of the real messages:** `“Text requires meaningful copy”`, `“CTA label and destination must be supplied together”`, `“CTA must be a safe single-slash site-relative URL”`, `“Slot capacity or duplicate assignment conflict.”`, `“Content changed. Reload and reconcile before retrying.”` — all rendered identically in one `role="alert"`.
- **Recommendation:** map the server's `code`/message to the field where possible (a small `{ code → field }` table) and otherwise show it **inside** the form, not above the list. Pre-validate the two deterministic rules (CTA pair, site-relative) before submitting.
- **Frontend-only?** **Yes.**
- **Regression risk:** low; the server remains authoritative.

#### F-15 · A 409 forces a reload that discards the operator’s work
- **Severity:** Medium · **Category:** Functional (lost work) · **Sections:** #2–#12
- **Files:** `:73-75` (`setNeedsReload(true)`; save disabled), `:81-86` (`reload()` → `reset()` → `load()`), `:120` (*“Reload and reconcile before another write”*)
- **Why it is wrong:** the conflict is another operator’s save; the local draft is *still valid copy*. The UI offers only “throw it away”.
- **Recommendation:** keep the draft, show *“Someone saved this section (revision 7 → 9). Your text is preserved below — review, then Re-apply.”* Re-apply = re-read the section, then let the operator submit the same draft against the new revision (one explicit click, never automatic).
- **Frontend-only?** **Yes.**
- **Regression risk:** medium — must never auto-retry a write (the current “no automatic retry” guarantee is correct; keep it).

#### F-16 · Reorder exists for 3 of 15 groups and can cost 23 clicks
- **Severity:** Medium · **Category:** UX (ordering) · **Sections:** trust, sarees MEDIA, all PRODUCT
- **Files:** `:135-143` (only `trust-items`, `lookbook`, PRODUCT); one `PUT /reorder` **per click**
- **Why it is confusing:** “Move entry up” appears and disappears between tabs with no explanation; categories MEDIA and kurtis MEDIA have no reorder even though the storefront renders them in `sort_order`.
- **Recommendation:** show the control consistently where the server supports it, add “Move down”, and batch a drag/keyboard move into **one** reorder call after the operator finishes (debounced), not per step.
- **Frontend-only?** **Yes** (one call per completed reorder, same payload).
- **Regression risk:** low; payload shape unchanged; the server requires exact membership, which a client-side list already satisfies.

#### F-17 · Mobile: the 12-row rail stacks above the workspace
- **Severity:** Medium · **Category:** Accessibility/responsive · **Sections:** page-level
- **Files:** `AdminMarketingMedia.jsx:96` (`grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]`)
- **Evidence:** **DERIVED**, not browser-verified. 12 rows × (`py-3` + 2 text lines ≈ 56 px) ≈ 670 px before the section header, inside a `main` that already carries `px-4 py-6`.
- **Recommendation:** at `<lg`, render the rail as a horizontally scrollable chip strip (or a `<select>` “Section: …”) above the workspace.
- **Frontend-only?** **Yes.**
- **Regression risk:** low; keep the 12 buttons in DOM order for the existing order assertion.

#### F-18 · A disabled picker also disables its Retry (dead-end error state)
- **Severity:** Medium · **Category:** Accessibility/UX · **Sections:** MEDIA everywhere
- **Files:** `RegisteredMediaPicker.jsx:37` (`<fieldset disabled={disabled}>`) with `disabled={busy || !access.mediaView}` from `SectionContentEditor.jsx:161`
- **Current behaviour:** with no `media.view`, the mount request fails and the *Retry media library* button is inside the disabled fieldset → unreachable.
- **Recommendation:** disable only the tiles, keep search/retry/scope live, and render an explicit `Requires media.view` message instead of an error+dead retry.
- **Frontend-only?** **Yes.**

#### F-19 · Three different deletion behaviours across the two pipelines
- **Severity:** Low · **Category:** Data safety (documentation) · **Sections:** hero vs #2–#12
- **Files:** `models/media/homepage_section.py:27` (`media_asset_id … ON DELETE CASCADE`), `models/media/marketing_media.py:57,66` (`ON DELETE SET NULL`), `explore_service._build_hero_slides_from_db` (renders from `row.object_key`)
- **Why it matters:** deleting one media asset silently deletes every section entry that references it, but leaves hero rows pointing at a key that may 404. Nothing in the UI warns about either.
- **Recommendation:** do **not** change the FKs in this phase. Document the behaviour where an operator will read it (`Remove entry` copy already says the object is not deleted — add the inverse note on the media library delete: *“This will remove N homepage entries that use it”* — needs a count query, so propose it as a **separate, reviewed** change).
- **Frontend-only?** **No** for the count; **yes** for the static warning copy.

#### F-20 · Two status requests and two permission models on one page load
- **Severity:** Low · **Category:** Performance/UX · **Sections:** page-level
- **Files:** `AdminMarketingMedia.jsx:40-59` → `homepageRequest('/sections')` **and** `loadHomepagePlacement('HOME_HERO')`; then `SectionContentEditor` → `readHomepageSection`
- **Cost:** `GET /sections` and `GET /sections/{key}` each call `content()`, which loads **every** section, **every** item, all referenced products and runs an `object_exists` storage check per asset (cached only on the public path). First paint therefore performs 2 full builds + N storage HEADs.
- **Recommendation:** derive the selected section from the already-loaded list response instead of a second `GET /sections/{key}` (the list payload contains identical section objects). Pure frontend; removes one full build per section click.
- **Frontend-only?** **Yes** (optional; a `?keys=` filter would be the backend variant — **not** proposed here).
- **Regression risk:** low; the editor must still refresh after writes (keep `load()` for that path).

#### F-21 · `HOMEPAGE_SECTIONS[].live` still implies only the hero is live
- **Severity:** Low · **Category:** Functional (stale model) · **Sections:** all
- **Files:** `homepageContentModel.js:9` (`live: true` on hero only; no other entry sets it)
- **Why it matters:** the field is unused by the nav (which now derives statuses from HTTP) but is exported and read by tests/consumers; a future reader will conclude the 11 sections are not live.
- **Recommendation:** delete the field or rename it to `pipeline: 'marketing' | 'sections'` (purely a model cleanup).
- **Frontend-only?** **Yes.**
- **Regression risk:** low — grep shows no UI consumer.

#### F-22 · Newsletter/promotion caveats appear twice and after the form
- **Severity:** Low · **Category:** UX (copy placement) · **Sections:** newsletter, promotion
- **Files:** `AdminMarketingMedia.jsx:116` + `SectionContentEditor.jsx:169-170`
- **Recommendation:** one caveat, placed **above** the fields it constrains, in the section header area.
- **Frontend-only?** **Yes.** **Regression risk:** none.

#### F-23 · Type tabs can be dead ends, revealed only after a write
- **Severity:** Medium · **Category:** UX · **Sections:** bestsellers (MEDIA), trust (MEDIA/PRODUCT), promotion (PRODUCT), newsletter (PRODUCT)
- **Files:** `SectionContentEditor.jsx:126` — the *“No {type} slot is registered for this section.”* message lives **inside** the configured branch
- **Why it is wrong:** an operator can press CONFIGURE (a real write) solely to discover the tab has no slots.
- **Recommendation:** compute availability from `section.allowedSlots` (already present for unconfigured sections) and disable+label the type button `MEDIA · none` before any write; keep the message for the configured case.
- **Frontend-only?** **Yes.**
- **Regression risk:** low; `homepageAllSections.test.js` asserts the message after `ensureConfigured` — the existing assertion still passes if the message remains.

#### F-24 · One button style for every intent, and two design generations in one panel
- **Severity:** Low · **Category:** Visual · **Sections:** all
- **Files:** `SectionContentEditor.jsx:13` and `BackendHomeHeroPanel.jsx:27` (`border border-pf-border px-3 py-2 text-xs`) vs `AdminPanel`'s 14 px radius + gold rule + `AtelierButton` used elsewhere on Media screens
- **Recommendation:** three explicit variants from the existing system — primary = `bg-pf-burgundy text-pf-ivory` (as `AdminMediaUpload` already does), secondary = `border-pf-border-strong`, destructive = `text-pf-error border-pf-error/40`; wrap the editor in `AdminPanel` so the panel chrome matches the rest of the portal.
- **Frontend-only?** **Yes.** **Regression risk:** none.

#### F-25 · Structural boundaries use the decorative border token
- **Severity:** Low · **Category:** Accessibility (visual) · **Sections:** all
- **Files:** all editor `border border-pf-border` on inputs and pickers; `index.css` defines `--color-pf-border-strong #A68A68` (3.11:1) precisely for inputs/active plates
- **Recommendation:** inputs/selects/fieldsets → `border-pf-border-strong`; keep `pf-border` for hairlines. Matches the documented token intent.
- **Frontend-only?** **Yes.**

#### F-26 · Two pre-existing red tests reduce trust in the suite
- **Severity:** Low · **Category:** Data safety (verification) · **Sections:** —
- **Evidence (EXECUTED):** backend `test_homepage_content.py::test_migration_graph_one_new_head` — **1 failed, 100 passed** — asserts the single head is `p3hp20261016a`, but the migration graph now ends at `w3b4c5d6e7f8` (`add_mobile_asset_to_marketing_hero`). Frontend `homepageContentControl.test.js:136` fails on the absent `home-page/` reference directory (`117 tests, 116 pass`).
- **Why it matters:** both failures are unrelated to behaviour but they mask a *real* future regression in the same file.
- **Recommendation:** update the head assertion to the actual single head and make the reference-inventory test skip clearly when `home-page/` is absent. **Test-only change, separate batch.**
- **Frontend-only?** Mixed (one backend test, one frontend test). **No product behaviour changes.**

### 7.2 Storefront findings that originate in what the admin configures

#### F-27 · Storefront filter vocabulary does not match the curated products’ taxonomy
- **Severity:** High · **Category:** Functional · **Sections:** jewellery, bestsellers, (men’s type rows)
- **Files:** `customer/components/sections/JewelleryTheatre.jsx:24,74-84` + `customer/mock/data/content.js:jewelleryTypes` vs `customer/mock/data/products.js:departmentFor/type`; `Bestsellers.jsx:17-24,49-58`
- **Evidence (PROBE 2):** a canonical bridal-jewellery product maps to `{ department:'jewellery', type:'jewellery' }`; a `women/sarees/banarasi` saree maps to `{ department:'women', type:'banarasi' }`.
- **Consequence:** Jewellery’s *Necklaces / Jhumkas / Rings / Maang Tikka* tabs can never match; Bestsellers’ *Sarees* tab can only match the subcategory literally named `sarees`.
- **Recommendation:** derive the filter vocabulary from the products actually curated into the section (`content.products(...)` → distinct `type`), or map the tabs through the existing `DESIGN_ALIASES` table. **Do not** change product taxonomy.
- **Frontend-only?** **Yes.** **Regression risk:** low — `homepageSectionsRender.test.js` asserts the authored/absent-content contract, not the tab counts.

### 7.3 Suspected / subjective (labelled as such)

| ID | Statement | Class |
|---|---|---|
| S-01 | The 44 px H1 + 3-sentence banner + 12-row rail exceed the first viewport at 1366×768, pushing the first editable control below the fold. | **SUSPECTED** (needs a browser; DERIVED from sizes only) |
| S-02 | `border-pf-border` (#EDE4D8) on a `#FFF9F2` card gives roughly 1.1:1 — a *structural* input boundary that some low-vision users will not perceive. | **SUSPECTED** (token maths; not measured) |
| S-03 | The gold-deep left border on an ivory-on-ivory rail is too subtle to serve as the only selection cue at a glance. | **OPINION** (design judgement) |
| S-04 | `window.confirm` for “Configure section” is safe but feels destructive for a reversible action; a styled dialog with an explicit “keep hidden after saving” would read better. | **OPINION** |
| S-05 | Grouping the six copy fields into “Heading / Body / Link / Accessibility” would reduce errors more than any single label change. | **OPINION** |
| S-06 | The hero’s 5-layout rotation by index is a hidden coupling: reordering slides reshuffles layouts. | **SUSPECTED as a UX problem, VERIFIED as behaviour** (`heroModel.js:HERO_LAYOUT_SEQUENCE`) |

---

## 8. Prioritisation and simplification proposal

### 8.A Global findings (affect multiple sections)

1. **Preview is wrong and gated** (F-01, F-02, F-12) — the highest-value single fix on the page.
2. **Publish state is never summarised** (F-10, F-09, F-05) — four writes, three unstated conditions, silent disables.
3. **Raw backend vocabulary is the UI language** (F-06, F-08, plus slot keys/capacities/revision).
4. **Two pipelines and two permission vocabularies wear one title** (F-07, F-22 area, §5.2).
5. **Media acquisition is split across three pages and one of the links is wrong** (F-03, F-19).
6. **Product curation is structurally one-at-a-time** (F-11) while three sections demand 8–24 products.
7. **Failure taxonomy is flat** (F-05, F-14, F-15, F-18) — 403/409/422/503 all look similar.
8. **Visual system stops at the panel border** (F-24, F-25, §4.D).

### 8.B Section-by-section matrix

Legend — **Writes** = minimum writes to publish one entry; **Reorder** = supported groups; **Score** = my configuration-complexity rating (1 simple → 5 hard) for a *typical* task in that section.

| # | Section | Slots (T/M/P) | Product seats | Writes | Reorder | Main usability problem | Unique constraint that must stay | Recommended simplification | Score |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Home hero | – / 2 / – | – | 2 | per-row ↑↓ | No preview at all; register link wrong; orphan CTA silently dropped | `marketing_media` unique `(placement, object_key)`; register-first rule; mobile asset only for HOME_HERO | Inline hero preview; inline upload+register; CTA pair validation | **4** |
| 2 | Category collage | 1/4/4 | 16 | 4 | none | 4 tiles all structurally required; tile count comes from curation; no reorder | 4 fixed slot keys drive layout + entrance animation | Structural-slot checklist (“2 of 4 tiles set”); tile thumbnails | **4** |
| 3 | Saree lookbook | 5/3/1 | 4 | 4 | MEDIA group | Newline-in-title contract undocumented; only “up”; 4 of 5 text slots are collection rows | `lookbook` group membership; `lookbook-1` is the dominant frame | Label collection slots as rows; add “down”; batch reorder | **4** |
| 4 | Bridal campaign | 1/3/2 | 8 | 4 | none | Three structural images, no completeness cue; price line appears only with curation | bride/couple/groom composition | Per-slot required marker + placeholder preview | **4** |
| 5 | Jewellery theatre | 1/1/1 | 24 | 4 (+23×N for products) | PRODUCT | 24 seats one-at-a-time; 4 of 5 storefront filter tabs can never match | 24-seat capacity, single campaign slot | Multi-select staging (F-11); taxonomy-derived tabs (F-27) | **5** |
| 6 | Promotion banner | 1/1/0 | 0 | 4 | none | Editorial-only boundary restated twice, after the form | No discount/coupon writes | One caveat above the form | **2** |
| 7 | Men’s editorial | 5/1/2 | 5 | 4 | PRODUCT | `featured` cap 1 replaces silently; 3 type rows name non-existent taxonomy | `featured` cap 1; `products` cap 4 | Distinguish “hero tag” vs “grid”; explain caps | **3** |
| 8 | Kids playground | 4/3/1 | 24 | 4 | PRODUCT | 24 seats one-at-a-time; chips can be visually inert without a destination | main/girls/boys anchor tiles | Multi-select; warn when `ctaHref` is empty | **5** |
| 9 | Bestsellers | 1/0/1 | 8 | 4 | PRODUCT | MEDIA tab is a dead end; `Sarees` filter can never match; “ranking” ambiguity | No MEDIA slot at all | Disable MEDIA pre-emptively; explain “curated, not ranked” | **2** |
| 10 | Kurti lookbook | 1/4/5 | 20 | 4 | PRODUCT | Untitled mood shows the raw slot key to customers | mood key = MEDIA slot = PRODUCT slot (the good pattern) | Require a mood title; reuse this pattern elsewhere | **3** |
| 11 | Newsletter | 2/1/0 | 0 | 4 | none | Fine print lives in `subtitle`, not `title` — undiscoverable | Subscription stays disconnected | Dedicated “Fine print” field bound to the right slot | **2** |
| 12 | Trust strip | 5/0/0 | 0 | 4 | TEXT group | Slot names are the icon contract; no way to change icon | 5 fixed keys → 5 icons | Per-item labels (“Delivery”, “Authenticity”…), icon shown read-only | **2** |

**Aggregate:** 11 sections require ≥4 writes; 3 require 8–24 repeated saves; 4 have a dead-end tab; 1 has no preview; 5 have fixed structural compositions with no completeness cue.

### 8.C Common patterns that can be standardised safely

| Pattern | Standardise as | Risk |
|---|---|---|
| Copy fields | One `COPY_FIELDS` descriptor map used by **both** editors (hero and sections) | Low — labels only; hero already uses words |
| Entry row | One `EntryRow` primitive: thumbnail · business slot label · title · Active chip · overflow menu | Low |
| Slot occupancy | One `SlotMeter`: `Women tile · set` / `Product list · 3 of 4` — never `(1/1 filled — full)` | Low (display only) |
| Save feedback | One message contract: `Saved locally-confirmed` / `Saved, refresh failed` / `Rejected: <reason>` / `Conflict: reload` — the section editor's four-state model, adopted by hero | Low |
| Conflict recovery | Keep draft + explicit “Re-apply” | Medium (sequencing) |
| Preview | One `DraftPreview` wrapper that merges the draft into the item list **by id**, never after it | Low |
| Disabled controls | Always paired with an `aria-describedby` reason | Low |
| Destructive/irreversible | One styled confirm via the existing `ConfirmDialog` (`components/orders/ConfirmDialog.jsx`) instead of `window.confirm` | Low |
| Permission messaging | One `permissionHint(missing)` used by page, editor and pickers | Low |

### 8.D Section-specific patterns that must stay distinct

- **Hero** stays on `media_marketing_media` with its own endpoints and its mobile asset — **do not** fold it into the section pipeline in this phase.
- **Category collage / bridal / kids** have *fixed compositions*: their slot keys are layout contracts. Keep them; surface required-ness instead of free-form editing.
- **Saree lookbook MEDIA** and **Trust TEXT** are the only reorderable non-product groups — keep `GROUPS` exact.
- **Kurti mood slots** couple art + products by key — this is a section-specific strength; do not generalise it to sections whose MEDIA and PRODUCT slots are unrelated (jewellery, kids).
- **Newsletter** stays content-only with the subscription disabled; **promotion** stays discount-free. Both are business boundaries, not UI defects.
- **Bestsellers has no MEDIA slot.** Do not add one.

### 8.E Simplified journeys (before → after)

| Task | Before | After (proposed) | Reduction |
|---|---|---|---|
| Change a section headline (first time) | 12 actions · 4 writes · 1 dialog | Section → **Text** → type → **Save & publish** (2 writes: the entry + the section activation; configuration becomes implicit and inactive) → **8 actions · 2 writes · 0 dialogs** | −33 % actions, −50 % writes |
| Fix a typo in an active entry | 6 actions (edit, save, reload, re-open) + 1 conflict risk | Entry card → inline edit → **Save** → 4 actions, 1 write | −33 % |
| Replace a hero image (already registered) | 5 actions | 3 actions (card → `Replace image` → pick) | −40 % |
| Add brand-new hero art | 12 actions + 2 page navigations | **Upload & register** inside the hero panel → 5 actions, 0 navigations | −58 %, navigations −100 % |
| Fill 24 jewellery products | 24 × (select+save) ≈ 96 actions | multi-select 24 → “Add 24 products” ≈ 8 actions | −92 % |
| Reorder 12 products | 11 clicks × 1 request = 11 requests | keyboard/drag 5 moves, **1** request on commit | −55 % actions, −91 % requests |
| Preview before saving | impossible before configure; wrong after | **always available**, shows the draft | new capability |
| Understand “why can’t I publish?” | none | one summary line naming the exact missing step/permission | new capability |
| Recover from a 409 | reload ⇒ **draft lost** | draft preserved + explicit “Re-apply” | lost work eliminated |

### 8.F Proposed layout

```
┌ Homepage Content ─────────────────────────────────────────────────────────────┐
│  Homepage Content            [Open storefront ↗]   [Media library]  [Upload]  │
│  Twelve sections, in storefront order. Unconfigured sections are hidden.      │
├────────────────────────┬──────────────────────────────────────────────────────┤
│ ① Home hero   ● 3 live │  Home hero                         ● Live · 3 slides │
│ ② Category collage  ⚠  │  Position 1 of 12 · managed by marketing media        │
│ ③ Saree lookbook    ○  │  ───────────────────────────────────────────────────  │
│ ④ Bridal campaign   ○  │  [ Slides 3 ]   [ Preview ]                           │
│ ⑤ Jewellery theatre ●  │  ┌──────────────┬──────────────────────────────────┐  │
│ ⑥ Promotion banner  ○  │  │ 1 ▣ image    │ Title    [Festive Heirlooms     ]│  │
│ ⑦ Men's editorial   ○  │  │   Active     │ Subtitle [......................]│  │
│ ⑧ Kids playground   ○  │  │ 2 ▣ image    │ CTA      [Shop now ▾] [/festive] │  │
│ ⑨ Bestsellers       ●  │  │   Active     │ Alt text [Describe the image   ] │  │
│ ⑩ Kurti lookbook    ○  │  │ 3 ▣ missing  │ ⓘ Kicker is the small gold label │  │
│ ⑪ Newsletter        ○  │  │   + Add image│ Mobility [Use registered art ▾]  │  │
│ ⑫ Trust strip       ●  │  └──────────────┴──────────────────────────────────┘  │
│                        │  ┌──────────── Storefront preview ─────────────────┐  │
│  Legend ●live ○hidden  │  │  the real section component, fed by the DRAFT   │  │
│                        │  │  (desktop 1366 | tablet 768 | mobile 390)       │  │
│                        │  └─────────────────────────────────────────────────┘  │
│                        │  ● Unsaved changes          [Discard] [Save & publish]│
└────────────────────────┴──────────────────────────────────────────────────────┘
```

- **Navigation:** rail with a status dot + short label; the selected row is a filled burgundy-tinted plate with a gold left rule; below `lg` it becomes a horizontal chip strip.
- **Selected-section workspace:** one header with *title · position · pipeline · publish state*; **no** "revision 7" (move it into a tooltip/diagnostics disclosure).
- **Content tabs:** `Slides / Media`, `Products`, `Text` — each with a count and a disabled reason when empty (before configuration).
- **Entry cards:** thumbnail, *business* slot label, title, `Live`/`Hidden` chip, overflow menu (Edit · Duplicate · Move ↑↓ · Remove).
- **Editing controls:** labelled fields with helper text, counters and inline errors; asset picker with thumbnail + product context (already built).
- **Status feedback:** one sticky bar — dirty state left, actions right; a publish checklist when the section is not live.
- **Preview/save:** preview always available and always draft-driven; save and publish are **two** explicit verbs (`Save draft`, `Publish`) rather than four implicit steps.

### 8.G Prioritised remediation roadmap

**Batch 1 — Truthfulness & lost work (Critical/High; frontend-only; ~1 PR)**
F-01, F-02, F-12, F-04, F-15, F-05.
*Why first:* everything else is decoration until the preview stops lying and a conflict stops deleting the operator's work.

**Batch 2 — Workflow collapse (High; frontend-only)**
F-10 (publish summary + one “Save & publish” sequence), F-09 (explain disabled states), F-23 (pre-emptive dead-tab disabling), F-16 (batch reorder + “down”), F-11 (multi-select staging → N sequential creates), F-03 (real registration entry point).
*Why second:* largest measurable reduction in clicks (8.E).

**Batch 3 — Language & component consistency (Medium; frontend-only)**
F-08, F-06, F-24, F-25, F-22, F-21, F-18, F-14; extract `EntryRow`/`SaveBar`/`COPY_FIELDS` shared by both editors (F-07).
*Why third:* makes batches 1–2 legible and shrinks the code surface that future batches must touch.

**Batch 4 — Section-specific usability (Medium; frontend-only)**
F-17 (responsive rail), F-27 (taxonomy-derived filter tabs), F-13 (hero CTA pair), structural-slot completeness meters for collage/bridal/kids, mood-title requirement for kurtis, trust icon read-only display.

**Batch 5 — Accessibility & responsive polish (Low/Medium)**
F-07 tab semantics, F-25 token usage, focus/announcement pass, `ConfirmDialog` adoption, per-field `aria-describedby`, contrast measurement in a real browser.

**Batch 6 — Verification hygiene (Low; test-only)**
F-26 (stale migration-head assertion, absent-`home-page` skip), F-19 static warning copy.

### 8.H Exact file scope per batch

| Batch | Files that would change | Why |
|---|---|---|
| **1** | `frontend/src/components/admin/homepage/SectionPreview.jsx` (draft merge by id, placeholders instead of duplicated art, unconfigured preview, hero preview) · `SectionContentEditor.jsx` (remove the configure-before-preview gate; keep-draft conflict state) · `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` (pass HTTP status into labels) · `frontend/src/services/homepage/homepageContentModel.js` (`sectionStatusLabel` gains a reason) · `BackendHomeHeroPanel.jsx` (mount hero preview) | All are presentation/state composition; **no request shape changes** |
| **2** | `SectionContentEditor.jsx` (publish summary, chained save, batch reorder, multi-select save loop, disabled reasons) · `PublishedProductPicker.jsx` (multi-select mode, “already added” disabling, no dual role) · `AdminMarketingMedia.jsx` (header action targets) · `BackendHomeHeroPanel.jsx` (inline upload+register) · reuse `components/admin/media/PlacementAssetPanel.jsx` as-is | Existing endpoints only; `POST /items` still one row per call |
| **3** | `SectionContentEditor.jsx`, `BackendHomeHeroPanel.jsx`, `RegisteredMediaPicker.jsx`, `PublishedProductPicker.jsx`, new `components/admin/homepage/{EntryRow,SaveBar,SlotMeter,copyFields}.jsx`, `homepageContentModel.js`, `index.css` (only if a new token is genuinely needed — prefer existing `pf-border-strong`) | Shared primitives; both editors converge on one vocabulary |
| **4** | `customer/components/sections/{JewelleryTheatre,Bestsellers}.jsx` (taxonomy-derived tabs) · `customer/mock/data/products.js` (only if the tab lookup helper belongs there — prefer the section) · `SectionPreview.jsx` (structural slot maps) · `AdminMarketingMedia.jsx` (responsive rail) · `BackendHomeHeroPanel.jsx` (CTA pair) · `KurtiLookbook.jsx` (require a title, fall back to a neutral label instead of the key) | Section-specific; **no backend changes** |
| **5** | `SectionContentEditor.jsx` (tab semantics, `aria-describedby`, `aria-invalid`), `RegisteredMediaPicker.jsx` (fieldset scoping), reuse `components/orders/ConfirmDialog.jsx`, `index.css` (only focus/contrast if measured) | Accessibility only |
| **6** | `backend/verification/unit/test_homepage_content.py` (head assertion → `w3b4c5d6e7f8`) · `frontend/src/components/admin/homepage/__tests__/homepageContentControl.test.js` (skip when `home-page/` absent) · copy-only edits in `AdminMediaLibrary.jsx` | Test hygiene + one static sentence |

**Explicitly out of scope for every batch:** `backend/app/schemas/media/homepage.py`, `backend/app/services/media/homepage_content_service.py`, `marketing_media_service.py`, both models, the migration chain, `core/rbac.py`, `api/v1/homepage.py`, `api/v1/media.py`, `media_product_service` paths, and every stored row.

### 8.I Required verification per batch (before merge)

1. `node --import ./scripts/node-loader/register.mjs --test src/components/admin/homepage/__tests__/*.test.js` → expect **117 tests** with only the known `home-page/` failure (or 117/117 after Batch 6).
2. Storefront contract suites (§0.3, 131 tests) — must stay **131/131**.
3. Backend `test_homepage_content.py` + `test_marketing_media.py` — must stay **101/101** after Batch 6.
4. Manual, **in a real browser** (not available here — must be done by the reviewer): 1366×768, 1920×1080, 768×1024, 390×844; keyboard-only pass through 12 sections; preview/draft parity; 409 recovery with the draft intact; publish checklist accuracy.
5. Explicit non-regression checks: section order unchanged in `/home`; `homepageContent` still returns exactly 12 sections; every existing `media_asset_id`/`product_id` still resolves; activation still requires the same grants; no new network request shape.

---

## 9. Closing assessment

The Homepage Content Control Center is **functionally sound and unusually honest at the transport layer** — CAS, inactive-first creation, typed slots, asset-id references, re-checked product eligibility, four-way save reporting and a correct degradation boundary (`HomepageSection`) are all in place and covered by tests. What makes it *difficult* is not the data model; it is that **the interface does not tell the truth about its own state** (preview), **does not summarise its own process** (four writes, silent disables), and **speaks in the backend's vocabulary rather than a merchandiser's** (`intro`, `lookbook-1`, `eyebrow`, `revision 7`).

That is good news: the fix is concentrated in **four frontend components**, needs **no schema, API, permission, default or row change**, and can be delivered in two frontend-only batches that remove the lying preview, preserve work on conflict, and collapse four writes into one visible “Save & publish”.

**No implementation has begun. Nothing was modified, committed, migrated or deployed.**

---

### Appendix A — Verified evidence index

| Evidence | Command / source | Result |
|---|---|---|
| Control-centre suites | `node --test …homepage{AllSections,ContentControl,Persistence}.test.js` | 117 tests · 116 pass · 1 pre-existing fail (`home-page/` absent) |
| Storefront suites | 7 files incl. `homeSectionsRender`, `homepageSectionsRender`, `heroModel` | 131 tests · 131 pass |
| Backend homepage/marketing | `pytest backend/verification/unit/test_homepage_content.py backend/tests/unit/test_marketing_media.py` | 100 pass · 1 stale-head fail |
| Preview draft shadowing | PROBE 1 (`SectionPreview` + `renderToStaticMarkup`) | saved shown, draft dropped |
| Product taxonomy mapping | PROBE 2 (`toDesignProduct`) | `banarasi→type 'banarasi'`, `kurtis-suits`, `jewellery` |
| Working tree | `git status --ignored` before and after | clean; only `backend/logs/*.log` ignored artefacts, removed |

### Appendix B — Not verified (and why)

| Item | Reason |
|---|---|
| Any pixel-level visual, spacing, overflow or contrast claim | No browser binary in this sandbox (§0.4) |
| 1366×768 / wide / tablet / mobile behaviour | Same |
| Real persistence, revision locking, FK cascade in PostgreSQL | No database |
| `POST /media/register-placement`, upload validation, S3/CDN delivery | No storage backend |
| Real 409/503 under concurrency | No server |
| Whether the operator-perceived “slowness” of section switching is material | Requires instrumentation against a populated catalogue |

### Appendix C — Assumptions a reviewer should confirm

1. The `home-page/` reference directory is intentionally absent in this checkout (two tests depend on it).
2. Batch 1–2 estimates assume the four existing control-centre suites are the merge gate and may be extended, never weakened.
3. “Frontend-only” for F-11 assumes sequential single-entry `POST /items` calls are acceptable; if a bulk endpoint is preferred, that is a **separate approved backend change** with its own CAS design.
4. The storefront filter mismatch (F-27) is treated as a consumer defect, not a taxonomy defect — the canonical taxonomy is authoritative and must not be renamed.
