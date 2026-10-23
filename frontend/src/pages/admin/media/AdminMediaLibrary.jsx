import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Copy, Database, Film, HardDrive, Image as ImageIcon, Layers, Plus, Sparkles, Tag } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import PlacementAssetPanel from "../../../components/admin/media/PlacementAssetPanel";
import RegisteredMediaPanel from "../../../components/admin/media/RegisteredMediaPanel";
import { AtelierButton } from "../../../design-system";
import { useMediaSummary } from "../../../hooks/useMediaRegistry";
import { cn } from "../../../utils/cn";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { useEmployeeAuth } from "../../../context/EmployeeAuthContext";
import { resolveMediaAccess } from "../../../services/media/mediaAccess";

/* The eight summary cards and their icons. Labels, order and meaning come
   from the shared view model; only the icon is a page concern. */
const SUMMARY_CARD_ICONS = {
  total: Layers,
  images: ImageIcon,
  videos: Film,
  productMapped: Sparkles,
  marketing: Tag,
  unassigned: Database,
  largeFiles: HardDrive,
  sameByteCopies: Copy,
};

export default function AdminMediaLibrary() {
  const { admin, isSuperAdmin } = useAdminAuth();
  const { employee } = useEmployeeAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  const [registryRefresh, setRegistryRefresh] = useState(0);

  /* Batch 7 — the placement panel moved below the registry and now sits in a
     disclosure that starts OPEN (decision R3). Collapsing only hides it; the
     panel stays mounted so an in-flight upload, a chosen file and its feedback
     are never thrown away. */
  const [placementOpen, setPlacementOpen] = useState(true);

  /* F-03 (Batch 2): the homepage control centre links here as
     `/media#placement-art`. Landing on that hash opens the panel and scrolls
     it into view, so "register art" stops dead-ending on the product uploader.
     Collapsing afterwards is unaffected — this only reacts to the URL. */
  const placementRef = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.location?.hash !== "#placement-art") return;
    setPlacementOpen(true);
    placementRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, []);

  /* Permission-aware controls (restored in Batch 5A). `resolveMediaAccess` is
     the house's existing media authorization — the same resolver the page used
     through the media-actions hook before Batch 5, read directly here so the
     local-registry write hook stays out of this page. It answers `canUpload`
     for the current session; the server still enforces `media.upload` on
     every registration. */
  const mediaAccess = useMemo(
    () => resolveMediaAccess({ admin, employee }),
    [admin, employee]
  );

  /* Batch 4 — the KPI cards read the durable registry summary, not the
     in-memory session register. */
  const summaryState = useMediaSummary({ refreshToken: registryRefresh });

  return (
    <AdminPage
      eyebrow="Business / Media"
      title="Media Management"
      description="Manage product and marketing media across PRATIKSHYA FASHION."
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Batch 6 — the label names the destination, not the old desk name. */}
          <AtelierButton as={Link} to={`${prefix}/media/marketing`} size="chip" variant="outline">
            Homepage Content
          </AtelierButton>
          {mediaAccess.canUpload ? (
            <AtelierButton
              as={Link}
              to={`${prefix}/media/upload`}
              size="chip"
              className="bg-pf-burgundy text-pf-ivory hover:bg-pf-cocoa shadow-sm"
            >
              <Plus size={13} className="mr-1 inline-block" />
              Upload Product Media
            </AtelierButton>
          ) : null}
        </div>
      }
    >
      {/* Registry summary — the eight truthful cards (Batch 4).
          Server-derived only: `—` while loading or after a failure, never a
          zero. Genuine backend zeros appear only in the `ready` state. */}
      {summaryState.status === "unauthorized" ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          Media statistics are unavailable for this session. Sign in with an
          administrator account that holds the <span className="font-mono">media.view</span>{" "}
          permission to see registry counts.
        </div>
      ) : (
        <>
          {summaryState.status === "error" ? (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
            >
              <span>
                Media statistics could not be loaded:{" "}
                {summaryState.error?.message || "Unknown error"}.
              </span>
              <AtelierButton size="chip" variant="outline" onClick={summaryState.retry}>
                Retry
              </AtelierButton>
            </div>
          ) : null}

          <div
            aria-busy={summaryState.status === "loading"}
            className="mb-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {summaryState.cards.map((card) => (
              <AdminMetricCard
                key={card.id}
                label={card.label}
                value={card.value}
                hint={summaryState.status === "loading" ? "Loading…" : card.hint}
                sub={card.sub}
                tone={card.tone}
                icon={SUMMARY_CARD_ICONS[card.id]}
              />
            ))}
          </div>
        </>
      )}

      {/* F-19 (Batch 4): what deleting one asset actually costs, stated where an
          operator reads the registry. The behaviour is unchanged and no count is
          queried — this only replaces "the UI says nothing" with the truth:
          deletion is refused while anything references the asset (409 from the
          reference audit), a section entry's removal never deletes the artwork,
          a section entry pointing at a vanished asset is removed by the database
          (the media reference cascades), and a hero row keeps its stored object
          key, so its plate simply stops resolving and is hidden on the storefront. */}
      <p role="note" className="mb-4 border-l-2 border-pf-gold-deep bg-pf-card-soft p-3 text-xs text-pf-muted">
        <strong className="text-pf-burgundy">Before deleting an asset:</strong> deletion is permanent and is refused while a
        product, homepage entry or marketing placement still references it. Removing a homepage entry never deletes its
        artwork. If an asset is removed elsewhere, the homepage entries that used it are removed with it, while hero
        placement rows keep their stored object key and their image stops loading.
      </p>
      {/* Batch 5 — ONE inventory: the durable registry, read from
          GET /media/assets. The previous in-memory "All Media" grid and the
          separate durable-asset panel are both gone. */}
      <RegisteredMediaPanel refreshToken={registryRefresh} prefix={prefix} />

      {/* Batch 7 — homepage placement art, BELOW the registry and expanded by
          default. Same panel, same permission gate, same `onRegistered`
          refresh: a registration still re-reads the cards and the registry. */}
      {mediaAccess.canUpload ? (
        <section id="placement-art" ref={placementRef} className="mt-6 scroll-mt-24" aria-labelledby="placement-art-toggle">
          <button
            type="button"
            id="placement-art-toggle"
            aria-expanded={placementOpen}
            aria-controls="placement-art-panel"
            onClick={() => setPlacementOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 border border-pf-border bg-pf-card px-4 py-3 text-left font-ui text-[11px] uppercase tracking-[.16em] text-pf-muted hover:border-pf-gold-line"
          >
            Advanced: homepage placement art
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn("transition-transform", placementOpen ? "rotate-180" : "")}
            />
          </button>
          <div id="placement-art-panel" className={placementOpen ? "" : "hidden"}>
            <PlacementAssetPanel onRegistered={() => setRegistryRefresh((value) => value + 1)} />
          </div>
        </section>
      ) : null}
    </AdminPage>
  );
}
