/**
 * PRATIKSHYA FASHON — Admin Offers desk (Phase 5)
 *
 * Fully server-backed: the register list, its search (`q`), the derived
 * status filter and pagination all run on `GET /admin/offers`; the metric
 * tiles read the server's own aggregate counts (never a page masquerading
 * as the register, never a locally stored coupon). Activate/pause call
 * their endpoints and are AWAITED — success copy only appears after the
 * server confirms, failures show the server message.
 *
 * Filters the coupon API does not support server-side (offer "type",
 * category/collection scope, per-day usage, from/to windows) are NOT
 * approximated client-side — they are recorded as a BACKEND_GAP in
 * PHASE_5_IMPLEMENTATION_REPORT.md instead of half-faking a filtered set.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play, Plus, Search } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import OfferStatusBadge from "../../../components/offers/OfferStatusBadge";
import { AtelierButton } from "../../../design-system";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import {
  OFFER_STATUS,
  describeEligibility,
  effectiveUsageCount,
  formatOfferDiscount,
  normaliseOffer,
} from "../../../services/offers/offerRepository";
import { apiAdminListOffers, apiAdminActivateOffer, apiAdminPauseOffer } from "../../../services/api/offersApi";
import { formatAdminError } from "../../../services/admin/adminError";
import { formatINR } from "../../../utils/shopping";
import { employeeInputClass } from "../../../components/employee/EmployeeField";
import { cn } from "../../../utils/cn";

const usageLabel = (offer) => {
  const used = effectiveUsageCount(offer);
  if (offer.usageLimit > 0) return `${used} / ${offer.usageLimit}`;
  return `${used} / ∞`;
};

const formatShortDate = (value) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const STATUS_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "SCHEDULED", label: "Scheduled" },
  { id: "EXPIRED", label: "Expired" },
  { id: "ARCHIVED", label: "Paused / archived" },
];

export default function AdminOffers() {
  const { admin } = useAdminAuth();
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [offers, setOffers] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(null);
  const [lifetime, setLifetime] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const result = await apiAdminListOffers({
      q: debouncedQuery || undefined,
      status: status === "ALL" ? undefined : status,
      page,
      pageSize,
    });
    if (result.ok) {
      setOffers((result.offers ?? []).map(normaliseOffer));
      setTotal(result.total ?? 0);
      setCounts(result.counts ?? null);
      setLifetime(result.lifetimeRedemptions ?? null);
      setListError(null);
    } else {
      setOffers([]);
      setTotal(0);
      setListError(formatAdminError(result, { entity: "offer register", action: "loaded" }));
    }
    setIsLoading(false);
  }, [debouncedQuery, status, page]);

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const runAction = async (offer, action) => {
    if (busyId) return;
    setBusyId(offer.id);
    // Awaited: the copy below only claims success after the server answered.
    const result =
      action === "activate" ? await apiAdminActivateOffer(offer.id) : await apiAdminPauseOffer(offer.id);
    if (result.ok) {
      setNotice(
        action === "activate"
          ? `${offer.code} is active on the server — checkout will honour it while its window allows.`
          : `${offer.code} is no longer usable at checkout (deactivated server-side).`
      );
      await load();
    } else {
      setNotice(
        formatAdminError(result, { entity: `offer ${offer.code}`, action }) ??
          `The server refused to ${action} ${offer.code}.`
      );
    }
    setBusyId(null);
  };

  const metrics = useMemo(
    () =>
      counts
        ? {
            total: counts.total ?? total,
            active: counts.ACTIVE ?? 0,
            scheduled: counts.SCHEDULED ?? 0,
            expired: counts.EXPIRED ?? 0,
            inactive: counts.ARCHIVED ?? 0,
          }
        : null,
    [counts, total]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPage
      eyebrow="Business / Offers"
      title={
        <>
          Offers <span className="italic text-accent">& promotions.</span>
        </>
      }
      description="Coupons are backend-owned: this desk lists, filters and toggles the live coupon table. Eligibility at checkout is decided by the server's validation gate — never by this page."
      actions={
        <AtelierButton as={Link} to="/admin/offers/new" size="chip">
          <Plus size={13} aria-hidden="true" /> Create offer
        </AtelierButton>
      }
    >
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {listError ? (
          <p className="col-span-full font-ui text-xs text-accent" role="alert">
            Tiles unavailable — {listError}
          </p>
        ) : !metrics ? (
          <p className="col-span-full font-ui text-xs text-taupe">Loading offer counts from the server…</p>
        ) : (
          <>
            <AdminMetricCard label="Total Offers" value={metrics.total} hint="Every coupon record" />
            <AdminMetricCard label="Active" value={metrics.active} hint="Live for customers" />
            <AdminMetricCard label="Scheduled" value={metrics.scheduled} hint="Not yet open" />
            <AdminMetricCard label="Expired" value={metrics.expired} hint="Past validity window" />
            <AdminMetricCard
              label="Paused / archived"
              value={metrics.inactive}
              hint="Deactivated — the table stores one inactive flag"
              tone={metrics.inactive ? "alert" : "default"}
            />
            <AdminMetricCard
              label="Lifetime Uses"
              value={lifetime ?? 0}
              hint="usage_count across all coupons"
            />
          </>
        )}
      </div>

      {notice ? (
        <p aria-live="polite" className="mb-5 border border-mist/80 bg-canvas px-4 py-3 font-ui text-sm text-ink">
          {notice}
        </p>
      ) : null}

      <AdminPanel
        eyebrow="Register"
        title="Offers"
        action={
          <span className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">
            {total} offer{total === 1 ? "" : "s"}{debouncedQuery ? ` matching “${debouncedQuery}”` : ""}
          </span>
        }
      >
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="relative flex-1">
            <span className="sr-only">Search offers</span>
            <Search className="absolute left-3 top-3 text-taupe" size={15} aria-hidden="true" />
            <input
              className={cn(employeeInputClass(), "pl-9")}
              placeholder="Search code or name (server-side)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status filter">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={status === option.id}
                onClick={() => {
                  setStatus(option.id);
                  setPage(1);
                }}
                className={
                  status === option.id
                    ? "border border-ink bg-ink px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory"
                    : "border border-mist px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {listError ? (
          <div role="alert" className="mb-5 flex items-start justify-between gap-4 border border-accent/50 bg-canvas px-4 py-4">
            <p className="font-ui text-sm text-accent">{listError}</p>
            <button
              type="button"
              onClick={load}
              className="border border-ink px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-ink hover:bg-ink hover:text-ivory"
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-mist font-ui text-[10px] uppercase tracking-widest text-taupe">
                {["Offer Code", "Name", "Type", "Discount", "Eligibility", "Start", "End", "Usage", "Status", "Actions"].map(
                  (heading) => (
                    <th key={heading} className="px-3 py-3" scope="col">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center font-ui text-sm text-taupe">
                    Loading the offer register from the server…
                  </td>
                </tr>
              ) : (
                offers.map((offer) => (
                  <tr key={offer.id} className="border-b border-mist/60 font-ui text-sm">
                    <td className="px-3 py-4 font-medium">
                      <Link to={`/admin/offers/${offer.id}`} className="underline-offset-4 hover:text-accent hover:underline">
                        {offer.code}
                      </Link>
                    </td>
                    <td className="px-3 py-4">{offer.name}</td>
                    <td className="px-3 py-4 text-taupe">{offer.type === "FIXED_AMOUNT" ? "Fixed" : offer.type === "FREE_SHIPPING" ? "Free shipping" : "Percent"}</td>
                    <td className="px-3 py-4">{formatOfferDiscount(offer)}</td>
                    <td className="px-3 py-4 text-taupe">
                      {describeEligibility(offer)}
                      {offer.minimumOrderValue > 0 ? (
                        <span className="block text-[11px]">{formatINR(offer.minimumOrderValue)} minimum</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-taupe">{formatShortDate(offer.startDate ?? offer.startsAt)}</td>
                    <td className="px-3 py-4 text-taupe">{formatShortDate(offer.endDate ?? offer.expiresAt)}</td>
                    <td className="px-3 py-4">{usageLabel(offer)}</td>
                    <td className="px-3 py-4">
                      <OfferStatusBadge status={offer.status ?? offer.displayStatus ?? OFFER_STATUS.DRAFT} />
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/offers/${offer.id}/edit`}
                          className="font-ui text-[10px] uppercase tracking-[.14em] text-brass hover:text-accent"
                        >
                          Edit
                        </Link>
                        {offer.status !== "ACTIVE" ? (
                          <button
                            type="button"
                            disabled={busyId === offer.id}
                            onClick={() => runAction(offer, "activate")}
                            className="inline-flex items-center gap-1 font-ui text-[10px] uppercase tracking-[.14em] text-ink disabled:opacity-40"
                          >
                            <Play size={11} aria-hidden="true" /> Activate
                          </button>
                        ) : null}
                        {offer.status === "ACTIVE" ? (
                          <button
                            type="button"
                            disabled={busyId === offer.id}
                            onClick={() => runAction(offer, "pause")}
                            className="inline-flex items-center gap-1 font-ui text-[10px] uppercase tracking-[.14em] text-taupe disabled:opacity-40"
                          >
                            <Pause size={11} aria-hidden="true" /> Pause
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && !listError && !offers.length ? (
          <p className="py-12 text-center font-ui text-sm text-taupe">
            {total === 0 && !debouncedQuery && status === "ALL"
              ? "No offers exist on the server yet — create the first coupon."
              : "No offers match the current search/status filters."}
          </p>
        ) : null}

        {!isLoading && !listError && total > pageSize ? (
          <div className="mt-5 flex items-center justify-between font-ui text-[11px] text-taupe">
            <p>
              Page {page} of {totalPages} · {total} offer{total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="border border-mist px-3 py-1.5 uppercase tracking-[.14em] transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="border border-mist px-3 py-1.5 uppercase tracking-[.14em] transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>
    </AdminPage>
  );
}
