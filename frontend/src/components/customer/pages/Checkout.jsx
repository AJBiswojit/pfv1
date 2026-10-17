/**
 * PRATIKSHYA FASHION — PHASE 9 · the checkout journey, in the design's language.
 *
 * The design's own `Checkout.jsx` is a 34-line prototype whose note says
 * outright that no order can be placed — it drew a summary and nothing else.
 * What it does contribute is its vocabulary (`.info`, `.checkout__lines`,
 * `.totals`, the `.btn` register), and that vocabulary is used here.
 *
 * The journey itself is this application's, unchanged: the four steps of
 * `CHECKOUT_STEPS`, driven by `CheckoutContext` — customer → delivery →
 * review → payment — with the same validators (`utils/checkout.js`), the same
 * delivery methods and fees (`config/checkoutConfig.js` + the shipping rules),
 * the same payment methods and Razorpay hand-off, the same idempotency
 * (`attemptId`), the same bag-changed guard and the same rule that the bag is
 * cleared ONLY inside the context, after the server confirms the order.
 * Nothing about money, stock, addresses or order state is decided here.
 *
 * The payment step keeps every state the production step has: a method must be
 * chosen before paying, PENDING while the gateway decides, FAILURE with Try
 * Again / Change Method / Return to Bag, CANCELLED with its own way back, and
 * SUCCESS which replaces this route with `/order-success`. No success is ever
 * invented: the ONLY thing that moves the page forward is `completedOrder`,
 * which the context sets from the server's answer.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Banknote,
  Check,
  Clock,
  CreditCard,
  Landmark,
  MapPin,
  Plus,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import AddressModal from '../../../components/account/AddressModal.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useAccount } from '../../../context/AccountContext.jsx';
import { useCart } from '../../../context/CartContext.jsx';
import { useCheckout } from '../../../context/CheckoutContext.jsx';
import {
  CHECKOUT_STEPS,
  COD_FEE,
  DELIVERY_METHODS,
  PAYMENT_METHODS,
} from '../../../config/checkoutConfig.js';
import { readShippingRules } from '../../../config/commerceDefaults.js';
import { PAYMENT_STATUS } from '../../../services/payment/paymentService.js';
import {
  calculateDeliveryFee,
  formatDeliveryEstimate,
  getDeliveryEstimate,
  validateAddress,
  validateCustomer,
} from '../../../utils/checkout.js';
import { formatINR } from '../../../utils/shopping.js';
import { formatPhone } from '../../../utils/validation.js';
import { BagTotals, OfferField, lineTotalFor } from './Cart.jsx';

/**
 * The rail's words, keyed by the application's own step ids. The rail is drawn
 * from `CHECKOUT_STEPS` (see the render below), so a step the configuration
 * gains or loses cannot leave this page's rail out of step with the journey
 * the context actually runs; an id without a word here falls back to the id.
 */
const STEP_LABELS = {
  customer: 'Customer',
  delivery: 'Delivery',
  review: 'Review',
  payment: 'Payment',
};

/* ─────────────────────────────── the page ─────────────────────────────── */

export default function Checkout() {
  const cart = useCart();
  const checkout = useCheckout();
  const navigate = useNavigate();

  const customerRef = useRef(null);
  const deliveryRef = useRef(null);
  const reviewRef = useRef(null);
  const paymentRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Checkout — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  /* A successfully confirmed order (server-verified) hands off to the order
     confirmation page. This is the ONLY hand-off: nothing else navigates. */
  useEffect(() => {
    if (checkout.completedOrder) navigate('/order-success', { replace: true });
  }, [checkout.completedOrder, navigate]);

  const stepIndex = checkout.stepIndex;

  /* Each step opening moves focus to its heading, the production shell's own
     behaviour, for a screen reader arriving at a step it did not ask for. */
  useEffect(() => {
    const heading = panelRef.current?.querySelector('h2');
    heading?.focus?.({ preventScroll: false });
  }, [stepIndex]);

  if (cart.items.length === 0) {
    return (
      <div className="container pf-journey__page">
      <div className="empty">
          <p className="empty__title">Your collection is empty.</p>
          <p>Add something beautiful before continuing to checkout.</p>
          <Button to="/shop">Continue Shopping</Button>
        </div>
      </div>
    );
  }

  const isPaymentStep = stepIndex === CHECKOUT_STEPS.length - 1;

  const handlePrimary = () => {
    if (isPaymentStep) {
      /* The instrument is never collected here: the order is created as
         pending and the secure Razorpay window collects it. */
      paymentRef.current?.pay?.();
      return;
    }
    const stepRef = [customerRef, deliveryRef, reviewRef, paymentRef][stepIndex];
    const valid = stepRef.current?.validate?.() ?? true;
    if (valid) checkout.nextStep();
  };

  const isCod = checkout.paymentMethod === 'cod';
  const primaryLabels = [
    'Continue to Delivery',
    'Continue to Review',
    'Continue to Payment',
    isCod ? 'Place Order' : `Pay ${formatINR(checkout.totals.total)}`,
  ];

  const stepPanels = [
    <CustomerStep key="customer" ref={customerRef} />,
    <DeliveryStep key="delivery" ref={deliveryRef} />,
    <ReviewStep key="review" ref={reviewRef} />,
    <PaymentStep key="payment" ref={paymentRef} />,
  ];

  const bagChangedNotice = isPaymentStep && checkout.bagChanged ? (
    <div className="pf-notice" role="status">
      <p><AlertCircle size={14} aria-hidden="true" />
        Your bag changed since you reviewed your order — please review it again before paying.
      </p>
      <button type="button" onClick={() => checkout.goToStep(2)}>Review Order</button>
    </div>
  ) : null;

  return (
    <div className="container pf-journey__page">
      <header className="pf-head">
        <p className="label">Checkout</p>
        <h1 className="display pf-head__title">Complete your <em>order.</em></h1>
        <p className="pf-head__lead">A few quiet steps between your collection and your door.</p>
      </header>

      <ol className="pf-progress" aria-label="Checkout progress">
        {CHECKOUT_STEPS.map((stepId, index) => {
          const label = STEP_LABELS[stepId] ?? stepId;
          const isCurrent = index === stepIndex;
          const isCompleted = index < stepIndex;
          const reachable = index <= stepIndex;
          return (
            <li key={stepId} className="pf-progress__item">
              <button
                type="button"
                onClick={() => reachable && checkout.goToStep(index)}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className="pf-progress__step"
              >
                <span className={isCompleted ? 'pf-progress__mark is-done' : isCurrent ? 'pf-progress__mark is-now' : 'pf-progress__mark'}>
                  {isCompleted
                    ? <Check size={13} strokeWidth={2} aria-hidden="true" />
                    : <span>{String(index + 1).padStart(2, '0')}</span>}
                </span>
                <span className="pf-progress__label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {bagChangedNotice}

      <div className="pf-journey__grid">
        <JourneySummary totals={checkout.totals} deliveryLabel={checkout.deliveryMethod.label} couponCart={cart} />

        <div className="pf-journey__steps" ref={panelRef}>
          {stepPanels[stepIndex]}

          <nav className="pf-nav" aria-label="Checkout navigation">
            <Button variant="ghost" onClick={checkout.backStep} disabled={stepIndex === 0}>Back</Button>
            <Button onClick={handlePrimary} disabled={checkout.paymentInProgress}>
              {primaryLabels[stepIndex]}
            </Button>
          </nav>
        </div>
      </div>

      {/* Mobile: the running total and the way forward. */}
      <div className="pf-bar">
        <div className="pf-bar__total">
          <span className="pf-bar__label">Total</span>
          <strong>{formatINR(checkout.totals.total)}</strong>
        </div>
        <Button onClick={handlePrimary} disabled={checkout.paymentInProgress}>
          {primaryLabels[stepIndex]}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────────── the summary ─────────────────────────────
   The design's `.checkout__lines` for the pieces and the design's `.totals`
   for the ledger (shared with the bag page — one implementation of both), with
   the delivery method named, the free-delivery remainder, the total, what was
   saved and the application's own offer field. On small screens the panel is
   folded away above the steps, as the production summary is, so the total is
   in reach without crowding the forms. */

function JourneySummary({ totals, deliveryLabel, couponCart }) {
  const cart = useCart();
  const [open, setOpen] = useState(false);

  return (
    <aside className="pf-summary pf-summary--journey" aria-label="Order summary">
      <button
        type="button"
        className="pf-summary__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="pf-journey-summary"
      >
        <span className="label">Order summary</span>
        <strong>{formatINR(totals.total)}</strong>
      </button>

      <div className="pf-summary__body" id="pf-journey-summary" data-open={open ? 'true' : 'false'}>
        <h2 className="pf-summary__title">Order Summary</h2>
        <ul className="checkout__lines">
          {cart.items.map((item) => (
            <li key={item.id}>
              {normalisePlate(item) ? <img src={normalisePlate(item)} alt="" loading="lazy" /> : <span />}
              <span>
                {item.product?.name}
                <small>{[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'} · Qty {item.quantity}</small>
              </span>
              {/* The design's line is a four-cell grid (`56px 1fr auto auto`);
                  the quantity already reads in the variant line above, so the
                  third cell stays empty rather than saying it twice — and the
                  figure stays flush right, where the design put it. */}
              <span aria-hidden="true" />
              <strong>{formatINR(lineTotalFor(item))}</strong>
            </li>
          ))}
        </ul>
        <BagTotals totals={totals} deliveryLabel={deliveryLabel} />
        <OfferField cart={couponCart} />
      </div>
    </aside>
  );
}

/** The line's plate through the application's one media resolver. */
function normalisePlate(item) {
  const reference = item?.product?.image;
  return typeof reference === 'string' ? reference : '';
}

/* ─────────────────────────── step 01 · customer ─────────────────────────── */

const CustomerStep = forwardRef(function CustomerStep(_props, ref) {
  const checkout = useCheckout();
  const { user, isAuthenticated } = useAuth();
  const [errors, setErrors] = useState({});
  const fields = useRef({});

  const setField = (name, value) => {
    checkout.updateCustomer({ [name]: value });
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }));
  };

  useImperativeHandle(ref, () => ({
    validate() {
      const result = validateCustomer(checkout.customer);
      setErrors(result.errors);
      if (!result.ok) {
        const firstInvalid = ['firstName', 'lastName', 'email', 'phone'].find((field) => result.errors[field]);
        fields.current[firstInvalid]?.focus();
      }
      return result.ok;
    },
  }));

  const signedInAs = isAuthenticated && user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : '';

  return (
    <section className="pf-step" aria-labelledby="checkout-step-heading">
      <p className="label">Step 01</p>
      <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
        Your <em>details.</em>
      </h2>

      {/* `/checkout` is guarded by the application's own `ProtectedRoute`, so
          this branch is not reachable through the route table. It is written to
          stay honest anyway: it never promises a checkout without an account,
          and it sends the visitor where the guard sends them. */}
      {isAuthenticated ? (
        <p className="pf-step__who">
          Signed in as <strong>{signedInAs}</strong>
          <Link to="/account">Change account</Link>
        </p>
      ) : (
        <p className="pf-step__who">
          Signed out
          <Link to={`/signin?returnTo=${encodeURIComponent('/checkout')}`}>Sign in to continue</Link>
        </p>
      )}

      <p className="pf-step__lead">
        {isAuthenticated
          ? 'Your profile details are already here — adjust them if this order is for someone else.'
          : 'Checkout needs a signed-in account. Sign in and we will bring you straight back here.'}
      </p>

      <div className="form pf-form">
        <div className="pf-form__row">
          <label>
            <span className="pf-lab">First name <span className="pf-req">*</span></span>
            <input
              ref={(node) => { fields.current.firstName = node; }}
              value={checkout.customer.firstName}
              onChange={(event) => setField('firstName', event.target.value)}
              autoComplete="given-name"
              placeholder="e.g. Ananya"
              aria-invalid={Boolean(errors.firstName)}
            />
            {errors.firstName && <span className="form__err" role="alert">{errors.firstName}</span>}
          </label>
          <label>
            <span className="pf-lab">Last name <span className="pf-req">*</span></span>
            <input
              ref={(node) => { fields.current.lastName = node; }}
              value={checkout.customer.lastName}
              onChange={(event) => setField('lastName', event.target.value)}
              autoComplete="family-name"
              placeholder="e.g. Sharma"
              aria-invalid={Boolean(errors.lastName)}
            />
            {errors.lastName && <span className="form__err" role="alert">{errors.lastName}</span>}
          </label>
        </div>

        <label>
          <span className="pf-lab">Email address <span className="pf-req">*</span></span>
          <input
            ref={(node) => { fields.current.email = node; }}
            type="email"
            value={checkout.customer.email}
            onChange={(event) => setField('email', event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <span className="form__err" role="alert">{errors.email}</span>}
        </label>

        <label>
          <span className="pf-lab">Mobile number <span className="pf-req">*</span></span>
          <input
            ref={(node) => { fields.current.phone = node; }}
            type="tel"
            value={checkout.customer.phone}
            onChange={(event) => setField('phone', event.target.value)}
            autoComplete="tel"
            placeholder="+91 98765 43210"
            aria-invalid={Boolean(errors.phone)}
          />
          {errors.phone
            ? <span className="form__err" role="alert">{errors.phone}</span>
            : <span className="pf-hint">10-digit Indian mobile, with or without +91.</span>}
        </label>
      </div>

      <p className="pf-step__foot">A confirmation of this order will be sent to the email above.</p>
    </section>
  );
});

/* ─────────────────────────── step 02 · delivery ─────────────────────────── */

const DeliveryStep = forwardRef(function DeliveryStep(_props, ref) {
  const { isAuthenticated } = useAuth();
  const account = useAccount();
  const checkout = useCheckout();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressError, setAddressError] = useState('');

  const payable = checkout.totals.total - checkout.totals.shipping - checkout.totals.codFee;
  const { freeShippingThreshold } = readShippingRules();
  const feeFor = (method) => calculateDeliveryFee(method.id, payable);
  const estimateFor = (method) => formatDeliveryEstimate(getDeliveryEstimate(method.id));

  const openAddAddress = () => { setEditingAddress(null); setAddressError(''); setModalOpen(true); };
  const openEditAddress = (address) => { setEditingAddress(address); setAddressError(''); setModalOpen(true); };

  /* The production step's own hand-off: a saved address for a signed-in
     customer (selected synchronously when it was just created), the guest
     address otherwise — through the account context's own address book. */
  const handleSaveAddress = (formData) => {
    if (isAuthenticated) {
      if (editingAddress?.id) {
        account.updateAddress(editingAddress.id, formData);
      } else {
        const result = account.addAddress(formData);
        if (result.ok && result.addressId) {
          checkout.selectAccountAddress(result.addressId, {
            id: result.addressId,
            fullName: formData.fullName,
            phone: formData.phone,
            addressLine: formData.addressLine,
            landmark: formData.landmark ?? '',
            city: formData.city,
            state: formData.state,
            pincode: formData.pincode,
            type: formData.type ?? 'Home',
            isDefault: Boolean(formData.isDefault) || account.addresses.length === 0,
          });
        }
      }
    } else {
      checkout.setGuestAddress(formData);
    }
    setModalOpen(false);
  };

  useImperativeHandle(ref, () => ({
    validate() {
      if (!checkout.address) {
        setAddressError('Please choose a delivery address before continuing.');
        return false;
      }
      if (!validateAddress(checkout.address).ok) {
        setAddressError('That address needs a little attention — please review it.');
        return false;
      }
      setAddressError('');
      return true;
    },
  }));

  return (
    <section className="pf-step" aria-labelledby="checkout-step-heading">
      <p className="label">Step 02</p>
      <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
        Delivery <em>arrangements.</em>
      </h2>

      <div className="pf-block">
        <div className="pf-block__head">
          <div>
            <h3>Delivery address</h3>
            <p>{isAuthenticated
              ? 'Choose from your saved addresses, or add another.'
              : 'Tell us where your pieces should arrive.'}</p>
          </div>
          <Button variant="ghost" onClick={openAddAddress}><Plus size={12} aria-hidden="true" /> Add Address</Button>
        </div>

        {addressError && <p className="form__err pf-alert" role="alert">{addressError}</p>}

        {isAuthenticated && account.addresses.length > 0 ? (
          <div className="pf-options" role="radiogroup" aria-label="Saved delivery addresses">
            {account.addresses.map((address) => (
              <label
                key={address.id}
                className={checkout.addressId === address.id ? 'pf-option is-selected' : 'pf-option'}
              >
                <input
                  type="radio"
                  name="pf-address"
                  checked={checkout.addressId === address.id}
                  onChange={() => checkout.selectAccountAddress(address.id)}
                />
                <span className="pf-option__body">
                  <span className="pf-option__meta">
                    <span className="pf-chip">{address.type || 'Home'}</span>
                    {address.isDefault && <span className="pf-chip is-quiet">Primary</span>}
                  </span>
                  <strong>{address.fullName}</strong>
                  <span className="pf-option__line">
                    {address.addressLine}{address.landmark ? `, ${address.landmark}` : ''}
                  </span>
                  <span className="pf-option__line">{address.city}, {address.state} — {address.pincode}</span>
                  <span className="pf-option__quiet">{formatPhone(address.phone)}</span>
                </span>
              </label>
            ))}
          </div>
        ) : checkout.address ? (
          <div className="pf-panel is-selected">
            <p className="pf-panel__eyebrow"><MapPin size={12} aria-hidden="true" /> Delivery address</p>
            <p className="pf-panel__name">{checkout.address.fullName}</p>
            <p className="pf-panel__line">
              {checkout.address.addressLine}{checkout.address.landmark ? `, ${checkout.address.landmark}` : ''}
            </p>
            <p className="pf-panel__line">
              {checkout.address.city}, {checkout.address.state} — {checkout.address.pincode}
            </p>
            <p className="pf-panel__quiet">{formatPhone(checkout.address.phone)}</p>
            <div className="pf-panel__actions">
              <button type="button" className="pf-quiet" onClick={() => openEditAddress(checkout.address)}>Edit</button>
              <button type="button" className="pf-quiet" onClick={openAddAddress}>Change</button>
            </div>
          </div>
        ) : (
          <div className="pf-empty">
            <p>{isAuthenticated ? 'No saved address yet' : 'Add a delivery address to continue'}</p>
            <Button onClick={openAddAddress}><Plus size={14} aria-hidden="true" /> Add Delivery Address</Button>
          </div>
        )}
      </div>

      <div className="pf-block">
        <div className="pf-block__head">
          <div>
            <h3>Delivery method</h3>
            <p>
              Normal delivery is always complimentary. Standard delivery is free above{' '}
              {formatINR(freeShippingThreshold)}.
            </p>
          </div>
        </div>

        <div className="pf-options" role="radiogroup" aria-label="Delivery method">
          {DELIVERY_METHODS.map((method) => {
            const fee = feeFor(method);
            const selected = checkout.deliveryMethod === method.id;
            const Icon = method.id === 'express' ? Clock : Truck;
            return (
              <label key={method.id} className={selected ? 'pf-option is-selected' : 'pf-option'}>
                <input
                  type="radio"
                  name="pf-delivery"
                  checked={selected}
                  onChange={() => checkout.setDeliveryMethod(method.id)}
                />
                <span className="pf-option__body">
                  <span className="pf-option__top">
                    <span className="pf-option__title"><Icon size={16} strokeWidth={1.5} aria-hidden="true" /> {method.label}</span>
                    <span className={fee === 0 ? 'pf-option__price is-free' : 'pf-option__price'}>
                      {fee === 0 ? 'Complimentary' : formatINR(fee)}
                    </span>
                  </span>
                  <span className="pf-option__line">{method.caption}</span>
                  <span className="pf-option__quiet">Estimated delivery: {estimateFor(method)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <AddressModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveAddress}
        initialAddress={editingAddress}
      />
    </section>
  );
});

/* ──────────────────────────── step 03 · review ──────────────────────────── */

function addressLines(address) {
  if (!address) return [];
  return [
    address.addressLine + (address.landmark ? `, ${address.landmark}` : ''),
    `${address.city}, ${address.state} — ${address.pincode}`,
  ];
}

const ReviewStep = forwardRef(function ReviewStep(_props, ref) {
  const cart = useCart();
  const checkout = useCheckout();

  useImperativeHandle(ref, () => ({
    validate() {
      return cart.items.length > 0;
    },
  }));

  return (
    <section className="pf-step" aria-labelledby="checkout-step-heading">
      <p className="label">Step 03</p>
      <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
        Review your <em>order.</em>
      </h2>

      <ul className="checkout__lines pf-review__lines">
        {cart.items.map((item) => (
          <li key={item.id}>
            {normalisePlate(item) ? <img src={normalisePlate(item)} alt="" loading="lazy" /> : <span />}
            <span>
              {item.product?.name}
              <small>{[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'}</small>
            </span>
            <span className="pf-summary__qty">Qty {item.quantity}</span>
            <strong>{formatINR(lineTotalFor(item))}</strong>
          </li>
        ))}
      </ul>

      <div className="pf-review__edit">
        <Button to="/cart" variant="ghost">Edit Bag</Button>
      </div>

      <div className="pf-review__cols">
        <div className="pf-panel">
          <p className="pf-panel__eyebrow">Delivering to</p>
          <p className="pf-panel__name">{checkout.address?.fullName}</p>
          {addressLines(checkout.address).map((line) => <p className="pf-panel__line" key={line}>{line}</p>)}
          <p className="pf-panel__quiet">{formatPhone(checkout.address?.phone)}</p>
        </div>
        <div className="pf-panel">
          <p className="pf-panel__eyebrow">Delivery lane</p>
          <p className="pf-panel__name">{checkout.deliveryMethod.label}</p>
          <p className="pf-panel__line">
            {checkout.deliveryMethod.caption} · estimated {checkout.deliveryEstimate}
          </p>
          <p className="pf-panel__line">
            {checkout.totals.shipping === 0
              ? 'Complimentary delivery'
              : `${checkout.deliveryMethod.label}: ${formatINR(checkout.totals.shipping)}`}
          </p>
        </div>
      </div>

      <p className="pf-step__foot">
        Once you continue, you will be asked to complete payment. Your collection stays
        in your bag until the payment is confirmed.
      </p>
    </section>
  );
});

/* ─────────────────────────── step 04 · payment ─────────────────────────── */

/** The production step's own register of method marks. */
const METHOD_ICONS = {
  upi: QrCode,
  card: CreditCard,
  netbanking: Landmark,
  cod: Banknote,
};

/** The production step's own words for each online method. */
const METHOD_BLURB = {
  upi: 'Complete your UPI payment in the Razorpay window — choose your UPI app or scan the QR shown there.',
  card: 'Enter your card details in the Razorpay window. Cards are processed by the payment gateway; nothing is stored on this site.',
  netbanking: 'Choose your bank inside the Razorpay window and complete your bank sign-in to approve the payment.',
};

const PaymentStep = forwardRef(function PaymentStep(_props, ref) {
  const cart = useCart();
  const checkout = useCheckout();
  const [methodError, setMethodError] = useState('');

  /* Starts the canonical payment flow. For online methods the backend creates
     the pending order + Razorpay session and the hosted checkout collects the
     instrument — there is no instrument form here, only that a method was
     chosen. COD places the order directly, exactly as production does. */
  const handlePay = () => {
    if (!checkout.paymentMethod) {
      setMethodError('Please choose a payment method first.');
      return false;
    }
    setMethodError('');
    checkout.startPayment();
    return true;
  };

  useImperativeHandle(ref, () => ({ pay: handlePay }));

  const selectedMethod = PAYMENT_METHODS.find((method) => method.id === checkout.paymentMethod);

  if (checkout.paymentStatus === PAYMENT_STATUS.PENDING) {
    return (
      <section className="pf-step" aria-labelledby="checkout-step-heading">
        <p className="label">Step 04</p>
        <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
          Payment <em>in progress.</em>
        </h2>
        <div className="pf-outcome" role="status" aria-live="polite">
          <p className="pf-outcome__eyebrow">Verifying your payment</p>
          <span className="pf-outcome__pulse" aria-hidden="true" />
          <p className="pf-outcome__body">
            Please wait — your payment is being confirmed. Do not close this window.
          </p>
          <button type="button" className="pf-quiet" onClick={checkout.cancelActivePayment}>Cancel payment</button>
        </div>
      </section>
    );
  }

  if (checkout.paymentStatus === PAYMENT_STATUS.FAILURE) {
    return (
      <section className="pf-step" aria-labelledby="checkout-step-heading">
        <p className="label">Step 04</p>
        <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
          Payment <em>unsuccessful.</em>
        </h2>
        <div className="pf-outcome" role="alert">
          <p className="pf-outcome__eyebrow">Payment unsuccessful</p>
          <p className="pf-outcome__title">Payment could not be completed.</p>
          <p className="pf-outcome__body">{checkout.paymentMessage}</p>
          <div className="pf-outcome__actions">
            <Button onClick={checkout.retryPayment}><RotateCcw size={14} aria-hidden="true" /> Try Again</Button>
            <Button variant="ghost" onClick={checkout.resetPayment}>Change Payment Method</Button>
            <Button variant="ghost" to="/cart">Return to Bag</Button>
          </div>
        </div>
        <p className="pf-outcome__note">Your bag, details and delivery choices are all preserved.</p>
      </section>
    );
  }

  if (checkout.paymentStatus === PAYMENT_STATUS.CANCELLED) {
    return (
      <section className="pf-step" aria-labelledby="checkout-step-heading">
        <p className="label">Step 04</p>
        <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
          Payment <em>cancelled.</em>
        </h2>
        <div className="pf-outcome" role="alert">
          <p className="pf-outcome__eyebrow">Payment cancelled</p>
          <p className="pf-outcome__title">Payment cancelled.</p>
          <p className="pf-outcome__body">{checkout.paymentMessage}</p>
          <div className="pf-outcome__actions">
            <Button onClick={checkout.resetPayment}>Return to Payment</Button>
            <Button variant="ghost" onClick={checkout.resetPayment}>Change Method</Button>
            <Button variant="ghost" to="/cart">Return to Bag</Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pf-step" aria-labelledby="checkout-step-heading">
      <p className="label">Step 04</p>
      <h2 id="checkout-step-heading" tabIndex={-1} className="display pf-step__title" data-step-heading>
        Complete your <em>payment.</em>
      </h2>

      <div className="pf-options pf-options--pay" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((method) => {
          const selected = checkout.paymentMethod === method.id;
          return (
            <label key={method.id} className={selected ? 'pf-option is-selected' : 'pf-option'}>
              <input
                type="radio"
                name="pf-payment"
                checked={selected}
                onChange={() => checkout.setPaymentMethod(method.id)}
              />
              <span className="pf-option__body">
                <span className="pf-option__head">
                  {(() => { const Icon = METHOD_ICONS[method.id] ?? ShieldCheck; return <Icon size={17} strokeWidth={1.5} className="pf-option__icon" aria-hidden="true" />; })()}
                  <span className="pf-option__title">{method.label}</span>
                </span>
                <span className="pf-option__line">{METHOD_BLURB[method.id] ?? method.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      {methodError && <p className="form__err pf-alert" role="alert">{methodError}</p>}

      <div className="pf-paypanel">
        {!selectedMethod ? (
          <p className="pf-paypanel__empty">Choose a payment method to continue</p>
        ) : selectedMethod.id === 'cod' ? (
          <div className="pf-panel">
            <p className="pf-panel__eyebrow">Cash on Delivery</p>
            <p className="pf-panel__line">
              Pay in cash when your order arrives at your door. A small handling fee of{' '}
              {formatINR(COD_FEE)} is added to this order — it is already reflected in the total.
            </p>
            <p className="pf-panel__quiet">Please keep the exact amount ready for the delivery partner.</p>
          </div>
        ) : (
          <div className="pf-panel">
            <p className="pf-panel__eyebrow"><ShieldCheck size={13} aria-hidden="true" /> Secure Razorpay checkout</p>
            <p className="pf-panel__line">{METHOD_BLURB[selectedMethod.id]}</p>
            <p className="pf-panel__quiet">
              Your order is saved as pending first, then the secure payment window opens. If you close
              it, nothing is charged — you can retry the same payment any time.
            </p>
          </div>
        )}
      </div>

      <div className="pf-pay">
        <div>
          <p className="pf-pay__label">Amount payable</p>
          <p className="pf-pay__total">{formatINR(checkout.totals.total)}</p>
          <p className="pf-pay__meta">
            {cart.count} {cart.count === 1 ? 'piece' : 'pieces'} · inclusive of all taxes
            {checkout.totals.codFee > 0 && ` · includes ${formatINR(checkout.totals.codFee)} COD fee`}
          </p>
        </div>
        <Button onClick={handlePay}>
          {checkout.paymentMethod === 'cod' ? 'Place Order' : `Pay ${formatINR(checkout.totals.total)}`}
        </Button>
      </div>

      <p className="pf-step__foot">
        Payments are processed securely by Razorpay — card, UPI and bank details are entered
        in the gateway window, never on this site.
      </p>
    </section>
  );
});

/* Kept for parity with the production step's own exports. */
export { CustomerStep, DeliveryStep, PaymentStep, ReviewStep };
