# CINEMATIC GLASS AUTH — the PRATIKSHYA FASHION authentication hero

> **STATUS: implemented; corrected against the approved reference; build, unit/source
> suites, browser flows and rendered screenshots verified.**
> This document is the implementation report for the cinematic glass authentication
> experience: one campaign photograph, one editorial column, one transparent panel,
> and **one page** for sign-in, registration, password recovery and password reset.
> It records what changed, what was deliberately left alone, what was actually
> executed, and what remains different from the approved reference.

---

## 1 · What the page is now

| Surface | Before | After |
| --- | --- | --- |
| Layout | Centered opaque cream card on a cream page | Full-bleed campaign photograph: editorial column left, transparent glass panel right |
| Auth modes | Four separate routes, each its own page (`/signin`, `/signup`, `/forgot-password`, `/reset-password`) | The same four routes still exist, but each opens the **one** `AuthExperience`; every in-panel action swaps a local `mode` state in place |
| Navbar | Storefront header | **Unchanged** — same component, same CSS, same markup |
| Footer | Rendered under the auth card | Not painted beneath the hero (`:has()` rule; still in the shell's markup, still on every other page) |
| Background | none | `public/design/pratikshya-auth-campaign.webp` (1672×941) + a portrait crop `…-mobile.webp` (941×1672) |

The routes and their existing contracts are intact:

| URL | Mode it opens | Existing behaviour preserved |
| --- | --- | --- |
| `/signin?returnTo=…` | `login` | `POST /auth/customer/sign-in`, `sanitizeReturnUrl`, 500 ms success handover, guest rule, Google SSO |
| `/signup?returnTo=…` | `register` | `POST /auth/customer/sign-up`, the same validators and messages, guest-order claim, Google SSO |
| `/forgot-password` | `forgotPassword` | `POST /auth/customer/forgot-password`; confirmation shown only when the backend accepted |
| `/reset-password?userId=…&token=…` | `resetPassword` | `POST /auth/customer/reset-password`, 8–128 rule, 401/404 → "invalid or expired" |

Switching modes **never** changes the URL, never calls the router, never remounts the
photograph and never reloads the page. The reset `userId`/`token` pair stays in the URL
(it is the backend's contract), is read with `useSearchParams`, and is never stored or
logged.

---

## 2 · Files

**Created**

| File | Role |
| --- | --- |
| `frontend/src/components/customer/auth/AuthExperience.jsx` | The single experience: photograph, scrim, editorial, glass panel, mode state, `returnTo` sanitisation, reset-token reading, focus hand-off, panel ornament line work |
| `frontend/src/components/customer/auth/AuthEditorial.jsx` | The left editorial column and its one-shot entrance animation |
| `frontend/src/components/customer/auth/AuthPanelSignIn.jsx` | Sign-in panel (login, remember-me, reveal, Google, guest, in-panel switches) |
| `frontend/src/components/customer/auth/AuthPanelSignUp.jsx` | Registration panel (seven fields, guest-order claim, Google) |
| `frontend/src/components/customer/auth/AuthPanelForgotPassword.jsx` | Recovery panel (request + honest confirmation) |
| `frontend/src/components/customer/auth/AuthPanelResetPassword.jsx` | Reset panel (incomplete / form / success) |
| `frontend/src/components/customer/auth/AuthPanelParts.jsx` | Shared panel parts: heading, alert, status, field, password field, divider, text action |
| `frontend/public/design/pratikshya-auth-campaign.webp` | **Generated** campaign photograph, desktop 1672×941, 220 KB (regenerated in the correction pass) |
| `frontend/public/design/pratikshya-auth-campaign-mobile.webp` | **Generated** portrait composition, 941×1672, 244 KB (regenerated in the correction pass) |
| `frontend/test/cinematicAuthExperience.test.js` | Contract suite for the experience (one page, glass, asset, copy, wiring) |
| `docs/CINEMATIC-GLASS-AUTH.md` | This report |

**Modified**

| File | Change |
| --- | --- |
| `frontend/src/components/customer/pages/SignIn.jsx` | Renders `AuthExperience` in `login` mode; same title, same route |
| `frontend/src/components/customer/pages/SignUp.jsx` | Renders `AuthExperience` in `register` mode |
| `frontend/src/components/customer/pages/ForgotPassword.jsx` | Renders `AuthExperience` in `forgotPassword` mode |
| `frontend/src/components/customer/pages/ResetPassword.jsx` | Renders `AuthExperience` in `resetPassword` mode |
| `frontend/src/components/customer/customer.auth.css` | The whole authentication hero's stylesheet (previous card rules replaced) |
| `frontend/src/components/auth/GoogleSignInButton.jsx` | Additive `variant="glass"` skin for the *unconfigured fallback* control only — GIS client, exchange and callbacks untouched |
| `frontend/src/components/customer/__tests__/customerSignInPage.test.js` | Rewritten for the single-page experience (20 assertions groups) |
| `frontend/src/components/customer/__tests__/customerSignUpPage.test.js` | Rewritten for the in-panel registration |
| `frontend/src/components/customer/__tests__/customerForgotPasswordPage.test.js` | Rewritten for the recovery + reset panels |
| `frontend/src/components/customer/__tests__/customerAccountShell.test.js` | One assertion updated: the guard's destination now paints `.pf-auth-experience` |

**Deliberately untouched:** `Header.jsx`, `Layout.jsx`, `customer.css` (the shared
stylesheets), `CustomerStorefront.jsx`'s route table, `AuthContext.jsx`,
`services/api/authApi.js`, the backend, and every other storefront surface.

---

## 3 · The background image (actually generated)

Both assets were **regenerated from scratch** in the fidelity-correction pass rather
than brightened with CSS. The first pair was underexposed against the approved
reference; the second generation asks for a warm, richly lit frame instead: the model
seated centre-left in a burgundy zari saree whose gold embroidery is legible, sandstone
arches and a candlelit jali behind her, amber highlights on skin and jewellery, visible
fabric texture, warm — not crushed — shadows, and a recess of darker warm stone on the
left where the editorial sits. The portrait is a separate composition, not an outpainted
desktop frame (outpainting left a visible rectangular seam and was discarded).

- Desktop: `frontend/public/design/pratikshya-auth-campaign.webp` — 1672×941, 220 KB
- Mobile: `frontend/public/design/pratikshya-auth-campaign-mobile.webp` — 941×1672, 244 KB

Both are WebP quality 84, method 6, metadata stripped.

The `<picture>` swaps to the portrait crop at ≤767 px, so a phone never downloads the
wrong aspect. `width`/`height` are declared (no layout shift), the image is
`fetchPriority="high"`, `decoding="async"`, `alt=""` (decorative; the editorial carries
the meaning).

---

## 4 · The transparent panel

`customer.auth.css` builds the glass from a **single** translucent fill; there is no
second rectangle anywhere in the panel.

| Layer | Value |
| --- | --- |
| Panel fill | `linear-gradient(168deg, rgba(48,9,19,.30), rgba(42,8,18,.24) 52%, rgba(35,6,15,.27))` |
| Border | `1px solid rgba(231,190,125,.62)` — the only border on the panel |
| Radius | `20px` |
| Blur | `backdrop-filter: blur(5px) saturate(1.05)` |
| Shadow | one soft drop shadow + `inset 0 1px 0 rgba(255,236,208,.18)` highlight |

Readability is bought in the order the directive prescribes: source exposure first
(the regenerated photograph), local text contrast second, text shadow third, blur last.
The hero scrim is now **one directional gradient** — `linear-gradient(90deg, …)` from
`.58` at the left edge to zero at 62 % — plus a very light top/bottom vignette
(`.12`/`.14`). The previous four-stop, near-opaque overlay stack is gone, so the
photograph on the right is the photograph, not a dark wash of it. The `@supports not`
fallback raises the tint to `.58` only where `backdrop-filter` does not exist.

**The "inner gold rectangle" is gone.** It was never a wrapper or a pseudo-element: it
was the browser's default focus outline painted on `.pf-auth-panel__title`, which was
focused on first load. Two fixes: the focus hand-off now compares against the previous
mode (so a first paint — including React's development double-effect — never focuses the
heading), and the heading/body regions explicitly clear `outline` in both `:focus` and
`:focus-visible`. Keyboard focus rings remain for every real control.

Inputs are translucent glass rows: `rgba(255,244,232,.08)` over
`1px solid rgba(246,220,187,.46)`, 50 px tall, warm-ivory text, champagne icons, gold
focus border plus a 3 px champagne ring. The primary action is the one intentionally more solid
element: a burgundy gradient (`#7A1229 → #560A1E`) with a thin gold border. Google keeps
its official mark and — when a client id is configured — Google's own rendered button.

---

## 5 · The animations

All of it is Framer Motion (already a dependency), plays **once**, and is disabled by
`useReducedMotion` + `MotionConfig reducedMotion="user"`.

| Element | Motion |
| --- | --- |
| Photograph | static (no motion — it must feel like a campaign still) |
| Eyebrow | fade + 14 px rise, 0.7 s |
| Headline lines | masked reveal: each line rises from `translateY(112%)` inside an `overflow:hidden` line box, staggered 0.11 s |
| Gold italic line | joins the same reveal, one beat later |
| Rule, supporting paragraph, highlights, signature | fade + rise, staggered 0.13 s from the container |
| Panel | fade + 18 px rise, 0.8 s, 0.4 s delay |
| Form | interactive from the first frame — nothing gates pointer events |
| Mode change | panel contents cross-fade + 8/−6 px shift, 0.22 s (`AnimatePresence mode="wait"`), the experience itself stays mounted |

Hover transitions (highlight icons, links, buttons) are ≤0.5 s colour/border changes only.
Nothing loops, pulses, rotates or glows.

---

## 6 · What was verified, and how

### Build

```
cd frontend && npm ci && npm run build
✓ 2755 modules transformed · ✓ built in 9.74s
```

### Suites

```
npm test
# tests 569 · pass 558 · fail 10 · skipped 1
```

The ten failures are the **pre-existing** account-level / unified-login failures that
also fail on the untouched checkout (baseline run before any change: 562 tests, 10
failures, identical names). Nothing in the auth work adds a failure.

The auth suites specifically:

```
node --import ./scripts/node-loader/register.mjs --test src/components/customer/__tests__/customerSignInPage.test.js        20/20
node --import ./scripts/node-loader/register.mjs --test src/components/customer/__tests__/customerSignUpPage.test.js        12/12
node --import ./scripts/node-loader/register.mjs --test src/components/customer/__tests__/customerForgotPasswordPage.test.js 13/13
node --import ./scripts/node-loader/register.mjs --test test/passwordReset.test.js                                          18/18
node --import ./scripts/node-loader/register.mjs --test test/cinematicAuthExperience.test.js                                 7/7
```

### Browser (headless Chromium against the live dev server, API stubbed at the network layer)

The fidelity-correction pass was verified the same way: headless Chromium at
1440×900 against `npm run dev`, screenshots compared side by side with the approved
reference, then the same page at 1280, 1120, 1024, 768, 390 and 360.

**Correction-pass screenshot evidence** (committed under `.p22/evidence/`):

| File | Viewport | Mode |
| --- | --- | --- |
| `30-auth-signin-1440-correction.png` | 1440×900 | sign in |
| `31-auth-signup-1440-correction.png` | 1440×900 (full page 1157) | registration |
| `32-auth-forgot-1440-correction.png` | 1440×900 | recovery |
| `33-auth-reset-1440-correction.png` | 1440×900 | reset form |
| `34-auth-signin-1024-correction.png` | 1024×900 | sign in |
| `35-auth-signin-768-correction.png` | 768×1254 | sign in |
| `36-auth-signin-390-correction.png` | 390×1138 | sign in |

**24/24 correction-pass checks passed.** Computed styles and behaviour read live from
the rendered page:

- exactly one border on the panel (`1px solid rgba(231,190,125,0.62)`); a walk of every
  element larger than 80×24 inside the panel finds no second border, outline or frame
  (the only hairline is the intentional divider above the alternate actions);
- panel fill is the translucent gradient above, `backdrop-filter: blur(5px)`; the
  photograph's blur, zari and candlelight are still visible through it;
- `document.activeElement` is `BODY` on arrival — nothing receives focus, so no focus
  rectangle is painted on the heading;
- headline copy is exactly `More than` / `an outfit,` / `a part of you.`, eyebrow
  `TIMELESS IN EVERY DETAIL`, the three highlights and `PRATIKSHYA FASHION`;
- a mode switch moves focus to the heading, changes the URL not at all, and does **not**
  re-request the hero (one request before, one after);
- an empty submit is refused by the existing validation sentence;
- no horizontal overflow at 1440, 1280, 1024, 768, 390 or 360;
- under `prefers-reduced-motion: reduce`, eyebrow, headline, lead and panel are at rest
  (`opacity: 1`, `transform: none`) the moment the panel exists.

Earlier full behavioural run (before the correction pass) — **30/30 checks passed**,
including:

- sign-in rejection surfaces the backend message and keeps the URL;
- a successful sign-in hands over to the sanitised `returnTo` (`/account`);
- `returnTo=https://evil.example.com` is sanitised to `/account`;
- empty registration is refused client-side with no request sent;
- "Already have an account? Sign in" switches in place, URL unchanged;
- a refused recovery shows the backend error and **no** confirmation; an accepted one
  shows "no reset email has been sent";
- an incomplete reset link offers no form; a mismatched confirmation sends no request;
  a rejected token is reported truthfully; an accepted one shows "Password updated."
  and returns to sign-in in-panel with the URL unchanged;
- password masking/reveal and the `aria-label` swap;
- the guest link keeps `/account → /shop`;
- reduced motion renders the headline at rest (`transform: none`);
- focus moves to the new panel heading after a mode change.

Measured live in the correction pass: the panel's computed background is the
translucent gradient (no solid colour), `backdrop-filter: blur(5px) saturate(1.05)`,
border `rgba(231,190,125,0.62)`, radius 20 px, 560 px wide, 702 px tall at 1440×900;
inputs compute to a transparent background inside a translucent row. The navbar was not
touched: its computed height/background are identical on `/` and `/signin` (a pixel
comparison of the top 99 px of both screenshots differs by **0 pixels**).

### Suite results after the correction

```
npm run build   ✓ 2755 modules · 3,457.14 kB · 9.50 s
npm test        # tests 569 · pass 558 · fail 10 · skipped 1   (same ten pre-existing)
auth suites     sign-in 20/20 · sign-up 12/12 · forgot 13/13 · passwordReset 18/18 · cinematic 7/7
```

The auth suites' visual assertions were updated to the corrected contract (`blur(5px)`,
`rgba(231,190,125,.62)`, radius 20 px, `rgba(255,244,232,.08)` inputs) — the behaviour
they assert is unchanged.

**Not verified (and not claimed):** a real credential exchange, a real Google login and
a real reset email — there is no database, no Google client id and no mail relay in this
sandbox. Those flows were exercised against a stubbed API only. The Google identity
provider, when configured, still runs its own external authorization page; that step
cannot be held inside this document by design.

---

## 7 · Known differences from the approved reference

1. **Navbar.** The reference shows an editorial dark navbar; this storefront keeps its
   own existing ivory header untouched (same component, same stylesheet, same computed
   background and height on `/` and `/signin`). The hero therefore starts beneath a
   light bar rather than a dark one.
2. **Typography.** `Cormorant Garamond` + `Manrope`, the project's own families, rather
   than the reference's Didone-ish display face. The hierarchy, tracking and italic
   gold phrase match the reference's structure.
3. **Photograph.** The reference's own campaign still is not available to this project;
   the hero is a generated image at the same art direction. Model pose, jewellery and
   architecture differ in detail, by nature of generation.
4. **Panel proportions.** The panel is a touch taller than the reference's (the form is
   a real form with real validation copy), so at 1440×900 it sits 149 px below the
   header and ends at 851 px — inside the fold — while registration scrolls naturally.
   Width is 560 px, inside the directive's 550–600 px.
5. **Ornaments.** The botanical line work is inline SVG inside the panel's upper-right
   and lower-right corners at 26 % opacity, at 96 px — deliberately fainter than the
   reference's engraved illustration so it never crosses the headline, a field or a
   button.
6. **Mobile.** The reference is desktop; on phones the editorial condenses over the
   photograph with the model held to the right of the copy, the brand highlights are
   hidden to protect the subject, and the hero scrolls if the form needs the room.
