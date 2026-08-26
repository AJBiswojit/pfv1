import { forwardRef, useImperativeHandle, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CreditCard,
  Landmark,
  QrCode,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useCart } from "../../context/CartContext";
import { useCheckout } from "../../context/CheckoutContext";
import { PAYMENT_METHODS } from "../../config/checkoutConfig";
import { PAYMENT_STATUS } from "../../services/payment/paymentService";
import { formatINR } from "../../utils/shopping";
import { AtelierButton } from "../../design-system";
import { cn } from "../../utils/cn";

const METHOD_ICONS = {
  upi: QrCode,
  card: CreditCard,
  netbanking: Landmark,
  cod: Banknote,
};

/* ------------------------------------------------------------------ */
/* Method panels                                                       */
/* ------------------------------------------------------------------ */

/**
 * Info panel for online methods (UPI / card / netbanking).
 *
 * Phase 2 (audit P1-28): the storefront does NOT collect card numbers,
 * CVV, UPI IDs or bank credentials. When the customer pays, the order is
 * created as pending and the Razorpay hosted checkout opens — all
 * instruments are entered inside the gateway's secure window.
 */
function SecureCheckoutPanel({ method }) {
  const copy = {
    upi: "Complete your UPI payment in the Razorpay window — choose your UPI app or scan the QR shown there.",
    card: "Enter your card details in the Razorpay window. Cards are processed by the payment gateway; nothing is stored on this site.",
    netbanking: "Choose your bank inside the Razorpay window and complete your bank sign-in to approve the payment.",
  };
  return (
    <div className="border border-mist/80 bg-surface/30 p-5">
      <p className="flex items-center gap-2 font-ui text-[11px] uppercase tracking-[.18em] text-ink">
        <ShieldCheck size={14} className="shrink-0 text-accent" aria-hidden="true" />
        Secure Razorpay checkout
      </p>
      <p className="mt-2 font-ui text-xs leading-relaxed text-graphite">{copy[method.id]}</p>
      <p className="mt-3 font-ui text-[11px] leading-relaxed text-taupe">
        Your order is saved as pending first, then the secure payment window opens.
        If you close it, nothing is charged — you can retry the same payment any time.
      </p>
    </div>
  );
}

function CodPanel() {
  return (
    <div className="border border-mist/80 bg-surface/30 p-5">
      <p className="font-ui text-[11px] uppercase tracking-[.18em] text-ink">
        Cash on Delivery
      </p>
      <p className="mt-2 font-ui text-xs leading-relaxed text-graphite">
        Pay in cash when your order arrives at your door. A small handling fee
        of {formatINR(49)} is added to this order — it is already reflected in
        the total.
      </p>
      <p className="mt-3 font-ui text-[11px] text-taupe">
        Please keep the exact amount ready for the delivery partner.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payment states                                                      */
/* ------------------------------------------------------------------ */

function PendingPayment() {
  return (
    <div role="status" aria-live="polite" className="border border-mist/80 bg-surface/30 px-6 py-14 text-center">
      <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">
        Verifying your payment
      </p>
      <div className="mx-auto mt-8 h-px w-24 animate-pulse bg-accent" aria-hidden="true" />
      <p className="mt-6 font-ui text-xs leading-relaxed text-taupe">
        Please wait — your payment is being confirmed. Do not close this window.
      </p>
    </div>
  );
}

function PaymentOutcome({
  eyebrow,
  headline,
  message,
  actions,
  live = "polite",
}) {
  return (
    <div
      role={live === "assertive" ? "alert" : "status"}
      aria-live={live}
      className="border border-mist/80 bg-surface/30 px-6 py-12 text-center sm:px-10"
    >
      <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">{eyebrow}</p>
      <h3 className="mx-auto mt-4 max-w-md font-display text-3xl font-light tracking-tight text-ink">
        {headline}
      </h3>
      <p className="mx-auto mt-4 max-w-md font-ui text-xs leading-relaxed text-taupe">{message}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step                                                                */
/* ------------------------------------------------------------------ */

const PaymentStep = forwardRef(function PaymentStep(_props, ref) {
  const cart = useCart();
  const checkout = useCheckout();

  const [methodError, setMethodError] = useState("");

  /**
   * Starts the canonical payment flow. For online methods the backend
   * creates the pending order + Razorpay session and the hosted checkout
   * collects the instrument — there is no instrument form to validate
   * here, only that a method was chosen.
   */
  const handlePay = () => {
    if (!checkout.paymentMethod) {
      setMethodError("Please choose a payment method first.");
      return false;
    }
    setMethodError("");
    checkout.startPayment();
    return true;
  };

  useImperativeHandle(ref, () => ({
    pay: handlePay,
  }));

  const selectedMethod = PAYMENT_METHODS.find((method) => method.id === checkout.paymentMethod);

  /* --------------------------- Payment states --------------------------- */

  if (checkout.paymentStatus === PAYMENT_STATUS.PENDING) {
    return (
      <section aria-labelledby="checkout-step-heading">
        <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">Step 04</p>
        <h2 id="checkout-step-heading" tabIndex={-1} className="mt-2 font-display text-3xl font-light tracking-tight outline-none">
          Payment <span className="italic text-accent">in progress.</span>
        </h2>
        <div className="mt-9">
          <PendingPayment />
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={checkout.cancelActivePayment}
              className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe underline-offset-2 hover:text-accent hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            >
              Cancel payment
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (checkout.paymentStatus === PAYMENT_STATUS.FAILURE) {
    return (
      <section aria-labelledby="checkout-step-heading">
        <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">Step 04</p>
        <h2 id="checkout-step-heading" tabIndex={-1} className="mt-2 font-display text-3xl font-light tracking-tight outline-none">
          Payment <span className="italic text-accent">in progress.</span>
        </h2>
        <div className="mt-9">
          <PaymentOutcome
            live="assertive"
            eyebrow="Payment unsuccessful"
            headline="Payment could not be completed."
            message={checkout.paymentMessage}
            actions={
              <>
                <AtelierButton type="button" variant="primary" size="md" onClick={checkout.retryPayment}>
                  <RotateCcw size={14} aria-hidden="true" /> Try Again
                </AtelierButton>
                <AtelierButton type="button" variant="outline" size="md" onClick={checkout.resetPayment}>
                  Change Payment Method
                </AtelierButton>
                <AtelierButton as={Link} to="/cart" variant="outline" size="md">
                  Return to Bag
                </AtelierButton>
              </>
            }
          />
          <p className="mt-5 text-center font-ui text-[11px] text-taupe">
            Your bag, details and delivery choices are all preserved.
          </p>
        </div>
      </section>
    );
  }

  if (checkout.paymentStatus === PAYMENT_STATUS.CANCELLED) {
    return (
      <section aria-labelledby="checkout-step-heading">
        <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">Step 04</p>
        <h2 id="checkout-step-heading" tabIndex={-1} className="mt-2 font-display text-3xl font-light tracking-tight outline-none">
          Payment <span className="italic text-accent">in progress.</span>
        </h2>
        <div className="mt-9">
          <PaymentOutcome
            live="assertive"
            eyebrow="Payment cancelled"
            headline="Payment cancelled."
            message={checkout.paymentMessage}
            actions={
              <>
                <AtelierButton type="button" variant="primary" size="md" onClick={checkout.resetPayment}>
                  Return to Payment
                </AtelierButton>
                <AtelierButton type="button" variant="outline" size="md" onClick={checkout.resetPayment}>
                  Change Method
                </AtelierButton>
                <AtelierButton as={Link} to="/cart" variant="outline" size="md">
                  Return to Bag
                </AtelierButton>
              </>
            }
          />
        </div>
      </section>
    );
  }

  /* ------------------------------ Form ------------------------------ */

  return (
    <section aria-labelledby="checkout-step-heading">
      <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">Step 04</p>
      <h2
        id="checkout-step-heading"
        tabIndex={-1}
        className="mt-2 font-display text-3xl font-light tracking-tight outline-none"
      >
        Complete your <span className="italic text-accent">payment.</span>
      </h2>

      <div className="mt-9 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((method) => {
          const Icon = METHOD_ICONS[method.id];
          const selected = checkout.paymentMethod === method.id;
          return (
            <div key={method.id} className="relative">
              <input
                id={`payment-${method.id}`}
                type="radio"
                name="checkout-payment-method"
                checked={selected}
                onChange={() => checkout.setPaymentMethod(method.id)}
                className="peer sr-only"
              />
              <label
                htmlFor={`payment-${method.id}`}
                className={cn(
                  "flex h-full cursor-pointer items-start gap-3 border bg-surface/20 p-4 transition-colors",
                  "peer-checked:border-ink peer-checked:bg-surface/60",
                  "peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-accent",
                  "hover:border-brass"
                )}
              >
                <Icon size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-ui text-[11px] uppercase tracking-[.16em] text-ink">
                    {method.label}
                  </span>
                  <span className="mt-1 block font-ui text-[10px] leading-relaxed text-taupe">
                    {method.description}
                  </span>
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {methodError && (
        <p role="alert" className="mt-4 font-ui text-[11px] text-accent">
          {methodError}
        </p>
      )}

      <div className="mt-8">
        {!selectedMethod ? (
          <p className="border border-dashed border-mist bg-surface/20 px-5 py-8 text-center font-ui text-[11px] uppercase tracking-[.18em] text-taupe">
            Choose a payment method to continue
          </p>
        ) : selectedMethod.id === "cod" ? (
          <CodPanel />
        ) : (
          <SecureCheckoutPanel method={selectedMethod} />
        )}
      </div>

      {/* ------------------------------ Pay CTA ------------------------------ */}
      <div className="mt-8 border-t border-mist/70 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
              Amount payable
            </p>
            <p className="mt-1 font-display text-3xl font-light tracking-tight text-ink">
              {formatINR(checkout.totals.total)}
            </p>
            <p className="mt-1 font-ui text-[10px] text-taupe">
              {cart.count} {cart.count === 1 ? "piece" : "pieces"} · inclusive of all taxes
              {checkout.totals.codFee > 0 && ` · includes ${formatINR(checkout.totals.codFee)} COD fee`}
            </p>
          </div>
          <AtelierButton
            type="button"
            variant="primary"
            size="lg"
            onClick={handlePay}
          >
            Pay {formatINR(checkout.totals.total)}
          </AtelierButton>
        </div>
        <p className="mt-4 flex items-center gap-2 font-ui text-[10px] text-taupe">
          <ShieldCheck size={12} className="text-accent" aria-hidden="true" />
          Payments are processed securely by Razorpay — card, UPI and bank
          details are entered in the gateway window, never on this site.
        </p>
      </div>
    </section>
  );
});

export default PaymentStep;
