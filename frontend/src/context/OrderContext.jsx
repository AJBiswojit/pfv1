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
import { getTracking as buildTracking } from "../services/orders/trackingService";
import {
  advanceReturnRecord,
  approveReturnRecord,
  completeRefundRecord,
  createReturnRecord,
  initiateRefundRecord,
  inspectReturnRecord,
  receiveReturnRecord,
  rejectReturnRecord,
  schedulePickupRecord,
} from "../services/orders/returnService";
import { latestReturn } from "../utils/orders";
import inventoryRepository from "../services/inventory/inventoryRepository";
import { getAccessToken } from "../services/api/apiClient";
import {
  apiListOrders,
  apiGetOrder,
  apiPlaceOrder,
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

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useEffect(() => { orderService.saveOrders(orders); },         [orders]);
  useEffect(() => { orderService.saveCurrentOrderId(currentOrderId); }, [currentOrderId]);

  // Fetch orders from backend when user authenticates
  useEffect(() => {
    if (!user?.id || !getAccessToken()) return;
    setIsLoadingOrders(true);
    apiListOrders({ pageSize: 100 }).then((result) => {
      setIsLoadingOrders(false);
      if (result.ok && result.orders?.length) {
        // Merge server orders into local state (server wins for same ID)
        setOrders((local) => {
          const merged = new Map(local.map((o) => [o.id, o]));
          result.orders.forEach((o) => merged.set(o.id, o));
          return [...merged.values()].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      }
    });
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
    if (user?.id && getAccessToken()) {
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

  const getTracking = useCallback((orderId) => {
    const order = orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
    return order ? buildTracking(order, { customerView: true }) : null;
  }, [customerId]);

  const getTrackingAdmin = useCallback((orderId) => {
    const order = orderService.findOrder(ordersRef.current, orderId);
    return order ? buildTracking(order, { customerView: false }) : null;
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
    // If authenticated, place via backend
    if (user?.id && getAccessToken()) {
      const result = await apiPlaceOrder(snapshot);
      if (result.ok && result.order) {
        setOrders((current) => [result.order, ...current]);
        setCurrentOrderId(result.order.id);
        return { ok: true, order: result.order, message: "Order placed." };
      }
      return { ok: false, order: null, message: result.error ?? "Order could not be placed." };
    }

    // Offline demo
    const result = orderService.addOrder(ordersRef.current, snapshot);
    if (!result.ok || !result.order) return { ok: false, order: null, message: result.message || "" };
    ordersRef.current = result.orders;
    setOrders(result.orders);
    orderService.saveOrders(result.orders);
    setCurrentOrderId(result.order.id);
    return { ok: true, order: result.order, message: result.message };
  }, [user?.id]);

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
    if (user?.id && getAccessToken()) {
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

  const createReturn = useCallback(async ({ orderId, lineIds, reason, resolution, note }) => {
    if (user?.id && getAccessToken()) {
      const result = await apiCreateReturnCall(orderId, {
        items: lineIds?.map((lineId) => ({ lineId, quantity: 1, reason })) ?? [],
        pickupMethod: resolution || "HOME_PICKUP",
      });
      if (result.ok) {
        // Refresh the order
        const orderResult = await apiGetOrder(orderId);
        if (orderResult.ok) {
          setOrders((current) => current.map((o) => o.id === orderId ? orderResult.order : o));
        }
        return { ok: true, record: result.return_order, errors: {}, message: "Return request created." };
      }
      return { ok: false, errors: {}, message: result.error };
    }

    const order = orderService.findOwnedOrder(ordersRef.current, orderId, customerId);
    if (!order) return { ok: false, errors: {}, message: "Order not found." };
    const built = createReturnRecord({ order, lineIds, reason, resolution, note });
    if (!built.ok) return built;
    const attached = orderService.attachReturn(ordersRef.current, orderId, built.record, built.orderStatus);
    if (!attached.ok) return { ok: false, errors: {}, message: "Return could not be created." };
    applyResult(attached);
    return { ok: true, record: built.record, errors: {}, message: built.message };
  }, [user?.id, customerId, applyResult]);

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

  const claimGuestOrders = useCallback((id = customerId) => {
    if (!id) return { ok: false, claimed: 0 };
    const result = orderService.claimGuestOrders(ordersRef.current, id);
    if (result.claimed === 0) return { ok: false, claimed: 0 };
    ordersRef.current = result.orders;
    setOrders(result.orders);
    return { ok: true, claimed: result.claimed };
  }, [customerId]);

  // ---------------------------------------------------------------------------
  // Admin/employee writes — proxy to backend + local fallback
  // ---------------------------------------------------------------------------

  const adminPost = useCallback((apiFn, localFn) => async (orderId, payload) => {
    if (getAccessToken()) {
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
    if (getAccessToken()) {
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
    if (getAccessToken()) {
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
    if (getAccessToken()) {
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
    if (getAccessToken()) {
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
    if (getAccessToken()) {
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
    if (getAccessToken()) {
      const result = await apiAdminApplyStatus(orderId, nextStatus, opts.note);
      if (result.ok) {
        setOrders((current) => current.map((o) => o.id === result.order.id ? result.order : o));
        return result;
      }
      return { ok: false, message: result.error };
    }
    return applyResult(orderService.applyStatus(ordersRef.current, orderId, nextStatus, opts.at, opts.actor));
  }, [applyResult]);

  // Return mutations (local-only until return backend endpoints expose individual operations)
  const applyReturnMutation = useCallback((returnId, mutationFn, options = {}) => {
    let foundOrder = null, foundRecord = null;
    for (const order of ordersRef.current) {
      const record = (order.returns || []).find((e) => e.id === returnId);
      if (record) { foundOrder = order; foundRecord = record; break; }
    }
    if (!foundRecord) return { ok: false, message: "Return not found." };
    const result = mutationFn(foundRecord, options);
    if (!result.ok) return result;
    const updated = orderService.updateReturn(ordersRef.current, foundOrder.id, result.record);
    if (!updated.ok) return { ok: false, message: "Return could not be updated." };
    applyResult(updated);
    return { ok: true, record: result.record, message: result.message };
  }, [applyResult]);

  const approveReturn       = useCallback((id, opts) => applyReturnMutation(id, approveReturnRecord, opts),       [applyReturnMutation]);
  const rejectReturn        = useCallback((id, opts) => applyReturnMutation(id, rejectReturnRecord, opts),        [applyReturnMutation]);
  const scheduleReturnPickup = useCallback((id, opts) => applyReturnMutation(id, schedulePickupRecord, opts),     [applyReturnMutation]);
  const receiveReturn       = useCallback((id, opts) => applyReturnMutation(id, receiveReturnRecord, opts),       [applyReturnMutation]);
  const inspectReturn       = useCallback((id, opts) => applyReturnMutation(id, inspectReturnRecord, opts),       [applyReturnMutation]);
  const initiateReturnRefund = useCallback((id, opts) => applyReturnMutation(id, initiateRefundRecord, opts),    [applyReturnMutation]);
  const completeReturnRefund = useCallback((id, opts) => applyReturnMutation(id, completeRefundRecord, opts),    [applyReturnMutation]);

  // ---------------------------------------------------------------------------

  const value = useMemo(() => ({
    orders: customerOrders, allOrders: orders, currentOrder, guestOrderCount, isLoadingOrders,
    getOrders, getAllOrders, getOrderById, getOrderByIdAdmin, getCustomerOrders,
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
    customerOrders, orders, currentOrder, guestOrderCount, isLoadingOrders,
    getOrders, getAllOrders, getOrderById, getOrderByIdAdmin, getCustomerOrders,
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
  orders: [], allOrders: [], currentOrder: null, guestOrderCount: 0, isLoadingOrders: false,
  getOrders: () => [], getAllOrders: () => [], getOrderById: () => null, getOrderByIdAdmin: () => null,
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
