/**
 * PRATIKSHYA FASHION — controlled homepage integration switch (Phase 2C).
 *
 * THE RULE: the production homepage is the existing `AtelierDesign` unless
 * someone explicitly asks for the integrated editorial home. Nothing a customer
 * can do — a URL, a session, storage — changes that.
 *
 * Two homes:
 *
 *   "atelier"    the existing homepage (`src/pages/AtelierDesign.jsx`) — the
 *                DEFAULT, and the fallback this switch is reversible to.
 *   "editorial"  the integrated composition (`components/storefront/StorefrontHome.jsx`):
 *                the Phase 2A shell (announcement bar + header), the approved
 *                Phase 1 editorial hero, and the Phase 2B homepage sections.
 *   "aarna"      the Phase 2D EXACT PORT of the approved `home-page/` design
 *                (`components/aarna/AarnaStorefront.jsx`): its own announcement
 *                bar, header, mega menu, mobile menu, footer, drawers and all
 *                twelve homepage sections, carried over file-by-file, scoped
 *                under `.aan-root`, wired to this application's catalogue,
 *                routes, cart, wishlist and account. Also OFF by default and
 *                also requested through `?home=aarna` / `VITE_STOREFRONT_HOME`.
 *
 * How "editorial" is requested:
 *
 *   · A deployed build: `VITE_STOREFRONT_HOME=editorial` set when the build
 *     runs. That is an explicit, one-variable deploy decision — the switch is
 *     off in every build that does not set it, and rolling back means building
 *     again without it (or with `atelier`).
 *   · A local dev server: the same variable, and additionally `?home=editorial`
 *     on the URL, so the homepage can be flipped for review without a rebuild.
 *
 * `?home=` is honoured ONLY in a development build (`import.meta.env.DEV`), so a
 * customer can never switch the storefront by editing the URL. `?home=atelier`
 * is the escape hatch that always returns a local review to the existing
 * homepage, whatever the environment variable says.
 *
 * Anything unrecognised — a typo, an empty value, a missing variable — resolves
 * to "atelier". There is no path through this module that leaves the storefront
 * with no homepage to render.
 */

import { useLocation } from "react-router-dom";

export const STOREFRONT_HOME = Object.freeze({
  atelier: "atelier",
  editorial: "editorial",
  aarna: "aarna",
});

/** The homepage root the integrated composition is allowed to replace. */
export const STOREFRONT_HOME_PATH = "/";

const VALUES = [STOREFRONT_HOME.atelier, STOREFRONT_HOME.editorial, STOREFRONT_HOME.aarna];

/** The local-review parameter (`?home=editorial`), development builds only. */
export const STOREFRONT_HOME_PARAM = "home";

/** The build-time variable (`VITE_STOREFRONT_HOME=editorial`). */
export const STOREFRONT_HOME_VAR = "VITE_STOREFRONT_HOME";

/** Vite's environment object, or an empty object outside a Vite build. */
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

/**
 * The pure resolution rule, so it can be exercised directly:
 *
 *   resolveStorefrontHome({ dev, envValue, search })
 *
 * `dev`      — is this a development build (`import.meta.env.DEV`)?
 * `envValue` — `import.meta.env.VITE_STOREFRONT_HOME`
 * `search`   — `window.location.search` (empty during server-side rendering)
 */
export function resolveStorefrontHome({ dev = false, envValue = "", search = "" } = {}) {
  if (dev) {
    let requested = "";
    try {
      requested = new URLSearchParams(search || "").get(STOREFRONT_HOME_PARAM) || "";
    } catch {
      /* A malformed query string is not a reason to change the homepage. */
      requested = "";
    }
    if (VALUES.includes(requested)) return requested;
  }
  return VALUES.includes(envValue) ? envValue : STOREFRONT_HOME.atelier;
}

/** The homepage this build/page is asking for right now. */
export function storefrontHomeChoice() {
  return resolveStorefrontHome({
    dev: Boolean(env.DEV),
    envValue: env[STOREFRONT_HOME_VAR] ?? "",
    search: typeof window === "undefined" ? "" : window.location.search,
  });
}

/**
 * `true` when the customer root should render the integrated composition
 * instead of `AtelierDesign`.
 *
 * Read at render time (not memoised) so a local-review URL change is honoured
 * on the next navigation. It is not a hook: it subscribes to nothing, and the
 * homepage it resolves to is fixed for the life of the page.
 */
export const isEditorialHomeEnabled = () => storefrontHomeChoice() === STOREFRONT_HOME.editorial;

/** `true` when the customer root should render the Phase 2D exact port. */
export const isAarnaHomeEnabled = () => storefrontHomeChoice() === STOREFRONT_HOME.aarna;

/**
 * The Phase 2D boundary question: does THIS path render the exact design port?
 * Same rule as the 2C switch — the customer root only, and only when asked for.
 */
export function useAarnaHome() {
  const { pathname } = useLocation();
  return pathname === STOREFRONT_HOME_PATH && isAarnaHomeEnabled();
}

/**
 * The layout boundary's single question: does THIS path render the integrated
 * homepage? Only the customer root ever can — every other customer route, and
 * every portal route, keeps the shell it has today.
 */
export function useEditorialHome() {
  const { pathname } = useLocation();
  return pathname === STOREFRONT_HOME_PATH && isEditorialHomeEnabled();
}

export default STOREFRONT_HOME;
