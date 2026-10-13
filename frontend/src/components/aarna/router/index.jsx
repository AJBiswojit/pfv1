/**
 * PRATIKSHYA FASHION — PHASE 2D · the routing shim.
 *
 * The design's twenty components import `Link` and `NavLink` from
 * `react-router-dom`. This module re-exports both, wrapped so that every
 * destination is translated through `resolveStorefrontPath` before the router
 * sees it — the design's paths stay untouched in the components, and what
 * reaches this application's router is always a route it registers.
 *
 * `useLocation`, `useNavigate`, `useParams` and `Outlet` are NOT wrapped: they
 * belong to this application's router and behave exactly as they do everywhere
 * else. One consequence is worth knowing when reading the ported shell: the
 * design's own "is this section current?" checks compare
 * `location.pathname` against design-era paths, so an active-state there can
 * only be as accurate as the translation table. Nothing in the ported homepage
 * depends on that comparison; the mobile menu's open state and the mega panel's
 * open state are driven by hover/focus and the UI context.
 */

import { Link as RouterLink, NavLink as RouterNavLink } from "react-router-dom";
import { resolveStorefrontPath } from "./routes.js";

const translate = (to) => (to === undefined || to === null ? to : resolveStorefrontPath(to));

/** `Link` with the design's destination vocabulary. */
export function Link({ to, ...rest }) {
  return <RouterLink to={translate(to)} {...rest} />;
}

/** `NavLink`, same treatment, so `className={({isActive}) => …}` still works. */
export function NavLink({ to, ...rest }) {
  return <RouterNavLink to={translate(to)} {...rest} />;
}

export { resolveStorefrontPath, isRegisteredPath, routeTable } from "./routes.js";
export default Link;
