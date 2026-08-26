import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import {
  AtelierButton,
  AtelierSection,
  Breadcrumb,
  EmptyState,
} from "../design-system";
import { CHECKOUT_STEPS } from "../config/checkoutConfig";
import { useCart } from "../context/CartContext";
import { useCheckout } from "../context/CheckoutContext";
import { formatINR } from "../utils/shopping";
import CheckoutShell from "../components/checkout/CheckoutShell";
import CheckoutOrderSummary from "../components/checkout/CheckoutOrderSummary";
import CustomerInformation from "../components/checkout/CustomerInformation";
import DeliveryStep from "../components/checkout/DeliveryStep";
import OrderReview from "../components/checkout/OrderReview";
import PaymentStep from "../components/checkout/PaymentStep";

/**
 * Checkout — /checkout.
 *
 * The transaction journey: customer → delivery → review → payment,
 * orchestrated by the checkout context, priced for display by the Phase 6
 * engine and authoritatively priced by the backend at order time. Online
 * payment runs through the secure Razorpay hosted checkout; the cart is
 * only cleared after the server confirms the payment. Guest checkout is
 * supported (orders are claimable via the verified-email claim flow).
 */
export default function Checkout() {
  const cart = useCart();
  const checkout = useCheckout();
  const navigate = useNavigate();

  const customerRef = useRef(null);
  const deliveryRef = useRef(null);
  const reviewRef = useRef(null);
  const paymentRef = useRef(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Checkout — PRATIKSHYA FASHON";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  /* A successfully confirmed order (server-verified) hands off to the
     order confirmation page. */
  useEffect(() => {
    if (checkout.completedOrder) {
      navigate("/order-success", { replace: true });
    }
  }, [checkout.completedOrder, navigate]);

  /* ---------------------------------------------------------------- */

  if (cart.items.length === 0) {
    return (
      <main>
        <AtelierSection rhythm="none" width="wide" className="pb-24 pt-28 sm:pt-32 md:pb-32">
          <Breadcrumb
            items={[{ label: "Bag", to: "/cart" }, { label: "Checkout" }]}
            className="mb-4"
          />
          <EmptyState
            eyebrow="Checkout"
            title="Your collection is empty."
            description="Add something beautiful before continuing to checkout."
            actions={
              <AtelierButton as={Link} to="/shop" variant="primary" size="md">
                Continue Shopping
              </AtelierButton>
            }
          />
        </AtelierSection>
      </main>
    );
  }

  /* ---------------------------------------------------------------- */

  const stepIndex = checkout.stepIndex;
  const isPaymentStep = stepIndex === CHECKOUT_STEPS.length - 1;

  const handlePrimary = () => {
    if (isPaymentStep) {
      // Guest checkout is supported: the backend creates a claimable guest
      // order, and the secure Razorpay window collects any instrument.
      paymentRef.current?.pay?.();
      return;
    }
    const stepRef = [customerRef, deliveryRef, reviewRef, paymentRef][stepIndex];
    const valid = stepRef.current?.validate?.() ?? true;
    if (valid) checkout.nextStep();
  };

  const primaryLabels = [
    "Continue to Delivery",
    "Continue to Review",
    "Continue to Payment",
    `Pay ${formatINR(checkout.totals.total)}`,
  ];

  const stepPanels = [
    <CustomerInformation key="customer" ref={customerRef} />,
    <DeliveryStep key="delivery" ref={deliveryRef} />,
    <OrderReview key="review" ref={reviewRef} />,
    <PaymentStep key="payment" ref={paymentRef} />,
  ];

  const bagChangedNotice =
    isPaymentStep && checkout.bagChanged ? (
      <div
        role="status"
        className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-accent/30 bg-accent/5 px-5 py-4"
      >
        <p className="flex items-center gap-2.5 font-ui text-[11px] leading-relaxed text-accent">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          Your bag changed since you reviewed your order — please review it again
          before paying.
        </p>
        <button
          type="button"
          onClick={() => checkout.goToStep(2)}
          className="font-ui text-[10px] uppercase tracking-[.16em] text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          Review Order
        </button>
      </div>
    ) : null;

  return (
    <>
    <CheckoutShell
      stepIndex={stepIndex}
      onStepClick={checkout.goToStep}
      notice={bagChangedNotice}
      summary={<CheckoutOrderSummary />}
      onBack={checkout.backStep}
      onPrimary={handlePrimary}
      primaryLabel={primaryLabels[stepIndex]}
      backDisabled={stepIndex === 0}
      mobilePrimaryLabel={primaryLabels[stepIndex]}
      mobileTotal={formatINR(checkout.totals.total)}
    >
      {stepPanels[stepIndex]}
    </CheckoutShell>
    </>
  );
}
