/**
 * PRATIKSHYA FASHION — PHASE 2A PREVIEW (development only).
 *
 * Inspects the new storefront shell — announcement bar, header, mega menu and
 * mobile menu — composed exactly as the approved design frames them: the bar
 * above the sticky header, with the Phase 1 editorial hero beneath, which is
 * how the storefront will read once the shell is integrated in a later phase.
 *
 * It reuses the REAL components (`AnnouncementBar`, `StorefrontHeader`, the
 * Phase 1 `HeroEditorial`) and the REAL providers (`AuthProvider`,
 * `ShoppingProvider` — the same pair the customer layout mounts), so cart and
 * wishlist counts, the account dropdown and the sign-in state behave as they
 * do in the application.
 *
 * Reached at `?view=shell` on the preview server; `?embed=1` renders the
 * surface alone (used by the device frames) and `?data=fixture|auto` chooses
 * the announcement source. The hero preview at the default URL is untouched.
 *
 * Removal: delete it with the rest of `src/components/storefront/preview/`.
 */

import { useEffect, useState } from "react";
import { AuthProvider } from "../../../context/AuthContext";
import { ShoppingProvider, useShopping } from "../../../context/ShoppingContext";
import { useStorefrontAnnouncements } from "../../../hooks/useStorefrontAnnouncements";
import { campaign } from "../../../design-system";
import AnnouncementBar from "../shell/AnnouncementBar";
import StorefrontHeader from "../shell/StorefrontHeader";
import HeroEditorial from "../home/HeroEditorial";
import { MARKETING_PLACEMENTS } from "../../../config/mediaTypes";
import { useMarketingMedia } from "../../../hooks/useMedia";
import {
  PREVIEW_FIXTURE_ANNOUNCEMENTS,
  PREVIEW_FIXTURE_LABEL,
  PREVIEW_FIXTURE_SLIDES,
} from "./previewFixtures";
import PreviewViewSwitcher from "./PreviewViewSwitcher";

const REVIEW_VIEWS = [
  { id: "full", label: "Responsive width", width: 0, height: 0 },
  { id: "desktop", label: "Desktop 1280", width: 1280, height: 860 },
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
    /* The fixed-size frames clip their iframe; the responsive one must not,
       or the frame would become the sticky header's scroll container and the
       header would stop sticking to the real viewport. */
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

/** The storefront surface exactly as the approved design frames it. */
function ShellSurface({ dataMode }) {
  const live = useStorefrontAnnouncements();
  const wishlist = useShopping()?.wishlist;
  const cart = useShopping()?.cart;
  const heroMedia = useMarketingMedia(MARKETING_PLACEMENTS.HOME_HERO);

  /* The hero is the Phase 1 component with the harness's approved fixtures —
     this preview is about the shell, not about hero data. */
  const heroSlides = PREVIEW_FIXTURE_SLIDES;

  const usingFixture = dataMode === "fixture" || (dataMode === "auto" && live.status !== "ready");
  const announcements = usingFixture ? PREVIEW_FIXTURE_ANNOUNCEMENTS : live.announcements;

  return (
    <div className="pf-shell__surface" data-shell-surface={usingFixture ? "preview-fixture" : live.status}>
      <AnnouncementBar items={announcements} />
      <StorefrontHeader
        counts={{ wishlist: wishlist?.count ?? 0, cart: cart?.count ?? 0 }}
        onOpenCart={cart?.openDrawer}
      />
      <main>
        <HeroEditorial slides={heroSlides} heroMedia={heroMedia} />
      </main>
    </div>
  );
}

function WithProviders({ children }) {
  return (
    <AuthProvider>
      <ShoppingProvider>{children}</ShoppingProvider>
    </AuthProvider>
  );
}

export default function ShellPreview() {
  if (!import.meta.env.DEV) return null;
  return <ShellPreviewSurface />;
}

function ShellPreviewSurface() {
  const initial = readParams();
  const [dataMode, setDataMode] = useState(initial.dataMode);
  const [view, setView] = useState("full");
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const live = useStorefrontAnnouncements();
  const usingFixture = dataMode === "fixture" || (dataMode === "auto" && live.status !== "ready");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  if (initial.embed) {
    return (
      <WithProviders>
        <ShellSurface dataMode={initial.dataMode} />
      </WithProviders>
    );
  }

  const active = REVIEW_VIEWS.find((entry) => entry.id === view) ?? REVIEW_VIEWS[0];
  const embedSrc = (mode) => `/preview.html?view=shell&embed=1&data=${mode}`;

  return (
    <div style={S.page}>
      <header style={S.bar}>
        <h1 style={S.title}>Storefront shell — Phase 2A preview</h1>
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

        <PreviewViewSwitcher current="shell" />
      </header>

      <div style={S.status}>
        {usingFixture ? (
          <span style={S.badge("warn")}>{PREVIEW_FIXTURE_LABEL}</span>
        ) : (
          <span style={S.badge("info")}>
            LIVE backend data — {live.announcements.length} announcement(s) from the PROMOTION placement
          </span>
        )}
        <span style={S.badge("info")}>announcements: {live.status}</span>
        <span style={S.badge("info")}>
          hero component: HeroEditorial (Phase 1) — old HeroCarousel not mounted
        </span>
        <span style={S.badge("info")}>
          header: StorefrontHeader (Phase 2A) — production SiteHeader untouched
        </span>
        <span style={S.badge("info")}>
          viewport: {viewport.width}×{viewport.height}
        </span>
      </div>

      <div style={{ padding: "12px 20px 0" }}>
        <p style={{ ...S.hint, margin: 0 }}>
          Hover or focus a primary group (Women, Bridal, Men, Kids, Collections) to open its mega
          panel; the pointer leaving the group or the panel closes it, ESCAPE closes it, and the
          header dims its own rail to opaque while a panel is open. The ceremony group carries B's
          italic accent. Use the Viewport buttons for Desktop / Tablet / Mobile — each frame is a real
          iframe, so the 1023px rail swap, the 599px header rule and the left-hand mobile drawer are
          judged at their true width. The mobile drawer opens from the burger (top left) below 1024px;
          Tab cycles inside it and focus returns to the burger on close. The bag button opens the real
          cart drawer; search opens the real search panel; the account icon opens the real dropdown.
        </p>
      </div>

      <main style={S.stage}>
        <div style={S.frame(active.width)}>
          <div style={S.frameLabel}>
            <span>
              {active.label} ·{" "}
              {active.width ? `${active.width}×${active.height}` : `${viewport.width}×${viewport.height}`}
            </span>
            <span>{usingFixture ? "announcement fixture" : "backend announcements"}</span>
          </div>
          {active.width ? (
            <iframe
              title={`Storefront shell preview — ${active.label}`}
              src={embedSrc(usingFixture ? "fixture" : "auto")}
              width={active.width}
              height={active.height}
              style={{ display: "block", border: 0, background: campaign.blushCanvas }}
            />
          ) : (
            <WithProviders>
              <ShellSurface dataMode={dataMode} />
            </WithProviders>
          )}
        </div>
      </main>
    </div>
  );
}
