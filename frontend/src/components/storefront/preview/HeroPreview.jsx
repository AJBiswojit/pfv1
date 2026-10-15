/**
 * PRATIKSHYA FASHION — PHASE 1.5 PREVIEW HARNESS (development only).
 *
 * A temporary, isolated inspection surface for the Phase 1 editorial hero.
 * It renders the REAL `HeroEditorial` component with the real design tokens,
 * the real hero stylesheet and the real media seam — it does not re-implement
 * or restyle anything.
 *
 * How it is reached: the dev-only entry `frontend/preview.html`
 * (`npx vite --config vite.preview.config.js`). The preview config serves that
 * document at the dev server ROOT, because a live preview panel opens the root
 * — pointing `/` at the harness is what makes the harness the page under
 * review instead of the production `index.html`. The untouched application is
 * still served at `/index.html` (and `/app`) on that server.
 *
 * It is NOT part of the application's route table, not referenced by
 * `App.jsx`, and not an input of `npm run build`, so it cannot become a
 * production page. As a second guard this module renders nothing at all
 * outside `import.meta.env.DEV`.
 *
 * Data: the harness prefers LIVE backend data — it hydrates the catalogue the
 * same way `App.jsx`'s bootstrap does and reads `GET /home` → `heroSlides`
 * plus the HOME_HERO marketing register. When no backend answers, it falls
 * back to the clearly labelled, preview-only fixtures in `previewFixtures.js`
 * (see that file for the provenance of every value).
 *
 * URL flags (preview-only): `?embed=1` renders the hero alone (used by the
 * device frames), `?active=<0..4>` rotates the list so that layout sits in the
 * active position, `?data=auto|backend|fixture` forces a data source.
 *
 * The chrome around the hero is preview-only UI and is deliberately written
 * with inline styles: no Tailwind class here is scanned into the production
 * stylesheet, so the harness leaves the application's CSS untouched.
 *
 * Removal: delete `frontend/preview.html`, `frontend/vite.preview.config.js`,
 * `frontend/preview/`, and `frontend/src/components/storefront/preview/`.
 */

import { useEffect, useState } from "react";

import { campaign, useMediaQuery } from "../../../design-system";
import { MARKETING_PLACEMENTS } from "../../../config/mediaTypes";
import { heroSlides } from "../../../data/catalog/hero";
import { useCatalog } from "../../../hooks/useCatalog";
import { useMarketingMedia } from "../../../hooks/useMedia";
import { getCatalogState, hydrateCatalog } from "../../../services/catalog/catalogStore";
import HeroEditorial from "../home/HeroEditorial";
import { PREVIEW_FIXTURE_LABEL, PREVIEW_FIXTURE_SLIDES } from "./previewFixtures";
import PreviewViewSwitcher from "./PreviewViewSwitcher";

/** The five editorial layouts, in the order the hero applies them. */
const LAYOUTS = ["left", "panel", "right", "split", "top"];

const DEVICES = [
  { id: "full", label: "Responsive width", width: 0, height: 0 },
  { id: "desktop", label: "Desktop 1280", width: 1280, height: 820 },
  { id: "tablet", label: "Tablet 834", width: 834, height: 1112 },
  { id: "mobile", label: "Mobile 390", width: 390, height: 844 },
];

const DATA_MODES = [
  { id: "auto", label: "Auto (backend first)" },
  { id: "backend", label: "Backend only" },
  { id: "fixture", label: "Preview fixture" },
];

const VIEWS = [
  { id: "single", label: "Single layout" },
  { id: "stack", label: "All five layouts" },
];

/* ------------------------------------------------------------------ */
/* Preview-only styles (inline — nothing is added to index.css)        */
/* ------------------------------------------------------------------ */

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
  status: {
    borderBottom: `1px solid ${campaign.line}`,
    padding: "10px 20px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 22px",
    background: campaign.blushCanvas,
  },
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
  hint: { color: campaign.espressoMeta, fontSize: 11, lineHeight: 1.7 },
  stage: { padding: "20px", display: "flex", justifyContent: "center" },
  frame: (width) => ({
    width: width ? `${width}px` : "100%",
    maxWidth: "100%",
    border: `1px solid ${campaign.line}`,
    background: "#fff",
    boxShadow: "0 18px 50px -30px rgba(58, 24, 6, 0.45)",
    overflow: "hidden",
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
  stackItem: { marginBottom: 34 },
};

/** Preview flags from the URL (never used by the application). */
const readParams = () => {
  if (typeof window === "undefined") {
    return { embed: false, active: 0, dataMode: "auto" };
  }
  const params = new URLSearchParams(window.location.search);
  const active = Number.parseInt(params.get("active") ?? "0", 10);
  const dataMode = params.get("data");
  return {
    embed: params.get("embed") === "1",
    active: Number.isInteger(active) && active > 0 && active < LAYOUTS.length ? active : 0,
    dataMode: DATA_MODES.some((mode) => mode.id === dataMode) ? dataMode : "auto",
  };
};

/** Move the slide at `offset` to the front so its layout becomes the active one. */
const rotate = (list, offset) =>
  offset > 0 && list.length > offset ? [...list.slice(offset), ...list.slice(0, offset)] : list;

export default function HeroPreview() {
  /* Hard guard: the harness can never render outside a development build. */
  if (!import.meta.env.DEV) return null;
  return <HeroPreviewSurface />;
}

function HeroPreviewSurface() {
  const initial = readParams();
  const [dataMode, setDataMode] = useState(initial.dataMode);
  const [active, setActive] = useState(initial.active);
  const [view, setView] = useState("single");
  const [device, setDevice] = useState("full");
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  /* Same bootstrap as `App.jsx`'s CatalogBootstrap — the existing store, no
     second client and no new endpoint. The labelled fixture mode deliberately
     makes NO backend call at all, so a preview without a database shows zero
     failed requests; Auto and Backend modes keep the production behaviour. */
  const catalog = useCatalog();
  useEffect(() => {
    if (dataMode === "fixture") return;
    if (getCatalogState().status === "idle") hydrateCatalog();
  }, [dataMode]);

  /* The existing marketing register and the existing /home slide list. */
  const heroMedia = useMarketingMedia(MARKETING_PLACEMENTS.HOME_HERO);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const liveSlides = Array.from(heroSlides);
  const hasLive = liveSlides.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const usingFixture = dataMode === "fixture" || (dataMode === "auto" && !hasLive);
  const slides = usingFixture ? PREVIEW_FIXTURE_SLIDES : liveSlides;
  const orderedSlides = rotate(slides, active);

  /* Embed mode: the hero alone, at the frame's own viewport, so media queries,
     container queries and `svh` units behave exactly as they will in the
     application. No chrome is drawn inside the frame. */
  if (initial.embed) {
    return <HeroEditorial slides={orderedSlides} heroMedia={heroMedia} />;
  }

  const activeDevice = DEVICES.find((entry) => entry.id === device) ?? DEVICES[0];
  const iframeSrc = (offset) =>
    `/preview.html?embed=1&active=${offset}&data=${usingFixture ? "fixture" : "auto"}`;

  const heroBlock = (key, list, offset, frame) => (
    <div style={S.frame(frame?.width)} key={key}>
      <div style={S.frameLabel}>
        <span>
          {key} · {frame?.width ? `${frame.width}×${frame.height}` : `${viewport.width}×${viewport.height}`}
        </span>
        <span>{usingFixture ? "preview fixture" : "backend data"}</span>
      </div>
      {frame?.width ? (
        <iframe
          title={`Hero preview — ${key}`}
          src={iframeSrc(offset)}
          width={frame.width}
          height={frame.height}
          style={{ display: "block", border: 0, background: "#fff" }}
        />
      ) : (
        <HeroEditorial slides={list} heroMedia={heroMedia} />
      )}
    </div>
  );

  return (
    <div style={S.page}>
      <header style={S.bar}>
        <h1 style={S.title}>Editorial hero — Phase 1.5 preview</h1>

        <div style={S.group}>
          <span style={S.groupLabel}>View</span>
          {VIEWS.map((entry) => (
            <button key={entry.id} type="button" style={S.button(view === entry.id)} onClick={() => setView(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>

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
        <div style={{ ...S.hint, flexBasis: "100%", margin: 0, maxWidth: 900 }}>
          “Preview fixture” makes no backend request at all — pick it for a clean console. Auto and
          Backend only hit the existing endpoints.
        </div>

        <div style={S.group}>
          <span style={S.groupLabel}>Layout</span>
          <button type="button" style={S.button(active === 0)} onClick={() => setActive(0)}>
            Production order
          </button>
          {LAYOUTS.map((entry, index) => (
            <button
              key={entry}
              type="button"
              style={S.button(active === index)}
              onClick={() => setActive(index)}
              title={`Show the ${entry} layout in the active position${
                slides[index]?.title ? ` (${slides[index].title})` : ""
              }`}
            >
              {entry}
            </button>
          ))}
        </div>

        <div style={S.group}>
          <span style={S.groupLabel}>Viewport</span>
          {DEVICES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={S.button(device === entry.id)}
              onClick={() => setDevice(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <PreviewViewSwitcher current="hero" />
      </header>

      <div style={S.status}>
        {usingFixture ? (
          <span style={S.badge("warn")}>{PREVIEW_FIXTURE_LABEL}</span>
        ) : (
          <span style={S.badge("info")}>
            LIVE backend data — {liveSlides.length} slides from GET /home
          </span>
        )}
        <span style={S.badge("info")}>
          hero component: HeroEditorial (Phase 1) — old HeroCarousel not mounted
        </span>
        <span style={S.badge("info")}>
          entry: / → preview.html · untouched homepage: /app
        </span>
        <span style={S.badge("info")}>
          catalogue: {catalog.status}
          {catalog.error ? ` — ${catalog.error}` : ""}
        </span>
        <span style={S.badge("info")}>
          prefers-reduced-motion: {reducedMotion ? "reduce" : "no-preference"}
        </span>
        <span style={S.badge("info")}>
          viewport: {viewport.width}×{viewport.height}
        </span>
      </div>

      <div style={{ padding: "12px 20px 0" }}>
        <p style={{ ...S.hint, margin: 0 }}>
          Keyboard: click inside the hero, then ← / → move one slide. Touch: swipe horizontally (48 px,
          and the gesture must beat vertical drift). Autoplay advances every 7 s and pauses on hover, on
          keyboard focus, when the hero scrolls out of view, and while the tab is hidden. Reduced motion:
          emulate “prefers-reduced-motion: reduce” in your browser’s devtools (or the OS setting) —
          autoplay and the spatial reveals stop and the badge above flips to <em>reduce</em>. The hero
          itself contains no counter, progress bar, pause button or arrow control, and this harness does
          not change its behaviour.
        </p>
      </div>

      <main style={S.stage}>
        {view === "stack" ? (
          <div style={{ width: "100%" }}>
            {slides.map((slide, index) => (
              <div style={S.stackItem} key={slide.id}>
                {heroBlock(
                  `${LAYOUTS[index % LAYOUTS.length]} · ${slide.title ?? slide.id}`,
                  rotate(slides, index),
                  index,
                  activeDevice.width ? activeDevice : null
                )}
              </div>
            ))}
          </div>
        ) : (
          heroBlock(
            active > 0 ? `${LAYOUTS[active]} layout` : "production order",
            orderedSlides,
            active,
            activeDevice.width ? activeDevice : null
          )
        )}
      </main>
    </div>
  );
}
