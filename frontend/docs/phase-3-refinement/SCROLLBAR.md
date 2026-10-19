# Sidebar scroll contract — measured evidence

Phase 3 replaced the default grey rail scrollbar with a slim, brand-coloured
one and made the navigation the **only** scroll owner inside the sidebar.
This file records what the browser actually computes, because headless
Chromium does not paint scrollbars — a screenshot cannot prove this part.

Everything below is scoped to `.pf-staff`. No customer storefront CSS was
touched (`src/components/customer/**`, `src/components/storefront/**` are
unchanged).

## 1. The scroll owner

| Claim | Evidence |
| --- | --- |
| The `<nav id="admin-navigation">` is the only scrollable element in the rail | probe walked every descendant of the rail: `railScrollerCount = 1`, `railScrollerIds = ["admin-navigation"]` |
| It scrolls vertically, never horizontally | computed `overflow-y: auto`, `overflow-x: hidden` |
| The identity block and the brand footer are outside it | both are siblings of the nav (flex column); nav `clientHeight 548`, `scrollHeight 1397` at a 768px-tall viewport |
| The footer cannot overlap the last item | footer `top = 691`, nav `bottom = 691` → `overlapsNav: false`; footer fully inside the viewport (`bottom 768`) |
| The page itself does not scroll sideways | `document.scrollingElement.scrollWidth === clientWidth`; `pageScroll.horizontal = false` |
| No second scrollbar on the rail | the `<aside>` is `overflow-visible` on desktop and `overflow-hidden` (no scroll) on the mobile drawer |

Probe: `scripts/visual-audit/probe-sidebar6.mjs` → `evidence/probe/sidebar-metrics.json`.

## 2. The scrollbar styling (computed)

```
scrollbar-width:  thin                                  (Firefox / Chromium 121+)
scrollbar-color:  rgba(214, 174, 112, 0.38) transparent  (champagne thumb / transparent track)
::-webkit-scrollbar            width: 7px; height: 7px
::-webkit-scrollbar-track      background: transparent
::-webkit-scrollbar-thumb      rgba(214, 174, 112, 0.38), border-radius: 999px,
                              2px transparent border, background-clip: content-box
hover / focus-within thumb     rgba(214, 174, 112, 0.70)
nav focus-visible thumb        rgba(214, 174, 112, 0.85)
```

Light scroll regions (`.pf-scroll--light`, ivory panels) get the same shape
with a burgundy thumb: `rgba(101, 8, 31, 0.28)`, strengthening to `0.5` on
hover / focus. Nothing is `overflow: hidden`-only: wheel, trackpad, keyboard
and touch all remain possible, and `scrollbar-width: thin` lets operating
systems that auto-hide scrollbars keep doing so.

## 3. Mask / edge fade

The rail previously faded **both** edges, which dimmed the first group heading
at scroll start. It now fades only the foot, where the nav meets the fixed
wine footer:

```
mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 12px), transparent 100%)
scroll-padding-block: 10px
```

At `scrollTop = 0` the first heading (`Overview`) is fully inside the nav
(`top 161 ≥ nav top 143`) and hit-testable at its own centre
(`elementFromPoint` → the “Overview” button). No top clip, no invisible band.

## 4. Keyboard path

- The nav itself is focusable (`tabIndex=0`) and every destination is a link.
- Focus ring (settled, after the 150 ms colour transition):
  `outline 2px rgb(214, 174, 112)` + `outline-offset 2px` +
  `0 0 0 4px rgba(214, 174, 112, 0.35)` — champagne on burgundy.
- A deep-linked item is brought into view with rect arithmetic
  (`nav.scrollTop ± delta`), never `scrollIntoView`, so the page behind the
  rail never moves. Probe: last item “Settings” focused,
  `top 638 / bottom 672` inside the nav, `withinNav: true`.

## 5. What the probe cannot prove

Headless Chromium paints no scrollbars even with `--hide-scrollbars` removed.
Therefore:

- the **painted** thumb/track pixels, hover brightening and OS auto-hide are
  verified from the computed style contract above, not from a screenshot;
- touch inertia / two-finger scrolling was not exercised in this environment.

Everything else (single scroll owner, footer geometry, top-heading visibility,
keyboard reveal, no horizontal page scroll) is measured in the browser.

## 6. Screenshots

- `evidence/probe/sidebar-top.png` — scroll start: “Overview” crisp, no clip.
- `evidence/probe/sidebar-midscroll.png` — mid-scroll: the foot fade dissolves
  the last row into the footer, the header block stays fixed.
- `evidence/probe/sidebar-focus.png` — keyboard focus on a destination.
- `evidence/after7/drawer-open-390.jpg` — mobile drawer opens **below** the
  masthead (`asideTop 64 = headerBottom 64`), so the brand and account chip
  remain whole and usable.
