# Phase 3 — Homepage persistence: discovery and approval plan

**Date:** 2026-10-16 · **Status: PROPOSED — awaiting separate schema/API approval.**

This completes planning Steps 1–2, not persistence implementation. No models, migrations, backend handlers or frontend integration have been changed in Phase 3. No database connection, migration command, seed, database-writing test or other database operation has been executed. Approval of Phase 3 in general is not being treated as approval of this schema.

## 1. Verified starting point

Repository: `AJBiswojit/pfv1`; branch `arena/1c51f76c-pfv1`; HEAD `03bdb9c2744312ff0439361120643e000c549942`. The inherited Phase 1/2 working tree contains 26 changed/new files, not committed changes at HEAD. A SHA-256 inventory of these files was captured before writing this plan at `/home/user/phase3-plan-start-inventory.json`. The index was empty. Existing changes must remain intact.

Read-only discovery covered these actual implementations, rather than relying solely on earlier reports:

| Area | Existing authority and finding |
|---|---|
| Marketing persistence | `backend/app/models/media/marketing_media.py`, `backend/app/schemas/media/marketing.py`, `backend/app/services/media/marketing_media_service.py`, `backend/app/api/v1/marketing_media.py`: `media_marketing_media` owns marketing placement/artwork/copy/order/active state. It has no product-placement or standalone section-text relation. |
| Media identity | `backend/app/models/media/{media_asset,product_media}.py`, `backend/app/api/v1/media.py`, `backend/app/services/media/{media_service,product_media_records}.py`: registered objects and product-gallery ownership already exist. Asset scope defaults to product; it is not reliable evidence that an asset cannot be used editorially. Reuse registration/storage validation, not a new upload system. |
| Public assembly | `backend/app/schemas/catalog/explore.py`, `backend/app/services/catalog/explore_service.py`, `backend/app/api/v1/explore.py`: `/home` exposes `ok`, `heroSlides`, `newArrivals`, `categories`, `sareeEdit`, `brideGroomEdit`, `celebrationEdit`, `saleBanner`. There are no other existing HomeResponse fields. No `/home` response-cache decorator was found. |
| Hero compatibility | `ExploreService.get_home()` uses active `HOME_HERO` rows; rows present but all inactive mean honest empty. No rows, or database failure, can invoke its existing canonical fallback. Existing `HeroSlide.mediaId` is an object key, not an asset UUID; `altText` is not exposed there. Preserve these semantics rather than changing hero ownership. |
| Product authority | `backend/app/services/catalog/product_service.py`: public visibility requires `status == PUBLISHED`, `published == true`, and the existing taxonomy predicate. Known inactive category/subcategory hides a product; unknown legacy taxonomy currently fails open by design. Pricing and media projection already exist. Detail reads may be cached; the placement resolver must not use a cached detail as proof of current publication. |
| Stable product references | `ProductModel.id` is the permanent String(36) primary key, including existing non-UUID identifiers. `product_id` is a separate String(64) display label. `change_product_id()` changes that label only. New FKs must reference `catalog_product.id`, not labels, names or slugs. |
| Authorization | `backend/app/dependencies.py`, `backend/app/core/rbac.py`: existing admin marketing/library routes reject employee tokens before permission checks. `require_staff_permission` reuses the canonical engine but is not itself a staff-type boundary. Existing `marketing.view`/`marketing.manage` capabilities are declared with no implied media grants. |
| Phase 1/2 frontend | `frontend/src/services/homepage/{homepageContentModel,homepageContentService}.js`, `frontend/src/components/admin/BackendHomeHeroPanel.jsx`, `frontend/src/pages/admin/media/AdminMarketingMedia.jsx`, `frontend/src/services/catalog/catalogStore.js`, `frontend/src/components/storefront/home/{AarnaHomeHero.jsx,aarnaHomeHeroModel.js}`: hero writes are durable; non-hero marketing is preparation only; product selection is inspection only; employee access is overview only. Shared forced hydration already queues behind in-flight hydration and must be retained. |
| Actual visual consumers | `frontend/src/components/aarna/pages/Home.jsx`, its eleven non-hero section components and their data/services: sections mix static editorial art/copy with real catalog queries. These are the production integration targets. `home-page/` is read-only reference, not an implementation target. |
| Tests/migrations | Existing backend marketing and migration suites contain SQLite schema/row writes. They were inspected but not run. Static AST parsing of all migration files found **28 revisions, one head `l1a2b3c4d5e1`, no duplicate revision IDs, no missing parents, no parse errors**. Live database revision/schema is unknown. |

**Important migration safety:** `backend/alembic/env.py`'s online path issues `COMMIT`, `CREATE SCHEMA IF NOT EXISTS pratikshya`, and `SET search_path`. Even an apparently informational online Alembic command must not be used at this approval checkpoint. No `alembic current`, upgrade, downgrade, stamp or autogeneration has been executed.

## 2. Scope and ownership decision

Propose **two small homepage-specific tables**, not a generic CMS or another catalog. Section order and supported slots/types are a closed server registry matching the existing twelve sections:

`hero, categories, sarees, bridal, jewellery, promotion, men, kids, bestsellers, kurtis, newsletter, trust`.

- `hero` stays exclusively in existing `media_marketing_media` / `HOME_HERO` and existing `heroSlides` consumption. Do not create a second hero configuration row or a second hero publisher.
- The other eleven sections receive explicit configuration plus typed entries.
- No arbitrary pages, arbitrary section creation, arbitrary JSON payloads, HTML templates, user-defined slot types, scheduling, catalog snapshots or browser-local assignment persistence.
- Existing non-hero marketing placements remain readable/editable legacy preparation records. **Do not auto-import them:** placement names do not establish exact tile/slot identity. The new editor must distinguish legacy preparation from live section entries. An operator can explicitly select the same registered asset for a new slot; that is a new audited assignment, not a silent migration.

### Proposed closed slot registry

`T` = TEXT; `M` = registered MEDIA; `P` = ordered genuine PRODUCT references. `intro` is one TEXT entry where listed. Every T/M slot has capacity one. P capacity is per named slot. Names below are API identifiers, not database-discovered taxonomy IDs.

| Section | Allowed slots / capacity | Consumer behavior |
|---|---|---|
| hero | Delegated; existing hero rows only | Existing carousel, public fallback/empty and refresh semantics unchanged. |
| categories | T `intro`; M `women`, `men`, `kids`, `essentials`; P `women-products`, `men-products`, `kids-products`, `essentials-products` (4 each) | Tile copy/artwork and optional curated previews/counts. Curated counts must be labelled as the selected edit, not invented category totals. |
| sarees | T `intro`, `silk-classics`, `everyday-elegance`, `festive-sarees`, `contemporary-drapes`; M `lookbook-1`, `lookbook-2`, `lookbook-3`; P `products` (4) | Existing lookbook, collection links and four-product row. |
| bridal | T `intro`; M `bride`, `groom`, `couple`; P `bride-products`, `groom-products` (4 each) | Panel copy/artwork; any “from” pricing is computed from eligible referenced backend products, never entered by the editor. |
| jewellery | T `intro`; M `campaign`; P `products` (24) | Existing product theatre/filter UI; filters operate on resolved products, not invented counts. |
| promotion | T `intro`; M `campaign`; no P | Editorial banner/copy/ordinary CTA only. No editable coupon code, discount, expiry, ledger or apply-code action. See commerce boundary below. |
| men | T `intro`, `kurtas`, `bandhgalas`, `sherwanis`, `accessories`; M `campaign`; P `featured` (1), `products` (4) | Editorial artwork, optional real featured-product tag and ordered product row. |
| kids | T `intro`, `girls`, `boys`, `festive`; M `main`, `girls`, `boys`; P `products` (24) | Existing collage/chips and curated products. |
| bestsellers | T `intro`; P `products` (8); no M | Ordered real product cards; no claim that editorial selection is measured sales ranking. |
| kurtis | T `intro`; M `everyday-kurtis`, `anarkalis`, `festive-kurtis`, `kurta-sets`; P with those same four slot names (4 each), plus `pairings` (4) | Existing four mood tabs; media caption comes from that M entry. Pairings are explicitly selected backend products, not automatic fabricated fill. |
| newsletter | T `intro`, `fine-print`; M `campaign`; no P | Content only; subscription remains unavailable/disabled. |
| trust | T `delivery`, `authentic`, `secure`, `returns`, `help`; no M/P | Text, links, row order and active state. Icons remain code-owned and mapped to these keys. |

Filters, icons, animation/layout, crop presets and section order remain code-owned. No editor for arbitrary presentation rules. Slot/type/capacity mismatches are rejected server-side. Duplicate products within a product slot are rejected; using the same product in another section or distinct mood slot is permitted. Do not silently remove intentional curated placements using legacy `/home` seam image-reservation rules; those legacy rules remain unchanged for legacy fields.

## 3. Proposed schema and relationships

Use existing `Base` metadata/schema, UUID-style generated row IDs, UTC timestamps and explicit schema-qualified FKs. Product identity is an opaque existing String(36), not forced through UUID parsing.

### `pratikshya.homepage_section`

| Column | Proposal |
|---|---|
| inherited fields | `id` String(36) PK, `created_at`, `updated_at` as existing Base |
| `section_key` | String(32), NOT NULL, named UNIQUE plus CHECK against the eleven non-hero keys |
| `is_active` | Boolean NOT NULL, server/application default false |
| `revision` | Integer NOT NULL, default 1, CHECK >= 1; authored-write concurrency token |
| `created_by`, `updated_by` | Nullable String(36) FKs to `pratikshya.users.id`, ON DELETE SET NULL |

No rows are inserted by the migration. Missing row is meaningful; GET does not create it.

### `pratikshya.homepage_section_item`

| Column | Proposal |
|---|---|
| inherited fields | Existing Base ID/timestamps |
| `section_id` | String(36) NOT NULL FK to homepage_section.id, ON DELETE CASCADE |
| `slot_key` | String(64) NOT NULL, validated against the closed section registry |
| `content_type` | String(8) NOT NULL, CHECK in TEXT/MEDIA/PRODUCT |
| `media_asset_id` | Nullable String(36) FK to media_media_asset.id, ON DELETE CASCADE |
| `product_id` | Nullable String(36) FK to catalog_product.id, ON DELETE CASCADE |
| editorial fields | Nullable `eyebrow` String(100), `title` String(255), `subtitle` String(500), `cta_label` String(100), `cta_href` String(500), `alt_text` Text with API limit 2,000 |
| ordering/state | `sort_order` Integer NOT NULL default 0, CHECK >= 0; `is_active` Boolean NOT NULL default false |
| audit | Nullable created_by/updated_by user FKs, ON DELETE SET NULL |

Named DB CHECK: TEXT has neither FK; MEDIA has media_asset_id only; PRODUCT has product_id only. PRODUCT cannot store editorial/pricing/identity overrides. TEXT requires meaningful copy at service validation; CTA label/destination are both present or both absent. Unknown request fields are forbidden.

Indexes/uniqueness: `(section_id, content_type, slot_key, is_active, sort_order)` for reads; indexed resource FKs for cascades; UNIQUE `(section_id, slot_key, product_id)`; partial UNIQUE `(section_id, slot_key, content_type)` for non-PRODUCT entries. Slot identity is the section/key/type tuple: for example kids may have both TEXT and MEDIA named `girls`, and a kurti mood may have MEDIA and PRODUCT entries under the same key. Do not make sort_order unique: safe transactional swaps must not fail mid-reorder. Final order is `(sort_order, id)`.

Service checks enforce the cross-table slot/type/capacity rules under the section row lock; CHECK constraints enforce reference shape even outside the API. SQLite tests may cover supported behavior, but PostgreSQL is authoritative for partial indexes/FKs/locking and migration verification.

**Deletion:** deleting a product or registered asset removes only its new homepage association rows through CASCADE. The section row survives, preserving configured-empty/inactive intent. Deleting a homepage entry never deletes a catalog product, asset, product-gallery mapping or object bytes. Actor deletion nulls audit references, not content. Unpublish/archive retains the reference but public reads suppress it. Display-label changes keep references intact; duplication does not copy homepage placements.

Revision covers authored section/entry changes, not external catalog/media lifecycle events or FK cascades. Resolve dependencies fresh; never use revision alone as proof that effective public content is unchanged.

## 4. Proposed staff API

All paths below are beneath `/api/v1`. Reuse FastAPI routers, DTO aliases, exceptions, AsyncSession and the existing permission engine. No global auth-dependency relaxation.

Two workspace-bound route families share one service:

- `/admin/homepage/...` requires existing `get_current_admin`.
- `/employee/homepage/...` requires existing `get_current_employee`.
- Both apply the operation's explicit grants via `require_staff_permission` **after** the workspace guard. No general staff token or borrowed admin context.

| Method and suffix | Contract |
|---|---|
| GET `/sections` | All twelve descriptors in fixed order, including delegated hero, configuration state, allowed slots and authoritative saved entries. Paginate asset/product libraries separately, not this bounded registry. |
| GET `/sections/{key}` | One section, including saved inactive entries and current eligibility warnings. Unknown key => 422. Hero descriptor is read-only/delegated. |
| PUT `/sections/{key}` | Create non-hero container with `expectedRevision: 0`, or update its active state with matching revision. First create defaults inactive and contains no seeded entries. |
| POST `/sections/{key}/items` | Create one registry-valid typed entry; inactive by default; expectedRevision required. |
| PATCH `/sections/{key}/items/{id}` | Edit allowed fields/state/reference within its existing immutable section, slot and type. A replacement resource must pass current validation. |
| DELETE `/sections/{key}/items/{id}?expectedRevision=N` | Delete association/copy only. |
| PUT `/sections/{key}/reorder` | `{expectedRevision, slotKey, contentType, itemIds}`; exact current membership of that typed slot, including inactive entries; reject duplicates, foreign IDs and incomplete sets. Trust entries may be reordered as the fixed TEXT group. Atomic compact sort ordering. |

For cross-slot ordering, the only additional registry groups are trust's `slotKey: "trust-items", contentType: "TEXT"` (its five named TEXT slots) and sarees' `slotKey: "lookbook", contentType: "MEDIA"` (the three lookbook frames). These are explicit closed reorder groups, not arbitrary wildcards or creatable slots. Their consumers render the group's saved order. Other singleton semantic slots have no reorder action; product groups and existing hero slides do. There is deliberately **no section-container DELETE/reset endpoint**: empty/inactive is durable and must not silently restore fallback. Item deletion plus section deactivation provides clear/hide behavior.

All successful mutations return `{ok: true, section: ...}` with the new revision and authoritative saved entries. Create returns 201; update/delete/reorder return 200. Section-scoped lookups include both section ownership and row ID; a foreign section's row is 404 with no mutation. Create races and stale revisions return 409. Lock section, validate expectedRevision, validate complete payload/resource state, flush all changes, increment revision, commit once. Roll back on any error. No partially saved reorder or grant-dependent half mutation.

Examples are **illustrative only**, not fabricated records to seed or IDs to post. `existing-product-pk`, `existing-asset-pk` and `entry-pk` mean actual IDs returned by the server.

```http
PUT /api/v1/admin/homepage/sections/sarees
{"expectedRevision":0,"isActive":false}

POST /api/v1/admin/homepage/sections/sarees/items
{"expectedRevision":1,"slotKey":"intro","contentType":"TEXT",
 "title":"The Saree Edit","subtitle":"Handpicked heritage weaves","isActive":false}

POST /api/v1/admin/homepage/sections/sarees/items
{"expectedRevision":2,"slotKey":"lookbook-1","contentType":"MEDIA",
 "mediaAssetId":"existing-asset-pk","altText":"Detail of the weave","isActive":false}

POST /api/v1/admin/homepage/sections/sarees/items
{"expectedRevision":3,"slotKey":"products","contentType":"PRODUCT",
 "productId":"existing-product-pk","isActive":false}

PATCH /api/v1/admin/homepage/sections/sarees/items/entry-pk
{"expectedRevision":4,"isActive":true}
```

Each save increments revision; later operations must use the returned value, not these illustrative sequence numbers. Container and entry activation are distinct. Activation validates the entries that will become public; inactive drafts are not automatically activated.

### Hero and asset-library boundaries

- Existing admin marketing CRUD URLs and their permission requirements remain. No employee token is accepted there.
- Add employee-only `/employee/homepage/hero/items` list/create, `/hero/items/{id}` patch/delete, and `/hero/reorder`, backed by the existing marketing service/table. Hardcode `HOME_HERO`; reject placement changes and any IDs from other placements. Preserve existing hero sorting/write responses rather than pretending hero has the new section revision contract.
- Employee hero creation takes registered mediaAssetId plus permitted copy/state; derive object key server-side. New employee routes do not expose any other marketing placement or generic media mutation.
- Add only a read-only `/employee/homepage/media-assets?page=1&pageSize=24` projection of eligible registered images, sharing current library/storage helpers. Return `id, objectKey, url, status, mimeType` and paging metadata, no uploader/private storage credentials. No employee upload/register/delete/list-all-object API is added. Admin continues using existing `/media/assets`.
- Creating a HOME_HERO row, moving an existing row into HOME_HERO, or changing its media reference through the existing admin API also receives server-side registered-asset validation. For legacy callers supplying objectKey without mediaAssetId, resolve an actual registered asset by that exact safe key; reject nonexistent/unregistered new references. If both are supplied they must match. This is an intentional **new-write validation tightening**, not a response-shape or permission change.
- Existing key-only marketing rows remain readable. Copy/order/state-only updates on those legacy rows remain compatible; do not force retroactive registration, delete them or change their fallback semantics. New entries/replaced media cannot use that compatibility exception.

## 5. Authorization matrix for approval

Active/account/session checks remain in existing dependencies. SUPER_ADMIN gets the canonical override; ADMIN is not automatically all-powerful. No new default grants, role promotions, permission-mode changes, role seeds or parallel resolver.

| Operation | SUPER_ADMIN (admin workspace) | ADMIN | Employee (employee workspace only) | Customer/anonymous |
|---|---|---|---|---|
| Existing admin marketing/library APIs | Existing policy | Existing media.* policy | Always denied, even with grants | Denied |
| New section read | Allowed | marketing.view | marketing.view | Denied |
| New TEXT/PRODUCT entry/config write, reorder/delete | Allowed | marketing.view AND marketing.manage | Same explicit grants | Denied |
| New MEDIA create/replace/activate | Allowed | Above + media.view AND media.assign | Same explicit grants | Denied |
| MEDIA copy edit/reorder/deactivate | Allowed | marketing.view AND marketing.manage AND media.view AND media.assign | Same explicit grants | Denied |
| MEDIA entry removal | Allowed | marketing.view AND marketing.manage AND media.view AND media.delete | Same explicit grants; association only, no object deletion | Denied |
| Employee asset-library projection | Not an admin route | Not an admin route | marketing.view AND media.view | Denied |
| Employee hero read | Not an admin route | Not an admin route | marketing.view AND media.view | Denied |
| Employee hero create | Not an admin route | Not an admin route | marketing.view AND marketing.manage AND media.view AND media.upload | Denied |
| Employee hero edit/toggle/reorder | Not an admin route | Not an admin route | marketing.view AND marketing.manage AND media.view AND media.assign | Denied |
| Employee hero remove | Not an admin route | Not an admin route | marketing.view AND marketing.manage AND media.view AND media.delete | Denied |
| Public `/home` and published product picker | Allowed | Allowed | Allowed | Allowed, public records only |

Activating a section containing active MEDIA entries requires media.view/media.assign as well as marketing grants; otherwise a container toggle would bypass media activation authority. A deactivation/removal never grants media-object deletion. Generic section listing must not leak restricted asset-library metadata; it may show already-authored content necessary to manage the homepage.

These existing marketing capabilities grant authority over this shared homepage, not branch/customer/private catalog data. New routes enforce workspace and resource membership. Existing media.view-only employees keep the Phase 2 overview/public-product inspection, but **do not acquire editing by implication**. An authorized admin must explicitly assign the required marketing/media grants using existing people/RBAC operations. This plan does not perform those assignments.

## 6. Validation and lifecycle

- PRODUCT accepts only the permanent ID of an actual backend row. No inline product payload, label/slug substitution, synthetic ID, client price, image, published flag or inventory state is accepted. Validate on create/change/activation and on **every public read**.
- Use current ProductService publication/taxonomy logic without changing its legacy fail-open taxonomy policy. Draft/review/rejected/approved-but-unpublished/unpublished/archived/deleted records are never returned as public placements. Homepage operations cannot review, approve, publish or unpublish a product.
- Build public products using existing pricing and registered-media-first/valid-legacy-media resolution. Add a small batch-by-primary-ID helper to ProductService if necessary, reusing `_taxonomy_visible`, `_registered_media_map`, collection/subcategory resolution and `_to_storefront`; do not use cached `get_storefront_product()` as the visibility gate or copy a new pricing implementation.
- MEDIA accepts only a genuine registered, currently uploaded image in a supported image MIME, with a canonical safe key and an object verified through existing storage helpers. No raw URL/key-only new assignment, data URI, blob, inline bytes, traversal or guessed asset ID. Use asset status/MIME, not a newly invented marketing scope enum. Do not change product-gallery ownership.
- Resolve media URLs server-side via canonical storage helpers. Public output never emits inline/blob/unsafe URLs; missing object is suppressed with an admin warning. Storage outage is an availability error, not successful empty content.
- TEXT/MEDIA copy is bounded plain text rendered escaped, never HTML. CTA is a validated single-slash app-relative destination; reject schemes, protocol-relative URLs, controls and backslash/encoded bypasses. Product links/labels/prices come from product projection, not editable placement fields.
- Existing stale references may be deactivated/deleted without requiring the product to be republished. Non-publishing reorder does not resurrect an ineligible product. Public resolution still filters it immediately. Staff reads include warnings such as unpublished/hidden taxonomy/missing media; do not silently erase warnings or claim public eligibility.
- Authentication failures follow existing 401/403 envelopes; missing resource 404; stale revision/duplicate/membership race 409; schema/reference/type/unsafe input 422 using existing validation/business-exception conventions; unavailable storage/database 503 where not handled as the additive public status below. No partial writes.

## 7. Additive public API and honest states

Keep **every existing `/home` field, type, meaning and legacy hero/seam reservation path**. Add only `homepageContent` to HomeResponse:

```json
{
  "ok": true,
  "heroSlides": [],
  "newArrivals": [],
  "categories": [],
  "sareeEdit": {"id":"saree-edit","title":"The Saree Edit","subtitle":"","image":"","href":"","products":[]},
  "brideGroomEdit": {"id":"bride-groom-edit","title":"Bride & Groom Edit","subtitle":"","image":"","href":"","products":[]},
  "celebrationEdit": {"id":"celebration-edit","title":"The Celebration Edit","subtitle":"","image":"","href":"","products":[]},
  "saleBanner": null,
  "homepageContent": {
    "version": 1,
    "status": "ready",
    "sections": [
      {"key":"hero","source":"heroSlides","state":"delegated"},
      {"key":"categories","source":"legacy","state":"missing","configured":false,"items":[]},
      {"key":"sarees","source":"sections","state":"inactive","configured":true,"isActive":false,"revision":5,"items":[]}
    ]
  }
}
```

This is an abbreviated **shape example**, not a live response or a proposed overwrite of legacy values. Actual legacy data is unchanged. Actual `sections` contains all twelve descriptors. Ready public entries carry `id, slotKey, contentType, sortOrder` plus a typed `text`, `media` or `product` projection; no draft entries, audit user IDs or private model fields. Product projection is the existing StorefrontProduct shape. Media projection contains registered identity, canonical URL and approved editorial copy. TEXT has no media/product reference.

| Condition | Public result / frontend rule |
|---|---|
| No section row | `missing`, configured false, source legacy. Preserve that section's existing code-owned/catalog-backed behavior; do not label it backend-saved content. No new reference/demo fallback. |
| Saved inactive section | `inactive`, configured true, empty public items; hide section. Never revive static/catalog filler. |
| Active section, no active eligible entries | `empty`, configured true, items []; hide section. Deleting last entry does not delete the container. |
| Active valid entries | `ready`; preserve authored order, render only these entries. Missing individual slots remain absent, not statically refilled. |
| Product unpublish/taxonomy hide/archive | Suppress product immediately on next fresh public response; retain authored reference and staff warning. Other valid entries remain. |
| Product/asset hard deletion | FK removes the entry, not its section; empty stays empty. |
| Invalid/missing media object | Suppress entry, staff warning; no broken/fabricated fallback artwork. |
| New-table/query/storage unavailable | `homepageContent.status = unavailable`; affected descriptors unavailable, not missing/empty. Keep already assembled legacy fields/hero semantics. UI shows unavailable/retry rather than treating the failure as permission to restore static content. Contain/roll back failed read transactions; do not leave a PostgreSQL session aborted and then commit it. |
| Older backend omits entire new field | Explicit backward-compatible legacy mode; Phase 1 hero remains authoritative. This is distinct from a new backend returning unavailable. |

First configuration switches that section away from legacy fallback. Because new configuration defaults inactive, **the UI must confirm that the first saved configuration initially hides the legacy section**. This is not a separate published/draft-copy system. Saved and active are separate truthful states.

Do not add a `/home` response/content cache in this phase. Query current referenced products and taxonomy before serialization; batch media/resource lookups. External lifecycle changes need no homepage-cache TTL to expire. Existing product cache invalidation stays intact. Do not trust an earlier active snapshot or the browser catalog as proof of current eligibility.

## 8. Frontend integration after approval/implementation

1. Implement and test backend contracts first. Add workspace-aware homepage API methods using existing apiClient scopes; employee routes use employee token only, including when an admin session is also present. Admin legacy hero continues on its existing API.
2. Extend the Phase 2 registry/service with server-supplied allowed slots, grants, revisions and authoritative saved entries. Keep registered-media/public-product pickers. Remove “contract required/inspection only” labels only for operations actually implemented and authorized. Other operations stay unavailable with a reason.
3. Keep pending edits, cancel/discard, saving lock, validation, 409 reload/reconcile and retry. Never blindly retry a stale revision or claim success on local selection. On uncertain network outcome, reload authoritative state before retrying; creation uniqueness prevents duplicate assignments.
4. After a committed mutation, reload staff state and force the existing shared public refresh. Preserve the queued-flight behavior. If save succeeded but reload/public refresh failed, say exactly that; do not turn it into “not saved” or fake a synchronized storefront. Reload/remount must recover from the backend without browser placement storage.
5. Integrate the eleven existing Aarna section components through a small shared `/home` section adapter. Preserve classes/animations/route gates/default home selection. No reference-directory edits. Only configured sections consume new projections; missing sections preserve existing behavior, inactive/empty sections do not fall back.
6. Existing Atelier/default homepage and older consumers continue reading unchanged legacy fields. Their UI is not being redesigned to mirror the Aarna twelve-section layout. Both builds/gates must still work.
7. Promotion configuration is editorial only: reuse visual styling with ordinary CTA and hide coupon-specific ledger/apply controls in configured-editorial mode. Unconfigured legacy promotion behavior and all coupon/checkout validation remain unchanged. A real offer-link contract would require a separate scope decision; do not invent one here.
8. Newsletter configuration changes copy/artwork only. Keep current unavailable subscription service/form behavior; no new submit endpoint, simulated success or subscription claim.

## 9. Migration, deployment and rollback

Propose one manually reviewed additive Alembic revision, e.g. `p3hp20261016a`, **down_revision `l1a2b3c4d5e1`**, subject to rechecking the graph before implementation. Create only the two tables, their constraints/indexes/FKs. Add matching model imports to existing metadata discovery. No seeds/backfill, marketing-row rewrite, catalog rewrite or permission assignment.

Approval is requested for implementing this plan and running its schema/row-writing tests **only in an explicitly disposable test database**. It is not authorization to mutate an unidentified live/shared/production database. Before any live/shared migration, separately confirm target, backup/restore route and authorization.

After approval, verify the target's actual schema and `pratikshya.pratikshya_alembic_version` with genuinely read-only SQL before using online Alembic. If it is not at the verified parent, stop: do not stamp it or run all historical migrations to catch up. Existing historical migrations include catalog/inventory backfills; those are not authorized by this homepage addition. Report schema drift rather than hiding it.

Rollout: backup target and record legacy row counts/checksums; test parent → new revision → parent → new revision on disposable PostgreSQL; apply additive migration to an explicitly authorized target; deploy backend before enabling new frontend controls. No default-home/environment-gate change. Missing tables/new backend errors must be visibly unavailable, not reported as saved.

Rollback preference: revert the application integration while leaving additive tables/data intact. Old application versions ignore them. If schema downgrade is explicitly chosen, first export the two new tables, stop new writers, and downgrade **only this revision**: drop item table before section table. Downgrade destroys new homepage configuration, but must not alter legacy marketing, products, media, users, commerce or historical migration data. Never run downgrade-to-base or rewrite old migrations. Recovery of new entries requires the export/backup.

## 10. Verification required after approval

- **Schema/graph:** matching models/DDL, FK types/schema, closed checks, uniqueness, partial singleton index, cascade/SET NULL behavior; one head, correct parent; upgrade/downgrade/upgrade on PostgreSQL; legacy rows/checksums unchanged. Static graph tests alone are not migration acceptance.
- **Authorization:** missing/expired/inactive/suspended sessions; SUPER_ADMIN; provisioned/unassigned ADMIN; role/custom/wildcard grants through canonical resolver; employee view-only, manage-only and complete grant combinations; separate media delete authority; customer even with forged/granted strings; admin/employee cross-workspace tokens; coexisting browser sessions; denial before mutation.
- **Scope:** foreign-section IDs, nonhero IDs on employee hero routes, mixed-placement reorder, invalid keys/slots/types/capacities, duplicate and incomplete reorder sets, missing resources, forbidden extra fields and fabricated identity/pricing/media.
- **Lifecycle/media:** draft/review/rejected/approved-only/published/unpublished/archived/deleted products; known hidden taxonomy and preserved unknown-taxonomy compatibility; current pricing changes, registered gallery changes, invalid/inline/blob/missing objects, storage outage; label change and duplicate-product behavior; fresh reads despite stale product-detail cache.
- **CRUD/durability:** create/edit/reorder/toggle/delete every allowed type; revision races and all-or-nothing transactions; reload/new session/remount; empty/inactive/missing/unavailable; section activation cannot bypass media permission; no GET-side row creation.
- **Public compatibility:** exact legacy fields/hero fallback/empty behavior, no new hero owner, no silent import of nonhero marketing, all twelve descriptors, typed safe projections, no inactive/audit/private output, dependency deletion/unpublish suppression with no public cache delay.
- **Frontend:** existing Phase 1/2 focused and wider related suites; workspace-token isolation; save vs failed reload; pending state; conflict retry; configured-empty no fallback; old backend/no extension; both home variants/builds and unchanged gates; promotion/newsletter exclusions; no custom-product/browser-local assignment persistence.

Where PostgreSQL/storage/runtime access is unavailable, report the missing verification explicitly, not as a pass or as evidence of production durability. Separate pre-existing failures from new regressions without editing unrelated tests for green results.

## 11. Executed verification at this planning checkpoint

These are **fresh executions on the current Phase 1/2 worktree**, not Phase 3 database acceptance:

```sh
# cwd: frontend
node --import ./scripts/node-loader/register.mjs --test \
  src/components/admin/homepage/__tests__/homepageContentControl.test.js \
  src/components/storefront/__tests__/phase1Integration.test.js \
  src/components/storefront/home/__tests__/heroModel.test.js \
  src/components/storefront/home/__tests__/heroEditorialRender.test.js \
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
VITE_STOREFRONT_HOME=aarna npm run build
npm run build
```

Results: **240 passed, 0 failed, 0 skipped** (65.46 s); Aarna build passed (13.80 s); default build passed (13.07 s), default built last. Logs: `/home/user/phase3-plan-regressions.log`, `/home/user/phase3-plan-build-aarna.log`, `/home/user/phase3-plan-build-default.log`. These tests are frontend/source/mocked interaction checks, not real DB/media/browser acceptance. The renderer's upstream deprecation notices are not failures.

The broader known baseline failures documented in the Phase 2 report were **not rerun** here; no claim is made that the entire repository test suite is green. No backend test was executed because inspected suites can write database state, including local SQLite.

Final checks executed from repository root:

```sh
node frontend/scripts/aarna-port.js --check
git diff --check
# Read-only Python stdlib ast/hashlib audit of migration declarations,
# initial SHA-256 inventory, git status/index/branch/HEAD and protected paths.
```

Results: source parity passed (55 copied files, 88,885 CSS bytes); tracked diff and new-plan whitespace checks passed; **all 26 inherited Phase 1/2 files remain byte-identical** to the planning checkpoint start; only this new plan is added. Index remains empty; branch/HEAD unchanged; backend/reference/ignore files untouched. Repeated AST audit confirmed the same 28-revision, single-head graph with no duplicates/missing parents. No backend imports or database commands were involved in this audit.

## 12. Exact Phase 3 changes, intended implementation paths and approval

**Changed in this checkpoint:** only `docs/PHASE-3-HOMEPAGE-PERSISTENCE-PLAN.md` (new). All inherited Phase 1/2 changes are separate preserved work. No migration file exists for this proposal yet. No package/dependency, `.gitignore`, reference, auth, checkout or production route/default change is part of this checkpoint. No staging, commit, push or PR.

Expected implementation locations after approval (proposed, not implemented):

- New `backend/app/models/media/homepage_section.py` (both models), `backend/app/schemas/media/homepage.py`, `backend/app/services/media/homepage_content_service.py`, `backend/app/api/v1/homepage.py`, and one new file under `backend/alembic/versions/`.
- Registration/additive integration in `backend/app/models/__init__.py`, `backend/app/api/v1/router.py`, `backend/app/schemas/catalog/explore.py`, `backend/app/services/catalog/explore_service.py`.
- Small shared product batch projection helper in `backend/app/services/catalog/product_service.py`; scoped new-reference validation in `backend/app/services/media/marketing_media_service.py`; reuse/extract asset-library query helpers without widening old route guards.
- New backend homepage tests under `backend/tests/unit/` and isolated PostgreSQL migration coverage where available.
- Workspace-scoped API methods under `frontend/src/services/api/`; extend existing `frontend/src/services/homepage/` and admin homepage components/page; shared public adapter under `frontend/src/components/storefront/home/`; integrate only the existing eleven non-hero Aarna section components; related tests in visible component `__tests__` directories.
- Exact final changed-path inventory, implemented vs proposed APIs, commands/results, migration target/status and limitations will be supplied after implementation, not guessed now.

**Checkpoint verdict: PASS WITH LIMITATIONS for Steps 1–2.** The schema/API/permission/deployment choices above are proposed. Backend persistence, employee write access, live section rendering and migration acceptance are not delivered yet.

**Approval requested:** approve this two-table, closed-slot schema; additive `/home` contract and missing/inactive/empty behavior; explicit employee routes using the matrix above; narrowly tightened new hero-reference validation with legacy-row compatibility; and disposable-test-database mutation/migration verification. Live/shared database changes remain separately gated on target authorization. Stop here until that approval. No Phase 4 is authorized.
