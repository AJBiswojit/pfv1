# PHASE 10 — AUTHENTICATION UI MIGRATION

> **STATUS: audit complete; implementation complete; verification complete — awaiting review.**
> §1–§8 are the read-only audit and the approved scope (approved: the three honest screens;
> the reset defect handled by 1:1 parity and reported, never fixed in this phase). §9–§13 are
> the implementation, the exact test results, the browser evidence, the limitations and the
> Git status. **Nothing has been staged, committed or pushed**: the working tree holds the
> phase's five modified and eight new files, and no Git operation was performed during it.

Phase 10 asks whether the customer authentication surfaces can be adopted by the Aarna
storefront the way Phases 6–9 adopted the product page, the listing, the wishlist, the money
path. This document answers that from the code, not from the phase title: **two of the four
customer auth screens are straightforwardly eligible, one is eligible with a caveat, and one
cannot be migrated honestly at all in its present state** — for a verified reason, recorded
in §7.

---

## 1 · Git state (verified before the audit)

| Check | Value |
| --- | --- |
| `HEAD` | `81dffb59da2f2e742e1f03d2fca6705faf50d157` (`81dffb5`) |
| Subject | `Aarna storefront migration — Phases 3–9, onto the branch tip` |
| Parent | `1d64755` |
| Upstream | `origin/arena/649fd845-pfv1` → `81dffb5` (identical; pushed and verified) |
| Staged entries | 0 |
| Working tree | 0 modified; 7 untracked entries — `.p3/`–`.p9/` tooling and evidence only |
| `home-page/` | 0 status lines, 0 diff — untouched |
| Worktrees | 1 (the temporary validation worktree was removed after Phase 9) |

---

## 2 · Route inventory (production, as it actually is)

| Route | Component | Chrome | Guard | Portal |
| --- | --- | --- | --- | --- |
| `/signin` | `pages/auth/SignIn.jsx` (278) | full customer shell (`SiteHeader` + `SiteFooter`) | public; redirects **signed-in** visitors to `returnTo` | customer |
| `/signup` | `pages/auth/SignUp.jsx` (497) | full customer shell | same | customer |
| `/forgot-password` | `pages/auth/ForgotPassword.jsx` (193) | full customer shell | public | customer |
| `/reset-password` | `pages/auth/ResetPassword.jsx` (235) | full customer shell | public | customer |
| `/login` | `pages/auth/StaffLogin.jsx` (240) | staff shell | public; routes by account level | staff (all four levels) |
| `/admin/login` | `pages/auth/AdminLogin.jsx` | staff shell | public | admin |
| `/employee/login` | `pages/auth/EmployeeLogin.jsx` | staff shell | public; redirect to `/login` per tests | employee |
| `/employee/forgot-password`, `/employee/change-password` | `pages/employee/*` | staff shell | public / staff | employee |
| `/account/**` (dashboard, profile, orders, addresses, security, …) | `pages/account/*` | full customer shell | `ProtectedRoute` | customer |

Route declarations: customer auth at `App.jsx:479–482`; staff at `App.jsx:199–200`;
`/account/**` at `App.jsx:489–498`. The customer auth routes sit **inside** the customer
layout group and are **not** order-journey paths — `layouts/CustomerLayout.jsx:73–74`
(`isOrderJourney` = `/checkout` or `/order-success`), so production renders them with the
full shopping chrome, not the reduced checkout header.

---

## 3 · What exists, and what does not

**Exists (verified in code):**

* Email/phone + password sign-in; first/last name, email, optional phone, optional date of
  birth, password + confirmation sign-up; forgot-password (real request); reset-password
  (screen only — see §7).
* **Google SSO** on both sign-in and sign-up, via Google Identity Services
  (`components/auth/GoogleSignInButton.jsx`), client ID from `VITE_GOOGLE_CLIENT_ID` or
  `GET /auth/oauth/config`, credential exchanged at `POST /auth/oauth/google`.
* Session persistence and restore; token-expiry handling; route guarding with `returnTo`.
* Guest-order claiming on sign-up (`OrderContext.claimGuestOrders`, called from
  `SignUp.jsx:135`).
* Account-side password change for signed-in customers (`/account/security`,
  `AccountContext.changePassword`) — **explicitly out of Phase 10 scope**, like all of
  `/account/**`.

**Does NOT exist — and must not be invented:**

* **No OTP / one-time-code flow** anywhere (a repo-wide search finds no OTP screen, context
  method or API wrapper; the only case-insensitive matches are the substring inside
  "ForgotPassword").
* **No email or phone verification screen**, no "verify your address" gate, no resend-
  verification flow.
* **No two-factor / 2FA** screen.
* No magic-link, no social provider other than Google, no "sign in with passkey".

---

## 4 · Flow inventory, screen by screen

**`/signin` — `SignIn.jsx`.** Fields: identifier ("Email Address or Mobile Number") and
password; show/hide toggle (`aria-pressed`); "Remember me on this device" checkbox; error
alert (`role="alert"`) and a success banner (`role="status"`, "Welcome back. Opening your
atelier…"). Submit → `signIn({ identifier, password, remember })`. On success: 500 ms delay →
`navigate(returnTo, { replace: true })`. On failure: `result.error` shown, submitting reset.
Already-authenticated visitors are redirected to `returnTo` (except while submitting or
already successful). `returnTo` = `sanitizeReturnUrl(searchParams.get("returnTo") || "/account")`.
Links: `/forgot-password`; `/signup` carrying the **raw** `returnTo`; "Continue as Guest" →
`/shop` when `returnTo` starts with `/account`, else `returnTo` itself. Google button
(`onSuccess` repeats the success → navigate path; `onError` sets the error).

**`/signup` — `SignUp.jsx`.** Fields: first name, last name, email, phone (optional), date of
birth (optional), password, confirm password; per-field errors plus a general error alert and
a success banner. Validation: `isValidEmail`, optional `isValidPhone`,
`validatePassword` (≥ 6), `validatePasswordMatch`. Submit → `signUp({…})`; on success:
`claimGuestOrders(result.user?.id)` → success banner → 500 ms → `navigate(returnTo)`. Same
`returnTo` sanitising and same already-authenticated redirect as sign-in. Google button
present. Link to `/signin`.

**`/forgot-password` — `ForgotPassword.jsx`.** Field: identifier; validated with
`isValidIdentifier` (email or 10-digit phone). Submit → `forgotPassword(identifier)` →
**real** `POST /auth/customer/forgot-password`. Success screen "Check your inbox." with two
buttons: "Proceed to Reset Password" → `/reset-password` (no query), and "Return to Sign In".
Its own docstring calls it a "Safe frontend mock password recovery flow", but the request
itself is real; only the destination of the CTA is decorative (§7).

**`/reset-password` — `ResetPassword.jsx`.** Fields: new password + confirmation, show/hide on
both; `validatePassword` (≥ 6) and `validatePasswordMatch`. Submit →
`resetPassword(password, confirmPassword)` — **no third argument**. Success screen links back
to sign-in. See §7: this cannot perform a real reset.

**Staff screens.** `StaffLogin.jsx` is the unified `/login` (identifier may be an email,
phone or employee code; `POST /auth/staff/sign-in`; tokens stored under the workspace's
`admin` or `employee` scope). `/admin/login`, `/employee/login` and `/employee/forgot-password`
belong to the staff portals. Their routing is pinned by `frontend/tests/unifiedLogin.test.js`
and `frontend/tests/employeeLoginRouting.test.js`.

---

## 5 · Services, contexts, session and security — what the UI must keep using

* **`services/api/authApi.js`** — the only auth transport: `apiSignUpCustomer`,
  `apiSignInCustomer`, `apiSignInGoogleCustomer`, `apiSignOutCustomer`,
  `apiForgotPasswordCustomer`, `apiResetPasswordCustomer({ userId, token, newPassword,
  confirmPassword })`, `apiChangePasswordCustomer`, the staff trio, `apiSignInStaff`,
  `apiGetMe`, and the three session restores. Every call returns `{ ok, … }` or
  `{ ok: false, error }` via `handleError` — the UI shows what the backend said and nothing
  else.
* **`context/AuthContext.jsx`** (customer) — `user`, `isAuthenticated`, `isLoading`, `signIn`,
  `signInWithGoogle`, `signUp`, `signOut`, `forgotPassword`, `resetPassword(newPassword,
  confirmPassword, { userId, token } = {})`, `updateUser`. Session restore validates a stored
  token against `GET /customers/me` — **a token alone is never treated as a session**. Profile
  snapshot in `localStorage["pratikshya_auth"]`; tokens in `pf_access_token` /
  `pf_refresh_token` per scope; `pf:session-expired` clears the customer session.
* **`components/auth/ProtectedRoute.jsx`** — `isLoading` → `LoadingState`; not authenticated →
  `/signin?returnTo=<encodeURIComponent(pathname + search)>` (`replace`). Already imported by
  the Aarna storefront for `/checkout` and `/order-success` (Phase 9).
* **`utils/validation.js`** — `isValidEmail`, `isValidPhone`, `isValidIdentifier`,
  `validatePassword` (≥ 6), `validatePasswordMatch`, `sanitizeReturnUrl` (relative single-slash
  paths only; rejects `//`, `http(s)://`, `javascript:`, `data:`). **All of these must be
  imported by any migrated screen — none may be re-implemented.**
* **`components/auth/GoogleSignInButton.jsx`** — loads the GIS script from
  `accounts.google.com` (blocked in this sandbox; documented as a limitation), resolves the
  client ID, renders Google's own button, and falls back to an honest message when no client
  ID is configured. Reused as-is.
* **`context/OrderContext.jsx`** — `claimGuestOrders` is the guest-order claim flow the
  sign-up screen calls. Reused as-is.

**Design-side fact:** the design has **no authentication screens**. `home-page/src/App.jsx`
declares `account` → `home-page/src/pages/Account.jsx`, a 50-line prototype whose own copy
says *"Accounts are simulated in this prototype and stored only in your browser"* and
*"(Prototype — no server account is created)"*; its sign-out deletes a `localStorage` key.
It is a mock and is **not** a behavioural or visual template for real authentication. What
the design does contribute is vocabulary that fits a form page: `.info container`, `.crumbs`,
`.label`, `.display`, `.form` / `.form__err`, the `.btn` register, and the `.account__tiles` /
`.account__tile` block. The design's header links `/account`; it never links a sign-in page.

---

## 6 · Eligibility determination

| Surface | Eligible for Aarna migration? | Why |
| --- | --- | --- |
| `/signin` | **Yes** | Real flow, real validation, real Google wiring; only the rendering is production's. Design offers a form/card vocabulary; the page would be drawn in the design's language the way Phase 9 drew the bag. |
| `/signup` | **Yes** | Same, plus the guest-order claim, which is reused unchanged. |
| `/forgot-password` | **Yes, with one caveat** | The request is real; the success screen's "Proceed to Reset Password" CTA leads to a screen that cannot complete a reset (§7). Migration itself is honest if the screen keeps parity and the defect is reported. |
| `/reset-password` | **No — must remain on the production implementation in this phase** | Verified: the screen never reads `userId`/`token` from its URL, and the backend **requires both** (`ResetPasswordRequest.userId: str = Field(...)`, `token: str = Field(...)`, `backend/app/schemas/auth/login.py:164–181`; the documented link shape is `/reset-password?userId=<uuid>&token=<urlsafe_token>`). Every submit today posts `{ userId: undefined, token: undefined }` → 422. An Aarna-styled page over a flow that cannot complete would be staging. |
| `/login`, `/admin/login`, `/employee/**` | **No — staff portals stay production** | No design counterpart; separate contexts and scopes; routing pinned by existing tests; the standing boundary keeps `/login`, `/admin/**`, `/super-admin/**`, `/employee/**` out of the port's catch-all. |
| `/account/**` (incl. password change) | **Out of scope** | The Phase 8/9 boundary keeps the account production-side; the task is authentication UI only. |

---

## 7 · Verified defects found during the audit (reported, NOT fixed)

**D1 — the reset screen cannot complete a real reset.** `ResetPassword.jsx` never reads the
URL query, and `AuthContext.resetPassword(newPassword, confirmPassword, { userId, token } = {})`
is called with two arguments, so `apiResetPasswordCustomer` posts null credentials to an
endpoint whose schema requires them. Result: a 422 for every submit, while the UI presents
itself as a working password reset.

**D2 — the reset screen's password rule is looser than the backend's.** The screen accepts
≥ 6 characters (`validatePassword`); `ResetPasswordRequest.newPassword` requires
`min_length=8`. A 6–7 character password passes the client and fails the server. (Sign-up is
consistent: both sides require ≥ 6.)

**D3 — the forgot-password success CTA advertises a path that cannot work.** "Proceed to
Reset Password" navigates to `/reset-password` without a token, i.e. straight into D1.

**Observation O1 (not a defect) —** the "Remember me on this device" checkbox is decorative:
`AuthContext.signIn` does not read `remember` and `apiSignInCustomer` posts only
`identifier` + `password`. Migrating 1:1 keeps it decorative; making it functional would be a
behaviour change requiring separate approval.

**Observation O2 —** the forgot/reset docstrings call themselves "mock" screens. The
forgot-password request is real; only the reset destination is not. Any migrated copy must
never claim a reset email was sent when the backend refused, nor promise a reset it cannot
deliver.

**Handling for this phase — reported, NOT fixed, as approved:** migrate only what is honest (§6), keep `/reset-password`
production-side, and leave D1–D3 as reported findings with a recommendation — either a later
phase fixes the reset flow against the backend's documented link contract, or the misleading
CTA copy (D3) is corrected in a small, separately-approved change. No fix will be slipped into
Phase 10.

---

## 8 · Approved Phase 10 scope

**Migrate, when the switch is on:** `/signin`, `/signup`, `/forgot-password` — drawn in the
design's language, inside the design's full shell (production renders auth with the full
shopping header/footer, and the customer should be able to keep shopping). **Keep production:**
`/reset-password`, every staff portal, all of `/account/**`.

**Wiring (mirrors Phase 9 exactly):**

1. `config/storefrontHome.js` — `AARNA_AUTH_PATHS = new Set(["/signin", "/signup",
   "/forgot-password"])`, `isAarnaAuthPath()`, `useAarnaAuth()`, extended
   `useAarnaStorefront()`. The catch-all and staff guards keep their present semantics; with
   the switch off nothing changes.
2. `components/aarna/AarnaStorefront.jsx` — three routes inside the design's
   `<Route element={<Layout />}>` group. `App.jsx` is **not** touched (`ProtectedRoute`
   already covers the guarded surfaces; auth screens are public).
3. New port files, declared in the tool's `ADDED` (design has no counterpart, as with Phase 9):
   `pages/SignIn.jsx`, `pages/SignUp.jsx`, `pages/ForgotPassword.jsx`, plus
   `aarna.auth.css` for the few blocks the design never drew (auth card frame, password
   field with its toggle, divider). Every declaration scoped to `.aan-root`, every value a
   design token.
4. **Reused, never re-implemented:** `AuthContext` (`signIn`, `signUp`, `forgotPassword`,
   `signInWithGoogle`), `GoogleSignInButton`, `OrderContext.claimGuestOrders`,
   `utils/validation.js` (`isValidEmail`, `isValidPhone`, `isValidIdentifier`,
   `validatePassword`, `validatePasswordMatch`, `sanitizeReturnUrl`), the routing shim, the
   design `Layout`.
5. **Behaviour parity checklist** (each pinned by a test): `returnTo` sanitising and its
   `/account` fallback; the already-authenticated redirect; the 500 ms success → `navigate`
   transition; error text taken from `result.error` verbatim; disabled/deferred submit;
   per-field validation on sign-up; the guest-order claim call; Google success/error
   handling; `document.title` set and restored; "Continue as Guest" target logic;
   `/signup` receiving the **raw** `returnTo`; cross-links between the three screens.
6. **Tests:** new `aarnaSignInPage`, `aarnaSignUpPage`, `aarnaForgotPasswordPage` suites
   (switch off → production page, nothing of the port; switch on → port renders with the
   real contexts and no mock; parity pins for the checklist above; `/reset-password` and the
   staff routes still production-side). Two existing boundary pins move — the Phase 8/9
   suites that assert `/signin` never mounts the port (`aarnaNotFoundHandover.test.js:268`,
   `aarnaListingPage.test.js:226,235`) — to the account-only line, exactly as Phase 9 moved
   its money-path pins. The `aarnaCartPage` journey-set pin mentioning `/signin` stays valid
   (auth paths are not journey paths).
7. **Verification:** `aarna-port.js --check` parity; Aarna suites; `src/**` suites; `npm test`
   against the documented 434 = 412/21/1 baseline; catalogue audit; production build;
   `git diff --check`; browser pass on both servers (5174 Atelier default, 5175 Aarna switch)
   at 1440 and 390 with every populated reading labelled fixture — including the guard
   handover `/checkout` → `/signin?returnTo=…` landing on the **Aarna** sign-in when the
   switch is on. **Not verifiable here:** a real sign-in POST, a real Google exchange, and the
   reset flow — no backend and no Google client in this sandbox. Those stay labelled
   unverified.

**Explicitly not in scope:** `/reset-password` migration, staff portals, `/account/**`,
backend changes, API contracts, new dependencies, TypeScript, `App.jsx`, D1–D3 fixes.

**Approved as written**, with one decision recorded: the migrated recovery screen keeps
production's copy and CTA **1:1** — the misleading “Proceed to Reset Password” wording is
not corrected here but reported (§7, D3), so the phase ships zero copy divergence.

---

## 9 · Implementation

Approved as §8. Nothing about the production screens, the contexts, the API
clients or `App.jsx` was changed.

**New files (all port-authored — the design has no counterpart; declared in the
port tool's `ADDED`, so the closure check knows them and never writes them):**

| File | Lines | What it is |
| --- | --- | --- |
| `frontend/src/components/aarna/pages/SignIn.jsx` | 210 | `/signin` in the design's vocabulary, bound to `AuthContext.signIn`, the shared Google button, `sanitizeReturnUrl` |
| `frontend/src/components/aarna/pages/SignUp.jsx` | 354 | `/signup` · `signUp` + `claimGuestOrders`, the application's five validators, the same field ids/hints/placeholders |
| `frontend/src/components/aarna/pages/ForgotPassword.jsx` | 149 | `/forgot-password` · `forgotPassword` + `isValidIdentifier`; confirmation only on acceptance |
| `frontend/src/components/aarna/aarna.auth.css` | 229 | only what the design never drew (toggle, label row, remember-me row, divider, pairs, alt block, confirmation, back link) — every selector scoped to `.aan-root`, every value a design token |
| `…/__tests__/aarnaSignInPage.test.js` | 365 | 15 tests |
| `…/__tests__/aarnaSignUpPage.test.js` | 297 | 13 tests |
| `…/__tests__/aarnaForgotPasswordPage.test.js` | 255 | 10 tests |

**Modified files (+101/−15 across five):** `config/storefrontHome.js` (+52/−3:
`AARNA_AUTH_PATHS`, `isAarnaAuthPath`, `useAarnaAuth`, the union, and the
catch-all comment corrected to say which auth screens are now answered by name);
`components/aarna/AarnaStorefront.jsx` (+27: imports, the stylesheet, three
routes inside the design's `<Route element={<Layout />}>` group, with the reason
for the `/reset-password` exclusion written in place);
`scripts/aarna-port.js` (+12: the four `ADDED` entries);
two boundary pins moved in `aarnaNotFoundHandover.test.js` (+7/−7) and
`aarnaListingPage.test.js` (+4/−7) — `/reset-password` now stands where `/signin`
stood in each, so the suites pin the same rule about the same surface.

**Two defects found by reviewing the browser evidence, and fixed before it was
recorded:**

1. **The remember-me row lost the cascade.** The port scopes every design
   selector under `.aan-root` (`scripts/aarna-port.js`), so the design's
   `.form label` arrives as `.aan-root .form label` — specificity (0,2,1), one
   class MORE than a plain `.aan-root .pf-auth__check` (0,2,0). The row rendered
   as the design's label column: checkbox above uppercase 11px/700 text. Every
   competing rule was deepened (`.aan-root .form .pf-auth__check`,
   `.aan-root .info .pf-auth__terms`, …) and the measurement that caught it is
   now a probe reading (`flexDirection === "row"`, `textTransform === "none"`).
2. **The required mark took a line of its own.** In the same flex column, a
   bare `<span>*</span>` sibling of the label's text is a second flex item —
   so “FIRST NAME” sat above a lone `*`. The text and its mark now travel in one
   `.pf-auth__text` element; the probe pins `"First Name *"` as one line.

Everything else the pictures were reviewed against (breadcrumb, display
headline, lead, field register, CTA, divider, Google control, footer) matched
the design on all three screens at both viewports.

## 10 · Tests and exact results

| Run | Result |
| --- | --- |
| `node --import ./scripts/node-loader/register-jsx.mjs --test "src/components/aarna/__tests__/*.test.js"` | **197 / 197 pass, 0 fail** (was 159; +38) |
| `… --test "src/**/__tests__/*.test.js"` | **350 / 350 pass, 0 fail** (was 312; +38) |
| `npm test` | **434 tests = 412 pass / 21 fail / 1 skipped** — identical to the documented baseline; the 21 are pre-existing legacy failures, none in an auth surface |
| `node scripts/aarna-port.js --check` | pass — 55 copied files, 88,885 bytes of CSS (unchanged: Phase 10 adds no design file) |
| `npm run audit:frontend-catalog` | 9 PASS / 0 FAIL |
| `npm run build` | ✓ built in 9.06 s (dist/index.html 3,781.13 kB, gzip 1,396.68 kB) |
| `git diff --check` | clean |
| `home-page/` | 0 status lines, 0 diff — untouched |

The three new suites render the real composition — `CustomerLayout` inside the
application's provider stack, at the route, through Vite's SSR pipeline — with a
Map-backed `localStorage` and no faked context. They pin the switch-off
behaviour, the boundary sets, the production ids/autofill hints/placeholders,
every production message verbatim, the sanitiser import, the 500 ms transition,
the already-signed-in redirect, `claimGuestOrders`, the Google component, the
`/terms` and `/privacy` links, and the deliberate exclusion of
`/reset-password`. What they cannot do is click or focus (no DOM): those are the
probe's.

## 11 · Browser evidence

`.p10/browser/p10.mjs`, run against two real dev servers — 5174 with no
`VITE_STOREFRONT_HOME` (the Atelier default) and 5175 with
`VITE_STOREFRONT_HOME=aarna` (the switch on, from the environment, not the URL).
**98 readings · 3 limitations · 0 failing**
(`.p10/evidence/phase10-probe-results.json` + six screenshots
`phase10-{signin,signup,forgot-password}-{desktop,mobile}.png`).

*Switch off (measured, no fixture):* none of the four auth paths mounts
`.aan-root` or `.pf-auth`; `/signin`, `/signup`, `/forgot-password` are the
production pages, `/reset-password` is the production screen; no page errors.

*Switch on (measured):* the three screens mount `.aan-root` +
`.info.container.pf-auth` inside the design's FULL shell (footer + skip link,
not the quiet journey frame); each sets its production title. `/reset-password`
and `/login` stay production — measured on the switch-on server.

*The flows:*

| Reading | Value | Kind |
| --- | --- | --- |
| empty submit, production page vs ported page | both: “Please enter your registered email address or phone number.” | measured (parity) |
| identifier present, password absent | “Please enter your account password.”; no API call | measured |
| sign-in refused | the call reaches `POST /api/v1/auth/customer/sign-in`; the panel shows the backend's own “Invalid credentials”; **no** success note; stays on `/signin`; no token stored; button back to “Sign In to Account” | fixture |
| sign-in accepted | success note “Welcome back. Opening your atelier...”, lands on `/account/wishlist` (the sanitised `returnTo`), token pair under `pf_access_token`/`pf_refresh_token` | fixture |
| reveal toggle | `password → text`, `aria-pressed=true` | measured |
| guest link | no `returnTo` → `/shop`; `returnTo=/checkout` → `/checkout` | measured |
| sign-up empty submit | “First name is required.”, “Email address is required.”, “Password is required.” ×2; nothing sent | measured |
| recovery: empty / malformed | “Please enter your registered email address or phone number.” / “Please enter a valid email format or 10-digit mobile number.”; no API call | measured |
| recovery refused | call reaches `POST /api/v1/auth/customer/forgot-password`; “Unable to send reset instructions.”; **no confirmation** | fixture |
| recovery accepted | the confirmation appears and names `ananya.sharma@example.com`; no error panel | fixture |
| the remember-me row | `flex-direction: row`, `text-transform: none`, 400, 13px | measured |
| “First Name *” | one line (`childElements` = text+mark, input, error) | measured |
| Google control | renders its honest unconfigured fallback, “Sign in with Google” | measured |
| layout | no horizontal overflow at 1440 or 390 on all three; footer present; CTA 48 px tall (480 / 620 / 358 wide) | measured |

**Pictures:** `phase10-signin-desktop.png`, `phase10-signup-desktop.png`,
`phase10-forgot-password-desktop.png`, and the same three at 390 px. The two
defects in §9 were found in the first set of pictures and re-measured after the
fix.

## 12 · Limitations and unverified surface

* **No live backend.** The sandbox runs none, so every auth *response* above is
  a fixture, labelled as such; the readings prove what the page does with a
  refusal and an acceptance, not that the real API refuses or accepts.
* **No real Google login.** No client id is configured and
  `accounts.google.com` is unreachable here; what is verified is that the shared
  component renders its honest unconfigured state and that the page hands Google
  results to `signInWithGoogle`/`signUp` — the same code path production uses.
* **The reset flow is not exercised** (and is deliberately production-side):
  D1–D3 in §7 stand unfixed and unclaimed.
* **SSR-rendered, DOM-checked, but not click-logged:** focus order, keyboard
  traversal and screen-reader behaviour are not asserted beyond the ARIA
  attributes the suites pin.
* **The staff portals were inspected, not migrated** — their routing tests run
  unchanged and green.

## 13 · Exact Git status

```
HEAD      81dffb59da2f2e742e1f03d2fca6705faf50d157  (phase 9 commit; = origin/arena/649fd845-pfv1)
staged    nothing
```

*Modified (5):* `frontend/scripts/aarna-port.js`,
`frontend/src/components/aarna/AarnaStorefront.jsx`,
`frontend/src/components/aarna/__tests__/aarnaListingPage.test.js`,
`frontend/src/components/aarna/__tests__/aarnaNotFoundHandover.test.js`,
`frontend/src/config/storefrontHome.js` — +101/−15.

*New (8 project files):* `docs/PHASE-10-AUTHENTICATION-UI.md`,
`frontend/src/components/aarna/aarna.auth.css`,
`frontend/src/components/aarna/pages/{SignIn,SignUp,ForgotPassword}.jsx`,
`frontend/src/components/aarna/__tests__/aarna{SignIn,SignUp,ForgotPassword}Page.test.js`.
Plus the untracked `.p10/` evidence tree (probe, kit, screenshots — tooling,
never part of a commit proposal). `.p3`–`.p9` untouched; `home-page/` 0 lines.

No reset, rebase, amend or history rewrite; nothing staged, committed, pushed,
no PR, no Phase 11. Awaiting review and an explicit decision on how — and
whether — to commit.
