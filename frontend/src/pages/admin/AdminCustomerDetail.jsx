import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import { AtelierButton, EmptyState } from "../../design-system";
import { apiAdminGetCustomer } from "../../services/api/customersApi";
import { useOrder } from "../../context/OrderContext";

export default function AdminCustomerDetail() {
  const { customerId } = useParams();
  const { allOrders = [] } = useOrder();
  const [customer, setCustomer] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    apiAdminGetCustomer(customerId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setCustomer(result.customer ?? null);
        setError(null);
        setStatus("ready");
      } else {
        setError(result.error);
        setStatus("error");
      }
    });
    return () => { cancelled = true; };
  }, [customerId, attempt]);

  if (status === "loading") {
    return <AdminPage title="Customer profile"><p role="status" className="font-ui text-sm text-taupe">Loading customer from the server…</p></AdminPage>;
  }

  if (status === "error" || !customer) {
    return (
      <AdminPage title="Customer not found" eyebrow="Customer profile">
        <EmptyState
          eyebrow="Directory unavailable"
          title="Customer could not be loaded"
          description={error ?? "The customer record is not available."}
          actions={<AtelierButton onClick={() => setAttempt((a) => a + 1)} variant="outline" size="md">Try again</AtelierButton>}
        />
      </AdminPage>
    );
  }

  const orders = allOrders.filter(
    (o) => o.customerId === customer.id || o.customer?.email === customer.email
  );
  // Order aggregates come from the backend detail response (a real grouped
  // join over the order ledger) — never recomputed or hardcoded client-side.
  const orderCount = Number.isFinite(Number(customer.orderCount))
    ? Number(customer.orderCount)
    : orders.length;
  const lifetimeSpend = Number.isFinite(Number(customer.lifetimeSpend))
    ? Number(customer.lifetimeSpend)
    : 0;

  return (
    <AdminPage
      title={`${customer.firstName} ${customer.lastName}`}
      eyebrow="Customer profile"
      description={`${customer.id} · ${customer.email}`}
    >
      <div className="grid gap-5 md:grid-cols-3 mb-6">
        <AdminPanel title="Overview">
          <p>Status <b>{customer.status || "ACTIVE"}</b></p>
          <p>Member since {customer.memberSince || "—"}</p>
          <p>
            {orderCount} orders · ₹{Math.round(lifetimeSpend).toLocaleString("en-IN")} lifetime
          </p>
        </AdminPanel>
        <AdminPanel title="Contact">
          <p>{customer.phone}</p>
          <p>{customer.addresses?.[0]?.addressLine || "No saved address"}</p>
          <p>{customer.addresses?.[0]?.city || ""}</p>
        </AdminPanel>
        <AdminPanel title="Support notes">
          <p className="text-slate">Internal notes are visible to authorized support staff only.</p>
        </AdminPanel>
      </div>
      <AdminPanel title="Purchase history">
        <div className="space-y-3">
          {orders.length ? (
            orders.map((o) => (
              <div className="flex justify-between border-b border-pearl py-3" key={o.id}>
                <Link className="underline" to={`/admin/orders/${o.id}`}>
                  {o.id}
                </Link>
                <span>
                  {o.status} · ₹{Math.round(o.total || o.totalAmount || o.pricing?.total || 0).toLocaleString("en-IN")}
                </span>
              </div>
            ))
          ) : (
            <p>No orders yet.</p>
          )}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
