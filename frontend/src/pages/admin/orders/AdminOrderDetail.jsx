/**
 * PRATIKSHYA FASHON — Admin Order Detail
 *
 * Order Header, Customer, Items, Pricing, Payment, Inventory, Fulfillment,
 * Shipping, Timeline, Notes.
 *
 * PHASE 3 changes:
 *   - Reads the order from the backend (`GET /admin/orders/{id}`) with
 *     real loading and error states. It previously read a local record
 *     synchronously and rendered "Order not found" both while data was
 *     still undefined and for genuine failures.
 *   - Dispatch no longer fabricates data. It used to invent a tracking
 *     number (`TRK-<timestamp>`) when the dispatcher left the field
 *     blank, and always sent the hard-coded estimated delivery
 *     "14–16 Aug 2026". Both are now real, dispatcher-entered values, and
 *     the tracking number is required before the order can be dispatched.
 *   - The shipping panel reads the order's own stored dispatch fields.
 *   - Assignment defaults are no longer hard-coded warehouse/handler ids.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Package, User, MapPin, AlertTriangle, Check } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import OrderStatusBadge from "../../../components/orders/OrderStatusBadge";
import OrderTimeline from "../../../components/orders/OrderTimeline";
import { useOrder } from "../../../context/OrderContext";
import { apiAdminGetOrder } from "../../../services/api/ordersApi";
import { useInventory } from "../../../context/InventoryContext";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import { ORDER_STATUS, CANCELLATION_REASONS, CARRIERS } from "../../../config/orderConfig";
import { formatINR } from "../../../utils/shopping";
import { formatOrderDate, formatEventTime } from "../../../utils/orders";
import { employeeFullName } from "../../../utils/employee";
import { getActiveAssignmentEmployees } from "../../../services/employees/employeeService";
import { AtelierButton } from "../../../design-system";

export default function AdminOrderDetail() {
  const { orderId } = useParams();
  const { allocateOrder, assignFulfillment, markItemPicked, markPacked, markReadyToDispatch, dispatchOrder, markOutForDelivery, markDelivered, addInternalNote, cancelOrderAdmin } = useOrder();
  const inventory = useInventory();
  const { employees: employeeRegister } = useEmployeeManagement();
  const employees = useMemo(
    () => getActiveAssignmentEmployees(employeeRegister).map((employee) => ({
      ...employee,
      name: employeeFullName(employee),
    })),
    [employeeRegister]
  );

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    apiAdminGetOrder(orderId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setOrder(result.order);
      else {
        setOrder(null);
        setLoadError({ status: result.status, message: result.error });
      }
    });
    return () => { cancelled = true; };
  }, [orderId, reloadToken]);

  const [carrier, setCarrier] = useState(CARRIERS[0].label);
  const [tracking, setTracking] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const packCount = 1;
  const [packNotes, setPackNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [cancelReason, setCancelReason] = useState("customer_request");
  const [cancelNote, setCancelNote] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [notice, setNotice] = useState("");
  // No hard-coded warehouse or handler: the dispatcher picks from the
  // real registers, and an unassigned order starts blank.
  const [assignLocation, setAssignLocation] = useState("");
  const [assignEmployee, setAssignEmployee] = useState("");

  useEffect(() => {
    if (!order) return;
    setAssignLocation(order.fulfillment_location_id ?? order.fulfillment?.sourceLocationId ?? "");
    setAssignEmployee(order.fulfillment_handler_id ?? order.fulfillment?.assignedEmployeeId ?? "");
    setCarrier(order.tracking?.carrier ?? CARRIERS[0].label);
    setTracking(order.tracking?.trackingNumber ?? "");
  }, [order]);

  const inventoryMap = useMemo(() => {
    if (!order) return [];
    return order.items.map((item) => {
      const availability = inventory.records.filter((r) => r.productId === item.productId);
      const totalAvailable = availability.reduce((s, r) => s + r.quantity.available, 0);
      const totalReserved = availability.reduce((s, r) => s + r.quantity.reserved, 0);
      const location = order.fulfillment?.sourceLocationId ? inventory.locations.find((l) => l.id === order.fulfillment.sourceLocationId) : null;
      return {
        ...item,
        available: totalAvailable,
        reserved: totalReserved,
        locationName: location?.name || "—",
        placement: availability[0]?.placementLabel || "—",
      };
    });
  }, [order, inventory.records, inventory.locations]);

  if (loading) {
    return (
      <AdminPage eyebrow="Orders" title="Loading order…">
        <p role="status" aria-live="polite" aria-busy="true" className="font-ui text-sm text-taupe">
          Loading order…
        </p>
      </AdminPage>
    );
  }

  if (loadError || !order) {
    // Each status gets its own honest message — a server failure is never
    // presented as "this order does not exist".
    const status = loadError?.status ?? 404;
    const title =
      status === 401 ? "Session expired"
        : status === 403 ? "Not permitted"
        : status === 404 ? "Order not found"
        : "Could not load this order";
    const detail =
      status === 401 ? "Your admin session has expired. Sign in again to continue."
        : status === 403 ? "Your role does not include permission to view orders."
        : status === 404 ? "No order exists with this reference."
        : loadError?.message ?? "Something went wrong on our side. Please try again.";
    return (
      <AdminPage eyebrow="Orders" title={title}>
        <p role="alert" className="font-ui text-sm text-graphite">{detail}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {status >= 500 || status === 0 ? (
            <AtelierButton type="button" variant="outline" size="chip" onClick={reload}>
              Try again
            </AtelierButton>
          ) : null}
          <Link to="/admin/orders" className="font-ui text-sm text-brass hover:text-accent">Back to orders</Link>
        </div>
      </AdminPage>
    );
  }

  const orderRef = order.orderNumber ?? order.id;

  /**
   * Fulfillment actions go to the backend and its returned order becomes
   * the displayed record, so the screen never shows an optimistic state
   * the server did not accept.
   */
  const handleAction = async (fn, payload, successMsg) => {
    const res = await fn(order.id, payload);
    if (res?.ok) {
      if (res.order) setOrder(res.order);
      setNotice(successMsg || res.message || "Updated");
    } else {
      setNotice(res?.message || "Action failed");
    }
  };

  return (
    <AdminPage
      eyebrow={`Sales / Orders / ${orderRef}`}
      title={
        <>
          Order <span className="italic text-accent">{orderRef}</span>
        </>
      }
      description={`${order.customer?.fullName || "Customer unavailable"} · ${order.items.length} items · ${formatINR(order.pricing.total)}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <AtelierButton as={Link} to="/admin/orders" variant="outline" size="chip">
            <ArrowLeft size={12} /> Back
          </AtelierButton>
          <AtelierButton as={Link} to={`/admin/orders/${order.id}/invoice`} variant="outline" size="chip">
            Invoice
          </AtelierButton>
        </div>
      }
    >
      {notice && (
        <div className="mb-6 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">{notice}</div>
      )}

      {/* Header metrics */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="border border-mist/80 bg-surface/40 p-4">
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Order Value</p>
          <p className="mt-1 font-display text-xl">{formatINR(order.pricing.total)}</p>
          <p className="mt-1 font-ui text-[10px] text-taupe">{order.items.length} items</p>
        </div>
        <div className="border border-mist/80 bg-surface/40 p-4">
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Payment</p>
          <div className="mt-2"><OrderStatusBadge status={order.paymentStatus} kind="payment" /></div>
          <p className="mt-2 font-ui text-xs">{order.paymentMethod.label}</p>
        </div>
        <div className="border border-mist/80 bg-surface/40 p-4">
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Order Status</p>
          <div className="mt-2"><OrderStatusBadge status={order.status} /></div>
          <p className="mt-2 font-ui text-[11px] text-taupe">{formatOrderDate(order.createdAt)}</p>
        </div>
        <div className="border border-mist/80 bg-surface/40 p-4">
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Fulfillment</p>
          <div className="mt-2 font-ui text-xs">{order.fulfillment?.status || "PENDING"} · {order.fulfillment?.fulfillmentType || "—"}</div>
          <p className="mt-1 font-ui text-[11px] text-taupe">{order.fulfillment?.assignedEmployeeName || "Unassigned"} @ {inventory.locations.find((l) => l.id === order.fulfillment?.sourceLocationId)?.name || "—"}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Left */}
        <div className="space-y-6">
          <AdminPanel eyebrow="Customer" title={order.customer.fullName}>
            <div className="space-y-2 font-ui text-sm">
              <p className="flex items-center gap-2"><User size={12} /> {order.customer.email} · {order.customer.phone}</p>
              <p className="flex items-start gap-2"><MapPin size={12} className="mt-1" /> {order.address?.addressLine}, {order.address?.city}, {order.address?.state} - {order.address?.pincode}</p>
              {order.customerNote && <p className="mt-3 border-l-2 border-brass bg-surface/30 px-3 py-2 text-xs">Customer note: "{order.customerNote}"</p>}
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Items" title={`${order.items.length} pieces`}>
            <div className="divide-y divide-mist/60">
              {inventoryMap.map((item) => (
                <div key={item.lineId} className="flex gap-4 py-4">
                  <div className="h-16 w-16 shrink-0 bg-mist/30 overflow-hidden">
                    {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-taupe"><Package size={16} /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base">{item.name}</p>
                    <p className="font-ui text-[11px] text-taupe">{[item.color, item.size].filter(Boolean).join(" · ") || "Free Size"} · SKU {item.productId}</p>
                    <p className="mt-1 font-ui text-xs">Qty {item.quantity} × {formatINR(item.price)} = {formatINR(item.lineTotal)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="border border-mist px-2 py-0.5 font-ui text-[10px]">Ordered: {item.quantity}</span>
                      <span className="border border-mist px-2 py-0.5 font-ui text-[10px]">Reserved: {item.quantity}</span>
                      <span className="border border-mist px-2 py-0.5 font-ui text-[10px]">Available in network: {item.available}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {order.fulfillment?.picking?.[item.lineId]?.picked ? (
                      <span className="inline-flex items-center gap-1 border border-accent/30 bg-accent/5 px-2 py-1 font-ui text-[10px] text-accent"><Check size={10} /> PICKED</span>
                    ) : (
                      <span className="inline-flex border border-mist px-2 py-1 font-ui text-[10px] text-taupe">PENDING</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Pricing" title="Breakdown">
            <dl className="space-y-2 font-ui text-sm">
              <div className="flex justify-between"><dt className="text-taupe">Subtotal</dt><dd>{formatINR(order.pricing.subtotal)}</dd></div>
              {order.pricing.productDiscount > 0 && <div className="flex justify-between"><dt className="text-taupe">Product Discount</dt><dd>− {formatINR(order.pricing.productDiscount)}</dd></div>}
              {order.pricing.couponDiscount > 0 || order.pricing.couponCode ? (
                <div className="flex justify-between">
                  <dt className="text-taupe">Offer{order.pricing.couponCode ? ` · ${order.pricing.couponCode}` : ""}</dt>
                  <dd>{order.pricing.couponDiscount > 0 ? `− ${formatINR(order.pricing.couponDiscount)}` : "—"}</dd>
                </div>
              ) : null}
              <div className="flex justify-between"><dt className="text-taupe">Shipping</dt><dd>{order.pricing.shipping === 0 ? "Complimentary" : formatINR(order.pricing.shipping)}</dd></div>
              {order.pricing.codFee > 0 && <div className="flex justify-between"><dt className="text-taupe">COD Fee</dt><dd>{formatINR(order.pricing.codFee)}</dd></div>}
              <div className="flex justify-between border-t border-mist/60 pt-2 font-medium"><dt>Grand Total</dt><dd>{formatINR(order.pricing.total)}</dd></div>
            </dl>
          </AdminPanel>

          <AdminPanel eyebrow="Inventory" title="Reservation & Stock">
            <div className="space-y-3">
              <p className="font-ui text-[11px] text-taupe">Reservation ID: <span className="font-mono text-ink">{order.inventoryReservationId || "—"}</span></p>
              <div className="grid gap-2 sm:grid-cols-2">
                {inventoryMap.map((it) => (
                  <div key={it.lineId} className="border border-mist/60 bg-canvas/40 p-3">
                    <p className="font-display text-sm">{it.name}</p>
                    <p className="font-ui text-[11px] text-taupe">Location: {it.locationName} · {it.placement}</p>
                    <p className="mt-1 font-ui text-[11px]">Ordered {it.quantity} · Available {it.available} · Reserved {it.reserved}</p>
                  </div>
                ))}
              </div>
              {order.fulfillment?.status === "PENDING" && <p className="flex gap-2 font-ui text-[11px] text-accent"><AlertTriangle size={12} /> Allocation pending — assign location to move to picking.</p>}
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Shipping" title="Carrier & Tracking">
            {/* The order's own stored dispatch fields — nothing else. */}
            {order.tracking?.trackingNumber || order.tracking?.carrier || order.tracking?.dispatchedAt ? (
              <div className="font-ui text-sm space-y-1">
                <p>Carrier: <strong>{order.tracking.carrier ?? "—"}</strong></p>
                <p>Tracking: <span className="font-mono">{order.tracking.trackingNumber ?? "—"}</span></p>
                <p>Dispatched: {order.tracking.dispatchedAt ? formatEventTime(order.tracking.dispatchedAt) : "—"}</p>
                <p>Estimated Delivery: {order.tracking.estimatedDelivery ? formatOrderDate(order.tracking.estimatedDelivery) : "Not set"}</p>
                <p>Delivered: {order.tracking.deliveredAt ? formatEventTime(order.tracking.deliveredAt) : "—"}</p>
                <p className="pt-1 text-[11px] text-taupe">
                  No courier API is integrated — no live shipment scans are available.
                </p>
              </div>
            ) : (
              <p className="font-ui text-sm text-taupe">No shipment yet — dispatch after packing.</p>
            )}
          </AdminPanel>
        </div>

        {/* Right */}
        <div className="space-y-6">
          <AdminPanel eyebrow="Fulfillment" title="Operations">
            <div className="space-y-4">
              {/* Assign */}
              <div className="border border-mist/60 bg-canvas/30 p-3">
                <p className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-2">Assignment</p>
                <div className="grid gap-2">
                  <select value={assignLocation} onChange={(e) => setAssignLocation(e.target.value)} className="h-9 border border-mist bg-canvas px-2 font-ui text-xs">
                    <option value="">Select a location…</option>
                    {inventory.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name} · {loc.type}</option>)}
                  </select>
                  <select value={assignEmployee} onChange={(e) => setAssignEmployee(e.target.value)} className="h-9 border border-mist bg-canvas px-2 font-ui text-xs">
                    <option value="">Select a handler…</option>
                    {employees.map((emp) => <option key={emp.employeeId} value={emp.employeeId}>{emp.name} · {emp.employeeId}</option>)}
                  </select>
                  <button onClick={() => handleAction(assignFulfillment, { locationId: assignLocation, employeeId: assignEmployee, employeeName: employees.find((e) => e.employeeId === assignEmployee)?.name, actor: { name: "Admin" } }, "Fulfillment assigned")} className="h-9 bg-ink text-ivory font-ui text-[11px] uppercase tracking-[.12em]">Assign fulfillment</button>
                </div>
              </div>

              {/* Allocation */}
              {[ORDER_STATUS.PROCESSING, ORDER_STATUS.ORDER_CONFIRMED, ORDER_STATUS.CONFIRMED].includes(order.status) && (
                <button onClick={() => handleAction(allocateOrder, { locationId: assignLocation, employeeId: assignEmployee, employeeName: employees.find((e) => e.employeeId === assignEmployee)?.name || "Staff", actor: { name: "Admin" } }, "Allocated")} className="w-full border border-accent bg-accent text-white py-2 font-ui text-[11px] uppercase">Allocate order</button>
              )}

              {/* Picking */}
              {order.status === ORDER_STATUS.ALLOCATED && (
                <div className="space-y-2">
                  <p className="font-ui text-[11px] text-taupe">Pick items individually:</p>
                  {order.items.map((item) => (
                    <div key={item.lineId} className="flex items-center justify-between border border-mist/60 px-3 py-2">
                      <span className="font-ui text-xs">{item.name} ×{item.quantity}</span>
                      <button onClick={() => handleAction(markItemPicked, { lineId: item.lineId, actor: { name: "Warehouse" } }, "Picked")} className="text-[11px] text-accent border border-accent/30 px-2 py-1">Mark picked</button>
                    </div>
                  ))}
                </div>
              )}

              {order.status === ORDER_STATUS.PICKING && (
                <div className="space-y-2">
                  <p className="font-ui text-[11px] text-taupe">Complete picking:</p>
                  {order.items.map((item) => (
                    <div key={item.lineId} className="flex items-center justify-between border border-mist/60 px-3 py-2">
                      <span className="font-ui text-xs">{item.name}</span>
                      <span className="font-ui text-[10px]">{order.fulfillment?.picking?.[item.lineId]?.picked ? "Picked" : "Pending"}</span>
                    </div>
                  ))}
                  <button onClick={() => handleAction(markPacked, { packageCount: packCount, notes: packNotes, actor: { name: "Warehouse" } }, "Marked packed")} className="w-full bg-ink text-ivory py-2 font-ui text-[11px] uppercase">Mark as packed</button>
                  <input value={packNotes} onChange={(e) => setPackNotes(e.target.value)} placeholder="Packaging notes" className="w-full h-9 border border-mist bg-canvas px-2 font-ui text-xs" />
                </div>
              )}

              {order.status === ORDER_STATUS.PACKED && (
                <button onClick={() => handleAction(markReadyToDispatch, { actor: { name: "Warehouse" } }, "Ready to dispatch")} className="w-full border border-ink bg-ink text-ivory py-2 font-ui text-[11px] uppercase">Mark Ready to Dispatch</button>
              )}

              {order.status === ORDER_STATUS.READY_TO_DISPATCH && (
                <div className="border border-mist/60 p-3 space-y-2">
                  <p className="font-ui text-[10px] uppercase tracking-[.14em]">Dispatch</p>
                  <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs">
                    {CARRIERS.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </select>
                  {/* A tracking number is REQUIRED — one is never
                      generated on the customer's behalf. The estimated
                      delivery date is optional and only stored when the
                      dispatcher actually knows it. */}
                  <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number from the carrier" className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs" />
                  <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe" htmlFor="dispatch-eta">Estimated delivery (optional)</label>
                  <input id="dispatch-eta" type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs" />
                  <button
                    disabled={!tracking.trim()}
                    onClick={() => handleAction(dispatchOrder, {
                      carrier,
                      trackingNumber: tracking.trim(),
                      estimatedDelivery: estimatedDelivery || null,
                    }, "Dispatched")}
                    className="w-full bg-ink text-ivory py-2 font-ui text-[11px] uppercase disabled:opacity-50"
                  >
                    Dispatch order
                  </button>
                  {!tracking.trim() ? (
                    <p className="font-ui text-[10px] text-taupe">Enter the carrier&apos;s tracking number to dispatch.</p>
                  ) : null}
                </div>
              )}

              {order.status === ORDER_STATUS.SHIPPED && (
                <button onClick={() => handleAction(markOutForDelivery, { actor: { name: "Courier" } }, "Out for delivery")} className="w-full border border-ink bg-ink text-ivory py-2 font-ui text-[11px] uppercase">Mark Out for Delivery</button>
              )}

              {order.status === ORDER_STATUS.OUT_FOR_DELIVERY && (
                <button onClick={() => handleAction(markDelivered, { actor: { name: "Courier" } }, "Delivered")} className="w-full border border-ink bg-ink text-ivory py-2 font-ui text-[11px] uppercase">Mark Delivered</button>
              )}

              {/* Cancellation */}
              {![ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED, ORDER_STATUS.REFUNDED].includes(order.status) && (
                <div className="pt-4 border-t border-mist/60">
                  {!showCancel ? (
                    <button onClick={() => setShowCancel(true)} className="w-full border border-mist text-taupe py-2 font-ui text-[11px] uppercase">Cancel order</button>
                  ) : (
                    <div className="space-y-2">
                      <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs">
                        {CANCELLATION_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                      <input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} placeholder="Cancellation note" className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs" />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowCancel(false); handleAction(cancelOrderAdmin, { reason: cancelReason, note: cancelNote || "Cancelled by admin", actor: { name: "Admin" } }, "Order cancelled"); }} className="flex-1 bg-accent text-white py-2 font-ui text-[11px] uppercase">Confirm cancel</button>
                        <button onClick={() => setShowCancel(false)} className="flex-1 border border-mist py-2 font-ui text-[11px] uppercase">Abort</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Timeline" title="Order history">
            {/* Persisted status-history rows only — real transitions with
                the timestamps the backend recorded. */}
            {order.statusHistory.length > 0 ? (
              <OrderTimeline
                showLocation={false}
                events={order.statusHistory.map((h) => ({
                  id: h.id,
                  status: h.status,
                  title: h.label ?? h.status.replace(/_/g, " "),
                  description: h.note ?? h.description,
                  timestamp: h.at,
                  state: "done",
                }))}
              />
            ) : (
              <p className="font-ui text-sm text-taupe">No transitions have been recorded for this order yet.</p>
            )}
          </AdminPanel>

          <AdminPanel eyebrow="Notes" title="Internal communication">
            <div className="space-y-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(order.internalNotes || []).map((n, i) => (
                  <div key={i} className="border-l-2 border-brass bg-surface/30 px-3 py-2">
                    {/* Backend note shape: { id, authorId, authorName, note, createdAt } */}
                    <p className="font-ui text-xs">{n.note ?? n.text}</p>
                    <p className="font-ui text-[10px] text-taupe mt-1">
                      {n.authorName ?? n.by ?? "Staff"} · {formatEventTime(n.createdAt ?? n.at)}
                    </p>
                  </div>
                ))}
                {!(order.internalNotes?.length) && <p className="font-ui text-xs text-taupe">No internal notes.</p>}
              </div>
              <div className="flex gap-2">
                <input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Add internal note" className="flex-1 h-9 border border-mist bg-canvas px-2 font-ui text-xs" />
                <button onClick={() => { if (!internalNote.trim()) return; handleAction(addInternalNote, { text: internalNote, actor: { name: "Admin" } }, "Note added"); setInternalNote(""); }} className="px-3 bg-ink text-ivory font-ui text-[11px] uppercase">Add</button>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Payment" title="Transaction">
            <div className="font-ui text-sm space-y-1">
              <p>Method: {order.paymentMethod.label}</p>
              <p>Status: {order.paymentStatus}</p>
              <p>Paid: {formatINR(order.pricing.total)}</p>
              {order.refund && <p className="text-accent">Refund: {formatINR(order.refund.amount)} · {order.refund.status}</p>}
            </div>
          </AdminPanel>
        </div>
      </div>
    </AdminPage>
  );
}
