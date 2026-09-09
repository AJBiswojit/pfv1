/**
 * PRATIKSHYA FASHON — Backend-managed HOME_HERO admin panel (B-02)
 *
 * This panel talks to the real backend API:
 *   GET    /admin/marketing/media?placement=HOME_HERO
 *   POST   /admin/marketing/media
 *   PATCH  /admin/marketing/media/{id}
 *   DELETE /admin/marketing/media/{id}
 *   PUT    /admin/marketing/media/reorder
 *
 * It is the source of truth for homepage hero curation. The previous
 * frontend-only memory store (mediaRepository) for HOME_HERO is now
 * secondary — backend is authoritative, frontend memory is fallback for
 * resilience when DB unavailable.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, Eye, Trash2, Plus, RefreshCw } from "lucide-react";
import AdminPanel from "./AdminPanel";
import { AtelierButton } from "../../design-system";
import {
  apiListMarketingMedia,
  apiCreateMarketingMedia,
  apiUpdateMarketingMedia,
  apiDeleteMarketingMedia,
  apiReorderMarketingMedia,
} from "../../services/api/marketingMediaApi";
import { mediaObjectUrl } from "../../services/media/mediaPaths";

const CANONICAL_HERO_OPTIONS = [
  { key: "hero/hero001.avif", label: "hero001.avif — Festive Elegance" },
  { key: "hero/hero002.avif", label: "hero002.avif — Bridal Couture" },
  { key: "hero/hero003.avif", label: "hero003.avif — Heritage Weaves" },
  { key: "hero/hero004.avif", label: "hero004.avif — Celebration Edit" },
  { key: "hero/hero005.avif", label: "hero005.avif — New Arrivals" },
];

const DEFAULT_COPY = {
  "hero/hero001.avif": { title: "Festive Elegance", subtitle: "Handwoven stories for the season of celebration", ctaLabel: "Explore Collection", ctaHref: "/shop" },
  "hero/hero002.avif": { title: "Bridal Couture", subtitle: "Crafted for your most special day", ctaLabel: "View Bridal", ctaHref: "/bridal" },
  "hero/hero003.avif": { title: "Heritage Weaves", subtitle: "Six yards of timeless craft", ctaLabel: "Shop Sarees", ctaHref: "/women/sarees" },
  "hero/hero004.avif": { title: "The Celebration Edit", subtitle: "Dress up every moment", ctaLabel: "Shop the Edit", ctaHref: "/shop" },
  "hero/hero005.avif": { title: "New Arrivals", subtitle: "Fresh drapes, just landed", ctaLabel: "Shop New", ctaHref: "/shop" },
};

export default function BackendHomeHeroPanel() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    objectKey: "hero/hero001.avif",
    title: "Festive Elegance",
    subtitle: "Handwoven stories for the season of celebration",
    ctaLabel: "Explore Collection",
    ctaHref: "/shop",
    sortOrder: 0,
    isActive: true,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    const result = await apiListMarketingMedia({ placement: "HOME_HERO" });
    if (result.ok) {
      const sorted = (result.items || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setItems(sorted);
      setStatus("ready");
    } else {
      setStatus("error");
      setError(result.error || "Failed to load HOME_HERO");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setMessage(null);
    const payload = {
      placement: "HOME_HERO",
      objectKey: form.objectKey,
      title: form.title,
      subtitle: form.subtitle,
      ctaLabel: form.ctaLabel,
      ctaHref: form.ctaHref,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: Boolean(form.isActive),
    };
    const result = await apiCreateMarketingMedia(payload);
    setBusy(false);
    if (result.ok) {
      setMessage({ type: "success", text: `Created ${payload.objectKey}` });
      setShowCreate(false);
      await load();
    } else {
      setMessage({ type: "error", text: result.error || "Create failed" });
    }
  };

  const handleToggleActive = async (item) => {
    setBusy(true);
    const result = await apiUpdateMarketingMedia(item.id, { isActive: !item.isActive });
    setBusy(false);
    if (result.ok) await load();
    else setMessage({ type: "error", text: result.error });
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete ${item.objectKey} from HOME_HERO?`)) return;
    setBusy(true);
    const result = await apiDeleteMarketingMedia(item.id);
    setBusy(false);
    if (result.ok) await load();
    else setMessage({ type: "error", text: result.error });
  };

  const handleMove = async (index, direction) => {
    const newItems = [...items];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= newItems.length) return;
    const tmp = newItems[index];
    newItems[index] = newItems[target];
    newItems[target] = tmp;
    // Reassign sortOrder based on new position
    const reorderPayload = newItems.map((it, i) => ({ id: it.id, sortOrder: i }));
    setBusy(true);
    const result = await apiReorderMarketingMedia({ placement: "HOME_HERO", items: reorderPayload });
    setBusy(false);
    if (result.ok) {
      setItems((result.items || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    } else {
      setMessage({ type: "error", text: result.error });
    }
  };

  const handleObjectKeyChange = (key) => {
    const copy = DEFAULT_COPY[key] || {};
    setForm((f) => ({
      ...f,
      objectKey: key,
      title: copy.title ?? f.title,
      subtitle: copy.subtitle ?? f.subtitle,
      ctaLabel: copy.ctaLabel ?? f.ctaLabel,
      ctaHref: copy.ctaHref ?? f.ctaHref,
    }));
  };

  const seedCanonical = async () => {
    setBusy(true);
    setMessage(null);
    // Create 5 canonical hero entries if not already present
    for (let i = 0; i < CANONICAL_HERO_OPTIONS.length; i++) {
      const opt = CANONICAL_HERO_OPTIONS[i];
      const copy = DEFAULT_COPY[opt.key] || {};
      const payload = {
        placement: "HOME_HERO",
        objectKey: opt.key,
        title: copy.title,
        subtitle: copy.subtitle,
        ctaLabel: copy.ctaLabel,
        ctaHref: copy.ctaHref,
        sortOrder: i,
        isActive: true,
      };
      const result = await apiCreateMarketingMedia(payload);
      if (!result.ok && !String(result.error || "").toLowerCase().includes("already exists")) {
        setMessage({ type: "error", text: `Seed failed at ${opt.key}: ${result.error}` });
        setBusy(false);
        await load();
        return;
      }
    }
    setBusy(false);
    setMessage({ type: "success", text: "Seeded 5 canonical hero assets" });
    await load();
  };

  return (
    <AdminPanel
      eyebrow="Backend-managed"
      title="HOME_HERO — Hero carousel (B-02)"
      description="Database-managed hero curation. Order is explicit, inactive entries excluded, no duplicate media in same placement. Changes reflect on homepage after refresh. This is the production source of truth — the 5 canonical hero files remain as initial data, not hardcoded slideshow definition."
      action={
        <div className="flex gap-2">
          <AtelierButton size="chip" variant="outline" onClick={load} disabled={busy}>
            <RefreshCw size={12} className="mr-1 inline" /> Refresh
          </AtelierButton>
          <AtelierButton size="chip" variant="outline" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={12} className="mr-1 inline" /> {showCreate ? "Close" : "Add hero"}
          </AtelierButton>
        </div>
      }
    >
      {message ? (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-xs ${message.type === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {message.text}
        </div>
      ) : null}

      {status === "loading" ? (
        <p className="font-ui text-xs text-taupe">Loading HOME_HERO from backend…</p>
      ) : status === "error" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="font-ui text-xs text-amber-900">Backend unavailable or table not migrated: {error}</p>
          <p className="mt-2 font-ui text-[11px] text-taupe">Hero currently uses canonical fallback (5 assets) for resilience. Run migrations and seed when DB available.</p>
          <AtelierButton size="chip" variant="outline" className="mt-3" onClick={load}>Retry</AtelierButton>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
            <span className="font-ui text-taupe">{items.length} entries · {items.filter((i) => i.isActive).length} active · ordered by sortOrder</span>
            {items.length === 0 ? (
              <AtelierButton size="chip" variant="outline" onClick={seedCanonical} disabled={busy}>
                Seed 5 canonical hero assets
              </AtelierButton>
            ) : null}
          </div>

          {items.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item, index) => {
                const url = item.url || mediaObjectUrl(item.objectKey || item.object_key);
                const first = index === 0;
                const last = index === items.length - 1;
                return (
                  <li key={item.id} className="border border-mist/80 bg-canvas">
                    <div className="relative aspect-[3/2] overflow-hidden bg-surface">
                      {url ? (
                        <img src={url} alt={item.title || item.objectKey} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-canvas-deep font-ui text-[9px] uppercase tracking-[.2em] text-taupe">No image</div>
                      )}
                      <span className="absolute left-2 top-2 bg-ink/80 px-2 py-1 font-ui text-[9px] tabular-nums tracking-[.14em] text-ivory">{index + 1}</span>
                      <span className={`absolute right-2 top-2 px-2 py-1 font-ui text-[9px] uppercase tracking-[.14em] ${item.isActive ? "bg-green-700/90 text-ivory" : "bg-amber-700/90 text-ivory"}`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="font-display text-sm font-medium leading-snug text-ink">{item.title || "—"}</p>
                      <p className="font-mono text-[10px] uppercase text-cocoa">{item.objectKey}</p>
                      <p className="font-ui text-[11px] text-taupe line-clamp-2">{item.subtitle}</p>
                      <p className="font-ui text-[10px] text-taupe">CTA: {item.ctaLabel} → {item.ctaHref}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <AtelierButton size="chip" variant="outline" disabled={first || busy} onClick={() => handleMove(index, "up")}><ArrowUp size={11} /> Up</AtelierButton>
                        <AtelierButton size="chip" variant="outline" disabled={last || busy} onClick={() => handleMove(index, "down")}><ArrowDown size={11} /> Down</AtelierButton>
                        <AtelierButton size="chip" variant="outline" disabled={busy} onClick={() => handleToggleActive(item)}>{item.isActive ? <><EyeOff size={11} /> Deactivate</> : <><Eye size={11} /> Activate</>}</AtelierButton>
                        <AtelierButton size="chip" variant="outline" disabled={busy} onClick={() => handleDelete(item)}><Trash2 size={11} /> Remove</AtelierButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="border border-dashed border-mist/80 bg-surface/30 px-5 py-10 text-center">
              <p className="font-ui text-sm text-taupe">No HOME_HERO entries in database yet.</p>
              <p className="mt-1 font-ui text-[11px] text-taupe">Seed canonical 5 assets or add custom hero media. Until then, homepage uses resilient fallback (5 canonical files).</p>
              <AtelierButton size="chip" variant="outline" className="mt-4" onClick={seedCanonical} disabled={busy}>Seed canonical heroes</AtelierButton>
            </div>
          )}

          {showCreate ? (
            <form onSubmit={handleCreate} className="mt-6 border border-mist/80 bg-surface/20 p-4">
              <h4 className="mb-3 font-display text-sm font-medium">Add HOME_HERO entry</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">Object Key</span>
                  <select value={form.objectKey} onChange={(e) => handleObjectKeyChange(e.target.value)} className="mt-1 w-full border border-mist/80 bg-canvas px-3 py-2 font-mono text-xs">
                    {CANONICAL_HERO_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                    <option value="marketing/custom.avif">marketing/custom.avif (custom)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">Sort Order</span>
                  <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="mt-1 w-full border border-mist/80 bg-canvas px-3 py-2 font-ui text-xs" />
                </label>
                <label className="block">
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">Title</span>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full border border-mist/80 bg-canvas px-3 py-2 font-ui text-xs" />
                </label>
                <label className="block">
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">CTA Label</span>
                  <input value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} className="mt-1 w-full border border-mist/80 bg-canvas px-3 py-2 font-ui text-xs" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">Subtitle</span>
                  <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="mt-1 w-full border border-mist/80 bg-canvas px-3 py-2 font-ui text-xs" />
                </label>
                <label className="block">
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">CTA Href</span>
                  <input value={form.ctaHref} onChange={(e) => setForm({ ...form, ctaHref: e.target.value })} className="mt-1 w-full border border-mist/80 bg-canvas px-3 py-2 font-ui text-xs" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span className="font-ui text-[11px] uppercase tracking-[.14em] text-taupe">Active</span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <AtelierButton type="submit" size="chip" disabled={busy}>Create</AtelierButton>
                <AtelierButton type="button" size="chip" variant="outline" onClick={() => setShowCreate(false)}>Cancel</AtelierButton>
              </div>
            </form>
          ) : null}
        </>
      )}
    </AdminPanel>
  );
}
