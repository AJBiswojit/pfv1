/**
 * PRATIKSHYA FASHON — Order state (Phase B wired)
 *
 * When authenticated:
 *   - POST   /orders               — createOrder / placeOrder
 *   - GET    /orders               — load customer orders on mount
 *   - GET    /orders/{id}          — getOrderById
 *   - POST   /orders/{id}/cancel   — cancelOrder
 *   - POST   /orders/{id}/returns  — createReturn
 *   - Admin mutations pass through to /admin/orders/* endpoints
 *
 * Falls back to localStorage (demo orders) when not authenticated or when
 * backend is unreachable.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { ORDER_STATUS, RETURN_STATUS, nextJourneyStatus } from "../config/orderConfig";
import * as orderService from "../services/orders/orderService";
import { buildTrackingView } from "../services/orders/trackingService";
import { advanceReturnRecord } from "../services/orders/returnService";
import { latestReturn } from "../utils/orders";
import inventoryRepository from "../services/inventory/inventoryRepository";
import { getAccessToken } from "../services/api/apiClient";
import {
  apiListOrders,
  apiGetOrder,
  apiGetTracking,
  apiPlaceOrder,
  apiClaimGuestOrders,
  apiCancelOrder as apiCancelOrderCall,
  apiCreateReturn as apiCreateReturnCall,
  apiAdminListOrders,
  apiAdminGetOrder,
  apiAdminAllocateOrder,
  apiAdminAssignFulfillment,
  apiAdminStartPicking,
  apiAdminPickItem,
  apiAdminMarkPacked,
  apiAdminMarkReady,
  apiAdminDispatchOrder,
  apiAdminMarkOutForDelivery,
  apiAdminMarkDelivered,
  apiAdminCancelOrder,
  apiAdminAddNote,
  apiAdminApplyStatus,
  apiAdminForceStatus,
  apiAdminApproveReturn,
  apiAdminRejectReturn,
  apiAdminSchedulePickup,
  apiAdminReceiveReturn,
  apiAdminInspectReturn,
  apiAdminInitiateRefund,
  apiAdminCompleteRefund,
} from "../services/api/ordersApi";

export const ORDERS_STORAGE_KEY = orderService.ORDERS_STORAGE_KEY;
export const CURRENT_ORDER_KEY  = orderService.CURRENT_ORDER_KEY;

const OrderContext = createContext(null);

export function OrderProvider({ children }) {
  const { user } = useAuth();
  const customerId = user?.id ?? null;

  const [orders,         setOrders]         = useState(() => orderService.loadOrders());
  const [currentOrderId, setCurrentOrderId] = useState(() => orderService.loadCurrentOrderId());
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  // `ordersError` carries the HTTP status alongside the message so the
  // list screen can render 401 / 403 / 5xx distinctly instead of showing
  // an empty "no orders yet" state for a failed request.
  const [ordersError, setOrdersError] = useState(null);
  const [ordersErrorStatus, setOrdersErrorStatus] = useState(null);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useEffect(() => { orderService.saveOrders(orders); },         [orders]);
  useEffect(() => { orderService.saveCurrentOrderId(currentOrderId); }, [currentOrderId]);

  // Fetch orders from backend when user authenticates. The server is
  // authoritative; the previous local mirror is only replaced by server data.
  useEffect(() => {
    if (!user?.id || !getAccessToken("customer")) {
      setOrdersError(null);
      setOrdersErrorStatus(null);
      return;
    }
    let cancelled = false;
    setIsLoadingOrders(true);
    apiListOrders({ pageSize: 100 }).then((result) => {
      if (cancelled) return;
      setIsLoadingOrders(false);
      if (result.ok) {
        setOrders(result.orders ?? []);
        setOrdersError(null);
        setOrdersErrorStatus(null);
      } else {
        setOrdersError(result.error ?? "Could not load your orders.");
        setOrdersErrorStatus(result.status ?? 500);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  const customerOrders = useMemo(
    () => orderService.ordersForCustomer(orders, customerId),
    [orders, customerId]
  );

  const guestOrderCount = useMemo(
    () => (customerId ? orders.filter((o) => !o.customerId).length : 0),
    [orders, customerId]
  );

  const getOrders    = useCallback(() => ordersRef.current, []);
  const getAllOrders  = useCallback(() => ordersRef.current, []);

  const getOrderById = useCallback(async (orderId) => {
    // Try backend first when authenticated
    if (user?.id && getAccessToken("customer")) {
      const result = await apiGetOrder(orderId);
      if (result.ok) {
        // Update local store
        setOrders((current) => {
          const exists = current.find((o) => o.id === result.order.id);
          if (exists) return current.map((o) => o.id === result.order.id ? result.order : o);
          return [result.order, ...current];
        });
        return result.order;
      }
    }
    return orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
  }, [user?.id, customerId]);

  /**
   * Fetch one order with its full result envelope.
   *
   * PHASE 3: order screens need to distinguish "still loading", "not
   * yours / not found", "session expired" and "our side failed". The
   * legacy `getOrderById` collapses every failure into `null`, which the
   * pages then render as "order not found" — including for a 500. This
   * accessor returns the status so the caller can render the right state.
   *
   * Ownership is enforced by the backend: `GET /orders/{id}` 403s when
   * the order belongs to another customer, and the UI shows the same copy
   * for 403 and 404 so ids cannot be probed.
   *
   * @returns {Promise<{ok: boolean, order: object|null, status: number|null, error?: string}>}
   */
  const fetchOrder = useCallback(async (orderId) => {
    if (!orderId) return { ok: false, order: null, status: 404 };
    const result = await apiGetOrder(orderId);
    if (result.ok) {
      setOrders((current) => {
        const exists = current.some((o) => o.id === result.order.id);
        return exists
          ? current.map((o) => (o.id === result.order.id ? result.order : o))
          : [result.order, ...current];
      });
      return { ok: true, order: result.order, status: 200 };
    }
    return { ok: false, order: null, status: result.status ?? 500, error: result.error };
  }, []);

  /**
   * Reload the signed-in customer's order list from the server.
   * Returns the envelope so the list screen can tell an empty history
   * from a failed request.
   */
  const refreshOrders = useCallback(async () => {
    if (!getAccessToken("customer")) {
      return { ok: false, orders: [], status: 401, error: "Please sign in to see your orders." };
    }
    setIsLoadingOrders(true);
    const result = await apiListOrders({ pageSize: 100 });
    setIsLoadingOrders(false);
    if (result.ok) {
      setOrders(result.orders ?? []);
      setOrdersError(null);
      setOrdersErrorStatus(null);
      return { ok: true, orders: result.orders ?? [], total: result.total, status: 200 };
    }
    setOrdersError(result.error ?? "Could not load your orders.");
    setOrdersErrorStatus(result.status ?? 500);
    return { ok: false, orders: [], status: result.status ?? 500, error: result.error };
  }, []);

  /**
   * Load the ADMIN order list from the backend into `allOrders`.
   *
   * PHASE 3: `allOrders` previously only ever contained the signed-in
   * customer's own orders (or nothing at all in an admin-only session),
   * so every admin screen reading it — the orders desk, the returns desk,
   * analytics — silently showed an empty dataset. `apiAdminListOrders`
   * was imported but never called. Admin screens now call this on mount.
   *
   * Authorization is the backend's: the admin token scope decides what is
   * returned. Nothing about admin visibility is decided in the browser.
   *
   * @returns {Promise<{ok, orders, total, status, error?}>}
   */
  const refreshAdminOrders = useCallback(async (params = {}) => {
    if (!getAccessToken("admin")) {
      return { ok: false, orders: [], status: 401, error: "Please sign in to the admin desk." };
    }
    setIsLoadingOrders(true);
    const result = await apiAdminListOrders({ pageSize: 100, ...params });
    setIsLoadingOrders(false);
    if (result.ok) {
      setOrders(result.orders ?? []);
      setOrdersError(null);
      setOrdersErrorStatus(null);
      return { ok: true, orders: result.orders ?? [], total: result.total, status: 200 };
    }
    setOrdersError(result.error ?? "Could not load orders.");
    setOrdersErrorStatus(result.status ?? 500);
    return { ok: false, orders: [], status: result.status ?? 500, error: result.error };
  }, []);

  const getOrderByIdAdmin = useCallback(
    (orderId) => orderService.findOrder(ordersRef.current, orderId),
    []
  );

  const getCustomerOrders = useCallback(
    (id = customerId) => orderService.ordersForCustomer(ordersRef.current, id),
    [customerId]
  );

  const currentOrder = useMemo(
    () => (currentOrderId ? orderService.findOrder(orders, currentOrderId) : null),
    [orders, currentOrderId]
  );

  /**
   * Tracking for one of the caller's own orders.
   *
   * PHASE 3: this now calls `GET /orders/{id}/tracking` instead of
   * building a timeline locally. The backend returns persisted
   * status-history events plus whatever carrier / tracking number an
   * admin recorded; `buildTrackingView` only projects those onto the
   * journey for display. Nothing is invented, and failures are returned
   * with their HTTP status so the page can distinguish 401 / 403 / 404
   * from an order that simply has no events yet.
   *
   * @returns {Promise<{ok: boolean, tracking?: object, error?: string, status?: number}>}
   */
  const getTracking = useCallback(async (orderId) => {
    const result = await apiGetTracking(orderId);
    if (!result.ok) {
      return { ok: false, tracking: null, error: result.error, status: result.status };
    }
    return {
      ok: true,
      tracking: buildTrackingView(result.tracking, { customerView: true }),
      status: 200,
    };
  }, []);

  /**
   * Admin view of the same real tracking record. The admin order-read
   * endpoint carries the identical stored fields, so the admin journey is
   * projected from the order the admin already loaded — still no
   * fabricated courier scans.
   */
  const getTrackingAdmin = useCallback(async (orderId) => {
    const result = await apiAdminGetOrder(orderId);
    if (!result.ok) {
      return { ok: false, tracking: null, error: result.error, status: result.status };
    }
    const order = result.order;
    const tracking = buildTrackingView(
      {
        orderId: order.id,
        orderStatus: order.status,
        paymentStatus: order.paymentStatus,
        carrier: order.tracking?.carrier ?? null,
        trackingNumber: order.tracking?.trackingNumber ?? null,
        estimatedDelivery: order.tracking?.estimatedDelivery ?? null,
        dispatchedAt: order.tracking?.dispatchedAt ?? null,
        deliveredAt: order.tracking?.deliveredAt ?? null,
        cancelledAt: order.cancellation?.at ?? null,
        carrierTrackingAvailable: Boolean(
          order.tracking?.carrier && order.tracking?.trackingNumber
        ),
        carrierEventsAvailable: false,
        events: (order.statusHistory ?? []).map((entry) => ({
          status: entry.status,
          at: entry.at,
          description: entry.note ?? entry.description ?? null,
          actorName: entry.actorName ?? null,
          source: "STATUS_HISTORY",
        })),
      },
      { customerView: false }
    );
    return { ok: true, tracking, status: 200 };
  }, []);

  const getReturn = useCallback((orderId, returnId = null) => {
    const order = orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
    if (!order) return null;
    if (returnId) return order.returns.find((r) => r.id === returnId) ?? null;
    return latestReturn(order);
  }, [customerId]);

  // ---------------------------------------------------------------------------
  // Local state helper
  // ---------------------------------------------------------------------------

  const applyResult = useCallback((result) => {
    if (!result?.ok) return result;
    ordersRef.current = result.orders;
    setOrders(result.orders);
    return result;
  }, []);

  // ---------------------------------------------------------------------------
  // Customer writes
  // ---------------------------------------------------------------------------

  const createOrder = useCallback(async (snapshot) => {
    // Canonical (Phase 2): the backend is always the order authority —
    // signed-in customers place their own orders, guests place claimable
    // guest orders. No local/demo order is ever created from checkout.
    const result = await apiPlaceOrder(snapshot);
    if (result.ok && result.order) {
      setOrders((current) => [result.order, ...current]);
      setCurrentOrderId(result.order.id);
      return { ok: true, order: result.order, message: "Order placed." };
    }
    return { ok: false, order: null, message: result.error ?? "Order could not be placed." };
  }, []);

  const clearCurrentOrder = useCallback(() => setCurrentOrderId(null), []);

  const updateMockOrderStatus = useCallback((orderId, nextStatus = null) => {
    const order = orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
    if (!order) return { ok: false, message: "Order not found." };
    const target = nextStatus ?? nextJourneyStatus(order.status);
    if (!target) return { ok: false, message: "This order has completed its journey." };
    const result = orderService.applyStatus(ordersRef.current, orderId, target);
    if (!result.ok) return { ok: false, message: result.message };
    return applyResult(result);
  }, [customerId, applyResult]);

  const cancelOrder = useCallback(async (orderId, options = {}) => {
    if (user?.id && getAccessToken("customer")) {
      const result = await apiCancelOrderCall(orderId, { reason: options.reason, note: options.note });
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }

    const order = orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
    if (!order) return { ok: false, message: "Order not found." };
    const result = orderService.cancelOrder(ordersRef.current, orderId, {
      reason: options.reason || "customer_request",
      note:   options.note   || "Cancelled by the customer.",
      actor:  options.actor  || { name: order.customer?.fullName || "Customer" },
    });
    if (!result.ok) return { ok: false, message: result.message || "This order can no longer be cancelled." };
    if (result.order.inventoryReservationId) {
      inventoryRepository.restockCancelledOrder(result.order, { label: result.order.customer?.fullName || "Customer" });
    }
    return applyResult(result);
  }, [user?.id, customerId, applyResult]);

  /**
   * Create a return against one of the caller's own orders.
   *
   * PHASE 3: this is now always a server call. The previous local branch
   * built a return record in the browser when no session token was
   * present, which produced a "return" the atelier never received. A
   * return is a real business record — only the backend may create one,
   * and it re-checks ownership, DELIVERED status, the return window and
   * per-line returnable quantities.
   *
   * @param {object}  args
   * @param {string}  args.orderId
   * @param {Array}   args.items  [{ lineId, quantity, reason }]
   * @param {string}  args.pickupMethod  SCHEDULED_PICKUP | CUSTOMER_DROP_OFF
   */
  const createReturn = useCallback(async ({ orderId, items = [], pickupMethod }) => {
    const result = await apiCreateReturnCall(orderId, {
      items: items.map((item) => ({
        lineId: item.lineId,
        quantity: item.quantity ?? 1,
        reason: item.reason,
      })),
      pickupMethod: pickupMethod || "SCHEDULED_PICKUP",
    });

    if (!result.ok) {
      // The server's own reason is preserved (422 carries the real rule
      // violation, 403 an ownership failure) — never flattened.
      return { ok: false, record: null, status: result.status, message: result.error };
    }

    // Re-read the order so its `returns[]` and per-line returned
    // quantities reflect the server record rather than a local guess.
    const orderResult = await apiGetOrder(orderId);
    if (orderResult.ok) {
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? orderResult.order : o))
      );
    }

    return {
      ok: true,
      record: result.return_order,
      status: 200,
      message: "Return request created.",
    };
  }, []);

  const updateMockReturnStatus = useCallback((orderId, returnId, nextStatus) => {
    const order  = orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
    const record = order?.returns.find((e) => e.id === returnId) ?? null;
    if (!record) return { ok: false, message: "Return not found." };
    const advanced = advanceReturnRecord(record, nextStatus);
    if (!advanced.ok) return { ok: false, message: advanced.message };
    const updated = orderService.updateReturn(ordersRef.current, orderId, advanced.record);
    if (!updated.ok) return { ok: false, message: "Return could not be updated." };
    applyResult(updated);
    if (nextStatus === RETURN_STATUS.RECEIVED || nextStatus === "RECEIVED") {
      inventoryRepository.recordOrderReturn(advanced.record);
    }
    return { ok: true, record: advanced.record, message: "" };
  }, [customerId, applyResult]);

  const claimGuestOrders = useCallback(async (id = customerId) => {
    if (!id) return { ok: false, claimed: 0 };
    // Server-authoritative (Phase 2): the backend derives the claim
    // identity from the authenticated account's own email — no client
    // email is sent, so one caller can never claim another person's
    // guest orders.
    const result = await apiClaimGuestOrders();
    if (!result.ok) return { ok: false, claimed: 0, error: result.error };
    // Refresh the server order list so claimed orders appear in history.
    const list = await apiListOrders({ pageSize: 100 });
    if (list.ok) {
      setOrders(list.orders ?? []);
    }
    return { ok: true, claimed: result.claimed };
  }, [customerId]);

  // ---------------------------------------------------------------------------
  // Admin/employee writes — proxy to backend + local fallback
  // ---------------------------------------------------------------------------

  const adminPost = useCallback((apiFn, localFn) => async (orderId, payload) => {
    if (getAccessToken("admin")) {
      const result = await apiFn(orderId, payload);
      if (result.ok && result.order) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return localFn ? applyResult(localFn(ordersRef.current, orderId, payload)) : { ok: false, message: "Not authenticated." };
  }, [applyResult]);

  const allocateOrder     = adminPost(apiAdminAllocateOrder,     (orders, id, p) => orderService.allocateOrder(orders, id, p));
  const assignFulfillment = adminPost(apiAdminAssignFulfillment, (orders, id, p) => orderService.assignFulfillment(orders, id, p));
  const startPicking      = adminPost(apiAdminStartPicking,      (orders, id, p) => orderService.startPicking(orders, id, p));
  const markPacked        = adminPost(apiAdminMarkPacked,        (orders, id, p) => orderService.markPacked(orders, id, p));
  const markReadyToDispatch = adminPost(apiAdminMarkReady,       (orders, id, p) => orderService.markReadyToDispatch(orders, id, p));
  const markOutForDelivery  = adminPost(apiAdminMarkOutForDelivery, (orders, id, p) => orderService.markOutForDelivery(orders, id, p));
  const markDelivered       = adminPost(apiAdminMarkDelivered,   (orders, id, p) => orderService.markDelivered(orders, id, p));

  const markItemPicked = useCallback(async (orderId, lineId, opts = {}) => {
    if (getAccessToken("admin")) {
      const result = await apiAdminPickItem(orderId, lineId);
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.markItemPicked(ordersRef.current, orderId, lineId, opts));
  }, [applyResult]);

  const dispatchOrder = useCallback(async (orderId, payload) => {
    if (getAccessToken("admin")) {
      const result = await apiAdminDispatchOrder(orderId, payload);
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.dispatchOrder(ordersRef.current, orderId, payload));
  }, [applyResult]);

  const addInternalNote = useCallback(async (orderId, payload) => {
    if (getAccessToken("admin")) {
      const result = await apiAdminAddNote(orderId, payload.text ?? payload.note);
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.addInternalNote(ordersRef.current, orderId, payload));
  }, [applyResult]);

  const cancelOrderAdmin = useCallback(async (orderId, opts = {}) => {
    if (getAccessToken("admin")) {
      const result = await apiAdminCancelOrder(orderId, opts);
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.cancelOrder(ordersRef.current, orderId, opts));
  }, [applyResult]);

  const forceTransition = useCallback(async (orderId, nextStatus, opts = {}) => {
    if (getAccessToken("admin")) {
      const result = await apiAdminForceStatus(orderId, nextStatus, opts.reason || "Admin override");
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.forceTransition(ordersRef.current, orderId, nextStatus, opts));
  }, [applyResult]);

  const applyStatusAdmin = useCallback(async (orderId, nextStatus, opts = {}) => {
    if (getAccessToken("admin")) {
      const result = await apiAdminApplyStatus(orderId, nextStatus, opts.note);
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.applyStatus(ordersRef.current, orderId, nextStatus, opts.at, opts.actor));
  }, [applyResult]);

  /**
   * Admin returns desk.
   *
   * PHASE 3: these were local-only mutations that rewrote the return
   * record in browser state — an "approved" return was never approved
   * anywhere, and the change vanished on reload. Every one of them now
   * calls the real `/admin/returns/{id}/…` endpoint that already existed
   * in the API layer but was never wired up.
   *
   * After a successful mutation the admin order list is re-read so the
   * desk reflects the server's record, not an optimistic guess.
   */
  const applyReturnMutation = useCallback(async (apiFn, returnId, options = {}) => {
    if (!getAccessToken("admin")) {
      return { ok: false, status: 401, message: "Please sign in to the admin desk." };
    }
    const result = await apiFn(returnId, options);
    if (!result.ok) {
      return { ok: false, status: result.status, message: result.error };
    }
    await refreshAdminOrders();
    return { ok: true, record: result.return_order, status: 200, message: "" };
  }, [refreshAdminOrders]);

  const approveReturn = useCallback(
    (id, opts) => applyReturnMutation(apiAdminApproveReturn, id, opts), [applyReturnMutation]);
  const rejectReturn = useCallback(
    (id, opts = {}) => applyReturnMutation(apiAdminRejectReturn, id, {
      reason: opts.reason,
      customerMessage: opts.customerMessage ?? opts.note,
    }), [applyReturnMutation]);
  const scheduleReturnPickup = useCallback(
    (id, opts = {}) => applyReturnMutation(apiAdminSchedulePickup, id, {
      scheduledAt: opts.scheduledAt ?? opts.date,
      pickupAddress: opts.pickupAddress ?? null,
    }), [applyReturnMutation]);
  const receiveReturn = useCallback(
    (id, opts = {}) => applyReturnMutation(apiAdminReceiveReturn, id, {
      packageCondition: opts.packageCondition ?? opts.condition,
      notes: opts.notes ?? opts.note,
    }), [applyReturnMutation]);
  const inspectReturn = useCallback(
    (id, opts = {}) => applyReturnMutation(apiAdminInspectReturn, id, {
      inspectionCondition: opts.inspectionCondition ?? opts.condition,
      notes: opts.notes ?? opts.note,
    }), [applyReturnMutation]);
  const initiateReturnRefund = useCallback(
    (id, opts) => applyReturnMutation(apiAdminInitiateRefund, id, opts), [applyReturnMutation]);
  const completeReturnRefund = useCallback(
    (id, opts) => applyReturnMutation(apiAdminCompleteRefund, id, opts), [applyReturnMutation]);

  // ---------------------------------------------------------------------------

  const value = useMemo(() => ({
    orders: customerOrders, allOrders: orders, currentOrder, guestOrderCount, isLoadingOrders, ordersError, ordersErrorStatus,
    getOrders, getAllOrders, getOrderById, fetchOrder, refreshOrders, refreshAdminOrders, getOrderByIdAdmin, getCustomerOrders,
    getTracking, getTrackingAdmin, getReturn,
    createOrder, placeOrder: createOrder, clearCurrentOrder,
    updateMockOrderStatus, updateMockReturnStatus, cancelOrder, createReturn, claimGuestOrders,
    ordersForCustomer: getCustomerOrders,
    allocateOrder, assignFulfillment, startPicking, markItemPicked, markPacked,
    markReadyToDispatch, dispatchOrder, markOutForDelivery, markDelivered,
    addInternalNote, cancelOrderAdmin, forceTransition, applyStatusAdmin,
    approveReturn, rejectReturn, scheduleReturnPickup, receiveReturn, inspectReturn,
    initiateReturnRefund, completeReturnRefund,
  }), [
    customerOrders, orders, currentOrder, guestOrderCount, isLoadingOrders, ordersError, ordersErrorStatus,
    getOrders, getAllOrders, getOrderById, fetchOrder, refreshOrders, refreshAdminOrders, getOrderByIdAdmin, getCustomerOrders,
    getTracking, getTrackingAdmin, getReturn,
    createOrder, clearCurrentOrder, updateMockOrderStatus, updateMockReturnStatus,
    cancelOrder, createReturn, claimGuestOrders, getCustomerOrders,
    allocateOrder, assignFulfillment, startPicking, markItemPicked, markPacked,
    markReadyToDispatch, dispatchOrder, markOutForDelivery, markDelivered,
    addInternalNote, cancelOrderAdmin, forceTransition, applyStatusAdmin,
    approveReturn, rejectReturn, scheduleReturnPickup, receiveReturn, inspectReturn,
    initiateReturnRefund, completeReturnRefund,
  ]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

const inertOrders = {
  orders: [], allOrders: [], currentOrder: null, guestOrderCount: 0, isLoadingOrders: false, ordersError: null, ordersErrorStatus: null,
  getOrders: () => [], getAllOrders: () => [], getOrderById: () => null,
  fetchOrder: async () => ({ ok: false, order: null, status: 401 }),
  refreshOrders: async () => ({ ok: false, orders: [], status: 401 }),
  refreshAdminOrders: async () => ({ ok: false, orders: [], status: 401 }),
  getOrderByIdAdmin: () => null,
  getCustomerOrders: () => [], getTracking: () => null, getTrackingAdmin: () => null, getReturn: () => null,
  createOrder: () => ({ ok: false, order: null, message: "" }), placeOrder: () => ({ ok: false, order: null, message: "" }),
  clearCurrentOrder: () => {}, updateMockOrderStatus: () => ({ ok: false, message: "" }),
  updateMockReturnStatus: () => ({ ok: false, message: "" }), cancelOrder: () => ({ ok: false, message: "" }),
  createReturn: () => ({ ok: false, errors: {}, message: "" }), claimGuestOrders: () => ({ ok: false, claimed: 0 }),
  ordersForCustomer: () => [],
  allocateOrder: () => ({ ok: false }), assignFulfillment: () => ({ ok: false }), startPicking: () => ({ ok: false }),
  markItemPicked: () => ({ ok: false }), markPacked: () => ({ ok: false }), markReadyToDispatch: () => ({ ok: false }),
  dispatchOrder: () => ({ ok: false }), markOutForDelivery: () => ({ ok: false }), markDelivered: () => ({ ok: false }),
  addInternalNote: () => ({ ok: false }), cancelOrderAdmin: () => ({ ok: false }), forceTransition: () => ({ ok: false }),
  applyStatusAdmin: () => ({ ok: false }), approveReturn: () => ({ ok: false }), rejectReturn: () => ({ ok: false }),
  scheduleReturnPickup: () => ({ ok: false }), receiveReturn: () => ({ ok: false }), inspectReturn: () => ({ ok: false }),
  initiateReturnRefund: () => ({ ok: false }), completeReturnRefund: () => ({ ok: false }),
};

export function useOrder() { return useContext(OrderContext) ?? inertOrders; }
export { ORDER_STATUS };
export default OrderContext;
