# Phase 2 — Homepage Content Control Center

## Entry points and source authority

The existing `/admin/media/marketing` and `/super-admin/media/marketing`
module is now the unified Homepage Content Control Center. Existing Media
navigation points to it. `/employee/media/marketing` exposes the same section
inventory, under the existing employee route guard and `media.view` rule.
There is no new sign-in boundary, branch scope, CMS table, persistence layer,
local-storage publishing system, or catalogue authority.

`home-page/src/pages/Home.jsx` is the read-only twelve-section visual inventory.
Production frontend/backend APIs, DTOs, auth and lifecycle remain authoritative.
Phase 1's default selection, home feed adapter, admission guard, local custom
record isolation and queued forced-refresh behavior are retained.

## Implemented interface

- Twelve sections in visual order with MEDIA / PRODUCT / TEXT views.
- Current backend placement entries, active/inactive state and saved status.
- New entries select existing safe registered image assets. No device file
  input or product-creation path exists in this editor. The existing global
  upload/registration page is linked only for permitted administrators.
- The existing durable `BackendHomeHeroPanel` is extended to accept existing
  placement names, registered asset selection and editable copy. Its preset
  seed/direct-device form is replaced by the registered-media workflow; it
  still uses the same backend marketing services and shared catalog refresh.
- MEDIA: create inactive rows, replace media, edit supported metadata,
  activate/deactivate, reorder and remove placement rows. Removing an entry
  never deletes a media object or product.
- TEXT: edit title, subtitle, CTA label, CTA destination and altText on an
  existing media-backed row. No standalone text records are invented.
- Dirty/saving state, disabled section/type changes while pending, explicit
  cancel/discard, unload warning, server rejection, loading/error/empty/retry,
  and distinct successful-save/failed-reload reporting.
- PRODUCT: paginated selection from the public catalogue only. Eligible rows
  must be published and pass Phase 1 record/media safety. Draft, review,
  approved-but-unpublished, archived, hidden and inline-media records are
  excluded. Selections are explicitly inspection-only and unsaved; refreshing
  clears them, so a product removed/unpublished on the backend cannot remain
  selected after reload. No product assignment mutation or local persistence.

The registration library is paginated; safe image MIME types only are offered
because these homepage renderers consume images, not video. Namespace/segment
validation mirrors the existing object-key vocabulary. Data/blob/javascript,
unsafe keys and non-image assets are not selectable. HTTP(S) CDN URLs and
canonical media URLs use the existing media-origin resolver.

## Verified existing contracts

### API and permissions

| Existing operation | Endpoint | Existing permission |
|---|---|---|
| Placement read | GET `/admin/marketing/media?placement=...` | `media.view` |
| Placement create | POST `/admin/marketing/media` | `media.upload` |
| Copy/media/active update | PATCH `/admin/marketing/media/{id}` | `media.assign` |
| Placement reorder | PUT `/admin/marketing/media/reorder` | `media.assign` |
| Placement row removal | DELETE `/admin/marketing/media/{id}` | `media.delete` |
| Registered library | GET `/media/assets?page=...&pageSize=...` | `media.view` |
| Published catalogue | GET `/products` | Public, backend publication/taxonomy gate |

Every marketing/library endpoint additionally requires `get_current_admin`.
`backend/app/dependencies.py` rejects `user_type != "admin"` before capability
checks. The new UI/services use `hasAdminPermission` and the existing capability
expansion; ADMIN is not an automatic full grant, SUPER_ADMIN retains its
existing active-account override, and delete is separate from media.manage.
Requests continue through the existing admin-scoped API client. Backend guards
remain authoritative even if frontend controls are bypassed.

Employees with `media.view` can see the overview and inspect public products.
Even employees with `media.manage` cannot durably edit through current APIs.
No admin token is borrowed when the page runs in the employee workspace,
even if another admin session exists in the same browser.

### Persistence shape

`MarketingMediaCreate/Update` support placement, objectKey, mediaAssetId,
title, subtitle, ctaLabel, ctaHref, altText, sortOrder and isActive. MEDIA/TEXT
are interface views over that DTO, not new persistent content-type fields.
The payload is whitelisted; product IDs, prices and publication flags are not
accepted as marketing row fields. New rows start inactive until an operator
explicitly activates them.

All successful writes reload the server list and request the existing forced
catalog hydration. Forced requests during another hydrate queue/coalesce per
Phase 1, and reorders follow the same refresh path. The hero consumes `/home`
through the existing shared store and adapter, not this editor's local form.

## Section coverage and exact gaps

| Reference section | Existing durable placement used in this UI | Current Aarna effect |
|---|---|---|
| Home hero | HOME_HERO | Live through existing `/home` integration |
| Category collage | None | Code-owned tile/copy structure; catalogue supplies product counts |
| Saree lookbook | SAREE_SECTION | Related placement preparation only |
| Bridal campaign | BRIDAL_SECTION | Related placement preparation only |
| Jewellery theatre | JEWELLERY_SECTION | Related placement preparation only |
| Promotion banner | PROMOTION | Related artwork/copy preparation only; does not change offers/coupons |
| Men’s editorial | GROOM_SECTION | Related placement preparation only, not an official mens-section slot |
| Kids playground | KIDS_SECTION | Related placement preparation only |
| Bestsellers | None | Existing catalogue selection; no durable section-product relation |
| Kurti lookbook | None | No dedicated kurti placement/slot contract |
| Newsletter | None | No section-copy DTO or verified subscription endpoint |
| Trust strip | None | No durable item/copy/ordering DTO |

Non-hero placement grouping is an explicit administrative preparation aid,
not a new backend section mapping. No existing placement is advertised as an
Aarna consumer merely because the namespace exists. No change was made to
storefront sections to pretend they consume these rows.

## Deferred contract work — Phase 3 requires separate approval

1. **Employee access:** a backend employee-capable marketing/library surface
   with existing permission enforcement and matching token scope. Frontend
   permission checks alone cannot authorize current admin-only endpoints.
2. **PRODUCT assignment:** a section/slot-to-product identity relation and
   read/write DTO, including ordering and authoritative public resolution.
   `MarketingMediaCreate/Update` have no productId/productIds/contentType field.
   The legacy browser-local marketingPlacementRepository is not a replacement.
3. **Standalone section TEXT and exact section structure:** stable section/slot
   identifiers and supported payloads for collage tiles, bestsellers/kurti
   curation, newsletter copy and trust items. Media-backed copy is not a
   general section-text store and cannot be repurposed using fake object keys.
4. **Non-hero storefront consumption:** an approved section mapping/render
   contract is needed before preparation rows can be presented as live section
   controls. Existing `/home` sections are assembled by the backend; there is
   no admin write DTO for those section objects.
5. **Hero art direction/accessibility fields:** public HeroSlide currently does
   not expose stored admin altText, layout or focal-point controls. The existing
   frontend defaults/derivations remain; the control center warns about altText.
6. **Newsletter:** consent/subscription API and persistence have not been
   verified. The existing production subscription boundary stays unavailable;
   no subscription operation or success is simulated here.

No Phase 3 schema/API/migration or authentication expansion was undertaken.

## Lifecycle and preservation

Product creation, submit/review, approval, publish and unpublish remain in the
existing product workspace. The public catalogue API enforces PUBLISHED,
published=true and active taxonomy. Product deletion and the existing CASCADE
relations in ProductMediaModel were not altered. Marketing-entry deletion
uses only the marketing API, never the product or media-object delete API.

`pratikshya_custom_products` is neither erased nor imported. Guest storage is
untouched. `home-page/`, `.gitignore`, backend schemas/services/migrations,
authentication, cart, wishlist, checkout, payment, production homepage defaults
and storefront route/environment gates remain unchanged. App gains only the
permission-guarded employee control-center route.

## Verification boundary

`src/components/admin/homepage/__tests__/homepageContentControl.test.js` uses
real React interactions, the real existing API clients, mocked HTTP responses
and an in-memory server-response fixture, not a database. It verifies RBAC,
public-product safety, registered media, exact write payloads, save/list reload,
remount, refresh, reorder, rejection/dirty state, pending/saving, empty/loading,
error/retry and legacy-storage preservation. The test-only dev dependency
react-test-renderer is pinned to React's version; no runtime dependency changed.

Relevant Phase 1 assertions were updated only for the registered-media/editor
refactor; hero behavior, isolation and forced-refresh tests remain. The older
homeIntegration assertion about CustomerLayout being the sole switch importer
is unchanged and continues to be reported separately as a baseline failure.

Mocked save/reload tests establish frontend contract behavior, not real DB
persistence or cross-user refresh. No database mutations or live backend writes
were run. Browser visual parity and real object delivery remain unverified.
See the final completion report for executed commands and final results.

### Focused test command

```sh
cd frontend
node --import ./scripts/node-loader/register.mjs --test \
  src/components/admin/homepage/__tests__/homepageContentControl.test.js \
  src/components/storefront/__tests__/phase1Integration.test.js
```

Manual placement refresh also refreshes the shared public home snapshot;
confirmed writes request that refresh even if the subsequent admin list reload
fails. The focused control-center suite contains 22 tests.

### Existing upload-page boundary

The “Register media” link reuses the existing product-media registration page;
its legacy marketing-upload tab still reports its own blocker. This center
selects already-registered images and does not add a new upload path. The
existing low-level `/media/register` API can register a stored object without a
product association, but no standalone upload/registration UI is invented here.
The legacy marketing stubs in `mediaApi.js` are not used for placement saves;
the real `marketingMediaApi.js` contract is used instead.
