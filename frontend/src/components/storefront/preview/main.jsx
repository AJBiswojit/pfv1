/**
 * PRATIKSHYA FASHION — Phase 1.5 preview harness entry (development only).
 *
 * Mounted by `frontend/preview.html`. This is the only module in the harness
 * that touches the DOM, and it deliberately reuses the application's own
 * stylesheet, providers and router so the hero is inspected under the same
 * conditions as the app:
 *
 *   · `index.css` — the real Tailwind theme and the Phase 1 tokens;
 *   · `MemoryRouter` — the real routing context (the same library the app
 *     uses; no second router implementation, no routes registered).
 *
 * Nothing here is imported by `src/App.jsx` or `src/main.jsx`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import "../../../index.css";
import HeroPreview from "./HeroPreview";
import CustomerPreview from "./CustomerPreview";
import HomePreview from "./HomePreview";
import ShellPreview from "./ShellPreview";

/**
 * Four surfaces share this development-only document:
 *
 *   /                 the full homepage composition (hero + 2A shell + 2B
 *                     sections together) — the default surface
 *   /?view=hero       the Phase 1 hero preview
 *   /?view=shell      the Phase 2A storefront shell preview
 *   /?view=home       the same composition, spelled out
 *   /?view=aarna      the Phase 2D exact port of the approved `home-page/`
 *                     design, with its own labelled fixtures
 *
 * The surface is chosen HERE, from the browser's own URL: the preview panel
 * opens the port root inside a frame with no address bar, so a surface that is
 * only reachable by typing `?view=…` was effectively unreachable for a
 * reviewer. A URL that names no view therefore opens the composition — the one
 * page that shows all of the work under review — while every surface keeps its
 * own explicit URL. (`vite-preview-server.mjs` rewrites paths only; it never
 * invents query strings, so this file stays the single source of that rule.)
 *
 * Each surface is dev-gated inside its own module, so none of them can render
 * in a production build even if this document is opened by accident.
 */
const DEFAULT_VIEW = "home";

const view = () => {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const requested = new URLSearchParams(window.location.search).get("view");
  if (!requested) return DEFAULT_VIEW;
  return requested === "shell" || requested === "home" || requested === "aarna"
    ? requested
    : "hero";
};

const container = document.getElementById("preview-root");

if (container) {
  createRoot(container).render(
    <StrictMode>
      <MemoryRouter>
        {/* One line on purpose: the view dispatch is the whole contract here. */}
        {view() === "aarna" ? (
          <CustomerPreview />
        ) : view() === "home" ? <HomePreview /> : view() === "shell" ? <ShellPreview /> : <HeroPreview />}
      </MemoryRouter>
    </StrictMode>
  );
}
