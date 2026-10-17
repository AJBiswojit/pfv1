/**
 * PRATIKSHYA FASHION — PHASE 12 · the Share & Earn screen, as a page of the design.
 *
 * The production screen is `pages/account/InstagramRewards.jsx`. This page keeps its
 * services, rules and wording, and changes the room and the states:
 *
 *   · submissions are read with `apiCustomerGetInstagramRewards` and a claim is sent
 *     with `apiCustomerSubmitInstagramReward`. Both are the production services;
 *     the server decides the outcome, approval and the coupon. The page shows the
 *     status the server returned — it never grants, approves or prices a reward;
 *   · the eligible orders come from the order context, with production's rule
 *     (PAID, or a delivered/confirmed/shipped status). A non-eligible order is not
 *     offered; an order that already has a pending or approved claim is listed but
 *     not selectable;
 *   · a failed read is named as failed and can be retried; an empty history is said
 *     to be empty, not shown as a loading spinner;
 *   · the copy button reports "Copied" only once the clipboard write has succeeded;
 *   · the reward percentage is NOT printed as a fixed number. Production hard-coded a
 *     10% default that its own code never displayed; the server's coupon is the only
 *     source of a discount, and it is shown as the server sent it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import {
  apiCustomerGetInstagramRewards,
  apiCustomerSubmitInstagramReward,
} from '../../../../services/api/instagramRewardsApi.js';

const REWARDS_TITLE = 'Share & Earn — PRATIKSHYA FASHION';
const COPIED_MS = 2000;
const QUALIFYING_STATUSES = ['DELIVERED', 'COMPLETED', 'ORDER_CONFIRMED', 'SHIPPED', 'DISPATCHED'];
const STATUS_LABEL = { APPROVED: 'Approved', PENDING: 'Under Review', REJECTED: 'Rejected' };

function formatDate(value) {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(value);
  }
}

const isQualifying = (order) => {
  const payment = (order.payment_status || order.paymentStatus || '').toUpperCase();
  const status = (order.status || '').toUpperCase();
  return payment === 'PAID' || QUALIFYING_STATUSES.includes(status);
};

export default function InstagramRewards() {
  const { user } = useAuth();
  const { orders, isLoadingOrders } = useOrder();

  const [submissions, setSubmissions] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [instagramUsername, setInstagramUsername] = useState('');
  const [instagramPostUrl, setInstagramPostUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const copiedTimer = useRef(null);

  const fetchSubmissions = useCallback(async () => {
    setIsLoadingSubmissions(true);
    const result = await apiCustomerGetInstagramRewards({ page: 1, limit: 50 });
    setIsLoadingSubmissions(false);
    if (result.ok) {
      setSubmissions(result.items ?? []);
      setListError(null);
    } else {
      setListError(result.error ?? 'Could not load your reward submissions.');
    }
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = REWARDS_TITLE;
    fetchSubmissions();
    return () => {
      document.title = previous;
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [fetchSubmissions]);

  /* Orders that already have a pending or approved claim cannot be claimed again. */
  const claimedOrderIds = useMemo(
    () => new Set(submissions.filter((s) => s.status === 'PENDING' || s.status === 'APPROVED').map((s) => s.orderId)),
    [submissions],
  );
  const eligibleOrders = useMemo(() => (orders ?? []).filter(isQualifying), [orders]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!selectedOrderId) {
      setFormError('Please select an eligible purchase order.');
      return;
    }
    if (!instagramUsername.trim()) {
      setFormError('Please enter your Instagram username.');
      return;
    }

    setIsSubmitting(true);
    const result = await apiCustomerSubmitInstagramReward({
      orderId: selectedOrderId,
      instagramUsername: instagramUsername.trim(),
      instagramPostUrl: instagramPostUrl.trim() || undefined,
    });
    setIsSubmitting(false);

    if (result.ok) {
      setSuccessMsg('Reward request submitted successfully! Our team will verify your post.');
      setSelectedOrderId('');
      setInstagramUsername('');
      setInstagramPostUrl('');
      fetchSubmissions();
    } else {
      setFormError(result.error || 'Failed to submit reward request. Please try again.');
    }
  };

  const handleCopy = async (code) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      setFormError('The code could not be copied. Select it and copy it by hand.');
      return;
    }
    setCopiedCode(code);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedCode(null), COPIED_MS);
  };

  const accountName = `${user?.fullName || user?.full_name || 'Authenticated Customer'}${user?.email ? ` (${user.email})` : ''}`;

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Share & Earn' }]}
      label="Loyalty rewards"
      title="Share & earn"
    >
      <p className="info__lead pf-account__lead">
        Style your Pratikshya Fashion pieces, share a photo or video, and claim a personal discount coupon on your next order.
      </p>

      <section className="pf-account__section" aria-label="How to claim your reward">
        <header className="shop__head">
          <p className="label">How it works</p>
          <h2 className="display shop__title">How to claim <em>your reward</em></h2>
        </header>
        <ol className="pf-account__steps">
          <li>Purchase a Pratikshya Fashion product.</li>
          <li>Wear and style your product.</li>
          <li>Post your photo or video on social media or share it with us.</li>
          <li>Tag the official <strong>@pratikshyafashion</strong> account.</li>
          <li>Submit your handle and order information below.</li>
          <li>Our team will verify your post.</li>
          <li>Once approved, you will receive a discount coupon for your next purchase.</li>
        </ol>
      </section>

      <section className="pf-account__section" aria-label="Submit your post">
        <header className="shop__head">
          <p className="label">Submit</p>
          <h2 className="display shop__title">Submit your <em>post</em></h2>
        </header>
        <p className="pf-hint">
          Enter your details below. Once verified by our team, your personal discount coupon will be issued automatically.
        </p>

        {successMsg ? <p className="form__note" role="status">{successMsg}</p> : null}
        {formError ? <p className="form__err pf-alert" role="alert">{formError}</p> : null}

        <form className="form pf-form" onSubmit={handleSubmit} noValidate>
          <label className="pf-form__row">
            <span className="pf-lab">Account name</span>
            <input type="text" value={accountName} disabled />
          </label>

          <label className="pf-form__row">
            <span className="pf-lab">Qualifying purchase order *</span>
            <select
              name="order"
              value={selectedOrderId}
              onChange={(event) => setSelectedOrderId(event.target.value)}
              disabled={isLoadingOrders || isSubmitting}
            >
              <option value="">-- Select an eligible order --</option>
              {eligibleOrders.map((order) => {
                const claimed = claimedOrderIds.has(order.id);
                return (
                  <option key={order.id} value={order.id} disabled={claimed}>
                    #{order.order_number || order.orderNumber || String(order.id).slice(0, 8)} -{' '}
                    {formatDate(order.created_at || order.createdAt)}
                    {claimed ? ' (Already submitted)' : ''}
                  </option>
                );
              })}
            </select>
            {eligibleOrders.length === 0 && !isLoadingOrders ? (
              <span className="pf-hint">No completed orders found. Place an order first to take part.</span>
            ) : null}
          </label>

          <label className="pf-form__row">
            <span className="pf-lab">Instagram username *</span>
            <input
              type="text"
              name="instagramUsername"
              placeholder="your_instagram_handle"
              value={instagramUsername}
              onChange={(event) => setInstagramUsername(event.target.value)}
              disabled={isSubmitting}
            />
            <span className="pf-hint">Do not include a leading @ (for example, janedoe_fashion).</span>
          </label>

          <label className="pf-form__row">
            <span className="pf-lab">Post or story link (optional)</span>
            <input
              type="url"
              name="instagramPostUrl"
              placeholder="Paste the full link to your post"
              value={instagramPostUrl}
              onChange={(event) => setInstagramPostUrl(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <div className="pf-account__actions">
            <Button type="submit" disabled={isSubmitting || eligibleOrders.length === 0}>
              {isSubmitting ? 'Submitting...' : 'Submit for review'}
            </Button>
          </div>
        </form>
      </section>

      <section className="pf-account__section" aria-label="Your submissions">
        <header className="shop__head">
          <p className="label">History</p>
          <h2 className="display shop__title">Your <em>submissions</em></h2>
        </header>

        {isLoadingSubmissions && submissions.length === 0 && !listError ? (
          <div className="empty" aria-busy="true" aria-label="Loading your reward submissions">
            <p className="empty__title">Loading reward submissions&hellip;</p>
          </div>
        ) : listError && submissions.length === 0 ? (
          <div className="empty" role="alert">
            <p className="empty__title">We could not load your reward submissions.</p>
            <p>{listError}</p>
            <Button variant="ghost" onClick={fetchSubmissions}>Try again</Button>
          </div>
        ) : submissions.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No submissions yet.</p>
            <p>Submit your first Instagram post above to claim a discount coupon.</p>
          </div>
        ) : (
          <table className="pf-account__table">
            <caption className="pf-hint">Your reward submissions, newest first.</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Post</th>
                <th scope="col">Status</th>
                <th scope="col">Coupon</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id}>
                  <td>
                    <Link to="/account/orders">#{submission.orderNumber ?? String(submission.orderId ?? '').slice(0, 8)}</Link>
                    <br />
                    <span className="pf-hint">{formatDate(submission.createdAt)}</span>
                  </td>
                  <td>
                    <span className="pf-hint">@{submission.instagramUsername}</span>
                    {submission.instagramPostUrl ? (
                      <>
                        <br />
                        <a href={submission.instagramPostUrl} target="_blank" rel="noopener noreferrer">View post</a>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {STATUS_LABEL[submission.status] ?? 'Status not recorded'}
                    {submission.status === 'REJECTED' && submission.rejectionReason ? (
                      <>
                        <br />
                        <span className="pf-hint">{submission.rejectionReason}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {submission.couponCode ? (
                      <>
                        <code>{submission.couponCode}</code>{' '}
                        <Button variant="ghost" onClick={() => handleCopy(submission.couponCode)}>
                          {copiedCode === submission.couponCode ? 'Copied' : 'Copy'}
                        </Button>
                        {submission.coupon?.validUntil ? (
                          <span className="pf-hint"> Valid until {formatDate(submission.coupon.validUntil)}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="pf-hint">Issued once approved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AccountFrame>
  );
}
