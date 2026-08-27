import { useMemo, useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import AdminPanel from "./AdminPanel";
import StatusBadge from "../employee/StatusBadge";
import { AtelierButton } from "../../design-system";
import { runAction } from "../../services/admin/productAdminService";
import { formatAdminError } from "../../services/admin/adminError";
import { getProductLifecycleOptions } from "../../services/productDeletionService";
import { useAdminAuth } from "../../context/AdminAuthContext";

/**
 * PRATIKSHYA FASHON — Product lifecycle actions (Phase 5 rework).
 *
 * The Media Management view of "retire this product". Every transition here
 * is a SERVER action, awaited: the button reports only what the backend
 * confirmed, and rejections (wrong state, missing gate) show the server's
 * own message via the shared admin-error mapper.
 *
 *   · ARCHIVE / RESTORE — POST /admin/products/{id}/archive and /restore.
 *     Archive is the canonical retirement: the product leaves the storefront
 *     while orders, reviews, history and media are preserved.
 *   · Permanent DELETE — NOT offered. The product API exposes no hard-delete
 *     route (archive is deletion by design), and a locally simulated
 *     deletion would silently diverge from the server register. The old
 *     dependency-checked local delete is therefore honestly disabled here,
 *     documented as a BACKEND_GAP in PHASE_5_IMPLEMENTATION_REPORT.md.
 *
 * The local lifecycle options remain only as a read-only hint panel (they
 * still answer "could this draft theoretically be removed"), never as an
 * execution path.
 */
export default function ProductLifecycleActions({ product, onChanged = null, onDeleted = null }) {
  const { admin } = useAdminAuth();
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;

  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const options = useMemo(
    () => (product ? getProductLifecycleOptions(product.id) : null),
    [product, version] // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  if (!product || !options) return null;

  const refresh = (text) => {
    setMessage(text);
    setVersion((v) => v + 1);
    onChanged?.();
  };

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    const result = await runAction(product.id, action, { actor });
    setBusy(false);
    if (result.ok) {
      refresh(
        action === "archive"
          ? "Archived on the server. The product is no longer storefront-visible; orders and media are preserved."
          : "Restored to draft on the server."
      );
    } else {
      refresh(formatAdminError(result, { entity: product.name ?? "product", action }));
    }
  };

  const mediaCount = options.dependencies.ownedMedia.length;

  return (
    <AdminPanel eyebrow="Lifecycle" title="Retire this product" className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge label={options.status} tone={options.status === "PUBLISHED" ? "accent" : "quiet"} />
        <span className="font-ui text-[12px] text-taupe">
          {product.id} · {product.name}
          {mediaCount ? ` · owns ${mediaCount} media asset${mediaCount === 1 ? "" : "s"}` : " · owns no media"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.canArchive ? (
          <AtelierButton size="chip" variant="outline" disabled={busy} onClick={() => run("archive")}>
            <Archive size={13} strokeWidth={1.5} aria-hidden="true" className="mr-1.5" />
            Archive product
          </AtelierButton>
        ) : null}
        {options.canRestore ? (
          <AtelierButton size="chip" variant="outline" disabled={busy} onClick={() => run("restore")}>
            <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" className="mr-1.5" />
            Restore to draft
          </AtelierButton>
        ) : null}
      </div>

      <p className="mt-4 border-l-4 border-alert bg-alert/5 px-4 py-2.5 font-ui text-[12px] leading-relaxed text-ink" role="note">
        <strong>Permanent deletion is not offered.</strong> The product API has no
        hard-delete route — archiving is the server’s retirement, keeping historical
        order and media references intact. A locally simulated delete would desync
        this desk from the register, so it is disabled rather than faked
        (BACKEND_GAP: recorded for a future phase).
      </p>

      {message ? <p className="mt-3 font-ui text-[12px] text-cocoa">{message}</p> : null}
    </AdminPanel>
  );
}
