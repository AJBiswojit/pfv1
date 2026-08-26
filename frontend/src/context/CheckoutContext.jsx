/**
 * PRATIKSHYA FASHON — Checkout session state (Phase 2 — canonical flow).
 *
 * The single checkout session: customer, delivery address, delivery
 * method, payment method, current step and the in-flight payment. It
 * composes the existing foundations rather than duplicating them:
 *
 *   AuthContext      → identity (prefill source)
 *   AccountContext   → saved addresses (source of truth for the address book)
 *   CartContext      → cart + coupon + pricing engine
 *   OrderContext     → order placement (calls /orders backend, guest or signed-in)
 *   paymentsApi      → real Razorpay session (POST /payments/session)
 *
 * Canonical lifecycle (Phase 2):
 *   COD    → POST /orders confirms the order (payment PENDING until
 *            delivery). No payment session, no Razorpay modal.
 *   Online → POST /orders creates a PENDING_PAYMENT order →
 *            POST /payments/session against that order (amount is the
 *            order's server-computed total) → Razorpay modal →
 *            POST /payments/verify (server-side HMAC) → confirmed.
 *
 * Idempotency: a per-attempt `attemptId` is generated client-side and
 * sent as `idempotencyKey`; the backend enforces it through the unique
 * order_number (safe retries return the same order). The attempt id
 * rotates whenever the order payload can change (bag review, customer,
 * address, delivery or payment method).
 *
 * Pricing is always derived live from the Phase 6 engine for display —
 * the authoritative amounts are computed by the backend. Only safe
 * checkout fields are persisted: never card numbers, CVV or any payment
 * credential.
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
import { useAccount } from "./AccountContext";
import { useCart } from "./CartContext";
import { useOrder } from "./OrderContext";
import {
  CHECKOUT_STEPS,
  PAYMENT_METHODS,
  getDeliveryMethod,
} from "../config/checkoutConfig";

/** Payment lifecycle states (client mirror of the backend session states). */
const PAYMENT_STATUS = {
  IDLE: "IDLE",
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  CANCELLED: "CANCELLED",
};
import {
  apiCreatePaymentSession,
  apiVerifyPayment,
  apiCancelPaymentSession,
} from "../services/api/paymentsApi";
import { apiGetCartTotals } from "../services/api/cartApi";
import {
  buildOrderId,
  buildOrderSnapshot,
  buildPlaceOrderRequest,
  calculateCheckoutTotals,
  cartFingerprint,
  formatDeliveryEstimate,
  getDeliveryEstimate,
  isCustomerComplete,
  newAttemptId,
  nextOrderSequence,
  validateAddress,
} from "../utils/checkout";
import { readStorage, writeStorage } from "../utils/shopping";
import { getAccessToken } from "../services/api/apiClient";
import { readShippingRules } from "../config/commerceDefaults";

export const CHECKOUT_STORAGE_KEY = "pratikshya_checkout";

/**
 * Lazily loads the Razorpay checkout.js script once per page session.
 * Resolves immediately if already loaded.
 */
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload  = () => resolve();
    script.onerror = () => resolve(); // non-fatal — modal open will fail gracefully
    document.head.appendChild(script);
  });
}

const CheckoutContext = createContext(null);

/**
 * Canonical customer shape (Phase 2): separate first/last name — matching
 * the backend DTO exactly. No fullName string is kept or split anywhere.
 */
const EMPTY_CUSTOMER = { firstName: "", lastName: "", email: "", phone: "" };

/** Customer fields prefilled from an authenticated profile. */
const customerFromUser = (user) => ({
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  email: user.email ?? "",
  phone: user.phone ?? "",
});

const freshState = ({ user, addresses = [] }) => {
  const customerSource = user ? "account" : "guest";
  const preferred = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
  return {
    customer: user ? customerFromUser(user) : { ...EMPTY_CUSTOMER },
    customerSource,
    address: user && preferred ? preferred : null,
    addressId: user && preferred ? preferred.id : null,
    addressSource: user && preferred ? "account" : "guest",
    deliveryMethod: "standard",
    paymentMethod: null,
    stepIndex: 0,
    bagFingerprint: null,
    /** Idempotency key for this checkout attempt (safe order retries). */
    attemptId: newAttemptId(),
    paymentStatus: PAYMENT_STATUS.IDLE,
    paymentMessage: "",
    sessionId: null,
    completedOrder: null,
  };
};

/**
 * Restores a safe subset of the last checkout session. Corrupt storage is
 * discarded, the step is pulled back when earlier steps are incomplete,
 * and an account-sourced address is re-resolved from the live address book.
 *
 * Idempotency: the stored attemptId is reused only when the bag is
 * unchanged — if the bag fingerprint differs from the current bag, a fresh
 * attempt id is generated so a stale key can never be replayed against a
 * changed order.
 */
const restoreCheckout = ({ user, addresses = [], cartItems = [], couponCode = null }) => {
  const stored = readStorage(CHECKOUT_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object") return freshState({ user, addresses });

  const base = freshState({ user, addresses });
  let customerSource = base.customerSource;
  let customer = base.customer;

  if (!user) {
    customerSource = "guest";
    customer = stored.customer ? { ...EMPTY_CUSTOMER, ...stored.customer } : base.customer;
  } else if (stored.customerSource === "edited" && stored.customer) {
    customerSource = "edited";
    customer = { ...EMPTY_CUSTOMER, ...stored.customer };
  }

  let address = base.address;
  let addressId = base.addressId;
  let addressSource = base.addressSource;
  if (user) {
    if (stored.addressSource === "account" && stored.addressId) {
      const saved = addresses.find((entry) => entry.id === stored.addressId);
      if (saved) {
        address = saved;
        addressId = saved.id;
        addressSource = "account";
      }
    }
  } else if (stored.addressSource === "guest" && stored.address) {
    address = stored.address;
    addressId = null;
    addressSource = "guest";
  }

  let stepIndex = Math.min(Math.max(Number(stored.stepIndex) || 0, 0), CHECKOUT_STEPS.length - 1);
  if (!isCustomerComplete(customer)) stepIndex = 0;
  else if (!address) stepIndex = Math.min(stepIndex, 1);

  // Reuse the stored attempt id only for an unchanged bag.
  let attemptId = base.attemptId;
  const storedFingerprint = stored.bagFingerprint ?? null;
  if (storedFingerprint) {
    if (storedFingerprint === cartFingerprint(cartItems, couponCode)) {
      attemptId =
        typeof stored.attemptId === "string" && stored.attemptId
          ? stored.attemptId
          : newAttemptId();
    } else {
      attemptId = newAttemptId();
    }
  }

  return {
    ...base,
    customer,
    customerSource,
    address,
    addressId,
    addressSource,
    deliveryMethod: getDeliveryMethod(stored.deliveryMethod).id,
    paymentMethod: PAYMENT_METHODS.some((method) => method.id === stored.paymentMethod)
      ? stored.paymentMethod
      : null,
    stepIndex,
    attemptId,
  };
};

export function CheckoutProvider({ children }) {
  const { user } = useAuth();
  const account = useAccount();
  const cart = useCart();
  const orderApi = useOrder();

  const [state, setState] = useState(() =>
    restoreCheckout({
      user,
      addresses: account.addresses,
      cartItems: cart.items,
      couponCode: cart.coupon?.code ?? null,
    })
  );

  /* Latest-state refs so async payment resolution always reads fresh data. */
  const stateRef = useRef(state);
  const cartRef = useRef(cart);
  stateRef.current = state;
  cartRef.current = cart;

  const paymentStartingRef = useRef(false);

  /* ---------------------------------------------------------------- */
  /* Persistence — safe checkout fields only                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    writeStorage(CHECKOUT_STORAGE_KEY, {
      customer: state.customer,
      customerSource: state.customerSource,
      address: state.addressSource === "guest" ? state.address : null,
      addressId: state.addressSource === "account" ? state.addressId : null,
      addressSource: state.addressSource,
      deliveryMethod: state.deliveryMethod,
      paymentMethod: state.paymentMethod,
      stepIndex: state.stepIndex,
      bagFingerprint: state.bagFingerprint,
      attemptId: state.attemptId,
      savedAt: Date.now(),
    });
  }, [
    state.customer,
    state.customerSource,
    state.address,
    state.addressId,
    state.addressSource,
    state.deliveryMethod,
    state.paymentMethod,
    state.stepIndex,
    state.bagFingerprint,
    state.attemptId,
  ]);

  /* ---------------------------------------------------------------- */
  /* Identity sync — prefill follows the signed-in customer            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setState((current) => {
      if (user) {
        const customer =
          current.customerSource === "edited"
            ? current.customer
            : customerFromUser(user);
        let { address, addressId, addressSource } = current;
        if (current.addressSource === "account") {
          const saved = account.addresses.find((entry) => entry.id === current.addressId);
          if (saved) {
            address = saved;
            addressId = saved.id;
          } else if (account.addresses.length) {
            address = account.addresses.find((entry) => entry.isDefault) ?? account.addresses[0];
            addressId = address.id;
          }
        } else if (!current.address && account.addresses.length) {
          address = account.addresses.find((entry) => entry.isDefault) ?? account.addresses[0];
          addressId = address.id;
          addressSource = "account";
        }
        return { ...current, customer, address, addressId, addressSource };
      }

      const customer =
        current.customerSource === "edited" ? current.customer : { ...EMPTY_CUSTOMER };
      return {
        ...current,
        customer,
        customerSource: current.customerSource === "edited" ? "edited" : "guest",
        address: current.addressSource === "guest" ? current.address : null,
        addressId: current.addressSource === "guest" ? current.addressId : null,
        addressSource: "guest",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ---------------------------------------------------------------- */
  /* Address book sync — the selected account address stays live        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!user) return;
    setState((current) => {
      if (current.addressSource !== "account") {
        if (!current.address && account.addresses.length) {
          const preferred =
            account.addresses.find((entry) => entry.isDefault) ?? account.addresses[0];
          return { ...current, address: preferred, addressId: preferred.id, addressSource: "account" };
        }
        return current;
      }
      const saved = account.addresses.find((entry) => entry.id === current.addressId);
      if (saved && saved !== current.address) {
        return { ...current, address: saved };
      }
      if (!saved && account.addresses.length) {
        const preferred =
          account.addresses.find((entry) => entry.isDefault) ?? account.addresses[0];
        return { ...current, address: preferred, addressId: preferred.id };
      }
      return current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.addresses, user]);

  /* ---------------------------------------------------------------- */
  /* Derived state                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Display totals. For signed-in customers the delivery/COD-dependent
   * breakdown is fetched from the backend (`GET /cart/totals`) whenever the
   * chosen methods or the bag change, so the checkout shows the server's own
   * numbers. Guests (no server cart) and any totals fetch failure fall back
   * to the presentation calculation — display-only either way: the placed
   * order's amounts are ALWAYS recomputed by the Phase 2 order boundary.
   */
  const [serverMethodTotals, setServerMethodTotals] = useState(null);
  const totalsKey = JSON.stringify([
    user?.id ?? null,
    state.deliveryMethod,
    state.paymentMethod,
    cartFingerprint(cart.items, cart.coupon?.code ?? null),
  ]);
  const totalsKeyRef = useRef(null);
  useEffect(() => {
    if (!user?.id || !getAccessToken("customer")) {
      setServerMethodTotals(null);
      totalsKeyRef.current = null;
      return;
    }
    if (totalsKeyRef.current === totalsKey) return;
    totalsKeyRef.current = totalsKey;
    // A method/bag change invalidates the previous server quote — show the
    // presentation estimate until the fresh server numbers arrive.
    setServerMethodTotals(null);
    let cancelled = false;
    apiGetCartTotals({
      deliveryMethod: state.deliveryMethod,
      // Before a payment method is chosen, quote the online rate (no COD fee).
      paymentMethod: state.paymentMethod === "cod" ? "cod" : "online",
    }).then((result) => {
      if (cancelled) return;
      setServerMethodTotals(result.ok ? result.totals : null);
    });
    return () => { cancelled = true; };
  }, [totalsKey, user?.id, state.deliveryMethod, state.paymentMethod]);

  const totals = useMemo(() => {
    if (user?.id && serverMethodTotals) {
      return {
        ...serverMethodTotals,
        freeShippingRemainder:
          serverMethodTotals.freeShippingRemainder ??
          (serverMethodTotals.shipping > 0
            ? Math.max(
                0,
                readShippingRules().freeShippingThreshold -
                  (serverMethodTotals.total - serverMethodTotals.shipping - serverMethodTotals.codFee)
              )
            : 0),
      };
    }
    return calculateCheckoutTotals(
      cart.totals,
      state.deliveryMethod,
      state.paymentMethod
    );
  }, [user?.id, serverMethodTotals, cart.totals, state.deliveryMethod, state.paymentMethod]);

  const deliveryEstimate = useMemo(
    () => formatDeliveryEstimate(getDeliveryEstimate(state.deliveryMethod)),
    [state.deliveryMethod]
  );

  const deliveryMethod = useMemo(
    () => getDeliveryMethod(state.deliveryMethod),
    [state.deliveryMethod]
  );

  /** True when the bag changed after the customer reviewed it. */
  const bagChanged =
    state.bagFingerprint !== null &&
    cartFingerprint(cart.items, cart.coupon?.code ?? null) !== state.bagFingerprint;

  const customerValid = isCustomerComplete(state.customer);
  const addressValid = state.address ? validateAddress(state.address).ok : false;
  const paymentInProgress = state.paymentStatus === PAYMENT_STATUS.PENDING;

  /* ---------------------------------------------------------------- */
  /* Idempotency — rotate the attempt id whenever the order payload     */
  /* can change. The same key always maps to the same payload; a         */
  /* changed payload gets a fresh key so a retry can never replay a       */
  /* stale order. Retries (unchanged payload) keep the key.               */
  /* ---------------------------------------------------------------- */
  const liveBagFingerprint = cartFingerprint(cart.items, cart.coupon?.code ?? null);
  const payloadInputs = useMemo(
    () =>
      JSON.stringify([
        state.customer,
        state.address,
        state.deliveryMethod,
        state.paymentMethod,
        liveBagFingerprint,
      ]),
    [state.customer, state.address, state.deliveryMethod, state.paymentMethod, liveBagFingerprint]
  );

  const payloadMountedRef = useRef(false);
  useEffect(() => {
    if (!payloadMountedRef.current) {
      payloadMountedRef.current = true;
      return;
    }
    setState((s) => ({ ...s, attemptId: newAttemptId() }));
  }, [payloadInputs]);

  /* ---------------------------------------------------------------- */
  /* Payment resolution                                                */
  /* startPayment is THE payment path: COD → POST /orders; online →    */
  /* POST /orders → POST /payments/session → Razorpay → POST           */
  /* /payments/verify (server-side HMAC). No mock handlers remain.     */
  /* ---------------------------------------------------------------- */

  /**
   * Canonical payment start (Phase 2).
   *
   * COD    → POST /orders (order confirmed; payment PENDING until delivery).
   * Online → POST /orders (PENDING_PAYMENT) → POST /payments/session
   *          (against that order) → Razorpay modal → POST /payments/verify
   *          (server-side HMAC) → order confirmed.
   *
   * Both guests and signed-in customers can complete checkout. The
   * idempotency key (attemptId) makes retries safe: the same attempt
   * returns the same order; a changed attempt creates a new one.
   */
  const startPayment = useCallback(async () => {
    const current = stateRef.current;
    if (current.paymentStatus === PAYMENT_STATUS.PENDING || paymentStartingRef.current) return;
    if (!current.paymentMethod || !current.address) return;

    const cartNow = cartRef.current;
    const isGuest = !user?.id;
    const guestEmail = isGuest ? current.customer.email ?? null : null;

    const payload = buildPlaceOrderRequest({
      items: cartNow.items,
      customer: current.customer,
      address: current.address,
      deliveryMethodId: current.deliveryMethod,
      paymentMethodId: current.paymentMethod,
      couponCode: cartNow.coupon?.code ?? null,
      idempotencyKey: current.attemptId,
    });

    // ----------------------------------------------------------------
    // COD — no Razorpay. The order is confirmed at placement and the
    // payment stays PENDING until cash is collected on delivery.
    // ----------------------------------------------------------------
    if (current.paymentMethod === "cod") {
      paymentStartingRef.current = true;
      const placed = await orderApi.placeOrder(payload);
      paymentStartingRef.current = false;
      if (!placed?.ok) {
        setState((s) => ({
          ...s,
          paymentStatus: PAYMENT_STATUS.FAILURE,
          paymentMessage: placed?.error || "Your order could not be placed. Please try again.",
        }));
        return;
      }
      await cartNow.clearCart();
      clearPersistedCheckout();
      setState((s) => ({
        ...s,
        paymentStatus: PAYMENT_STATUS.SUCCESS,
        completedOrder: placed.order ?? null,
        sessionId: null,
      }));
      return;
    }

    // ----------------------------------------------------------------
    // ONLINE — canonical order-first flow
    // ----------------------------------------------------------------
    setState((s) => ({ ...s, paymentStatus: PAYMENT_STATUS.PENDING, paymentMessage: "" }));
    paymentStartingRef.current = true;

    // 1. Create the pending order (server computes all amounts).
    const placed = await orderApi.placeOrder(payload);
    if (!placed?.ok) {
      paymentStartingRef.current = false;
      setState((s) => ({
        ...s,
        paymentStatus: PAYMENT_STATUS.FAILURE,
        paymentMessage: placed?.error || "Your order could not be created. Please try again.",
      }));
      return;
    }
    const pendingOrder = placed.order;

    // 2. Create the Razorpay session against that order.
    const sessionResult = await apiCreatePaymentSession({
      orderId: pendingOrder.id,
      paymentMethod: current.paymentMethod,
      idempotencyKey: current.attemptId,
      guestEmail,
    });
    if (!sessionResult.ok) {
      paymentStartingRef.current = false;
      setState((s) => ({
        ...s,
        paymentStatus: PAYMENT_STATUS.FAILURE,
        paymentMessage:
          "Your order is saved as pending. " +
          (sessionResult.error || "Payment could not be initialised.") +
          " You can retry the payment without re-entering your details.",
      }));
      return;
    }

    paymentStartingRef.current = false;
    const sessionId = sessionResult.sessionId;
    setState((s) => ({ ...s, sessionId }));

    // 3. Open the Razorpay hosted checkout (real instruments are collected
    //    by the gateway — the storefront never sees or stores them).
    if (sessionResult.razorpayOrderId && sessionResult.razorpayKeyId) {
      await loadRazorpayScript();

      if (typeof window.Razorpay === "undefined") {
        // The gateway script could not be loaded (network/offline). The
        // pending order remains payable — the customer can retry.
        setState((s) => ({
          ...s,
          paymentStatus: PAYMENT_STATUS.FAILURE,
          paymentMessage:
            "The secure payment window could not be loaded. Check your " +
            "connection and try again — your order is saved as pending and " +
            "nothing has been charged.",
        }));
        return;
      }

      const prefill = sessionResult.prefill ?? {};
      const options = {
        key: sessionResult.razorpayKeyId,
        amount: sessionResult.amountPaise,
        currency: sessionResult.currency ?? "INR",
        order_id: sessionResult.razorpayOrderId,
        name: "Pratikshya Fashon",
        description: "Order Payment",
        prefill: {
          name: prefill.name ?? `${current.customer.firstName} ${current.customer.lastName}`.trim(),
          email: prefill.email ?? current.customer.email,
          contact: prefill.contact ?? current.customer.phone,
        },
        handler: async (response) => {
          // 4. Verify the signature server-side. The backend is the only
          //    place where an order may become PAID.
          const verifyResult = await apiVerifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
            guestEmail,
          });
          if (verifyResult.ok) {
            const completedOrder = {
              ...pendingOrder,
              status: verifyResult.orderStatus ?? pendingOrder.status,
              paymentStatus: verifyResult.paymentStatus ?? "PAID",
            };
            await cartRef.current.clearCart();
            clearPersistedCheckout();
            setState((s) => ({
              ...s,
              paymentStatus: PAYMENT_STATUS.SUCCESS,
              completedOrder,
            }));
          } else {
            // Honest failure — we never claim payment success without
            // server confirmation. The order stays pending (unpaid).
            setState((s) => ({
              ...s,
              paymentStatus: PAYMENT_STATUS.FAILURE,
              paymentMessage:
                (verifyResult.error || "Payment verification failed.") +
                " If an amount was deducted, it will be automatically refunded. " +
                "Your order remains unpaid — you can retry the payment.",
            }));
          }
        },
        modal: {
          ondismiss: () => {
            setState((s) => ({
              ...s,
              paymentStatus: PAYMENT_STATUS.CANCELLED,
              paymentMessage:
                "The payment was cancelled. Nothing has been charged. " +
                "Your order is saved as pending and can be paid or cancelled later.",
            }));
          },
        },
        theme: { color: "#1a1a2e" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      return;
    }

    // Fallback: session created but no Razorpay data (shouldn't happen online)
    setState((s) => ({
      ...s,
      paymentStatus: PAYMENT_STATUS.FAILURE,
      paymentMessage:
        "Payment gateway configuration error. Your order is saved as pending — " +
        "please try again or use cash on delivery.",
    }));
  }, [orderApi, user]);

  /**
   * Guest-ownership token for payment-session calls. Signed-in callers are
   * matched by their session identity (null); guests present the order's
   * own guest email, which the server compares with the stored value.
   */
  const currentGuestEmail = useCallback(
    () => (user?.id ? null : stateRef.current.customer?.email ?? null),
    [user]
  );

  const cancelActivePayment = useCallback(async () => {
    const current = stateRef.current;
    if (current.paymentStatus !== PAYMENT_STATUS.PENDING || !current.sessionId) return;
    // Tell the backend to cancel the session (ownership: user or guest email)
    if (current.sessionId) {
      apiCancelPaymentSession(current.sessionId, "Customer cancelled", currentGuestEmail()).catch(() => {});
    }
    setState((s) => ({
      ...s,
      paymentStatus: PAYMENT_STATUS.CANCELLED,
      paymentMessage: "The payment was cancelled. Nothing has been charged.",
    }));
  }, [currentGuestEmail]);

  const retryPayment = useCallback(() => {
    startPayment();
  }, [startPayment]);

  const resetPayment = useCallback(() => {
    setState((s) => ({
      ...s,
      paymentStatus: PAYMENT_STATUS.IDLE,
      paymentMessage: "",
      sessionId: null,
    }));
  }, []);

  /* ---------------------------------------------------------------- */
  /* Step movement                                                     */
  /* ---------------------------------------------------------------- */

  const nextStep = useCallback(() => {
    setState((s) => {
      if (s.stepIndex >= CHECKOUT_STEPS.length - 1) return s;
      const next = s.stepIndex + 1;
      const updates = {};
      if (CHECKOUT_STEPS[s.stepIndex] === "review") {
        updates.bagFingerprint = cartFingerprint(
          cartRef.current.items,
          cartRef.current.coupon?.code ?? null
        );
      }
      return { ...s, ...updates, stepIndex: next };
    });
  }, []);

  const backStep = useCallback(() => {
    const current = stateRef.current;
    if (paymentStartingRef.current) return;
    if (current.paymentStatus === PAYMENT_STATUS.PENDING && current.sessionId) {
      apiCancelPaymentSession(current.sessionId, "Customer cancelled", currentGuestEmail()).catch(() => {});
      return;
    }
    setState((s) => {
      if (s.stepIndex <= 0) return s;
      if (CHECKOUT_STEPS[s.stepIndex] === "payment") {
        return {
          ...s,
          stepIndex: s.stepIndex - 1,
          paymentStatus: PAYMENT_STATUS.IDLE,
          paymentMessage: "",
          sessionId: null,
        };
      }
      return { ...s, stepIndex: s.stepIndex - 1 };
    });
  }, [currentGuestEmail]);

  const goToStep = useCallback((index) => {
    const current = stateRef.current;
    if (paymentStartingRef.current) return;
    if (current.paymentStatus === PAYMENT_STATUS.PENDING && current.sessionId) {
      apiCancelPaymentSession(current.sessionId, "Customer cancelled", currentGuestEmail()).catch(() => {});
      return;
    }
    setState((s) => {
      if (!Number.isInteger(index) || index < 0 || index >= CHECKOUT_STEPS.length) return s;
      if (index >= s.stepIndex) return s;
      if (CHECKOUT_STEPS[s.stepIndex] === "payment") {
        return {
          ...s,
          stepIndex: index,
          paymentStatus: PAYMENT_STATUS.IDLE,
          paymentMessage: "",
          sessionId: null,
        };
      }
      return { ...s, stepIndex: index };
    });
  }, [currentGuestEmail]);

  /* ---------------------------------------------------------------- */
  /* Data actions                                                      */
  /* ---------------------------------------------------------------- */

  const updateCustomer = useCallback(
    (fields) => {
      setState((s) => ({
        ...s,
        customer: { ...s.customer, ...fields },
        customerSource: user ? "edited" : "guest",
      }));
    },
    [user]
  );

  /**
   * Selects a saved address. When the caller just created the address (and
   * the account state has not re-rendered yet), it passes the snapshot
   * along so the selection is synchronous; otherwise the live address-book
   * sync resolves it.
   */
  const selectAccountAddress = useCallback(
    (addressId, address = null) => {
      const saved = address ?? account.addresses.find((entry) => entry.id === addressId);
      setState((s) => ({
        ...s,
        addressId,
        addressSource: "account",
        address: saved ?? null,
      }));
    },
    [account.addresses]
  );

  const setGuestAddress = useCallback((addressData) => {
    setState((s) => ({
      ...s,
      address: {
        fullName: addressData.fullName ?? "",
        phone: addressData.phone ?? "",
        addressLine: addressData.addressLine ?? "",
        landmark: addressData.landmark ?? "",
        city: addressData.city ?? "",
        state: addressData.state ?? "",
        pincode: addressData.pincode ?? "",
        type: addressData.type ?? "Home",
      },
      addressId: null,
      addressSource: "guest",
    }));
  }, []);

  const setDeliveryMethod = useCallback((id) => {
    setState((s) => ({ ...s, deliveryMethod: getDeliveryMethod(id).id }));
  }, []);

  const setPaymentMethod = useCallback((id) => {
    setState((s) => ({
      ...s,
      paymentMethod: PAYMENT_METHODS.some((method) => method.id === id) ? id : s.paymentMethod,
      paymentStatus: PAYMENT_STATUS.IDLE,
      paymentMessage: "",
      sessionId: null,
    }));
  }, []);

  const resetCheckout = useCallback(() => {
    clearPersistedCheckout();
    setState(freshState({ user, addresses: account.addresses }));
  }, [user, account.addresses]);

  /* ---------------------------------------------------------------- */

  const value = useMemo(
    () => ({
      ...state,
      totals,
      deliveryEstimate,
      deliveryMethod,
      bagChanged,
      customerValid,
      addressValid,
      paymentInProgress,
      updateCustomer,
      selectAccountAddress,
      setGuestAddress,
      setDeliveryMethod,
      setPaymentMethod,
      nextStep,
      backStep,
      goToStep,
      startPayment,
      cancelActivePayment,
      retryPayment,
      resetPayment,
      resetCheckout,
    }),
    [
      state,
      totals,
      deliveryEstimate,
      deliveryMethod,
      bagChanged,
      customerValid,
      addressValid,
      paymentInProgress,
      updateCustomer,
      selectAccountAddress,
      setGuestAddress,
      setDeliveryMethod,
      setPaymentMethod,
      nextStep,
      backStep,
      goToStep,
      startPayment,
      cancelActivePayment,
      retryPayment,
      resetPayment,
      resetCheckout,
    ]
  );

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

/** Removes the persisted checkout session (after a completed order). */
const clearPersistedCheckout = () => {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    }
  } catch {
    // Storage being unavailable never breaks checkout.
  }
};

/** Accessor for the checkout session; inert when no provider is mounted. */
export function useCheckout() {
  return (
    useContext(CheckoutContext) ?? {
      customer: { ...EMPTY_CUSTOMER },
      address: null,
      deliveryMethod: "standard",
      paymentMethod: null,
      stepIndex: 0,
      attemptId: null,
      totals: { subtotal: 0, shipping: 0, codFee: 0, total: 0 },
      deliveryEstimate: "",
      updateCustomer: () => {},
      selectAccountAddress: () => {},
      setGuestAddress: () => {},
      setDeliveryMethod: () => {},
      setPaymentMethod: () => {},
      setDemoScenario: () => {},
      nextStep: () => {},
      backStep: () => {},
      goToStep: () => {},
      startPayment: () => {},
      cancelActivePayment: () => {},
      retryPayment: () => {},
      resetPayment: () => {},
      resetCheckout: () => {},
    }
  );
}

export default CheckoutContext;
