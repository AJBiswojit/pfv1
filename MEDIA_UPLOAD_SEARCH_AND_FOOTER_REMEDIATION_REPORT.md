# PRATIKSHYA FASHION — Media Upload Page: Search Fix, Banner Removal & Footer Remediation

Branch: `arena/c38ce309-pfv1` (contains the merged `arena/dd367471-pfv1` work at `c94fef4`)
Date: 2026-10-23 · Surface: `/super-admin/media/upload` (and `/admin/media/upload`, `/employee/media/upload`)

---

## 1. Verified root cause of the stuck catalogue search

**The request was never the problem. The response was thrown away by a StrictMode-unsafe
mount guard.**

`useAdminProductSearch` (and `MediaUploadForm`) kept a ref initialised as
`useRef(true)` whose only mutation was inside an effect **cleanup**:

```js
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);
```

`frontend/src/main.jsx` renders the app inside `<React.StrictMode>`. In development
StrictMode runs every effect as **setup → cleanup → setup** on the first mount. After
that simulated unmount the ref stayed `false` for the rest of the session (nothing ever
set it back to `true`), so the stale-response guard

```js
if (!mountedRef.current || requestId !== requestIdRef.current) return;
```

discarded **every** search response — including responses to requests issued *after*
the remount. `status` therefore never left `"loading"`, the input spinner and the
"Searching the catalogue…" row persisted forever, and no row could ever be selected.
Production builds do not double-invoke effects, which is why only the dev server
(`localhost:5173`, the screenshot) exhibited the bug. The same defect in
`MediaUploadForm` also discarded the authoritative "read the product's existing media"
result, so after selecting a product the form could stay stuck on
"Reading this product's existing media from the server…" with submit disabled.

**Proof (red → green):** the new behavioural suite mounts the real hook and the real
selector under `<StrictMode>` (react-test-renderer, already a devDependency) with a
stubbed `fetch`. Against the pre-fix source (verified by reverting the two files and
re-running): **10/10 "031" tests fail**, first failure
`loading must clear once the server answers — 'ready' !== 'loading'` inverted, i.e.
status stuck at `loading` although the stub answered 200 with products. With the fix:
**13/13 pass**.

## 2. Endpoint / request / response evidence (live local API)

PostgreSQL is not installable in this sandbox, so the **production FastAPI app**
(`app.main:app`, full router graph, real JWT auth, real RBAC, real media pipeline) was
booted against a throwaway SQLite database using the repository's own integration
harness pattern (`backend/tests/integration/test_phase3_step11c_*.py`: JSONB→JSON
compile hook, ATTACHed `pratikshya` schema, `Base.metadata.create_all`). Harness-only
substitutions, none in application code: SQLite engine, pool-arg strip for the SQLite
NullPool, and skipping the PostgreSQL-only `information_schema` startup probe.

Super Admin seeded through the same fields as `scripts/create_admin.py`
(`account_level="SUPER_ADMIN"`); three products seeded (`PF-W-0042`, `PF-K-0007`,
`PF-B-0101`).

| Request | Result |
|---|---|
| `POST /api/v1/auth/super-admin/sign-in` `{adminId, password}` | 200, JWT issued (399 chars) |
| `GET /api/v1/admin/products?q=PF-W-0042&page=1&pageSize=20&sort=newest` + `Authorization: Bearer …` | **HTTP 200** — `{"ok":true,"items":[{"id":"pf-live-0001","name":"Banarasi Silk Sari","sku":"PF-W-0042",…}],"total":1,"page":1,"pageSize":20}` |
| Same URL with `q=zzz-no-match` | **HTTP 200** — `{"ok":true,"items":[],"total":0,…}` (honest empty) |
| Same URL without token / with garbage token | **HTTP 401** (auth enforced; frontend maps to error + retry) |
| Same URL **through the Vite dev proxy** `http://localhost:5173/api/v1/admin/products?q=PF-W-0042…` | **HTTP 200**, identical payload — the exact path the browser's `apiClient` (`BASE_URL=/api/v1`) uses |

The response shape (`items` + full filtered `total` + `page`/`pageSize`) is exactly what
`normaliseProductList` parses. **Conclusion: backend, auth, query params, paging and
response mapping were all correct; the discard happened client-side after a 200.**

## 3. Files changed and why

| File | Change |
|---|---|
| `frontend/src/hooks/useAdminProductSearch.js` | Mount guard re-arms on effect setup (`mountedRef.current = true` in setup, `false` in cleanup) — MEDIA-UPLOAD-031. Debounce (300 ms), request-id stale discard, paging/`loadMore`, `retry`, `enabled:false` inert mode all unchanged. |
| `frontend/src/components/media/MediaUploadForm.jsx` | (a) same mount-guard fix for the authoritative product read and post-upload reconciliation; (b) **pipeline banner removed** (MEDIA-UPLOAD-032) — the marketing-honesty sentence it carried now lives as one plain-language helper line under the scope switch, which `test/mediaTerminology.test.js` pins; (c) **action footer redesigned** (MEDIA-UPLOAD-033): sticky bar on `pf-card` with `pf-border` rule, status copy left (`role="status"`), actions right — Cancel = gold-hairline outline (`border-pf-border-strong`, muted type, warms to burgundy on hover, gold focus ring), primary = solid house burgundy plate (`bg-pf-burgundy` / `text-pf-ivory`) with `Upload` icon, soft shadow, `hover:bg-pf-wine-soft`, gold focus ring, `sm:min-w-56`; both carry explicit equal padding (the old buttons asked the Atelier scale for a `size` that does not exist and inherited *no* padding), stack full-width primary-first below `sm`, never clip or overflow; (d) vertical rhythm: form `space-y-6`, dropzone wrapped in the same `border-mist/80 bg-canvas p-5` card as the destination block. |
| `frontend/src/config/mediaTypes.js` | `UPLOAD_NOTICE` / `UPLOAD_NOTICE_COPY` marked legacy (only the un-routed `MediaUploadPanel` still imports them); live form no longer imports or renders them. |
| `frontend/tests/mediaUploadSearchRemediation.test.js` | **New** regression suite (13 tests): StrictMode behavioural loading/success/empty/error/retry/stale-discard for the hook; selector open/keyboard-select/Escape/empty/error+retry; source guards for 031/032/033. Whitelisted in `frontend/.gitignore` alongside the other media-upload suites (repo convention). |
| `frontend/.gitignore` | Whitelist entry for the new suite. |

No new endpoint, no new dependency, no RBAC/auth change, no DTO change, no navigation
invented: Cancel still routes through `requestCancel` (no uncommitted work → media
desk; otherwise the existing confirm dialog whose copy already states that a stopped
upload may have stored files). Cancel is deliberately **not** disabled while busy —
that dialog is its safe outcome. Double-submit remains blocked (`if (busy) return` in
`handleSubmit` + disabled submit). No `/media/register` call added; single-write flow
untouched.

## 4. Before / after UI behaviour

| Aspect | Before | After |
|---|---|---|
| Product search (dev server) | Spinner forever; dropdown stuck on "Searching the catalogue…"; nothing selectable | Brief honest spinner while in flight; rows with image, name, real SKU, category, status chip and price; "N of total" footer with Load more |
| No match | unreachable (stuck) | "No products found matching “q”" / "No products in the catalogue yet" |
| Failed request | unreachable (stuck) | Readable server message + "Try again" that recovers |
| Banner | ~90 px warning-toned disclosure: "DURABLE MEDIA PIPELINE ACTIVE", "Phase 7", "object store" | Gone; page header + field labels + dropzone instructions carry the guidance |
| Footer buttons | Cramped; primary `bg-ink` override off-system; Cancel a bare hairline; no padding from a non-existent size | Burgundy primary plate with icon + shadow + focus ring; subordinate outlined Cancel; aligned right on one row ≥ sm, stacked full-width on phones; sticky so the CTA is never below the fold at 1366×768 |
| After selecting a product | Could stay stuck on "Reading this product's existing media…" (same guard bug) | Read completes; registered-media summary, cover intent and submit enablement reflect the server state |

## 5. Tests run (exact counts)

| Suite | Result |
|---|---|
| New `tests/mediaUploadSearchRemediation.test.js` (post-fix) | **13 pass / 0 fail** |
| Same suite against pre-fix source (`031` pattern) | **0 pass / 10 fail** (root-cause evidence) |
| Targeted media suites: `mediaProductSearch`, `mediaUploadSurface`, `mediaUploadRecovery`, `mediaUploadContract`, `mediaUploadReconciliation` | **85 pass / 0 fail** |
| `test/mediaTerminology.test.js` + new suite | **26 pass / 0 fail** |
| Frontend Phase-3 product suites (`phase3ProductMediaHonesty`, `phase3ProductCreate`, `phase3ProductAvailability`) | **42 pass / 0 fail** |
| **F3 authorization regressions** — `backend/tests/unit/test_phase7_media_lifecycle.py::EmployeeProductMediaTests` (employee assignment policy, own-DRAFT uploads, `is_primary` restrictions, 409 semantics) | **22 pass / 0 fail / 0 error** |
| Full backend `test_phase7_media_lifecycle.py` (media regression module) | **128 pass / 0 fail** (exit 0) |
| Frontend full suite (`npm test`, tests/ + test/) | **850 tests: 839 pass, 10 fail, 1 skip** |
| — the 10 failures | **Pre-existing at pristine HEAD**, reproduced identically in a `git worktree` of `c94fef4` with zero local changes: `accountScreensRouting` (missing `home-page/` prototype dir), `employeeLoginRouting` ×2, `rbacContract` ×3, `regressionAuthRbacFix` ×3, `unifiedLogin` (file-level). None touch media code. **Zero new failures introduced.** |
| Frontend production build (`npm run build`) | **Success** — `dist/index.html` 3,097.50 kB (gzip 973.09 kB), 9.17 s |

## 6. Browser verification — BLOCKED (explicit)

No browser binary (Chromium/Firefox/Playwright bundle) exists in this sandbox and the
allowed egress hosts do not include a browser download, so a real-browser click-through
could not be performed here. Compensating evidence:

1. **Mounted-component behavioural tests** (react-test-renderer + StrictMode) drive the
   real selector: open on focus, rows rendered, ArrowDown+Enter selects `PF-W-0042`,
   Escape closes, empty and error+retry states render.
2. **Live HTTP through the real dev server**: `localhost:5173/api/v1/admin/products?q=PF-W-0042…`
   returns 200 with the product through the Vite proxy (the browser's exact path), and
   the SPA shell serves 200.
3. **Static render inspection** of the new footer markup (classes, hierarchy, disabled
   state, icon) from the real component tree.

Both servers are left running in this workspace for a live click-through: the Vite dev
server on **:5173** (preview-proxied) and the verification API on **:8000**. Sign in at
the super-admin login with `superadmin@pratikshyafashion.in` / `SuperAdmin@PF2026!`,
open `/super-admin/media/upload`, type `PF-W-0042`. Please re-confirm visuals (dropdown,
footer at 1366×768 and mobile width) in your browser — that step remains the only
unexecuted acceptance item.

## 7. Remaining limitations

* Live API verification used SQLite as the engine substitute (PostgreSQL unavailable in
  sandbox); harness-only glue listed in §2. Application code, auth and RBAC ran
  unmodified. Backend F3/phase-7 suites ran against their own SQLite harness as
  committed.
* The 10 pre-existing frontend failures (§5) are unrelated to media upload and were
  left untouched (out of scope, no unrelated refactoring).
* `UPLOAD_NOTICE*` constants remain exported for the un-routed legacy
  `MediaUploadPanel`; they are no longer reachable from any live route.
* No commit was made (per scope boundary); all changes are in the working tree of
  `arena/c38ce309-pfv1`.
