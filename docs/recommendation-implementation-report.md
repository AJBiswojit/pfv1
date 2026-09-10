# Product recommendations — implementation report

## Read-only migration reconciliation — 2026-09-10

**STOPPED after inspection, as requested. Deployment state remains UNKNOWN. No migration, migration configuration, recommendation runtime code, or test assertions were changed in this reconciliation turn. No PostgreSQL connection was attempted, no database was stamped, and no migrations were executed against a deployment.**

Only this report and the diagnostic document `docs/migration-readonly-check.sql` were changed/added this turn. Earlier recommendation implementation changes remain intact. The final API count was not updated or finalized.

### 1. Evidence and environment availability

Inspected migration metadata/body text, all migration references to `media_media_asset`, runtime media-model FK declarations, Alembic configuration, application configuration, startup scripts, Dockerfile/Compose, the migration helper, and deployment guidance in README files.

- Process `DATABASE_URL`: **not explicitly set**.
- Private root/backend/frontend `.env`: **absent**.
- Explicit `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSERVICE`, `PGSERVICEFILE`: **absent**.
- Application settings contain a loopback PostgreSQL default. `.env.example` and Compose contain example/local connection configuration. These are **not evidence of an available or deployed database**; defaults were not used to probe a server.
- Compose injects its own database configuration; no evidence establishes that these containers describe an active deployment. Dockerfile starts Uvicorn, not Alembic. Normal startup scripts do not establish migration state. The PowerShell migration helper can execute migration commands; it was inspected, **not executed**.
- Repository guidance explicitly treats the existing server schema as authoritative and warns against unverified live upgrades. No deployed release manifest or CI migration evidence was found in this checkout.
- **Unknown:** current deployed database revision(s), whether either media revision was applied, live asset table shape/existence, live marketing FK presence/validation, schema drift, and any deployment-specific migration procedures.
- Do not label either media migration “unapplied”: without deployment evidence, both statuses are **unknown**.

### 2. Actual file graph (not database state)

Executed read-only, file-graph commands from `backend/`:

```bash
../.venv/bin/alembic heads --verbose
../.venv/bin/alembic branches --verbose
../.venv/bin/alembic history --verbose
```

These commands inspect scripts without loading the online migration environment or connecting to PostgreSQL.

**Current working-tree heads:** `b6b5dcfb675b`, `d8e9f0a1b2c3`.

**Tracked HEAD baseline heads:** `b6b5dcfb675b`, `c7d8e9f0a1b2` (independently calculated from the original tracked revision metadata). The fork predates the recommendation changes.

```text
<base>
  8f0223843258  initial schema / media stubs
    597f883749d8  customer fields
      a1b2c3d4e5f6  taxonomy
        c9d1e2f3a4b5  collections
          d1e2f3a4b5c6  commerce
            e1f2a3b4c5d6  orders
              f1a2b3c4d5e6  payment sessions
                z1a2b3c4d5e6  wishlist/activity
                  m001schema  schema move (branchpoint)
                  ├─ a2b3c4d5e6f7  admin settings
                  │   └─ b6b5dcfb675b  product media [HEAD]
                  └─ c7d8e9f0a1b2  marketing media
                      └─ d8e9f0a1b2c3  behavioral interactions [DRAFT HEAD]
```

All inspected revisions declare `depends_on = None`. The marketing revision has no dependency on the product-media revision. Actual `revision`/`down_revision` variables, not dates or occasionally stale docstring “Revises” labels, determine this graph.

A graph-only Alembic plan calculation (`ScriptDirectory._upgrade_revs`, **no migration functions executed**) with the installed version orders the fork for a base-to-heads plan as:

```text
... m001schema -> c7d8e9f0a1b2 -> d8e9f0a1b2c3
               -> a2b3c4d5e6f7 -> b6b5dcfb675b
```

This illustrates the hazardous order in this checkout. It is not a PostgreSQL execution result or a promise of ordering across future graph changes. Single-head graph lookup fails because multiple heads exist.

### 3. Every migration affecting the asset table

| Revision | Upgrade effect | Downgrade / related risk |
|---|---|---|
| `8f0223843258` | Creates unqualified `media_media_asset`, `media_product_media`, `media_marketing_media` stubs (id/timestamps/index; initial-schema intent is public). | Drops the asset/marketing stubs. |
| `m001schema` | Includes all three in schema-move list; conditionally moves public tables into `pratikshya`. Changes session and database-level search path. | Moves back, changes database search path, drops schema if possible. Not a read-only diagnostic. |
| `b6b5dcfb675b` | Drops `pratikshya.media_product_media`, then `pratikshya.media_media_asset`; recreates durable asset + mapping tables, asset metadata/lifecycle columns, PK/unique/indexes, uploader FK, and product/media mapping FKs. | Drops/recreates as stubs. Asset drop is also unsafe while the marketing FK survives. No handling of that FK and no `DROP ... CASCADE`. |
| `c7d8e9f0a1b2` | Drops/recreates marketing stub; adds `media_asset_id -> pratikshya.media_media_asset.id ON DELETE SET NULL`. Does not create/upgrade the asset table. | Drops/recreates marketing stub, thereby removes that FK, but destroys marketing rows. Not a safe generic repair. |
| `d8e9f0a1b2c3` (draft) | Only creates `user_product_interactions`, with users/product FKs; no media table DDL. | Only drops interaction table. Does not solve the media fork. |

No other version files create/drop/alter/reference `media_media_asset` in this checkout. `a2b3c4d5e6f7` creates the admin settings table, not media. Runtime product-media and marketing-media models both reference the asset table; they do not reconcile migration history.

### 4. Exact conflict

1. Initial schema supplies an asset stub with a primary key. Marketing migration can therefore establish its FK even before the durable asset migration runs.
2. If marketing has run first, the product-media migration's parent-table DROP is blocked by the marketing FK. PostgreSQL protects the dependency **even if marketing is empty or every media_asset_id is NULL**. `ON DELETE SET NULL` applies to row deletion, not dropping the referenced table.
3. If product media runs first, then marketing, this particular FK/drop ordering conflict is avoided; full-chain compatibility still requires real PostgreSQL verification.
4. A downstream no-op merge consolidates revision tips **after its parents**. It neither repairs an existing FK conflict nor guarantees the parents execute in the safe order. A compatibility revision after that merge is too late to rescue a failing parent.
5. Dropping constraints with CASCADE, downgrading marketing, rewriting parents, or stamping to skip DDL could lose data/constraints or misrepresent history. None is authorized or recommended as a blind fix.
6. Draft behavioral DDL has no media dependency of its own. No recommendation code/schema defect requiring rollback was established by this investigation.

### 5. Important diagnostic correction: online Alembic is not read-only here

`backend/alembic/env.py` uses:
- Online version table: **`pratikshya.pratikshya_alembic_version`**.
- Offline configuration: `pratikshya_alembic_version` with no explicit version-table schema.
- Process `DATABASE_URL` overrides application settings; settings can load `.env` relative to the working directory and otherwise fall back to a development default.
- Before `context.run_migrations()`, the online setup executes **`COMMIT`**, **`CREATE SCHEMA IF NOT EXISTS pratikshya`**, another **`COMMIT`**, and `SET search_path`.

Thus even `alembic current` enters code that attempts DDL. **The previous report's suggestion to run it is withdrawn.** No online Alembic command was run this turn. Do not use application startup/migration helpers or schema-creation testing helpers as read-only deployment evidence collectors.

The schema-move migration does not explicitly migrate legacy Alembic version tables. This does not prove deployed version-table drift, but is why the diagnostic inventories both standard/custom version-table names across schemas instead of assuming a single table.

### 6. Exact read-only production check to run

Use an operator-approved **read-only database role**, the actual deployment target, and an existing private libpq service (`PGSERVICE`) or securely configured libpq environment. Do not put a password/URL in shell arguments or chat. Do not pass an SQLAlchemy `postgresql+asyncpg` URL directly to psql.

From the repository root, with the approved `PGSERVICE` already selected in the environment:

```bash
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000' \
  psql -X --no-password -v ON_ERROR_STOP=1 -P pager=off \
  -f docs/migration-readonly-check.sql
```

`-X` ignores startup files; `--no-password` avoids prompting for secrets. The script uses an explicit **REPEATABLE READ, READ ONLY** transaction and finishes with **ROLLBACK**. It issues only metadata SELECTs and identifier-quoted SELECTs of version numbers from discovered version tables. It contains no DDL, DML, stamping, migration execution, or application data reads. A missing version table produces a discovery result, not an attempted table creation. Permissions/query failures stop the script; do not disable read-only safeguards to work around them.

The diagnostic reports:
- Read-only/isolation/search-path settings.
- All discovered `pratikshya_alembic_version` / `alembic_version` tables and their current `version_num` values.
- Existence and schemas of asset/product-media/marketing/behavioral tables.
- Actual media-table column types/nullability/defaults; indexes and constraints.
- All FKs entering/leaving affected media tables, including target table/schema, definition, validation, and delete behavior.
- Explicit boolean for the `pratikshya` marketing-to-asset FK.

**This SQL document has not been run against PostgreSQL here.** It requires a real environment and psql. Review metadata output locally before sharing; no credentials or customer/product/behavioral records are needed.

Interpretation precautions:
- Alembic normally stores **current branch tips, not every applied revision**. Infer recorded ancestors against the migration graph of the deployed release; do not simply search for a literal row matching each old revision.
- With the inspected graph, a recorded `d8e9f0a1b2c3` tip implies `c7d8e9f0a1b2` ancestry, but says nothing about the other media branch. A `b6b5dcfb675b` tip implies its own parent chain, not marketing.
- Revision rows indicate **recorded** state, not proof DDL ran (manual changes or earlier stamping can cause divergence). Verify the actual schema/FKs as well.
- Multiple version tables, unknown revision IDs, missing version tables, or mismatched table shapes mean state is unresolved. Obtain the deployed release's migration files and operations history; do not stamp or guess.

### 7. Safest recommended strategy — conditional, NOT implemented

**Default recommendation: preserve all historical revision files; obtain deployment evidence first; use an explicitly ordered, deployment-specific forward reconciliation, followed by a new convergence/merge revision only when both media branches are demonstrably satisfied.** A universal merge-only fix is insufficient.

| Verified deployment state (not known here) | Proposed next action, requiring approval and PostgreSQL rehearsal |
|---|---|
| Both media branches recorded and schema/FKs match | No product/marketing table rebuild. A new no-op convergence/merge can unify tips. Place the recommendation continuation after the verified convergence in the eventual approved plan. Whether to attach/change the draft depends on proof it has never been deployed. |
| Product media only; marketing still an intact stub | Verify schema, stub emptiness and unexpected inbound dependencies before allowing marketing to replace its stub. Explicitly complete marketing after product media, then converge. Do not rerun the asset migration. |
| Neither branch, with genuine baseline stubs | Verify baseline/emptiness first; enforce product-media-before-marketing through an approved staged deployment path, then converge. Future deployments must retain an explicit order/preflight; a downstream merge does not encode this parent ordering by itself. |
| Marketing only; asset migration absent | **Do not run the asset migration blindly.** Inventory FK/data/dependencies in a separately approved follow-up. Design a forward, data-preserving compatibility prerequisite and an explicit staged execution path that handles/restores the marketing FK and preserves asset references. Exact DDL cannot be established from repository files alone. Rehearse on a restored PostgreSQL copy before approval for production. |
| Recorded revisions and schema disagree, or custom/multiple version tables | Deployment-specific reconciliation against the deployed code and backup is required. No generic upgrade/downgrade/stamp is safe. |

For future migration authoring, dependencies must be explicit and schema evolution should avoid drop/recreate of potentially populated parent tables. A dependency correction to an old file is **not** approved merely because one database lacks the revision; historical immutability must be preserved if it has been applied anywhere. New prerequisite/convergence revisions or controlled ordering can be proposed without rewriting applied history, but their exact plan needs the evidence above and explicit approval.

**Are migration changes required?** To restore an unambiguous converged deployment path, additional migration graph/deployment work is required; this cannot be solved in recommendation runtime code. It does **not** establish a need or permission to modify any existing migration. Whether a data compatibility migration is needed is deployment-dependent and currently unknown.

### 8. Targeted test confirmation and preservation

The previously identified fixes were already present and required no further edits:
- `ProductService.get_recommendations` explicitly passes the shared `_taxonomy_visible` predicate into the dedicated service. The existing source-inspection assertion is unchanged.
- Wishlist DB-double tests mock the optional behavioral collaborator only. Original response/idempotency assertions are retained; separate real SQLAlchemy/SQLite tests exercise behavioral persistence and savepoint failure isolation.

Reran the shared-predicate assertion, the three previously failing wishlist tests, and the recommendation service/API suite (excluding its migration-DDL test for this read-only reconciliation scope): **28 passed, 1 deselected, 4 subtests passed**, 2 deprecation warnings. All DB-backed cases used isolated SQLite test fixtures, **not a deployed PostgreSQL database**. No tests or assertions were deleted/weakened.

Earlier report count corrected: the recommendation test file contains **25 cases**, not 26; 24 were run this turn, plus the four targeted regressions. Earlier full-suite results remain historical, not a new full-suite run.

### 9. Preservation checks and stop status

- Existing tracked `backend/alembic/` files remain identical to repository HEAD.
- Draft `d8e9f0a1b2c3` remains untouched; SHA-256: `8f382bc56c0dbd0afdbffa574ff4da8e786988e51c3230cd1c9dba5840ead7b0`.
- No existing migrations/configuration modified, no new merge/prerequisite migration created, no stamping, no deployed DDL/DML, no recommendation rollback, no final API-count update.
- Remaining blockers: actual PostgreSQL revision/schema evidence; deployment-aware strategy approval; fresh/existing PostgreSQL rehearsal; later feature-completion documentation, final build/test review and browser verification as previously recorded.
- **STOP:** do not implement any migration-history or compatibility strategy until the user approves the evidence-based plan.

---

## Final schema / event model (documented before implementation)

Approved boundary: behavioral recommendation data is separate from the shared operational audit diary. No operational audit logging is removed, bypassed or duplicated.

New table: `pratikshya.user_product_interactions`.
- `id`: VARCHAR(36) primary key, existing Base UUID convention.
- `customer_id`: VARCHAR(36), required FK to `users.id`, ON DELETE CASCADE. Matches Cart/Wishlist ownership (authenticated customer user ID, not profile ID). Customer-only API dependency enforces role separation.
- `product_id`: VARCHAR(36), required FK to `catalog_product.id`, ON DELETE CASCADE / ON UPDATE CASCADE.
- `event_type`: VARCHAR(20), required CHECK allowlist: VIEW, CLICK, WISHLIST, UNWISHLIST, CART_ADD, CART_REMOVE, PURCHASE.
- `dedup_key`: VARCHAR(100), server-generated or namespaced retry key, required; unique (customer_id, dedup_key).
- `event_bucket`: BIGINT, required server-time bucket; unique (customer_id, product_id, event_type, event_bucket) bounds repeat signals even with fresh retry keys.
- `created_at`, `updated_at`: timezone-aware server timestamps, existing Base convention.
- Indexes: customer+created_at, product+created_at, event_type+created_at, created_at; unique constraints additionally cover customer/product/type lookups.

VIEW/CLICK: one signal per customer/product/type per 15-minute bucket; optional UUID idempotency key retains retry identity for retention window. Mutation signals: one signal per minute per product/type; authoritative wishlist/cart services emit only after successful mutations. Clients may submit only VIEW/CLICK, never fabricate PURCHASE. Existing order records supply purchase affinity directly (delivered, not returned); PURCHASE is reserved for trusted future transaction integrations. Ranking reads current Cart/Wishlist rows for those affinities, so removal neutralizes them without summing historical mutation events. VIEW/CLICK contributions use the maximum decayed signal per product, not accumulated click counts.

Retention: rank only the last 180 days; daily operator-scheduled batched purge deletes older rows. Customer/product deletion cascades. No IP, name, photo, session fingerprint, arbitrary metadata, or inferred sensitive preferences stored. No profile/cache tables required.

Existing recently-viewed Redis-compatible cache API (currently backed by the in-process LRU shim) / local history and response contracts remain intact. Authenticated customer views additionally persist durable VIEW events best-effort, with transaction savepoint isolation so behavioral storage failure cannot roll back normal business operations.

## Intended implementation contract

- Extend `GET /products/{id}/recommendations?type=related|complete-the-look|recommended|cart`; same items response and canonical product projection. Contextual, public, never falsely personalized.
- Add `POST /customers/me/product-interactions` (customer-only VIEW/CLICK tracking).
- Add `GET /customers/me/recommendations?type=personalized|because-viewed` (customer-only; empty when insufficient real signals).
- No anonymous behavioral repository; anonymous contextual recommendations only.
- Rule-based ranking is the production implementation, not a future AI feature. Future ML may replace scoring behind the same visibility, event, and product response contracts.

## Verification and completion

**PARTIAL — PAUSED on an additional pre-existing migration architecture conflict (2026-09-10). Not deployment-ready.**

### Migration conflict requiring approval

The tracked baseline already has two independent Alembic heads:
- `m001schema -> a2b3c4d5e6f7 -> b6b5dcfb675b` (admin settings + product media)
- `m001schema -> c7d8e9f0a1b2` (marketing media)

The draft interaction migration `d8e9f0a1b2c3` currently extends the marketing branch. `alembic heads` therefore reports `b6b5dcfb675b` and `d8e9f0a1b2c3`. It does not resolve the pre-existing fork.

This is more than an ambiguous `upgrade head`: `c7d8e9f0a1b2` creates a foreign key from marketing media to `media_media_asset`, while `b6b5dcfb675b` drops and recreates `media_media_asset`. If marketing was applied first, the product-media migration can fail on that dependency. A no-op merge alone cannot guarantee safe ordering or repair already-deployed states. No existing migrations were changed, no merge was created, and no production DB was accessed.

**Decision required:** authorize migration-graph reconciliation and establish which of these revisions, if any, have already been applied in deployed databases. Use the direct read-only PostgreSQL diagnostic below against the intended environment (without sharing credentials). **Correction:** do not run `alembic current` for this investigation; this checkout's online `env.py` performs DDL. Do not apply the draft as a production deployment until this is resolved.

### Implemented in the working tree

- New normalized behavioral table/model, draft Alembic upgrade/downgrade, schema contract regeneration, batched retention command.
- Customer-only VIEW/CLICK tracking API; customer-owned identity, strict payload validation, UUID retry keys, server time buckets, duplicate-key handling, 60/minute endpoint limits via the existing single-process limiter.
- Best-effort durable views alongside the unchanged recently-viewed response/cache behavior. Wishlist and cart mutation hooks use savepoints; operational audit files/logging unchanged.
- Dedicated recommendation service, existing contextual endpoint delegation, new personalized/because-viewed read endpoint.
- Category/subcategory/fabric/material/occasion/color/pattern scoring. Configurable module-level weights; 30-day half-life, 180-day horizon, maximum 200 recent events / 30 anchors / 1000 candidate products / 12 response products. Stable product-ID tie ordering. No shared personal cache or score/history disclosure.
- Personal signals from durable views/clicks, current wishlist/cart, delivered unreturned purchases. Empty insufficient-history responses, no invented new-user personalization.
- Complementary recommendations require co-purchase by at least 3 distinct customers in delivered, unreturned orders within the horizon, plus different category / same audience. No evidence means no section. No authored relationship editor or guessing that different categories automatically complement.
- Publication and taxonomy gates reused for both source and candidates; candidates additionally require positive stock and in-stock availability. Canonical ProductService media/collection projection and existing frontend ProductCard/media hooks.
- AI Mirror: separate Recommended for You, Because You Viewed, Similar Styles, Complete Your Look rails when data exists; selected-look VIEW tracking. Eligibility, camera, try-on behavior/history unchanged.
- PDP: independent contextual type requests, no mislabeled response slicing; preview products do not request rails.
- Cart: real backend contextual requests for at most 4 distinct anchors, excludes all bag products; no client-generated fallback.
- Homepage: one personalized rail, customer-only and hidden without meaningful results.
- Cross-rail deduplication, request cancellation/identity guards, empty/loading/error handling. Removed obsolete frontend-only recommendation utility (no remaining imports).
- Fixed new Cart/Wishlist ORM collection initialization to prevent async lazy-load errors on a new customer's first mutation, discovered by DB-backed tests.

### API inventory status — NOT final reconciled inventory

Added routes (base `/api/v1`):
1. `POST /customers/me/product-interactions`: `{productId, eventType: VIEW|CLICK, idempotencyKey?: UUID}` -> existing `{ok:true}` envelope. Customer JWT; 401/403/404/422/429/503.
2. `GET /customers/me/recommendations?type=personalized|because-viewed&limit=1..12`: existing `{ok:true, items: StorefrontProduct[]}` envelope. Customer JWT; default limit 4, private/no-store; 401/403/422/429/503.

Extended existing `GET /products/{id}/recommendations?type=related|complete-the-look|recommended|cart` without a duplicate contextual endpoint. Unknown type now returns 422. Public contextual results only, no shared response caching; invalid/private source returns 404, DB query failure 503.

The first inspection quoted a stale documented baseline of 225. Further inspection found **232 actual `### API-` entries** in the requirements document, while its header claims 233 and older matrices still claim 225. Adding the two routes would yield **234 requirements entries**, but they have not yet been inserted or reconciled. There is **no verified final API count** yet. This is documentation drift, not an additional API architecture decision.

### Executed validation

- Complete backend suite after backend feature changes: **660 passed, 24 skipped, 582 subtests passed**, 5 warnings. Skips: PostgreSQL schema suite absent local DATABASE_URL; 23 real-media-dataset checks absent dataset. No tests deleted. Existing wishlist DB-double tests now mock the new telemetry collaborator; real persistence/failure-isolation tests separately exercise it against SQLite.
- New recommendation DB/API tests: **25 passed**, included above. Cover owner isolation, retry/bucket dedup, validation, role boundaries, ranking, complementary evidence, publication/category/subcategory/stock exclusion, empty/stale history, wishlist removals, DB failure isolation, FK/cascade checks and migration DDL upgrade/downgrade.
- Complete existing frontend suite before new recommendation tests: **384 passed, 1 skipped, 0 failed**.
- New frontend tests: **8 API/data-flow tests passed** after correcting test HTTP content-type fixtures; **5 SSR/component tests passed** in the earlier combined run. Full frontend suite has not yet been rerun with these additions due to the migration stop.
- Production frontend build passed after placement integration (2679 modules). Later testability/refactoring cleanup has not received a final build rerun.
- All **21 package-defined audit/QA scripts exited 0**, including media, homepage, publication, lifecycle, activity, storefront and product performance. These use the existing audit harness; they are not proof of production catalogue or browser behavior.
- Draft migration upgrade/downgrade DDL tested with SQLite + existing schema attachment pattern. Revision-range SQL generation for PostgreSQL dialect succeeded. `alembic heads` uncovered the blocker above. **No full PostgreSQL migration, PostgreSQL runtime, or PostgreSQL production verification performed.**
- `git diff --check` passed at pause. Changed-file inspection performed; final full implementation review remains.
- Browser: Playwright package installed only in ignored environment. Chromium download failed repeatedly with TLS/ECONNRESET; alternate direct browser download also failed. No browser binary available. **No real-browser AI Mirror/PDP/Cart verification claimed.** SSR checks are explicitly not browser validation.

### Remaining before completion

1. Approved, deployment-aware resolution of the pre-existing migration graph/order hazard; then verify fresh and existing database paths with PostgreSQL where available.
2. Reconcile/update authoritative API requirements, API count/matrices, OpenAPI export, feature/integration/blocker docs in the same implementation. Only this report and generated DB schema docs are updated so far.
3. Final test/build rerun, full diff review, hardcoded-ID/mock/localStorage searches, browser verification when Chromium/live environment is available.
4. Schedule daily retention purge in deployment operations; existing rate limiting is per-process, not a distributed quota.
5. Limitations: cold catalogues without delivered co-purchases have no complementary rail; unknown taxonomy references retain the existing shared fail-open compatibility policy (known inactive nodes are excluded); no PURCHASE event emission yet because purchase affinity uses authoritative order reads. No anonymous personal history, inferred sensitive profile, or ML layer. ML is a future ranking enhancement; the rule-based recommendation feature itself is implemented in code, not classified as future.

### Exact files changed at pause


- `backend/alembic/versions/d8e9f0a1b2c3_add_product_interactions.py`
- `backend/app/api/v1/products.py`
- `backend/app/api/v1/recommendations.py`
- `backend/app/api/v1/router.py`
- `backend/app/models/__init__.py`
- `backend/app/models/customer/product_interaction.py`
- `backend/app/schemas/customer/recommendation.py`
- `backend/app/services/catalog/product_service.py`
- `backend/app/services/catalog/recommendation_service.py`
- `backend/app/services/commerce/cart_service.py`
- `backend/app/services/commerce/wishlist_service.py`
- `backend/schema_audit/expected_schema.json`
- `backend/schema_audit/generate_expected_schema.py`
- `backend/schema_audit/schema_contract.md`
- `backend/scripts/purge_product_interactions.py`
- `backend/tests/unit/test_phase4_customer_data.py`
- `backend/tests/unit/test_recommendations.py`
- `docs/recommendation-implementation-report.md`
- `frontend/src/components/product/ProductRecommendations.jsx`
- `frontend/src/components/product/RecommendationSections.jsx`
- `frontend/src/data/products/recommendations.js` (deleted obsolete client-only scorer)
- `frontend/src/hooks/useRecommendations.js`
- `frontend/src/pages/AtelierDesign.jsx`
- `frontend/src/pages/Cart.jsx`
- `frontend/src/pages/ProductDetail.jsx`
- `frontend/src/pages/account/AiMirror.jsx`
- `frontend/src/services/api/productsApi.js`
- `frontend/src/services/api/recommendationsApi.js`
- `frontend/tests/recommendationRendering.test.js`
- `frontend/tests/recommendations.test.js`
