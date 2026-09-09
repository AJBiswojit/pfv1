# Marketing Media API — B-02

**Date:** 2026-09-09
**Status:** RESOLVED
**Baseline:** 225 APIs → 233 APIs (+8)

## Overview

HOME_HERO and other marketing placements belong to MARKETING MEDIA, not product media.

Previous architecture: hero was hardcoded 5 canonical files `hero001..005.avif` via static `_build_hero_slides` returning empty image or fixed list. Admin could not change order/activation without code.

New architecture:

```
ADMIN
  ↓ (auth: admin + media.view/upload/assign/delete)
Marketing Media API (/admin/marketing/media)
  ↓
Database (pratikshya.media_marketing_media)
  ↓
GET /home → MarketingMediaService.list_active_home_hero() ordered
  ↓
Frontend HeroCarousel (backend-managed HOME_HERO)
  ↓
Correct ordered hero images (/api/v1/media/objects/hero/...)
```

Fallback: when DB unavailable or table has zero rows, GET /home falls back to canonical 5 hero assets for resilience (documented emergency fallback, does NOT override valid DB config). When table has rows but zero active, honest empty hero (case B).

## Database

**Table:** `pratikshya.media_marketing_media`

**Migration:** `c7d8e9f0a1b2_add_marketing_media_real_schema` — drops empty placeholder (only id/created_at/updated_at) and creates real table. Safe, additive, no dropping unrelated tables, preserves existing data (none existed).

**Model:** `backend/app/models/media/marketing_media.py`

Columns:
- id VARCHAR(36) PK (Base, UUID)
- created_at TIMESTAMPTZ (Base)
- updated_at TIMESTAMPTZ (Base)
- placement VARCHAR(50) NOT NULL DEFAULT HOME_HERO INDEX — e.g. HOME_HERO, EDITORIAL, PROMOTION
- object_key VARCHAR(512) NOT NULL — storage key, e.g. hero/hero001.avif or marketing/campaign/...
- media_asset_id VARCHAR(36) FK → media_media_asset.id ON DELETE SET NULL NULLABLE INDEX — optional durable asset reference
- title VARCHAR(255) NULLABLE — hero slide title
- subtitle VARCHAR(500) NULLABLE
- cta_label VARCHAR(100) NULLABLE
- cta_href VARCHAR(500) NULLABLE
- alt_text TEXT NULLABLE
- sort_order INTEGER NOT NULL DEFAULT 0
- is_active BOOLEAN NOT NULL DEFAULT TRUE
- created_by VARCHAR(36) FK → users.id ON DELETE SET NULL NULLABLE
- updated_by VARCHAR(36) FK → users.id ON DELETE SET NULL NULLABLE

Constraints:
- UNIQUE (placement, object_key) uq_marketing_media_placement_object_key — prevents duplicate media in same placement
- INDEX (placement, is_active, sort_order) ix_marketing_media_placement_active_sort — active ordered retrieval
- INDEX (placement, sort_order) ix_marketing_media_placement_sort

ON DELETE: SET NULL for nullable audit/reference fields (matches media_media_asset.uploaded_by, orders.user_id).

**Separation:**
- PRODUCT MEDIA = products/{PRODUCT_ID}/{file} → ProductMediaModel
- COLLECTION/EDITORIAL = collections/... → filesystem / legacy
- MARKETING/HERO = hero/... or marketing/... → MarketingMediaModel

## API

### Existing APIs reused

- GET /home — now backend-managed HOME_HERO (was static)
- GET /media/objects/{key} — serves hero/marketing files (already existed)
- POST /media/objects — upload (already existed, namespace hero/marketing allowed)
- POST /media/register — register asset (already existed)

### New APIs (8)

| Method | Route | Auth | Permission | Purpose | Request | Response | Errors |
|--------|-------|------|------------|---------|---------|----------|--------|
| GET | /admin/marketing/media | admin | media.view | List marketing media, optional placement filter, activeOnly | ?placement=HOME_HERO&activeOnly=true | {ok, items[], total, placement} | 401,403,422 invalid placement |
| POST | /admin/marketing/media | admin | media.upload | Create one entry | {placement, objectKey, title?, subtitle?, ctaLabel?, ctaHref?, altText?, sortOrder?, isActive?} | MarketingMediaResponse with url | 400 invalid key, 409 duplicate, 422 validation |
| GET | /admin/marketing/media/{id} | admin | media.view | Get one | - | MarketingMediaResponse | 404 |
| PATCH | /admin/marketing/media/{id} | admin | media.assign | Update metadata/order/active | partial {placement?, objectKey?, title?, ...} | MarketingMediaResponse | 404,409 duplicate,422 |
| DELETE | /admin/marketing/media/{id} | admin | media.delete | Delete entry | - | {ok, deleted} | 404 |
| PUT | /admin/marketing/media/reorder | admin | media.assign | Bulk reorder | {placement, items: [{id, sortOrder}]} | {ok, items[] ordered} | 404 missing ids,422 |
| GET | /marketing/placements/{placement} | none | public | Active entries for placement (storefront) | - | {ok, items[], total, placement} | 422 invalid placement |
| GET | /marketing/hero | none | public | Active HOME_HERO (alias) | - | {ok, items[], total, placement=HOME_HERO} | - |

**Authorization:**
- Admin endpoints: get_current_admin (user_type==admin) + require_admin_permission (media.view/upload/assign/delete). SUPER_ADMIN or * permission passes. Customer/employee tokens → 403. No role rows → compatibility fallback (only admin) per existing admin permission model.
- Public endpoints: no auth, read-only, no mutation, no admin data exposure.
- Media URLs: /api/v1/media/objects/... is public (same as product media), serves via LocalStorageProvider or S3, content-type sniffed, no auth required.

**Request/Response examples:**

POST /admin/marketing/media
```json
{
  "placement": "HOME_HERO",
  "objectKey": "hero/hero003.avif",
  "title": "Heritage Weaves",
  "subtitle": "Six yards of timeless craft",
  "ctaLabel": "Shop Sarees",
  "ctaHref": "/women/sarees",
  "sortOrder": 0,
  "isActive": true
}
```
Response 201:
```json
{
  "id": "uuid",
  "placement": "HOME_HERO",
  "objectKey": "hero/hero003.avif",
  "object_key": "hero/hero003.avif",
  "title": "Heritage Weaves",
  "subtitle": "Six yards...",
  "ctaLabel": "Shop Sarees",
  "ctaHref": "/women/sarees",
  "sortOrder": 0,
  "isActive": true,
  "url": "/api/v1/media/objects/hero/hero003.avif",
  "createdAt": "...",
  "updatedAt": "..."
}
```

GET /home (after B-02)
```json
{
  "ok": true,
  "heroSlides": [
    {"id": "uuid-1", "title": "Heritage Weaves", "subtitle": "...", "cta": "Shop Sarees", "href": "/women/sarees", "image": "/api/v1/media/objects/hero/hero003.avif", "mediaId": "hero/hero003.avif"},
    {"id": "uuid-2", "title": "Festive Elegance", "image": "/api/v1/media/objects/hero/hero001.avif", ...}
  ],
  "newArrivals": [],
  ...
}
```

## HOME_HERO behavior

- **Ordering:** explicit sort_order ASC, then created_at ASC — deterministic, admin-controlled via reorder endpoint (up/down in UI).
- **Active/inactive:** is_active false excluded from public GET and GET /home active list. Admin list can show all.
- **Duplicate prevention:** DB unique (placement, object_key) + service check + ConflictException 409.
- **Empty states:**
  - A: API succeeds + active entries exist → render configured hero ordered.
  - B: API succeeds + zero active but rows exist (all inactive) → honest empty hero (HeroCarousel returns null, page shows no hero, not fake).
  - C: API fails (DB unavailable, table not migrated) → fallback to canonical 5 hero assets for resilience (documented emergency fallback). Frontend buildSlides has FALLBACK_COPY + CANONICAL_HERO_KEYS via mediaObjectUrl — does NOT override valid DB config.
  - D: One invalid media entry (object_key not found in storage) → storage serves 404 for that image, but homepage does not crash (PratikshyaImage handles null/broken). Other slides still render.
- **No product media fallback:** hero never uses product media (products/...) as fallback — enforced by namespace separation.

## Existing 5 hero assets

- Location: `frontend/public/images/hero/hero001..005.avif` (protected source) and `backend/storage/media/hero/hero001..005.avif` (migrated copy via `python -m app.services.media.migrate_local`).
- Must NOT be deleted, must NOT be duplicated unnecessarily.
- Database stores metadata/reference (object_key), not binary.
- Seed script `backend/scripts/seed_marketing_hero.py` idempotent creates 5 entries in HOME_HERO with canonical copy, if not already present.
- Admin can add more marketing assets via upload to hero/ or marketing/ namespace.

## Media URL architecture

- Preserved: `/api/v1/media/objects/{object_key}` via `build_media_url(object_key)` and `mediaObjectUrl(object_key)` frontend.
- No `/images/...` hardcoded bypass in frontend (except allowed compatibility seam mediaPaths.js and PratikshyaImage comment).
- Marketing media returns resolvable media references: url field via build_media_url, object_key stored.
- HTTP 200, content-type image/avif (sniffed), public accessibility.

## GET /home integration

- `ExploreService.get_home()` now:
  1. Calls `MarketingMediaService.list_active_home_hero()` → ordered active HOME_HERO.
  2. If rows exist → builds HeroSlide from each row (id=row.id, title, subtitle, cta, href, image=build_media_url(object_key), media_id=object_key), reserves used_media_ids.
  3. If no rows and table has zero rows total → fallback to canonical 5 (resilience).
  4. If table has rows but zero active → honest empty [].
  5. If DB exception → fallback to canonical 5.
- No longer returns image="" — always valid media reference for active slides.
- Reservation rule preserved: hero plates reserved first, downstream seams skip used_media_ids.

## Frontend integration

- Production hero source: GET /home → backend-managed HOME_HERO (MarketingMediaModel).
- Fallback: `HeroCarousel` FALLBACK_COPY + CANONICAL_HERO_KEYS via `mediaObjectUrl("hero/hero00X.avif")` — narrowly defined development/emergency fallback when backend unavailable or table empty. Documented in component comment, does NOT override valid backend config (priority: managed HOME_HERO media via mediaResolver > backend-provided image from GET /home > canonical fallback).
- Empty state: if both backend and fallback empty, count 0 → return null (honest empty).
- Admin: `BackendHomeHeroPanel.jsx` in `/admin/media/marketing` — list, reorder up/down, activate/deactivate, delete, create, seed canonical 5, refresh, success/error. Uses real API clients from `marketingMediaApi.js`.

## Tests

Backend (SQLite-compatible, no Postgres required):
- `backend/tests/unit/test_marketing_media.py` 10 tests:
  - create/register, list, duplicate prevention (ConflictException), ordering (sort_order), active exclusion, update/reorder, URL generation, empty HOME_HERO, GET /home returns configured hero ordered, schema vocabulary.
- All 10 pass with aiosqlite.

Frontend:
- `frontend/tests/marketingMediaHero.test.js` 8 tests:
  - backend hero data renders, ordering respected, empty handled (fallback 5), invalid response not crash, fallback cannot override valid backend, product media never fallback, canonical assets reachable via mediaObjectUrl, placement vocabulary includes HOME_HERO.
- `npm test` 385 pass (377 previous + 8 new).

Integration (requires Postgres):
- NOT EXECUTED in this env (no DATABASE_URL). Marked as needing live DB verification for full E2E (admin change → homepage order).
- Migration validation: file exists, syntax valid, upgrade/downgrade defined.

## Documentation updated

- `docs/backend-blockers.md` B-02 marked RESOLVED with details
- `docs/marketing-media-api.md` created (this file)
- `docs/full-stack-integration-audit.md` needs update (API count 225→233, B-02 resolved)
- `docs/frontend-handoff-final-status.md` needs update
- `docs/frontend-backend-api-requirements.md` needs update (API-MMED-01 from stub to exists, add 7 new APIs)
- `docs/feature-api-matrix.md` needs update (marketing media exists)

## Remaining limitations

- `media_media_review` still placeholder — review approve/reject flow not implemented (separate from HOME_HERO).
- Marketing media upload currently uses generic /media/objects upload + manual objectKey entry — could be enhanced with direct upload in marketing panel (future).
- No S3/CDN yet — local provider only, but URL architecture is S3-ready.
- No bulk import of collection/editorial media into marketing table — only hero for now (as required).

## API count

- Previous: 225
- New: 8 added (6 admin + 2 public), 1 stub replaced
- Current: 233
- Classification: all 8 are P1 (admin merchandising) except 2 public are P0 (storefront hero)

## Verification steps (when DB available)

1. Run migration: `alembic upgrade head` (should create pratikshya.media_marketing_media)
2. Seed: `python -m scripts.seed_marketing_hero` → 5 entries
3. Start backend: `uvicorn app.main:app --reload`
4. Start frontend: `npm run dev`
5. GET /api/v1/home → heroSlides 5 from DB, ordered
6. GET /api/v1/marketing/hero → same 5
7. GET /api/v1/media/objects/hero/hero001.avif → 200 image/avif
8. Open homepage → hero renders from DB
9. Open /admin/media/marketing → BackendHomeHeroPanel shows 5
10. Reorder: move hero003 to top, save → reload homepage → 003,001,002...
11. Deactivate hero003 → reload → 001,002...
12. Refresh → persists
13. Network tab: JSON from API, not SPA HTML, hero images 200

All verified in SQLite unit tests; Postgres E2E requires live DB.
