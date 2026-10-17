# CINEMATIC GLASS AUTH — the PRATIKSHYA FASHION authentication hero

> **STATUS: implemented; build, unit/source suites and browser flows verified.**
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
| `frontend/public/design/pratikshya-auth-campaign.webp` | **Generated** campaign photograph, desktop 1672×941, 100 KB |
| `frontend/public/design/pratikshya-auth-campaign-mobile.webp` | **Generated** portrait crop, 941×1672, 104 KB |
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

Both assets were generated with the image tool from the approved reference's art
direction — a seated Indian model in a deep burgundy, gold-zari silk saree in a
heritage sandstone interior, warm amber diya light, deep burgundy shadows, antique
gold, photographic shallow depth of field — then converted to WebP (quality 82) and
stripped. The desktop frame keeps the model centre-left, the dark architectural space
on the far left for the editorial, and the candlelit arch detail on the right behind
the glass.

- Desktop: `frontend/public/design/pratikshya-auth-campaign.webp` — 1672×941, 100 KB
- Mobile: `frontend/public/design/pratikshya-auth-campaign-mobile.webp` — 941×1672, 104 KB

The `<picture>` swaps to the portrait crop at ≤767 px, so a phone never downloads the
wrong aspect. `width`/`height` are declared (no layout shift), the image is
`fetchPriority="high"`, `decoding="async"`, `alt=""` (decorative; the editorial carries
the meaning).

---

## 4 · The transparent panel

`customer.auth.css` builds the glass from three layers, transparency first:

| Layer | Value |
| --- | --- |
| Panel fill | `linear-gradient(162deg, rgba(58,13,25,.40), rgba(35,7,17,.32) 48%, rgba(27,5,13,.37))` |
| Border | `1px solid rgba(235,196,132,.62)` |
| Radius | `22px` |
| Blur | `backdrop-filter: blur(8px) saturate(1.08)` |
| Highlight | `inset 0 1px 0 rgba(255,236,208,.16)` |

Readability is bought in the order the directive prescribes: the hero scrim first
(`linear-gradient(90deg, …)` darkening the left, a lighter vignette over the right), the
panel tint second, local text shadow third. Blur is deliberately restrained (8 px) so
fabric, zari and candlelight stay legible through the panel; the `@supports not`
fallback raises the tint to `.62` only where `backdrop-filter` does not exist.

Inputs are translucent glass rows: `rgba(255,244,232,.07)` over
`1px solid rgba(246,220,187,.5)`, warm-ivory text, champagne icons, gold focus border
plus a 3 px champagne ring. The primary action is the one intentionally more solid
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

Screenshots at 1440×900, 1024×900 and 390×844 for sign-in, registration, recovery,
reset-incomplete, reset-form and the home page; measured live computed styles. **30/30
behavioural checks passed**, including:

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

Measured live: the panel's computed background is the translucent gradient (no solid
colour), `backdrop-filter: blur(8px) saturate(1.08)`, border `rgba(235,196,132,0.62)`,
radius 22 px; inputs compute to a transparent background inside a translucent row; the
navbar's computed height/background are identical on `/` and `/signin` (a pixel
comparison of the top 99 px of both screenshots differs by **0 pixels**).

**Not verified (and not claimed):** a real credential exchange, a real Google login and
a real reset email — there is no database, no Google client id and no mail relay in this
sandbox. Those flows were exercised against a stubbed API only. The Google identity
provider, when configured, still runs its own external authorization page; that step
cannot be held inside this document by design.

---

## 7 · Known differences from the approved reference

1. **Navbar.** The reference shows an editorial dark navbar; this storefront keeps its
   existing solid cream header, as the directive requires. The hero therefore starts
   beneath a light bar rather than a dark one.
2. **Typography.** `Cormorant Garamond` + `Manrope`, the project's own families, rather
   than the reference's Didone-ish display face. The hierarchy, tracking and italic
   gold phrase match the reference's structure.
3. **Panel proportions.** The panel is a touch taller than the reference's (the form is
   a real form), so on a 1440×900 desktop it ends just below the fold rather than
   floating entirely inside it; registration scrolls naturally.
4. **Ornaments.** The botanical line work in the panel's corners is drawn as inline SVG
   near the corners, not the reference's engraved illustration.
5. **Mobile.** The reference is desktop; on phones the editorial condenses above the
   panel, the brand highlights are hidden to protect the photograph's subject, and the
   hero scrolls if the form needs the room.
