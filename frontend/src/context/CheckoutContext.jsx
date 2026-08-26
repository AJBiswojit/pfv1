/**
 * PRATIKSHYA FASHON — Checkout session state (Phase B wired).
 *
 * The single checkout session: customer, delivery address, delivery
 * method, payment method, current step and the in-flight payment. It
 * composes the existing foundations rather than duplicating them:
 *
 *   AuthContext      → identity (prefill source)
 *   AccountContext   → saved addresses (source of truth for the address book)
 *   CartContext      → cart + coupon + pricing engine
 *   OrderContext     → order placement (calls /orders backend)
 *   paymentsApi      → real Razorpay session (POST /payments/session)
 *
 * For COD: the session is created immediately, no Razorpay modal is opened.
 * For online payments: Razorpay checkout.js is loaded and opened.
 *
 * Pricing is always derived live from the Phase 6 engine — nothing is
 * copied into this context. Only safe checkout fields are persisted:
 * never card numbers, CVV or any payment credential.
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
  DEMO_SCENARIOS,
  PAYMENT_METHODS,
  getDeliveryMethod,
} from "../config/checkoutConfig";
import {
  PAYMENT_STATUS,
  getPaymentService,
} from "../services/payment/paymentService";
import {
  apiCreatePaymentSession,
  apiVerifyPayment,
  apiCancelPaymentSession,
} from "../services/api/paymentsApi";
import {
  buildOrderId,
  buildOrderSnapshot,
  calculateCheckoutTotals,
  cartFingerprint,
  formatDeliveryEstimate,
  getDeliveryEstimate,
  isCustomerComplete,
  nextOrderSequence,
  validateAddress,
} from "../utils/checkout";
import { readStorage, writeStorage } from "../utils/shopping";
import inventoryRepository from "../services/inventory/inventoryRepository";

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

const EMPTY_CUSTOMER = { fullName: "", email: "", phone: "" };

/** Customer fields prefilled from an authenticated profile. */
const customerFromUser = (user) => ({
  fullName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim(),
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
    paymentStatus: PAYMENT_STATUS.IDLE,
    paymentMessage: "",
    sessionId: null,
    demoScenario: "success",
    completedOrder: null,
  };
};

/**
 * Restores a safe subset of the last checkout session. Corrupt storage is
 * discarded, the step is pulled back when earlier steps are incomplete,
 * and an account-sourced address is re-resolved from the live address book.
 */
const restoreCheckout = ({ user, addresses = [] }) => {
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
    demoScenario: DEMO_SCENARIOS.some((scenario) => scenario.id === stored.demoScenario)
      ? stored.demoScenario
      : "success",
  };
};

export function CheckoutProvider({ children }) {
  const { user } = useAuth();
  const account = useAccount();
  const cart = useCart();
  const orderApi = useOrder();

  const [state, setState] = useState(() =>
    restoreCheckout({ user, addresses: account.addresses })
  );

  /* Latest-state refs so async payment resolution always reads fresh data. */
  const stateRef = useRef(state);
  const cartRef = useRef(cart);
  stateRef.current = state;
  cartRef.current = cart;

  /**
   * The demo scenario, mirrored synchronously: a customer can tap a test
   * scenario and Pay within the same tick, and the payment must use the
   * scenario they just chose — never the one render caught up with.
   */
  const demoScenarioRef = useRef(state.demoScenario);
  /* Reservation identity is kept outside payment state so an asynchronous
     sandbox result can always settle exactly the stock it held. */
  const activeReservationRef = useRef(null);
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
      demoScenario: state.demoScenario,
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
    state.demoScenario,
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

  const totals = useMemo(
    () =>
      calculateCheckoutTotals(
        cart.totals,
        state.deliveryMethod,
        state.paymentMethod
      ),
    [cart.totals, state.deliveryMethod, state.paymentMethod]
  );

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
  /* Payment resolution                                                */
  /* (legacy mock handler — kept for backward compat during staged     */
  /* rollout; the real flow goes through startPayment / Razorpay)      */
  /* ---------------------------------------------------------------- */

  // retryPayment simply re-runs startPayment
  const startPayment = useCallback(async () => {
    const current = stateRef.current;
    if (!user?.id) {
      setState((s) => ({
        ...s,
        paymentStatus: PAYMENT_STATUS.FAILURE,
        paymentMessage: "Please sign in or create an account to complete your order.",
      }));
      return;
    }
    if (current.paymentStatus === PAYMENT_STATUS.PENDING || activeReservationRef.current || paymentStartingRef.current) return;
    if (!current.paymentMethod || !current.address) return;
    paymentStartingRef.current = true;

    // Reserve inventory before touching payment
    const reservation = inventoryRepository.reserveCart(cartRef.current.items, {
      reference: `CHECKOUT-${Date.now().toString(36).toUpperCase()}`,
    });
    if (!reservation.ok) {
      paymentStartingRef.current = false;
      setState((s) => ({
        ...s,
        paymentStatus: PAYMENT_STATUS.FAILURE,
        paymentMessage: reservation.error || "Stock changed while you were checking out. Please adjust your bag.",
      }));
      return;
    }
    activeReservationRef.current = reservation.reservationId;

    const totalAmount = calculateCheckoutTotals(
      cartRef.current.totals,
      current.deliveryMethod,
      current.paymentMethod
    ).total;

    // ----------------------------------------------------------------
    // COD — no Razorpay, place order directly then show success
    // ----------------------------------------------------------------
    if (current.paymentMethod === "cod") {
      const cartNow = cartRef.current;
      const placed = await orderApi.placeOrder({
        items: cartNow.items.map((item) => ({
          productId: item.productId,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
          price: item.product?.price ?? 0,
        })),
        customer: current.customer,
        address: current.address,
        deliveryMethod: current.deliveryMethod,
        paymentMethod: "cod",
        couponCode: cartNow.coupon?.code ?? null,
        inventoryReservationId: reservation.reservationId,
      });
      paymentStartingRef.current = false;
      if (!placed?.ok) {
        inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "COD-ORDER-FAIL" });
        activeReservationRef.current = null;
        setState((s) => ({
          ...s,
          paymentStatus: PAYMENT_STATUS.FAILURE,
          paymentMessage: "Your order could not be placed. Please try again.",
        }));
        return;
      }
      // Confirm inventory sale
      inventoryRepository.confirmReservationSale(activeReservationRef.current, { reference: placed.order?.id });
      activeReservationRef.current = null;
      cartNow.clearCart();
      clearPersistedCheckout();
      setState((s) => ({ ...s, paymentStatus: PAYMENT_STATUS.SUCCESS, completedOrder: placed.order ?? null }));
      return;
    }

    // ----------------------------------------------------------------
    // ONLINE — create Razorpay session, open checkout modal
    // ----------------------------------------------------------------
    setState((s) => ({ ...s, paymentStatus: PAYMENT_STATUS.PENDING, paymentMessage: "" }));

    const sessionResult = await apiCreatePaymentSession({
      paymentMethod: current.paymentMethod,
      orderDraft: {
        amount: totalAmount,
        customer: current.customer,
        address: current.address,
        deliveryMethod: current.deliveryMethod,
      },
    });
    paymentStartingRef.current = false;

    if (!sessionResult.ok) {
      inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "SESSION-FAIL" });
      activeReservationRef.current = null;
      setState((s) => ({
        ...s,
        paymentStatus: PAYMENT_STATUS.FAILURE,
        paymentMessage: sessionResult.error || "Payment could not be initialised. Please try again.",
      }));
      return;
    }

    const sessionId = sessionResult.sessionId;
    setState((s) => ({ ...s, sessionId }));

    // If Razorpay key is provided, open the checkout modal
    if (sessionResult.razorpayOrderId && sessionResult.razorpayKeyId) {
      // Dynamically load Razorpay checkout.js if not already loaded
      await loadRazorpayScript();

      const options = {
        key:          sessionResult.razorpayKeyId,
        amount:       sessionResult.amountPaise,
        currency:     "INR",
        order_id:     sessionResult.razorpayOrderId,
        name:         "Pratikshya Fashon",
        description:  "Order Payment",
        prefill: {
          name:  current.customer.fullName,
          email: current.customer.email,
          contact: current.customer.phone,
        },
        handler: async (response) => {
          // Verify the payment signature with the backend
          const verifyResult = await apiVerifyPayment({
            razorpayOrderId:   response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (verifyResult.ok) {
            // Place the order now that payment is confirmed
            const cartNow = cartRef.current;
            const placed = await orderApi.placeOrder({
              items: cartNow.items.map((item) => ({
                productId: item.productId,
                color: item.color,
                size: item.size,
                quantity: item.quantity,
                price: item.product?.price ?? 0,
              })),
              customer: stateRef.current.customer,
              address: stateRef.current.address,
              deliveryMethod: stateRef.current.deliveryMethod,
              paymentMethod: stateRef.current.paymentMethod,
              couponCode: cartNow.coupon?.code ?? null,
              inventoryReservationId: activeReservationRef.current,
            });
            if (placed?.ok) {
              inventoryRepository.confirmReservationSale(activeReservationRef.current, { reference: placed.order?.id });
              activeReservationRef.current = null;
              cartNow.clearCart();
              clearPersistedCheckout();
              setState((s) => ({ ...s, paymentStatus: PAYMENT_STATUS.SUCCESS, completedOrder: placed.order ?? null }));
            } else {
              inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "POST-VERIFY-FAIL" });
              activeReservationRef.current = null;
              setState((s) => ({ ...s, paymentStatus: PAYMENT_STATUS.FAILURE, paymentMessage: "Payment was received but the order could not be saved. Please contact support." }));
            }
          } else {
            inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "VERIFY-FAIL" });
            activeReservationRef.current = null;
            setState((s) => ({ ...s, paymentStatus: PAYMENT_STATUS.FAILURE, paymentMessage: "Payment verification failed. No charge has been made." }));
          }
        },
        modal: {
          ondismiss: () => {
            inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "RAZORPAY-DISMISSED" });
            activeReservationRef.current = null;
            setState((s) => ({
              ...s,
              paymentStatus: PAYMENT_STATUS.CANCELLED,
              paymentMessage: "The payment was cancelled. Nothing has been charged, and your collection remains in your bag.",
            }));
          },
        },
        theme: { color: "#1a1a2e" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      return;
    }

    // Fallback: backend returned a session but no Razorpay data (shouldn't happen for online)
    inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "NO-RZP-DATA" });
    activeReservationRef.current = null;
    setState((s) => ({
      ...s,
      paymentStatus: PAYMENT_STATUS.FAILURE,
      paymentMessage: "Payment gateway configuration error. Please try again or use COD.",
    }));
  }, [orderApi, user]);

  const cancelActivePayment = useCallback(async () => {
    const current = stateRef.current;
    if (current.paymentStatus !== PAYMENT_STATUS.PENDING || !current.sessionId) return;
    // Tell the backend to cancel the session
    if (current.sessionId) {
      apiCancelPaymentSession(current.sessionId, "Customer cancelled").catch(() => {});
    }
    inventoryRepository.releaseReservation(activeReservationRef.current, { reference: "CANCEL-ACTIVE" });
    activeReservationRef.current = null;
    setState((s) => ({
      ...s,
      paymentStatus: PAYMENT_STATUS.CANCELLED,
      paymentMessage: "The payment was cancelled. Nothing has been charged.",
    }));
  }, []);

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
      getPaymentService().cancelPayment(current.sessionId);
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
  }, []);

  const goToStep = useCallback((index) => {
    const current = stateRef.current;
    if (paymentStartingRef.current) return;
    if (current.paymentStatus === PAYMENT_STATUS.PENDING && current.sessionId) {
      getPaymentService().cancelPayment(current.sessionId);
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
  }, []);

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

  const setDemoScenario = useCallback((id) => {
    const next = DEMO_SCENARIOS.some((scenario) => scenario.id === id) ? id : "success";
    demoScenarioRef.current = next;
    setState((s) => ({ ...s, demoScenario: next }));
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
      setDemoScenario,
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
      setDemoScenario,
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
