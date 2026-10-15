/**
 * PRATIKSHYA FASHION — preview surface switcher (DEVELOPMENT ONLY).
 *
 * The live preview panel opens `preview.html` inside a frame with no address
 * bar, so a surface that is only reachable by typing `?view=…` was effectively
 * unreachable for a reviewer. This renders the surfaces as links, so the hero
 * preview, the Phase 2A shell, the Phase 2B composition and the Phase 2D exact
 * port are one click apart from inside the page.
 *
 * It is harness CHROME: it renders links and nothing else — no state, no
 * router, no application import, no effect on the surfaces themselves. The
 * surfaces in `embed=1` mode do not render it at all.
 *
 * Removal: delete with the rest of `src/components/storefront/preview/`.
 */

import { campaign } from "../../../design-system";

/** The three review surfaces, in the order a reviewer meets them. */
export const PREVIEW_SURFACES = [
  { id: "hero", label: "Hero (Phase 1)", href: "/?view=hero" },
  { id: "shell", label: "Storefront shell (2A)", href: "/?view=shell" },
  { id: "home", label: "Full homepage (2B)", href: "/?view=home" },
  { id: "aarna", label: "Exact design port (2D)", href: "/?view=aarna" },
];

const S = {
  wrap: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  label: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: campaign.espressoMeta,
    marginRight: 4,
  },
  link: (active) => ({
    font: "inherit",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    padding: "7px 11px",
    textDecoration: "none",
    border: `1px solid ${active ? campaign.burgundy : campaign.line}`,
    background: active ? campaign.burgundy : "#fff",
    color: active ? campaign.blushCanvas : campaign.espressoSoft,
  }),
};

/**
 * @param {("hero"|"shell"|"home"|"aarna")} [current] The surface being previewed.
 * @param {string} [defaultId] The surface a bare `/` opens (the harness default).
 */
export default function PreviewViewSwitcher({ current = null, defaultId = "home" }) {
  return (
    <div style={S.wrap} role="group" aria-label="Preview surface">
      <span style={S.label}>Surface</span>
      {PREVIEW_SURFACES.map((entry) => (
        <a
          key={entry.id}
          href={entry.href}
          style={S.link(current === entry.id)}
          aria-current={current === entry.id ? "page" : undefined}
          title={entry.id === defaultId ? "Opened by the preview panel's root URL" : undefined}
        >
          {entry.label}
          {entry.id === defaultId ? " · default" : ""}
        </a>
      ))}
    </div>
  );
}
