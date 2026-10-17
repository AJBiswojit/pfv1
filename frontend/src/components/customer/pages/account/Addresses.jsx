/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.3 — the addresses screen, as a page of
 * the design.
 *
 * The production screen is `pages/account/AccountAddresses.jsx`: the customer's
 * own delivery book — every address the account holds, the default one marked,
 * each with Edit, Delete and (while it is not the default) Set as Default, the
 * `Add New Address` action that opens the production `AddressModal`, and the
 * feedback line filled by the account context's own answer. This page keeps every
 * one of those decisions where they are and changes only the room they stand in:
 *
 *   · it is drawn out of the design's own register — the shared frame, `.label`,
 *     `.display`, the `.empty` block, the port's `pf-chip` register for the
 *     address type, and the card declared for this screen in `customer.account.css`
 *     (the design drew tiles for `/account`, not address cards, and this file adds
 *     no token, colour or radius of its own);
 *   · every mutation goes through `useAccount()`: `addAddress`, `updateAddress`,
 *     `deleteAddress` and `setDefaultAddress`, which is what the production screen
 *     calls. The page never writes a local copy of the list, never marks a card
 *     default on its own, and never claims a save happened:
 *       – the modal is closed only when the context answered `ok`,
 *       – the feedback line is the context's own `message` (so a failed request
 *         shows the failure, and a 401 shows the context's own sign-in sentence),
 *       – the default marker is the record's own `isDefault`, as the server
 *         returned it;
 *   · the form the modal renders is the SAME component the production screen (and
 *     this port's checkout, pinned in `customerCheckoutPage.test.js`) renders:
 *     `components/account/AddressModal.jsx`, with its own field rules — required
 *     full name, required 10-digit mobile, required street, required city, state
 *     and 6-digit PIN — untouched;
 *   · the list is not drawn as an empty book until the account read has answered:
 *     `isLoading && !addresses.length` draws the design's loading block and
 *     `loadError && !addresses.length` names the failure and offers the way back —
 *     the same two conditions the overview applies, and the reason Stage 2.2's
 *     context fix exists ("never a fabricated empty account").
 *
 * One deliberate, reported difference from the production screen: deleting an
 * address is asked about first. Production removes it on the single click; this
 * stage's own requirement is that an accidental deletion be prevented, and the
 * application's only existing confirmation pattern is
 * `components/orders/ConfirmDialog.jsx` — the dialog production's own `OrderDetail`
 * uses for the deliberate, irreversible movements. No second dialog was invented
 * and no other action gained friction: changing the default stays the one explicit
 * click production gives it, and it is never applied optimistically.
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import AddressModal from '../../../../components/account/AddressModal.jsx';
import ConfirmDialog from '../../../../components/orders/ConfirmDialog.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';

/* The tab title is the production screen's own, restored on unmount. */
const ADDRESSES_TITLE = 'Addresses — PRATIKSHYA FASHION';
/* Production clears its feedback after three and a half seconds; so does this. */
const FEEDBACK_MS = 3500;

export default function Addresses() {
  const {
    addresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    isLoading,
    loadError,
    loadErrorStatus,
  } = useAccount();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  /* The address a confirmed removal is about — never the removal itself: nothing
     is deleted until the customer answers the dialog. */
  const [pendingRemoval, setPendingRemoval] = useState(null);

  useEffect(() => {
    const previous = document.title;
    document.title = ADDRESSES_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleOpenAdd = () => {
    setEditingAddress(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (address) => {
    setEditingAddress(address);
    setModalOpen(true);
  };

  /* The backend mutation is awaited — its response decides the outcome, and the
     modal closes only on an answer that says the address was stored. */
  const handleSave = async (addressData) => {
    setIsSaving(true);
    const result = editingAddress?.id
      ? await updateAddress(editingAddress.id, addressData)
      : await addAddress(addressData);
    setIsSaving(false);
    setFeedback({ ok: result.ok, message: result.message });
    if (result.ok) setModalOpen(false);
  };

  const handleConfirmRemoval = async () => {
    const address = pendingRemoval;
    setPendingRemoval(null);
    if (!address) return;
    const result = await deleteAddress(address.id);
    setFeedback({ ok: result.ok, message: result.message });
  };

  const handleSetDefault = async (id) => {
    const result = await setDefaultAddress(id);
    setFeedback({ ok: result.ok, message: result.message });
  };

  const accountLoading = isLoading && !addresses.length;
  const accountFailed = Boolean(loadError) && !addresses.length;

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Saved Addresses' }]}
      label="Your account"
      title="Saved Addresses"
    >
      <p className="info__lead pf-account__lead">
        Manage your primary residence, work locations, and celebration delivery addresses.
      </p>

      <section className="pf-account__section" aria-label="Saved addresses">
        <header className="shop__head">
          <p className="label">Delivery book</p>
          <h2 className="display shop__title">Your saved <em>addresses</em></h2>
          <Button onClick={handleOpenAdd}>Add New Address</Button>
        </header>

        {feedback ? (
          <p className={feedback.ok ? 'form__note' : 'form__err pf-alert'} role="status">
            {feedback.message}
          </p>
        ) : null}

        {accountLoading ? (
          <div className="empty" aria-busy="true" aria-label="Loading your addresses">
            <p className="empty__title">Gathering your addresses&hellip;</p>
          </div>
        ) : accountFailed ? (
          <AddressesUnavailable status={loadErrorStatus} message={loadError} />
        ) : addresses.length ? (
          <ul className="pf-account__addresses">
            {addresses.map((address) => (
              <li
                key={address.id}
                className={address.isDefault ? 'pf-account__address is-default' : 'pf-account__address'}
              >
                <div className="pf-account__address-top">
                  {/* The record's own type, or nothing: no default is invented. */}
                  {address.type ? <span className="pf-chip">{address.type}</span> : null}
                  {address.isDefault ? (
                    <span className="pf-account__badge">
                      <Check size={12} strokeWidth={2} aria-hidden="true" /> Default Address
                    </span>
                  ) : null}
                </div>

                <p className="pf-account__address-name">{address.fullName}</p>
                <p className="pf-account__address-line">{address.addressLine}</p>
                {address.landmark ? (
                  <p className="pf-account__address-line">Landmark: {address.landmark}</p>
                ) : null}
                <p className="pf-account__address-line">{address.city}, {address.state} — {address.pincode}</p>
                <p className="pf-account__address-line">Phone: {address.phone}</p>

                <div className="pf-account__address-acts">
                  <button type="button" className="pf-account__act" onClick={() => handleOpenEdit(address)}>
                    Edit
                  </button>
                  <button type="button" className="pf-account__act" onClick={() => setPendingRemoval(address)}>
                    Delete
                  </button>
                  {address.isDefault ? null : (
                    <button
                      type="button"
                      className="pf-account__act is-accent"
                      onClick={() => handleSetDefault(address.id)}
                    >
                      Set as Default
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p className="empty__title">No saved addresses yet.</p>
            <p>Save your shipping and residence addresses for an effortless celebration checkout experience.</p>
            <Button onClick={handleOpenAdd}>Add Your First Address</Button>
          </div>
        )}
      </section>

      {/* The production modal, unchanged: its own fields, its own validation, its
          own saving gate. The page only hands it the accounting. */}
      <AddressModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialAddress={editingAddress}
        isSaving={isSaving}
      />

      {/* The application's existing confirmation pattern, and nothing new. */}
      <ConfirmDialog
        isOpen={Boolean(pendingRemoval)}
        title="Remove this address?"
        description={
          pendingRemoval
            ? `Are you sure you want to remove the address for ${pendingRemoval.fullName}? It will be deleted from your delivery book.`
            : ''
        }
        confirmLabel="Remove Address"
        cancelLabel="Keep Address"
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </AccountFrame>
  );
}

/* A failed account read is named as one, on the same rule the overview uses: a
   lapsed session (401/403) is offered the way back, anything else states the
   read's own message. There is no retry button because the account context
   exposes no reload — and this page invents no handler of its own. */

function AddressesUnavailable({ status, message }) {
  const lapsed = status === 401 || status === 403;
  return (
    <div className="empty" role="alert">
      <p className="empty__title">
        {lapsed ? 'Please sign in again to see your account.' : 'We could not load your account right now.'}
      </p>
      {!lapsed && message ? <p>{message}</p> : null}
      {lapsed ? <Button to="/signin?returnTo=%2Faccount%2Faddresses">Sign in</Button> : null}
    </div>
  );
}
