/**
 * PRATIKSHYA FASHION — Admin offer detail (Phase 17)
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pause, Play, Archive } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import OfferStatusBadge from "../../../components/offers/OfferStatusBadge";
import ConfirmDialog from "../../../components/orders/ConfirmDialog";
import ActivityFeed from "../../../components/employee/ActivityFeed";
import { AtelierButton } from "../../../design-system";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import { useOffer } from "../../../hooks/useOffers";
import offerRepository, {
  OFFER_STATUS,
  describeCustomerEligibility,
  describeEligibility,
  effectiveUsageCount,
  formatOfferDiscount,
  getOfferRedemptions,
} from "../../../services/offers/offerRepository";
import { activityForOffer } from "../../../services/employees/activityService";
import { formatINR } from "../../../utils/shopping";
import { formatOrderDate } from "../../../utils/orders";

export default function AdminOfferDetail() {
  const { offerId } = useParams();
  const { admin, isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;
  const { activity } = useEmployeeManagement();
  const { offer, loading, error } = useOffer(offerId);
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState("");

  const redemptions = useMemo(
    () => (offer ? getOfferRedemptions(offer.id) : []),
    [offer]
  );
  const diary = useMemo(
    () => (offer ? activityForOffer(activity, offer.id) : []),
    [activity, offer]
  );

  if (loading) {
    return (
      <AdminPage eyebrow="Offers" title="Loading offer…">
        <p className="py-12 text-center font-ui text-sm text-pf-muted">Fetching this offer from the server…</p>
      </AdminPage>
    );
  }

  if (!offer) {
    return (
      <AdminPage eyebrow="Offers" title="Offer not found" description="The server has no coupon with this id.">
        {error ? (
          <p role="alert" className="mb-4 font-ui text-sm text-pf-burgundy">{error}</p>
        ) : null}
        <Link to={`${prefix}/offers`} className="font-ui text-sm text-pf-gold-text hover:text-pf-burgundy">
          Back to offers
        </Link>
      </AdminPage>
    );
  }

  const used = effectiveUsageCount(offer);
  const discountGiven = redemptions.reduce((sum, entry) => sum + (entry.discount || 0), 0);

  const apply = async (action) => {
    const result =
      action === "activate"
        ? await offerRepository.activate(offer.id, actor)
        : action === "pause"
          ? await offerRepository.pause(offer.id, actor)
          : await offerRepository.archive(offer.id, actor);
    setConfirm(null);
    if (!result.ok) {
      // Server truth wins over optimism — the record here is re-read from
      // the response envelope (or shown as the rejection).
      setNotice(result.error || `The server refused to ${action} this offer.`);
      return;
    }
    setNotice(
      action === "activate"
        ? `${offer.code} is active on the server.`
        : action === "pause"
          ? `${offer.code} was deactivated on the server. Note: the coupon table stores one inactive flag, so a paused and an archived offer look identical to checkout — only “Activate” reverses either.`
          : `${offer.code} archived (deactivated) on the server.`
    );
  };

  return (
    <AdminPage
      eyebrow={`Business / Offers / ${offer.code}`}
      title={
        <>
          {offer.name} <span className="italic text-pf-burgundy">{offer.code}</span>
        </>
      }
      description={offer.description || "House promotion."}
      actions={
        <div className="flex flex-wrap gap-2">
          <AtelierButton as={Link} to={`${prefix}/offers`} variant="outline" size="chip">
            <ArrowLeft size={12} /> Back
          </AtelierButton>
          <AtelierButton as={Link} to={`${prefix}/offers/${offer.id}/edit`} size="chip">
            Edit
          </AtelierButton>
          {offer.displayStatus === OFFER_STATUS.ACTIVE ? (
            <AtelierButton variant="outline" size="chip" onClick={() => setConfirm("pause")}>
              <Pause size={12} /> Pause
            </AtelierButton>
          ) : offer.displayStatus !== OFFER_STATUS.ARCHIVED ? (
            <AtelierButton variant="outline" size="chip" onClick={() => setConfirm("activate")}>
              <Play size={12} /> Activate
            </AtelierButton>
          ) : null}
          {offer.displayStatus !== OFFER_STATUS.ARCHIVED ? (
            <AtelierButton variant="outline" size="chip" onClick={() => setConfirm("archive")}>
              <Archive size={12} /> Archive
            </AtelierButton>
          ) : null}
        </div>
      }
    >
      {notice ? (
        <p className="mb-6 border border-pf-border/80 bg-pf-card px-4 py-3 font-ui text-sm">{notice}</p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-pf-border/80 bg-pf-ivory/40 p-4">
          <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted">Status</p>
          <div className="mt-2">
            <OfferStatusBadge status={offer.displayStatus} />
          </div>
        </div>
        <div className="border border-pf-border/80 bg-pf-ivory/40 p-4">
          <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted">Discount</p>
          <p className="mt-1 font-display text-2xl">{formatOfferDiscount(offer)}</p>
        </div>
        <div className="border border-pf-border/80 bg-pf-ivory/40 p-4">
          <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted">Usage</p>
          <p className="mt-1 font-display text-2xl">
            {used}
            {offer.usageLimit > 0 ? ` / ${offer.usageLimit}` : ""}
          </p>
        </div>
        <div className="border border-pf-border/80 bg-pf-ivory/40 p-4">
          <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted">Discount given</p>
          <p className="mt-1 font-display text-2xl">{formatINR(discountGiven)}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <AdminPanel eyebrow="Overview" title="Offer">
            <dl className="grid gap-4 sm:grid-cols-2 font-ui text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-[.16em] text-pf-muted">Code</dt>
                <dd className="mt-1">{offer.code}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[.16em] text-pf-muted">Type</dt>
                <dd className="mt-1">{offer.type === "FIXED_AMOUNT" ? "Fixed amount" : "Percentage"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[.16em] text-pf-muted">Minimum order</dt>
                <dd className="mt-1">{offer.minimumOrderValue ? formatINR(offer.minimumOrderValue) : "None"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[.16em] text-pf-muted">Maximum discount</dt>
                <dd className="mt-1">{offer.maximumDiscount ? formatINR(offer.maximumDiscount) : "None"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[.16em] text-pf-muted">Stackable</dt>
                <dd className="mt-1">{offer.stackable ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[.16em] text-pf-muted">Priority</dt>
                <dd className="mt-1">{offer.priority}</dd>
              </div>
            </dl>
          </AdminPanel>

          <AdminPanel eyebrow="Validity" title="Schedule">
            <p className="font-ui text-sm">
              {offer.startDate || "Open"} — {offer.endDate || "No end"}
            </p>
            <p className="mt-2 font-ui text-[11px] text-pf-muted">
              Status is derived from these dates. Expired offers cannot be redeemed.
            </p>
          </AdminPanel>

          <AdminPanel eyebrow="Eligibility" title="Who and what">
            <dl className="space-y-3 font-ui text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-pf-muted">Customers</dt>
                <dd>{describeCustomerEligibility(offer)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-pf-muted">Products</dt>
                <dd className="text-right">{describeEligibility(offer)}</dd>
              </div>
              {offer.excludedProducts.length || offer.excludedCategories.length || offer.excludedCollections.length ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-pf-muted">Exclusions</dt>
                  <dd className="text-right">
                    {[
                      offer.excludedProducts.length ? `${offer.excludedProducts.length} pieces` : null,
                      offer.excludedCategories.length ? `${offer.excludedCategories.length} categories` : null,
                      offer.excludedCollections.length ? `${offer.excludedCollections.length} collections` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </AdminPanel>

          <AdminPanel eyebrow="Redemptions" title="Orders using this offer">
            {redemptions.length ? (
              <div className="divide-y divide-pf-border/60">
                {redemptions.map((entry) => (
                  <div key={entry.orderId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <Link
                        to={`${prefix}/orders/${entry.orderId}`}
                        className="font-ui text-sm text-pf-text underline-offset-4 hover:text-pf-burgundy hover:underline"
                      >
                        {entry.orderId}
                      </Link>
                      <p className="font-ui text-[11px] text-pf-muted">
                        {entry.customer} · {formatOrderDate(entry.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-ui text-sm">{formatINR(entry.discount)}</p>
                      <p className="font-ui text-[10px] uppercase tracking-[.14em] text-pf-muted">{entry.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-ui text-sm text-pf-muted">
                No orders in this browser have redeemed this code yet.
                {used ? ` Seeded usage stands at ${used}.` : ""}
              </p>
            )}
          </AdminPanel>
        </div>

        <div className="space-y-6">
          <AdminPanel eyebrow="Usage" title="Limits">
            <dl className="space-y-3 font-ui text-sm">
              <div className="flex justify-between">
                <dt className="text-pf-muted">House limit</dt>
                <dd>{offer.usageLimit || "Unlimited"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-pf-muted">Per customer</dt>
                <dd>{offer.perCustomerLimit || "Unlimited"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-pf-muted">Recorded uses</dt>
                <dd>{used}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-pf-muted">Orders on register</dt>
                <dd>{redemptions.length}</dd>
              </div>
            </dl>
          </AdminPanel>

          <AdminPanel eyebrow="Activity" title="House diary">
            <ActivityFeed entries={diary} empty="No offer activity recorded yet." />
          </AdminPanel>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title={
          confirm === "pause"
            ? "Pause this offer?"
            : confirm === "archive"
              ? "Archive this offer?"
              : "Activate this offer?"
        }
        description={
          confirm === "pause"
            ? "Customers will not be able to redeem this code until it is resumed. Completed orders stay unchanged."
            : confirm === "archive"
              ? "Archived offers remain in history and cannot be redeemed. This does not delete anything."
              : "The offer will become available according to its dates."
        }
        confirmLabel={confirm === "pause" ? "Pause" : confirm === "archive" ? "Archive" : "Activate"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => apply(confirm)}
      />
    </AdminPage>
  );
}
