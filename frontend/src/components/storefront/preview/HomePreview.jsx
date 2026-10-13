/**
 * PRATIKSHYA FASHION — PHASE 2B PREVIEW (development only).
 *
 * The complete homepage composition for review: announcement bar → Phase 2A
 * header → Phase 1 editorial hero → the Phase 2B content sections, exactly as
 * they will read once the storefront shell is integrated.
 *
 * It uses the REAL components and the REAL providers (`AuthProvider`,
 * `ShoppingProvider` — the same pair the customer layout mounts), so counts,
 * the account dropdown, the wishlist controls and the cart drawer behave as
 * they do in the application. The ONLY thing the harness supplies is data:
 * when no backend answers, the labelled fixtures in
 * `previewSectionFixtures.js` stand in, and the badge row says so.
 *
 * Reached at `?view=home`; `?embed=1` renders the composition alone (the device
 * frames) and `?data=fixture|auto` picks the section data source. The hero
 * preview (`/`) and the shell preview (`?view=shell`) are untouched.
 *
 * `HomeSurface` and `WithProviders` are exported so the render suite can mount
 * the SAME composition server-side and assert what it contains.
 *
 * Removal: delete with the rest of `src/components/storefront/preview/`.
 */

import { useEffect, useState } from "react";

import { campaign } from "../../../design-system";
import { MARKETING_PLACEMENTS } from "../../../config/mediaTypes";
import { AuthProvider } from "../../../context/AuthContext";
import { ShoppingProvider, useShopping } from "../../../context/ShoppingContext";
import { useCatalog } from "../../../hooks/useCatalog";
import { useMarketingMedia } from "../../../hooks/useMedia";
import { useStorefrontAnnouncements } from "../../../hooks/useStorefrontAnnouncements";
import { getCatalogState, hydrateCatalog } from "../../../services/catalog/catalogStore";
import AnnouncementBar from "../shell/AnnouncementBar";
import StorefrontHeader from "../shell/StorefrontHeader";
import HeroEditorial from "../home/HeroEditorial";
import HomeSections from "../home-sections/HomeSections";
import {
  PREVIEW_FIXTURE_ANNOUNCEMENTS,
  PREVIEW_FIXTURE_LABEL,
  PREVIEW_FIXTURE_SLIDES,
} from "./previewFixtures";
import { PREVIEW_FIXTURE_SECTIONS } from "./previewSectionFixtures";
import PreviewViewSwitcher from "./PreviewViewSwitcher";

const REVIEW_VIEWS = [
  { id: "full", label: "Responsive width", width: 0, height: 0 },
  { id: "desktop", label: "Desktop 1280", width: 1280, height: 900 },
  { id: "tablet", label: "Tablet 834", width: 834, height: 1112 },
  { id: "mobile", label: "Mobile 390", width: 390, height: 844 },
];

const DATA_MODES = [
  { id: "auto", label: "Auto (backend first)" },
  { id: "fixture", label: "Preview fixture" },
];

const S = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: campaign.blushPaper,
    color: campaign.espresso,
    fontFamily: '"Instrument Sans", system-ui, sans-serif',
    fontSize: 13,
  },
  bar: {
    borderBottom: `1px solid ${campaign.line}`,
    background: "#fff",
    padding: "14px 20px",
    display: "flex",
    flexWrap: "wrap",
    gap: "18px 26px",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  title: {
    fontFamily: '"Cormorant Garamond", Georgia, serif',
    fontSize: 22,
    lineHeight: 1.1,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  group: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  groupLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: campaign.espressoMeta,
    marginRight: 4,
  },
  button: (active) => ({
    font: "inherit",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    padding: "7px 11px",
    cursor: "pointer",
    border: `1px solid ${active ? campaign.burgundy : campaign.line}`,
    background: active ? campaign.burgundy : "#fff",
    color: active ? campaign.blushCanvas : campaign.espressoSoft,
  }),
  badge: (tone) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 10px",
    border: `1px solid ${tone === "warn" ? campaign.lineStrong : campaign.line}`,
    background: tone === "warn" ? "#fff6f4" : "#fff",
    color: tone === "warn" ? campaign.burgundy : campaign.espressoSoft,
    fontSize: 11,
    letterSpacing: "0.06em",
  }),
  status: {
    borderBottom: `1px solid ${campaign.line}`,
    padding: "10px 20px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 22px",
    background: campaign.blushCanvas,
  },
  hint: { color: campaign.espressoMeta, fontSize: 11, lineHeight: 1.7, maxWidth: 940 },
  stage: { padding: "20px", display: "flex", justifyContent: "center" },
  frame: (width) => ({
    width: width ? `${width}px` : "100%",
    maxWidth: "100%",
    border: `1px solid ${campaign.line}`,
    background: "#fff",
    boxShadow: "0 18px 50px -30px rgba(58, 24, 6, 0.45)",
    overflow: width ? "hidden" : "visible",
  }),
  frameLabel: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 10px",
    borderBottom: `1px solid ${campaign.line}`,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: campaign.espressoMeta,
  },
};

const readParams = () => {
  if (typeof window === "undefined") return { embed: false, dataMode: "auto" };
  const params = new URLSearchParams(window.location.search);
  const dataMode = params.get("data");
  return {
    embed: params.get("embed") === "1",
    dataMode: DATA_MODES.some((mode) => mode.id === dataMode) ? dataMode : "auto",
  };
};

/** The storefront, top to bottom, exactly as the approved design frames it. */
export function HomeSurface({ dataMode }) {
  const liveAnnouncements = useStorefrontAnnouncements();
  const shopping = useShopping();
  const heroMedia = useMarketingMedia(MARKETING_PLACEMENTS.HOME_HERO);

  /* Backend first, fixture second — the same rule the 2A shell preview uses:
     live data the moment the API answers, labelled samples until it does. */
  const usingFixture = dataMode === "fixture" || (dataMode === "auto" && liveAnnouncements.status !== "ready");
  const announcements = usingFixture ? PREVIEW_FIXTURE_ANNOUNCEMENTS : liveAnnouncements.announcements;
  const sectionSource = usingFixture ? PREVIEW_FIXTURE_SECTIONS : null;

  return (
    <div className="pf-shell__surface" data-home-surface={usingFixture ? "preview-fixture" : "live"}>
      <AnnouncementBar items={announcements} />
      <StorefrontHeader
        counts={{ wishlist: shopping?.wishlist?.count ?? 0, cart: shopping?.cart?.count ?? 0 }}
        onOpenCart={shopping?.cart?.openDrawer}
      />
      <main>
        {/* The hero always renders the approved Phase 1 content in the preview:
            the CMS-driven live slides need a database. */}
        <HeroEditorial slides={PREVIEW_FIXTURE_SLIDES} heroMedia={heroMedia} />
        <HomeSections source={sectionSource} />
      </main>
    </div>
  );
}

export function WithProviders({ children }) {
  return (
    <AuthProvider>
      <ShoppingProvider>{children}</ShoppingProvider>
    </AuthProvider>
  );
}

export default function HomePreview() {
  if (!import.meta.env.DEV) return null;
  return <HomePreviewSurface />;
}

function HomePreviewSurface() {
  const initial = readParams();
  const [dataMode, setDataMode] = useState(initial.dataMode);
  const [view, setView] = useState("full");
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const liveAnnouncements = useStorefrontAnnouncements();
  const catalog = useCatalog();

  /* Hydrate the live catalogue only while the reviewer is asking for live
     data: fixture mode makes no backend request, which is the harness contract
     it inherited from Phases 1.5 and 2A. */
  useEffect(() => {
    if (dataMode !== "auto") return;
    if (getCatalogState().status === "idle") hydrateCatalog();
  }, [dataMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const usingFixture = dataMode === "fixture" || (dataMode === "auto" && liveAnnouncements.status !== "ready");

  if (initial.embed) {
    return (
      <WithProviders>
        <HomeSurface dataMode={initial.dataMode} />
      </WithProviders>
    );
  }

  const active = REVIEW_VIEWS.find((entry) => entry.id === view) ?? REVIEW_VIEWS[0];
  const embedSrc = (mode) => `/preview.html?view=home&embed=1&data=${mode}`;

  return (
    <div style={S.page}>
      <header style={S.bar}>
        <h1 style={S.title}>Homepage composition — Phase 2B preview</h1>
        <div style={S.group}>
          <span style={S.groupLabel}>Data</span>
          {DATA_MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={S.button(dataMode === entry.id)}
              onClick={() => setDataMode(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div style={S.group}>
          <span style={S.groupLabel}>Viewport</span>
          {REVIEW_VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={S.button(view === entry.id)}
              onClick={() => setView(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <PreviewViewSwitcher current="home" />
      </header>

      <div style={S.status}>
        {usingFixture ? (
          <span style={S.badge("warn")}>{PREVIEW_FIXTURE_LABEL}</span>
        ) : (
          <span style={S.badge("info")}>LIVE backend data</span>
        )}
        <span style={S.badge("info")}>
          sections: categories · saree · bridal · finishing · offer · men · kids · bestsellers ·
          fabric stories · service strip
        </span>
        <span style={S.badge("info")}>announcements: {liveAnnouncements.status}</span>
        <span style={S.badge("info")}>
          catalogue: {catalog.status}
          {catalog.error ? " (see console for failed endpoints)" : ""}
        </span>
        <span style={S.badge("info")}>
          viewport: {viewport.width}×{viewport.height}
        </span>
      </div>

      <div style={{ padding: "12px 20px 0" }}>
        <p style={{ ...S.hint, margin: 0 }}>
          Scroll the whole page: announcement rail → header → editorial hero → the ten content
          sections in the approved order. The newsletter band (11) is not built — this application
          has no subscribe endpoint yet, and a form that did nothing would be a dead control. With
          Data = Preview fixture everything you see is labelled sample content: real photography and
          real product ids from this repository, but no prices and no live catalogue records. Switch
          to Auto with a running backend and the sections read the live catalogue instead.
        </p>
      </div>

      <main style={S.stage}>
        <div style={S.frame(active.width)}>
          <div style={S.frameLabel}>
            <span>
              {active.label} ·{" "}
              {active.width ? `${active.width}×${active.height}` : `${viewport.width}×${viewport.height}`}
            </span>
            <span>{usingFixture ? "sample section data" : "live catalogue"}</span>
          </div>
          {active.width ? (
            <iframe
              title={`Homepage preview — ${active.label}`}
              src={embedSrc(usingFixture ? "fixture" : "auto")}
              width={active.width}
              height={active.height}
              style={{ display: "block", border: 0, background: campaign.blushCanvas }}
            />
          ) : (
            <WithProviders>
              <HomeSurface dataMode={dataMode}  />
            </WithProviders>
          )}
        </div>
      </main>
    </div>
  );
}
