# Phase 3 — Homepage persistence implementation and verification

**2026-10-16 · Implementation complete; PostgreSQL acceptance BLOCKED.**

The user explicitly approved the schema/API/auth plan in
`PHASE-3-HOMEPAGE-PERSISTENCE-PLAN.md` before implementation. That document is
retained as the original planning snapshot (including its historical proposed
status); this report records the subsequent implementation and actual evidence.
The later user restriction to verified disposable PostgreSQL overrides the plan's
optional SQLite-test suggestion. **No SQLite-writing tests were run.**

## 1. Implemented boundary

- Two homepage-specific tables: `pratikshya.homepage_section` and
  `pratikshya.homepage_section_item`. Closed registry of eleven non-hero section
  keys, typed TEXT/MEDIA/PRODUCT slots and capacities, inactive-first creation,
  audit identities/timestamps and section revisions. No seeds/backfill, generic
  CMS, duplicate catalog or browser-local assignment persistence.
- Explicit workspace routes under `/api/v1/admin/homepage/sections` and
  `/api/v1/employee/homepage/sections`: list/read, configure, create/patch/delete
  entries, and exact-membership typed reorder. The existing admin-only guards
  were not loosened. New employee asset projection and HOME_HERO-only operations
  use `/api/v1/employee/homepage/media-assets`, `/hero/items` and `/hero/reorder`.
- Existing staff permission resolver is reused. Marketing view/manage authority
  is explicit; media assignment and removal require separate media grants.
  Activating a container with active media cannot bypass media-activation grants.
  No role seeds, promotions, default grants or borrowed admin session context.
- Strict copy/reference DTOs reject extra commerce/publication/identity fields,
  unsupported slots/types, invalid CTA destinations and forged resources. Write
  validation selects eligible published products and registered uploaded image
  assets, checks storage objects, and requests reference/section row locks.
  Revision and membership conflicts return 409; foreign entries return 404;
  invalid references/input return 422; database/storage failures are unavailable,
  not successful saves. Actual PostgreSQL lock behavior is **not verified**.
- PRODUCT projection reuses ProductService's current taxonomy/publication,
  pricing and media projection, bypassing cached product-detail snapshots.
  Public reads re-check eligibility. Ineligible/deleted references cannot refill
  from sample products. Existing lifecycle authority and legacy taxonomy policy
  are unchanged; homepage endpoints cannot publish or approve products.
- `/api/v1/home` gains typed, additive `homepageContent`, leaving existing fields
  and hero semantics intact. Extension failures are isolated with a savepoint and
  reported as unavailable. Missing configuration retains the legacy branch;
  configured inactive/empty/unavailable sections do not refill from reference
  content. Inactive public entries do not resolve storage resources. Invalid
  stored slots/copy and excess capacity are suppressed rather than fed into
  public renderers. Public DTOs omit audit/private authoring metadata.
- All eleven Aarna non-hero components consume the new resolved DTOs through a
  shared boundary. Authored copy/media/products replace reference content only in
  configured branches. Nullable copy is safe; actual authored paths use React
  Router directly, not the design-path translator. Legacy branches retain their
  original link behavior. Stylesheet declarations/layout source remain owned by
  the read-only reference.
- Phase 2 controls now use the approved contracts: pending changes, conflict
  reconciliation, truthful save versus reload/refresh failures, inactive-first
  creation, scoped pickers, reorder, toggles and deletion. Missing schema/backend
  reports unavailable. Public hydration is requested after an acknowledged save,
  even if the subsequent staff reload fails.
- HOME_HERO still uses the legacy table/service and old admin endpoints. Existing
  admin media writes additionally validate genuine registered images; employee
  hero operations are new, explicit, narrowly scoped routes. Hero zero-row
  canonical fallback, configured-inactive empty state and unavailable fallback
  remain covered by mocked compatibility tests.
- Newsletter is content-only with subscription disabled. Configured promotion is
  editorial-only; it cannot invent or apply discounts/codes/expiry. No newsletter
  success is simulated. Registration/upload architecture is reused, not replaced:
  this center selects existing registered assets and adds no standalone uploader.

## 2. Migration and database safety — blocking acceptance

| Check | Actual result |
|---|---|
| New migration | `p3hp20261016a_homepage_sections.py` authored |
| Expected parent | `l1a2b3c4d5e1` |
| Static graph | One new head, no missing parents/duplicate IDs (unit test) |
| Offline PostgreSQL SQL | Upgrade → downgrade → re-upgrade rendered to strings; model constraint/index names checked |
| Approved disposable target | **Not provided/verified** |
| Read-only identity/schema/revision connection | **Not attempted; no approved target** |
| Live upgrade/downgrade/re-upgrade | **Not executed** |
| DB-writing/SQLite tests | **Not executed** |
| Fresh-session SQL persistence and DB-backed RBAC | **Not established** |
| Durability/deployment acceptance | **Blocked; no durability claim** |

No database connection, mutation, migration, seed, stamp or historical migration
was run. Offline SQL rendering is not migration execution. Do not deploy on the
strength of mocked/unit evidence alone.

The opt-in PostgreSQL suite skips before connection without its explicit target.
Its first supplied-target connection enforces read-only mode at startup and
verifies database identity/comment, prerequisites/new-table absence and exact
parent revision. It stops on mismatch; it never provisions, stamps or migrates
historical revisions. See `backend/verification/README.md` for the precise
prerequisites and opt-in command. This report does **not** authorize a target or
production/shared mutation.

A future approved run exercises this revision's migration cycle and TEXT
fresh-session persistence. Its grant resolver is mocked, so even a passing run
would not establish full database-backed RBAC or real PRODUCT/MEDIA lifecycle,
concurrency and media-delivery acceptance. Those remain additional integration
acceptance work on the verified target. A schema downgrade destroys new homepage
configuration; export the new tables and stop writers before separately approving
it. Leave legacy data/history untouched.

## 3. Executed final verification

Commands below ran after final application edits. Backend commands use the
repository root; frontend commands use `frontend/`. No command below writes a
database. Logs outside the repository are supplemental local evidence, not
committed application artifacts.

### Safe backend selection — 125 passed, 1 skipped, 16 subtests passed

```sh
PYTHONPATH=backend .venv/bin/python -m pytest -o addopts='' -q \
  backend/verification/unit/test_homepage_content.py \
  backend/verification/integration/test_homepage_disposable_pg.py \
  backend/tests/unit/test_marketing_media.py::TestMarketingMediaSchema \
  backend/tests/unit/test_config.py \
  backend/tests/unit/test_phase3_error_envelope.py \
  backend/tests/unit/test_admin_consolidation_rbac.py \
  backend/tests/unit/test_phase6_image_formats.py::ImagePolicyConfigurationTests \
  backend/tests/unit/test_phase6_image_formats.py::UploadFormatAcceptanceTests \
  backend/tests/unit/test_phase6_image_formats.py::UploadFormatRejectionTests \
  backend/tests/unit/test_phase6_image_formats.py::ContentValidationStillEnforcedTests
```

Exit 0, 2.70s; two upstream deprecation warnings (Starlette/AnyIO and passlib/crypt).
Log: `/home/user/phase3-backend-final.log`. The one skip is the absent approved
PostgreSQL target, before connection. The new unit suite installs connection
blockers and uses fake sessions, real authorization dependencies with mocked
lookups, scoped HTTP tests, SQL compilation and offline migration rendering.
These are orchestration/contracts, not SQL durability or locking evidence.

The two new suites are under `backend/verification/` because the existing
`backend/.gitignore` ignores new `backend/tests/` files. Only these newly authored
files were relocated; no inherited test was moved. This makes the deliverable
visible without editing ignores or staging files.

`backend/tests/unit/test_marketing_media.py` also has a related registered-asset
fixture update in its old SQLite service-test class. **That service class was not
run**; only `TestMarketingMediaSchema` was authorized/safe in the command above.
The existing database-writing product-visibility suite was not run either.

### Related frontend/control center/commerce — 276 passed, 0 failed

```sh
node --import ./scripts/node-loader/register.mjs --test \
  src/components/admin/homepage/__tests__/homepageContentControl.test.js \
  src/components/admin/homepage/__tests__/homepagePersistence.test.js \
  src/components/storefront/__tests__/phase1Integration.test.js \
  src/components/storefront/home/__tests__/heroModel.test.js \
  src/components/storefront/home/__tests__/heroEditorialRender.test.js \
  src/components/storefront/home/__tests__/homepageSectionsRender.test.js \
  src/components/aarna/__tests__/aarnaPortParity.test.js \
  src/components/aarna/__tests__/aarnaIntegration.test.js \
  src/components/aarna/__tests__/aarnaLiveCatalogue.test.js \
  src/components/aarna/__tests__/aarnaProductPage.test.js \
  src/components/aarna/__tests__/aarnaListingPage.test.js \
  src/components/aarna/__tests__/aarnaCartPage.test.js \
  src/components/aarna/__tests__/aarnaWishlistPage.test.js \
  src/components/aarna/__tests__/aarnaCheckoutPage.test.js \
  src/components/aarna/__tests__/aarnaSignInPage.test.js \
  src/components/aarna/__tests__/aarnaAccountShell.test.js
```

Exit 0, 65.22s; log `/home/user/phase3-frontend-final.log`. Includes 14 new
persistence tests and 22 actual-section SSR tests. HTTP is mocked. SSR renders all
eleven adapted section components with their real provider stack and authored
DTOs, checks missing media/product behavior and nullable copy, actual product
consumption, authored path preservation, editorial-only promo and disabled
newsletter. React remount/save/reload tests establish client contracts only.
React test-renderer emits its upstream deprecation notice. No real browser,
visual/pixel, focus/resize or animation-timing acceptance is claimed.

An earlier related memo-source assertion was updated to the approved optional
content dependency; no unrelated baseline test was weakened. An intermediate
SSR assertion mistakenly matched a percentage in CSS transforms; it now checks
visible text. The final suite above passes after those corrections.

### Both homepage builds and parity — passed

```sh
# frontend/
VITE_STOREFRONT_HOME=aarna npm run build
npm run build

# repository root
node frontend/scripts/aarna-port.js --check
git diff --check
```

Both builds transformed 2,843 modules. Aarna: 13.05s; default: 12.97s. Default was
built last. Logs `/home/user/phase3-build-aarna-final.log` and
`/home/user/phase3-build-default-final.log`. Parity: **55 copied files, 88,885 CSS
bytes**. The deterministic twelve-file section/Home transformation recipe was
regenerated from the preserved pre-Phase-3 port and final sources, with exact
context checks and updated adaptation-size pins; the reference was not edited.
Whitespace checks include all new/modified Phase 3 sources, not just tracked diff.

### Legacy regressions — unchanged baseline failures remain

```sh
# frontend/
node --import ./scripts/node-loader/register.mjs --test \
  tests/rbacContract.test.js tests/regressionAuthRbacFix.test.js \
  tests/employeeLoginRouting.test.js tests/phase3ProductLifecycleUI.test.js \
  tests/phase3ProductVisibility.test.js tests/phase7ProductMedia.test.js \
  tests/phase6MediaStorage.test.js tests/normaliseProductList.test.js \
  tests/catalogHydratePagination.test.js tests/marketingMediaHero.test.js \
  tests/marketingAvifUpload.test.js

node --import ./scripts/node-loader/register.mjs --test \
  src/components/storefront/__tests__/homeIntegration.test.js

# repository root: collection only, no fixture/test execution
PYTHONPATH=backend .venv/bin/python -m pytest -o addopts='' --collect-only -q \
  backend/tests/unit/test_unified_rbac_consolidation.py
```

- Legacy frontend: exit 1, **137 passed / 11 failed**. Seven obsolete staff-routing
  assertions, two reads of nonexistent `pratikshya-backend/...`, and two suite-load
  failures for missing `tests/helpers/backendRoot.js`. The last two suites'
  individual assertions did not execute. Log `/home/user/phase3-legacy-final.log`.
  Causes match the original-HEAD evidence recorded during Phase 2 in
  `/home/user/phase2-contracts-baseline.log`; these failing tests were not changed.
- Old homepage suite: exit 1, **14 passed / 1 failed**. Its importer assertion
  excludes pre-existing AccountShell. Log `/home/user/phase3-home-legacy-final.log`;
  original-HEAD reproduction `/home/user/phase2-home-baseline.log`.
- Backend unified RBAC: exit 2 during collection, **no tests executed**, due to
  missing `ACCOUNT_LEVEL_SUPER_EMPLOYEE`. Current log
  `/home/user/phase3-rbac-current-final.log`; identical original-HEAD reproduction
  `/home/user/phase3-rbac-baseline.log`. This unrelated module was not edited.

## 4. Exact Phase 3 file inventory

The following **46 paths** comprise the implementation, tests, verification README
and this report. The approved plan is a separate retained artifact. Cumulative
Git diff also contains earlier Phase 1/2 changes; it is not a Phase-3-only diff.

- `backend/alembic/versions/p3hp20261016a_homepage_sections.py`
- `backend/app/api/v1/homepage.py`
- `backend/app/api/v1/router.py`
- `backend/app/models/__init__.py`
- `backend/app/models/media/homepage_section.py`
- `backend/app/schemas/catalog/explore.py`
- `backend/app/schemas/media/homepage.py`
- `backend/app/services/catalog/explore_service.py`
- `backend/app/services/catalog/product_service.py`
- `backend/app/services/media/homepage_content_service.py`
- `backend/app/services/media/marketing_media_service.py`
- `backend/tests/unit/test_marketing_media.py`
- `backend/verification/README.md`
- `backend/verification/integration/test_homepage_disposable_pg.py`
- `backend/verification/unit/test_homepage_content.py`
- `docs/PHASE-3-HOMEPAGE-PERSISTENCE-REPORT.md`
- `frontend/scripts/aarna-port.js`
- `frontend/scripts/homepage-section-rewrites.js`
- `frontend/src/components/aarna/__tests__/aarnaLiveCatalogue.test.js`
- `frontend/src/components/aarna/__tests__/aarnaPortParity.test.js`
- `frontend/src/components/aarna/components/sections/Bestsellers.jsx`
- `frontend/src/components/aarna/components/sections/BridalCampaign.jsx`
- `frontend/src/components/aarna/components/sections/CategoryCollage.jsx`
- `frontend/src/components/aarna/components/sections/JewelleryTheatre.jsx`
- `frontend/src/components/aarna/components/sections/KidsPlayground.jsx`
- `frontend/src/components/aarna/components/sections/KurtiLookbook.jsx`
- `frontend/src/components/aarna/components/sections/MensEditorial.jsx`
- `frontend/src/components/aarna/components/sections/Newsletter.jsx`
- `frontend/src/components/aarna/components/sections/PromoBanner.jsx`
- `frontend/src/components/aarna/components/sections/SareeLookbook.jsx`
- `frontend/src/components/aarna/components/sections/TrustStrip.jsx`
- `frontend/src/components/aarna/pages/Home.jsx`
- `frontend/src/components/admin/BackendHomeHeroPanel.jsx`
- `frontend/src/components/admin/homepage/PublishedProductPicker.jsx`
- `frontend/src/components/admin/homepage/SectionContentEditor.jsx`
- `frontend/src/components/admin/homepage/__tests__/homepagePersistence.test.js`
- `frontend/src/components/storefront/home/HomepageSection.jsx`
- `frontend/src/components/storefront/home/__tests__/homepageSectionsRender.test.js`
- `frontend/src/components/storefront/home/homepageSectionModel.js`
- `frontend/src/config/adminNavigation.js`
- `frontend/src/config/employeeNavigation.js`
- `frontend/src/layouts/EmployeeLayout.jsx`
- `frontend/src/pages/admin/media/AdminMarketingMedia.jsx`
- `frontend/src/services/api/homepageApi.js`
- `frontend/src/services/employees/authorization.js`
- `frontend/src/services/homepage/homepageContentService.js`

### Preservation checks

The pre-implementation inventory contained 26 inherited Phase 1/2 paths. All
remain present. **18 are byte-identical** to that SHA-256 snapshot; the other
eight were extended only for the approved Phase 3 integration:

- `frontend/scripts/aarna-port.js`
- `frontend/src/components/aarna/pages/Home.jsx`
- `frontend/src/components/admin/BackendHomeHeroPanel.jsx`
- `frontend/src/components/admin/homepage/PublishedProductPicker.jsx`
- `frontend/src/config/adminNavigation.js`
- `frontend/src/config/employeeNavigation.js`
- `frontend/src/pages/admin/media/AdminMarketingMedia.jsx`
- `frontend/src/services/homepage/homepageContentService.js`

The byte-identical set includes the package/lock files, App route, ported Hero,
hero adapter/model, registered-media picker, Phase 1 tests, earlier control-center
tests, catalog safety/store/repository changes, legacy placement storage and
Phase 1/2 reports. Existing local custom-product and guest state is not imported,
erased or made authoritative.

`home-page/` and all `.gitignore` files have no changes. Production homepage
default and route/environment gates are unchanged. Unrelated authentication,
commerce, cart/wishlist/checkout/payment/providers and guest behavior are not
redesigned. New employee navigation and the existing employee layout's content
center access check were extended narrowly for marketing grants. No new role or
authentication resolver was added.

Final branch: `arena/1c51f76c-pfv1`.
Final HEAD: `03bdb9c2744312ff0439361120643e000c549942`.
Index is unchanged/unstaged. No commit, push, merge, PR, branch switch, reset,
restore, clean or stash was performed. A local untracked `.venv/` is test tooling,
not part of the source deliverable; no dependencies/build output or baseline
exports are intended for Git.

## 5. Handoff boundary

Implementation and available database-free regressions are complete. PostgreSQL
migration/persistence, DB-backed authorization, concurrency and complete real
resource lifecycle acceptance remain blocked/unverified. Next action requires an
explicitly authorized disposable PostgreSQL target at the exact parent and a
successful genuinely read-only preflight before any mutation. Do not infer
production/shared migration authorization from this report. **No Phase 4 work was
started.**
