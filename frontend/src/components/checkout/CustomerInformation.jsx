import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCheckout } from "../../context/CheckoutContext";
import { validateCustomer } from "../../utils/checkout";
import CheckoutField, { fieldInputClass } from "./CheckoutField";
import { cn } from "../../utils/cn";

/**
 * Step 1 — Customer.
 *
 * Authenticated customers arrive with their profile prefilled and a quiet
 * "Signed in as …" confirmation; guests enter the same three fields with
 * an explicit reassurance that an account is not required. The Phase 7
 * validation primitives guard every value.
 */
const CustomerInformation = forwardRef(function CustomerInformation(_props, ref) {
  const { user, isAuthenticated } = useAuth();
  const checkout = useCheckout();
  const [errors, setErrors] = useState({});

  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);

  const setField = (field, value) => {
    checkout.updateCustomer({ [field]: value });
    if (errors[field]) setErrors((current) => ({ ...current, [field]: "" }));
  };

  useImperativeHandle(ref, () => ({
    validate() {
      const result = validateCustomer(checkout.customer);
      setErrors(result.errors);
      if (!result.ok) {
        const firstInvalid = ["firstName", "lastName", "email", "phone"].find(
          (field) => result.errors[field]
        );
        const target =
          firstInvalid === "firstName"
            ? firstNameRef
            : firstInvalid === "lastName"
              ? lastNameRef
              : firstInvalid === "email"
                ? emailRef
                : phoneRef;
        target.current?.focus();
      }
      return result.ok;
    },
  }));

  const signedInAs = isAuthenticated && user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : "";

  return (
    <section aria-labelledby="checkout-step-heading">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">
            Step 01
          </p>
          <h2 id="checkout-step-heading" tabIndex={-1} className="mt-2 font-display text-3xl font-light tracking-tight outline-none">
            Your <span className="italic text-accent">details.</span>
          </h2>
        </div>
        {isAuthenticated ? (
          <p className="inline-flex items-center gap-2 border border-mist/80 bg-surface/40 px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            <User size={12} className="text-accent" aria-hidden="true" />
            Signed in as <span className="text-ink">{signedInAs}</span>
            <Link
              to="/account"
              className="ml-1 text-accent underline-offset-2 hover:underline"
            >
              Change account
            </Link>
          </p>
        ) : (
          <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Checking out as a guest ·{" "}
            <Link to="/signin?return=/checkout" className="text-accent underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>

      <p className="mb-8 max-w-md font-ui text-xs leading-relaxed text-taupe">
        {isAuthenticated
          ? "Your profile details are already here — adjust them if this order is for someone else."
          : "No account needed. Your details are only used for this order; you can create an account after your purchase."}
      </p>

      <div className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <CheckoutField
            id="checkout-first-name"
            label="First Name"
            required
            error={errors.firstName}
          >
            <input
              ref={firstNameRef}
              id="checkout-first-name"
              type="text"
              autoComplete="given-name"
              value={checkout.customer.firstName}
              onChange={(event) => setField("firstName", event.target.value)}
              placeholder="e.g. Ananya"
              aria-invalid={Boolean(errors.firstName)}
              className={fieldInputClass(Boolean(errors.firstName))}
            />
          </CheckoutField>

          <CheckoutField
            id="checkout-last-name"
            label="Last Name"
            required
            error={errors.lastName}
          >
            <input
              ref={lastNameRef}
              id="checkout-last-name"
              type="text"
              autoComplete="family-name"
              value={checkout.customer.lastName}
              onChange={(event) => setField("lastName", event.target.value)}
              placeholder="e.g. Sharma"
              aria-invalid={Boolean(errors.lastName)}
              className={fieldInputClass(Boolean(errors.lastName))}
            />
          </CheckoutField>
        </div>

        <CheckoutField
          id="checkout-email"
          label="Email Address"
          required
          error={errors.email}
        >
          <input
            ref={emailRef}
            id="checkout-email"
            type="email"
            autoComplete="email"
            value={checkout.customer.email}
            onChange={(event) => setField("email", event.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            className={fieldInputClass(Boolean(errors.email))}
          />
        </CheckoutField>

        <CheckoutField
          id="checkout-phone"
          label="Mobile Number"
          required
          error={errors.phone}
          hint="10-digit Indian mobile, with or without +91."
        >
          <input
            ref={phoneRef}
            id="checkout-phone"
            type="tel"
            autoComplete="tel"
            value={checkout.customer.phone}
            onChange={(event) => setField("phone", event.target.value)}
            placeholder="+91 98765 43210"
            aria-invalid={Boolean(errors.phone)}
            className={fieldInputClass(Boolean(errors.phone))}
          />
        </CheckoutField>
      </div>

      <p className={cn("mt-8 border-t border-mist/60 pt-5 font-ui text-[11px] leading-relaxed text-taupe")}>
        A confirmation of this order will be sent to the email above.
      </p>
    </section>
  );
});

export default CustomerInformation;
