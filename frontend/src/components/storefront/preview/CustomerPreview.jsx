/**
 * PRATIKSHYA FASHION — PHASE 2D PREVIEW (development only).
 *
 * The review surface for the EXACT DESIGN PORT: the approved `home-page/`
 * design, carried over file-by-file into `src/components/customer/` and mounted
 * directly by the customer application. There is no query-param switch: the
 * former `?home=*` overrides are inert, and this harness is reached only
 * through `preview.html` (`?view=aarna`).
 *
 * Why a preview surface at all: the review sandbox has no backend and no
 * database, so the live catalogue is empty and the ported rails would render
 * empty. This surface substitutes the design's own labelled fixtures
 * (`previewCustomerFixtures.js`) through the port's preview seams, so the ported
 * page can be compared with the design section by section, at the three
 * reference widths (1440×900 · 834×1112 · 390×844).
 *
 * What it does NOT do: it does not change the ported components, it does not
 * reach production, and it renders no chrome inside the frames (`?embed=1`), so
 * what a reviewer compares is the design itself.
 *
 * `?view=aarna`, optional `?embed=1`, `?width=<px>`.
 *
 * Removal: delete with the rest of `src/components/storefront/preview/`.
 */

import { useState } from "react";

import CustomerStorefront from "../../customer/CustomerStorefront";
import { setPreviewCatalogueSource } from "../../customer/mock/data/products";
import { setPreviewPromotionSource } from "../../customer/mock/data/promotions";
import { setPreviewNewsletterService } from "../../customer/services/newsletter";
import {
  PREVIEW_CUSTOMER_NEWSLETTER,
  PREVIEW_CUSTOMER_PROMOTION,
  CUSTOMER_PREVIEW_PIECES,
} from "./previewCustomerFixtures";
import PreviewViewSwitcher from "./PreviewViewSwitcher";

/**
 * The three seams, set once at module scope: this module is imported by the
 * harness document only, so a production graph can never reach them.
 */
setPreviewCatalogueSource(CUSTOMER_PREVIEW_PIECES);
setPreviewPromotionSource(PREVIEW_CUSTOMER_PROMOTION);
setPreviewNewsletterService(PREVIEW_CUSTOMER_NEWSLETTER);

/** The comparison widths from the migration brief, plus a fluid mode. */
const REVIEW_VIEWS = [
  { id: "fluid", label: "Responsive width", width: 0, height: 0 },
  { id: "desktop", label: "Desktop 1440 × 900", width: 1440, height: 900 },
  { id: "tablet", label: "Tablet 834 × 1112", width: 834, height: 1112 },
  { id: "mobile", label: "Mobile 390 × 844", width: 390, height: 844 },
];

const S = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: "#F7EEED",
    color: "#3A1806",
    fontFamily: '"Manrope", system-ui, sans-serif',
    fontSize: 13,
  },
  bar: {
    position: "sticky",
    top: 0,
    zIndex: 30,
    borderBottom: "1px solid #E9D0C1",
    background: "#fff",
    padding: "14px 20px",
    display: "flex",
    flexWrap: "wrap",
    gap: "18px 26px",
    alignItems: "center",
  },
  title: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, margin: 0, letterSpacing: "-0.01em" },
  group: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  groupLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "#8A6555",
    marginRight: 4,
  },
  button: (active) => ({
    font: "inherit",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    padding: "7px 11px",
    cursor: "pointer",
    border: `1px solid ${active ? "#65081F" : "#E9D0C1"}`,
    background: active ? "#65081F" : "#fff",
    color: active ? "#F7EEED" : "#5B3A2A",
  }),
  status: {
    borderBottom: "1px solid #E9D0C1",
    padding: "10px 20px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 22px",
    background: "#FBF6F5",
    fontSize: 11,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 10px",
    border: "1px solid #E9D0C1",
    background: "#fff6f4",
    color: "#65081F",
    letterSpacing: "0.06em",
  },
  hint: { color: "#8A6555", lineHeight: 1.7, maxWidth: 980 },
  stage: { padding: "20px", display: "flex", justifyContent: "center" },
  frame: (width, height) => ({
    width: width ? `${width}px` : "100%",
    height: height ? `${height}px` : "auto",
    maxWidth: "100%",
    border: "1px solid #E9D0C1",
    background: "#F7EEED",
    boxShadow: "0 18px 50px -30px rgba(58, 24, 6, 0.45)",
    /* The design's mega menu and mobile drawer are positioned against the page;
       the frame is a viewport, so it clips exactly like one. */
    overflow: "hidden",
    position: "relative",
  }),
  scroll: { width: "100%", height: "100%", overflowY: "auto" },
  frameLabel: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 10px",
    borderBottom: "1px solid #E9D0C1",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "#8A6555",
  },
};

const readParams = () => {
  if (typeof window === "undefined") return { embed: false, width: 0 };
  const params = new URLSearchParams(window.location.search);
  const requested = Number(params.get("width") || 0);
  return {
    embed: params.get("embed") === "1",
    width: Number.isFinite(requested) ? requested : 0,
  };
};

/** The ported design, top to bottom, exactly as the design frames it. */
export function CustomerSurface() {
  return <CustomerStorefront />;
}

export default function CustomerPreview() {
  if (!import.meta.env.DEV) return null;
  return <CustomerPreviewSurface />;
}

function CustomerPreviewSurface() {
  const params = readParams();
  const [view, setView] = useState(
    REVIEW_VIEWS.find((entry) => entry.width === params.width)?.id ?? "fluid",
  );
  const active = REVIEW_VIEWS.find((entry) => entry.id === view) ?? REVIEW_VIEWS[0];
  const width = params.width || active.width;

  if (params.embed) {
    return (
      <div style={{ ...S.frame(0, 0), border: 0, boxShadow: "none" }}>
        <CustomerSurface />
      </div>
    );
  }

  return (
    <div style={S.page}>
      <header style={S.bar}>
        <h1 style={S.title}>Phase 2D — exact design port</h1>
        <PreviewViewSwitcher current="aarna" />
        <div style={S.group} role="group" aria-label="Comparison width">
          <span style={S.groupLabel}>Width</span>
          {REVIEW_VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={S.button(active.id === entry.id)}
              aria-pressed={active.id === entry.id}
              onClick={() => setView(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div style={S.status}>
        <span style={S.badge}>
          Preview fixture — the design’s own sample catalogue, NOT live backend data
        </span>
        <span style={S.badge}>Sample offer · Newsletter simulator</span>
        <span style={S.hint}>
          The customer app (<code>/</code>) renders this same port with the live
          catalogue and no fixtures. Compare with <code>home-page/</code> at the same width.
        </span>
      </div>

      <div style={S.stage}>
        <div style={S.frame(width, active.height)}>
          {width ? <div style={S.frameLabel}><span>{active.label}</span><span>frame = viewport</span></div> : null}
          <div style={S.scroll}>
            <CustomerSurface />
          </div>
        </div>
      </div>
    </div>
  );
}
