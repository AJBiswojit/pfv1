# ADMIN CATEGORY EDIT — "Category not found" on DRAFT categories

## 1. Symptom

`/admin/categories/{id}/edit` for the DRAFT category **Sarees**
(`28664436-3307-4174-87ca-21fbe3c3775b`) rendered:

* the error line **"Category not found."**, and at the same time
* a fully populated form (Name `Sarees`, Slug `sarees`, Status `ACTIVE`),

while PostgreSQL held `status = DRAFT`.

## 2. Root cause

The bug was entirely in the frontend data flow — the backend was already
correct.

```
AdminCategories (list)   → GET /admin/categories        ✅ all statuses
Edit button              → /admin/categories/:id/edit
AdminCategoryForm        → taxonomyRepository.findCategory(id)   ❌
                           └─ catalogStore.getCategoryById(id)
                              └─ in-memory snapshot hydrated from
                                 GET /categories?status=ACTIVE   ❌
```

`taxonomyRepository.findCategory` is a **synchronous lookup into the
storefront catalog snapshot**. That snapshot is hydrated once by
`catalogStore.hydrateCatalog()` from `GET /categories?status=ACTIVE`
(the request seen in DevTools, sometimes served from disk cache), so a
DRAFT or ARCHIVED row is *structurally absent* from it. The edit page
therefore concluded "not found" for every non-ACTIVE category —
independently of the record actually existing.

The "fallback data" half of the symptom had two sources:

1. the form seeded its draft with `emptyDraft`, whose `status` default was
   `TAXONOMY_STATUS.ACTIVE`, and rendered the form *next to* the error
   instead of instead of it; and
2. `normCategory()` / `asCategory()` defaulted an absent `status` to
   `"ACTIVE"`, so an incomplete record could always masquerade as ACTIVE.

A second, latent defect surfaced while tracing the save path: the admin
draft was POST/PATCHed **verbatim in camelCase**, while
`CategoryCreateRequest` / `CategoryUpdateRequest` are snake_case and
Pydantic ignores unknown keys — so `sortOrder`, `bannerMediaId`,
`seoTitle` and `seoDescription` were silently dropped on every save. The
form's `status` `<select>` was likewise inert: `PATCH /admin/categories/{id}`
has no `status` column (lifecycle belongs to `activate` / `archive` /
`restore`).

Backend verification (unchanged, already correct):
`GET /admin/categories/{id}` → `CategoryService.get_admin_category()` →
`_get_category_or_404()` resolves by id **or** slug with **no status
predicate**.

## 3. Fix

Admin detail reads now go to the admin endpoint; storefront discovery is
untouched.

| File | Change |
| --- | --- |
| `frontend/src/services/api/categoriesApi.js` | New `apiAdminGetCategory(idOrSlug)` (`GET /admin/categories/{id}`, no status filter) and `apiAdminListSubcategories(categoryId)`. New `apiAdminActivateCategory(id)` for the DRAFT→ACTIVE transition. New `buildCategoryPayload` / `buildSubcategoryPayload` write normalisers (camelCase desk draft → snake_case API columns; `status` deliberately excluded). `normCategory`/`normSubcategory` no longer default `status` to `ACTIVE`. |
| `frontend/src/services/taxonomyRepository.js` | New async admin reads `loadCategory(idOrSlug)` and `loadSubcategories(categoryId)`; new `activateCategory(id)`. Mutation helpers now propagate the HTTP `status` of a failure so screens can tell 404 from 500/offline. `asCategory`/`asSubcategory` no longer invent an `ACTIVE` status. |
| `frontend/src/pages/admin/taxonomy/AdminCategoryForm.jsx` | Loads the record from `taxonomyRepository.loadCategory` with four explicit, mutually exclusive states (`loading` / `ready` / `notfound` / `error` + Retry). No form — and therefore no values — is rendered unless a server record loaded. Status is shown read-only from the server record with the real lifecycle controls (Activate / Archive / Restore) next to it. Missing `formatAdminError` import fixed. |
| `frontend/src/pages/admin/taxonomy/AdminCategoryDetail.jsx` | Same server-backed load (it was showing "Category unavailable" for every DRAFT record, including right after a save redirect); subcategories come from the admin subcategory list, so DRAFT subs are visible too. |
| `frontend/tests/adminCategoryDraftEdit.test.js` | **New** regression suite (14 tests). |
| `backend/tests/unit/test_admin_category_detail.py` | **New** backend regression suite (8 tests). |

No backend source change was required. **No SQL was run, no migration was
created, no category status was modified.**

## 4. Tests

Backend (`backend/tests/unit/test_admin_category_detail.py`):
CASE 1 admin detail returns DRAFT (200, status preserved) · CASE 2 ACTIVE
returns 200 · admin resolver carries no status predicate and resolves by
slug · CASE 4 storefront list keeps its ACTIVE filter, admin list has none,
public detail 404s a DRAFT record · CASE 5 a read never mutates/promotes the
row (no flush, no add) · CASE 6 unknown id raises `NotFoundException` on both
surfaces.

Frontend (`frontend/tests/adminCategoryDraftEdit.test.js`):
CASE 1/2 admin detail read (no `status=` in the URL, GET only) · CASE 3
`loadCategory` feeds the desk the server record · CASE 3b the form draft is
built from the server record with nothing invented (Name/Slug from the
server, Status `DRAFT`) · CASE 4 storefront `?status=ACTIVE` intact and no
DRAFT leak · CASE 5 no status defaulting, no write/activate call on load ·
CASE 6 real 404 · CASE 7 transport failure ≠ not-found and carries no
fabricated category · first paint is "Loading category…" with no form and no
"Category not found" · source contract: the admin desks may never read
`findCategory` again · the write payload reaches the real columns and never
carries `status`.

Results:

* `backend`: `python -m pytest tests -q` → all pass (23 media tests skipped —
  they require the local media dataset, unchanged by this work).
* `frontend`: `npm test` → 222 passed, 1 skipped, 0 failed.
* `frontend`: `npm run build` → success.

## 5. Behaviour after the fix

* Sarees stays `DRAFT` in PostgreSQL; the admin list still shows it.
* Edit opens the record from `GET /admin/categories/{id}` and shows
  Name `Sarees`, Slug `sarees`, Status `DRAFT`.
* Saving PATCHes the real columns and never changes the status; DRAFT→ACTIVE
  happens only when the administrator presses **Activate**.
* Storefront discovery still requests `?status=ACTIVE`; DRAFT categories stay
  hidden there, and `GET /categories/{id}` still 404s a non-ACTIVE record.
* An unknown id shows a genuine not-found; an API/network failure shows the
  real error with a Retry — neither ever renders a populated form.
* Nothing is specific to "Sarees": the flow is driven by the route parameter
  and the server record for any lifecycle state.
