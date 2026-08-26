import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import AdminMetricCard from "../../components/admin/AdminMetricCard";
import { AtelierButton, EmptyState } from "../../design-system";
import { apiAdminListCustomers } from "../../services/api/customersApi";

const money = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiAdminListCustomers({ q, page: 1, pageSize: 100 }).then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.ok) {
        setCustomers(result.items ?? []);
        setTotal(result.total ?? (result.items ?? []).length);
        setError(null);
      } else {
        setCustomers([]);
        setError(result.error ?? "Could not load customers from the server.");
      }
    });
    return () => { cancelled = true; };
  }, [q, attempt]);

  const returning = customers.filter((c) => Number(c.orderCount) > 1).length;
  const highValue = customers.filter((c) => Number(c.lifetimeSpend) > 40000).length;
  const withOrders = customers.filter((c) => Number(c.orderCount) > 0).length;

  return (
    <AdminPage
      title="Customers"
      eyebrow="Customer operations"
      description="A considered view of the people behind the house."
      actions={
        error ? <AtelierButton size="chip" variant="outline" onClick={() => setAttempt((a) => a + 1)}>Retry</AtelierButton> : null
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-8">
        <AdminMetricCard label="Total customers" value={total} />
        <AdminMetricCard label="With orders" value={withOrders} />
        <AdminMetricCard label="Returning" value={returning} />
        <AdminMetricCard label="High value" value={highValue} />
      </div>
      <AdminPanel title="Customer directory">
        <input
          aria-label="Search customers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone or customer ID"
          className="w-full border border-pearl bg-ivory px-4 py-3 mb-5"
        />
        {isLoading ? (
          <p role="status" className="font-ui text-sm text-taupe">Loading customers from the server…</p>
        ) : error ? (
          <EmptyState eyebrow="Directory unavailable" title="Customers could not be loaded" description={error} />
        ) : customers.length === 0 ? (
          <EmptyState eyebrow="Customer directory" title="No customers yet" description="Customers appear here as they sign up through the backend." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pearl text-[10px] uppercase tracking-widest">
                  <th className="py-3">Customer</th>
                  <th>Contact</th>
                  <th>Orders</th>
                  <th>Total spend</th>
                  <th>Segment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-pearl/60">
                    <td className="py-4">
                      <Link className="font-medium underline" to={`/admin/customers/${c.id}`}>
                        {c.firstName} {c.lastName}
                      </Link>
                      <div className="text-xs text-slate">{String(c.id).slice(0, 12)}</div>
                    </td>
                    <td>
                      {c.email}
                      <br />
                      <span className="text-xs text-slate">{c.phone}</span>
                    </td>
                    <td>{c.orderCount}</td>
                    <td>{money(c.lifetimeSpend)}</td>
                    <td>
                      {c.lifetimeSpend > 40000
                        ? "HIGH VALUE"
                        : c.orderCount > 1
                          ? "RETURNING"
                          : c.orderCount
                            ? "ACTIVE"
                            : "NEW"}
                    </td>
                    <td>
                      <Link to={`/admin/customers/${c.id}`} className="text-xs uppercase tracking-widest">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
