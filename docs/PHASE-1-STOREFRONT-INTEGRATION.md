# Phase 1 storefront integration

## Runtime contract

- Default remains `AtelierDesign`. No route, environment gate, customer guard,
  authentication, RBAC, cart/wishlist, checkout, payment or backend change.
- Aarna Home mounts `frontend/src/components/storefront/home/AarnaHomeHero.jsx`.
  It subscribes to the existing catalog store's `/home` request; it does not
  fetch another feed or create a marketing register. The existing backend hero
  admin panel already refreshes that store after changes.
- Successful `/home` with an empty hero remains empty (including all-inactive
  configured rows). The backend's canonical no-row/emergency fallback is used
  only when returned by the backend. No static client fallback is substituted.
- Loading and failed home requests have explicit states and existing-store retry.
  Home publishes independently of slower product feeds. Updating hero content
  remounts the reference carousel to reset its index/timer safely.
- The existing editorial hero model derives line breaks and the five layout
  variants from server order; the API has no per-slide layout/focal editor or
  second CTA. The original scoped CSS, assets, animation and interaction logic
  remain. Reference hero data is used only by the existing labelled preview seam.
- Other editorial sections are NOT made CMS-controlled. Product assignment
  references remain browser-local, not durable shared marketing content.

## Non-destructive legacy compatibility

The removed marketing/selector file-upload handlers used to create fake
`PF-CUST-*` published products and Data URLs. Product placements now select
existing catalog records only. The marketing desk points product creation to
its existing backend draft workspace; real registered-media uploads remain in
that workspace and in the backend hero/media panels. There is no automatic
publication or invented pricing/identity.

`pratikshya_custom_products` is no longer read, merged or written by the catalog.
Its stored value is deliberately NOT erased or migrated. Administrators may
retain/export it for manual recovery, then recreate genuine merchandise through
the established backend draft, registered-media, review and publish workflow.
Never import its old publication flags/prices as server truth.

Catalog replacement/upsert, public snapshots and on-demand details reject explicit
local custom markers and inline/blob media records. IDs alone are not evidence
of fabrication: the backend accepts `PF-CUST-*` identifiers too. Placement reads
preserve inert references without creating catalogue rows; only products actually
returned by the backend resolve publicly. Guest cart and other temporary user storage are
unchanged. No database migrations, seeds, connections or mutations were run.

## Verification boundary

Focused Node tests in
`frontend/src/components/storefront/__tests__/phase1Integration.test.js` exercise
real frontend catalog/API modules and server-rendered components with mocked
GET responses only. They cover isolation/storage preservation, product selector
safety, managed hero updates/order/CTAs, empty vs backend fallback responses,
loading/errors/recovery and slow/failed product feeds. They do not prove actual
database rows, media-object availability, payment execution or browser pixel parity.

The older `homeIntegration.test.js` contains an unrelated stale assertion that
only CustomerLayout imports the switch. HEAD already has AccountShell importing
`useAarnaStorefront`; both those files and the test are unchanged by this phase.
It is reported rather than changed as part of homepage integration.

## Focused closure corrections

Closure rendering exposed product-panel guidance accidentally repeated inside
GenericPlacementPanel, referencing out-of-scope variables. Only that accidental
block was removed; generic media uploads remain unchanged. The catalogue guard
now ignores descriptive image metadata (e.g. an alt text beginning "Data:")
instead of mistaking it for inline media, and checks the backend hover-image
field as well. Positive tests cover registered URLs/object keys, valid on-demand
detail loading, search/listing visibility, and rendering all generic panels.

The prefix-only blacklist was also removed: `backend/app/schemas/catalog/product.py`
accepts arbitrary uppercase alphanumeric/hyphen IDs, including `PF-CUST-*`.
A backend-returned product with registered media is admitted even with that
prefix. Legacy browser storage still cannot supply any records to the catalog.
The original failing assertion was executed against both the working tree and a
read-only `git archive` of HEAD; both produced the identical extra AccountShell
importer. The assertion itself was not changed.

## Final production-contract verification

The public `HeroSlide` schema supplies `id`, `title`, `subtitle`, `cta`, `href`,
`image`, `mobileImage`, and `mediaId`. The adapter uses those fields directly;
canonical media URLs use the existing media-origin resolver and absolute CDN
URLs retain their query strings. The public response does not supply admin
`altText`, layout, focal point or a second CTA; those are not claimed as controls.

Contract verification found two refresh gaps: successful admin reorders did not
refresh `/home`, and a forced refresh during an existing hydrate could reuse a
home response fetched before an admin edit. Reorders now request the same forced
hydrate as other mutations. Concurrent forced callers queue one follow-up hydrate
after the existing flight, so a pending product feed cannot silently swallow the
refresh. Normal non-forced hydration still coalesces. Focused tests reproduce both
original defects and cover serialized slide fields, canonical/CDN URLs, missing
hero fields and explicit failed responses (21 tests total). No backend behavior,
database state or production homepage adoption was changed.
