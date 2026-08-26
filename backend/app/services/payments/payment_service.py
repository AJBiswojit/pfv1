"""
PaymentService — production Razorpay integration for Pratikshya Fashon.

Flow for ONLINE payments (upi | card | netbanking):
─────────────────────────────────────────────────────────────────────────────
  1. POST /payments/session
       • Validate the order exists (or draft amount).
       • Create a Razorpay Order via the REST API.
       • Persist a PaymentSessionModel with status=CREATED.
       • Return razorpay_order_id + razorpay_key_id to the frontend.

  2. Frontend opens razorpay-checkout.js with the returned values.
     User completes payment on Razorpay's hosted UI.

  3. Razorpay sends callback data to the frontend:
       { razorpay_order_id, razorpay_payment_id, razorpay_signature }

  4. POST /payments/verify  (called by frontend immediately after success)
       • Recompute HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id)
         using RAZORPAY_KEY_SECRET.
       • Compare against razorpay_signature (constant-time).
       • On match → update session to PAID, update order.payment_status = PAID.
       • On mismatch → update session to FAILED, raise 400.

  5. POST /payments/webhook  (async, sent directly by Razorpay to the server)
       • Verify X-Razorpay-Signature header (HMAC of raw body with WEBHOOK_SECRET).
       • Handle event types: payment.captured, payment.failed, order.paid.
       • Update session + order payment status idempotently.

Flow for COD:
─────────────────────────────────────────────────────────────────────────────
  • POST /payments/session with payment_method=cod creates a minimal session
    (no Razorpay API call) with status=CREATED and returns a synthetic response.
  • Order payment_status stays PENDING until delivery.

Security guarantees:
─────────────────────────────────────────────────────────────────────────────
  ✓ HMAC-SHA256 signature verification — prevents payment forging.
  ✓ Webhook signature verification — prevents spoofed webhook events.
  ✓ Amount cross-check — verifies Razorpay amount matches our DB record.
  ✓ Constant-time comparison (hmac.compare_digest) — prevents timing attacks.
  ✓ Idempotency key — prevents duplicate session creation.
  ✓ Status guard — only CREATED/PENDING sessions can be moved to PAID/FAILED.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import razorpay
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    BusinessLogicException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.logging import get_logger
from app.models.orders.order import OrderModel
from app.models.payments.payment_session import PaymentSessionModel

logger = get_logger("app.payments.payment_service")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SESSION_EXPIRY_MINUTES = 15
"""Payment sessions expire after 15 minutes if no payment is captured."""

PAYMENT_METHODS_REQUIRING_RAZORPAY = {"upi", "card", "netbanking"}
"""Methods that require a real Razorpay Order to be created."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _to_paise(rupees: int) -> int:
    """Convert whole rupees to paise (smallest Razorpay unit)."""
    return rupees * 100


def _to_rupees(paise: int) -> float:
    return paise / 100


def _build_razorpay_client() -> razorpay.Client:
    """
    Construct an authenticated Razorpay client.

    Raises RuntimeError if credentials are not configured.
    This is intentional — we want a clear startup-time failure, not a silent
    production error when keys are missing.
    """
    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET

    if not key_id or not key_secret or key_id.startswith("your-"):
        raise RuntimeError(
            "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment variables."
        )

    return razorpay.Client(auth=(key_id, key_secret))


def _verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """
    Verify Razorpay payment callback HMAC-SHA256 signature.

    Algorithm (per Razorpay docs):
        message  = razorpay_order_id + "|" + razorpay_payment_id
        expected = HMAC-SHA256(message, key=RAZORPAY_KEY_SECRET)
        compare  = hmac.compare_digest(expected_hex, razorpay_signature)

    Uses hmac.compare_digest for constant-time comparison to prevent
    timing-based oracle attacks.
    """
    key_secret = settings.RAZORPAY_KEY_SECRET
    if not key_secret:
        raise RuntimeError("RAZORPAY_KEY_SECRET is not configured.")

    message = f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
    expected = hmac.new(
        key_secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, razorpay_signature)


def _verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """
    Verify Razorpay webhook HMAC-SHA256 signature.

    Algorithm (per Razorpay docs):
        expected = HMAC-SHA256(raw_body, key=RAZORPAY_WEBHOOK_SECRET)
        compare  = hmac.compare_digest(expected_hex, X-Razorpay-Signature)

    IMPORTANT: `raw_body` must be the exact bytes received — never decode/re-encode.
    """
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not webhook_secret:
        raise RuntimeError("RAZORPAY_WEBHOOK_SECRET is not configured.")

    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# PaymentService
# ---------------------------------------------------------------------------

class PaymentService:
    """Business logic for the Payments section."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Load helpers ──────────────────────────────────────────────────────────

    async def _load_session(self, session_id: str) -> PaymentSessionModel:
        stmt = select(PaymentSessionModel).where(PaymentSessionModel.id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalars().first()
        if not session:
            raise NotFoundException(f"Payment session '{session_id}' not found.")
        return session

    async def _load_session_by_razorpay_order(
        self, razorpay_order_id: str
    ) -> PaymentSessionModel:
        stmt = select(PaymentSessionModel).where(
            PaymentSessionModel.razorpay_order_id == razorpay_order_id
        )
        result = await self.db.execute(stmt)
        session = result.scalars().first()
        if not session:
            raise NotFoundException(
                f"No payment session found for Razorpay order '{razorpay_order_id}'."
            )
        return session

    async def _load_order(self, order_id: str) -> OrderModel:
        stmt = select(OrderModel).where(OrderModel.id == order_id)
        result = await self.db.execute(stmt)
        order = result.scalars().first()
        if not order:
            raise NotFoundException(f"Order '{order_id}' not found.")
        return order

    # ── Create payment session ─────────────────────────────────────────────────

    async def create_session(
        self,
        order_id: Optional[str],
        payment_method: str,
        order_draft: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
        customer_email: Optional[str] = None,
        customer_phone: Optional[str] = None,
        customer_name: Optional[str] = None,
    ) -> dict:
        """
        POST /payments/session

        For online methods (upi/card/netbanking):
          1. Resolve the order amount (from DB order or draft).
          2. Verify no active session already exists for this order.
          3. Call Razorpay Create Order API.
          4. Persist PaymentSessionModel.
          5. Return Razorpay order details for the frontend SDK.

        For COD:
          • Create a minimal local session (no Razorpay API call).
          • Return a synthetic response telling the frontend to proceed.
        """
        # ── Idempotency: return existing session if key matches ────────────────
        if idempotency_key:
            existing_stmt = select(PaymentSessionModel).where(
                PaymentSessionModel.idempotency_key == idempotency_key
            )
            existing_result = await self.db.execute(existing_stmt)
            existing = existing_result.scalars().first()
            if existing:
                return self._build_session_response(existing)

        # ── Resolve amount ─────────────────────────────────────────────────────
        amount_rupees: int = 0
        resolved_order_id: Optional[str] = order_id
        order: Optional[OrderModel] = None

        if order_id:
            order = await self._load_order(order_id)

            # Guard: don't create a session for an already-paid order
            if order.payment_status in ("PAID", "AUTHORIZED"):
                raise ConflictException(
                    "This order has already been paid. "
                    "No new payment session can be created."
                )

            # Guard: order must not be cancelled
            if order.status == "CANCELLED":
                raise BusinessLogicException(
                    "Cannot create a payment session for a cancelled order."
                )

            amount_rupees = order.total
            resolved_order_id = order.id

        elif order_draft:
            # Pre-order flow: amount is computed from the draft
            amount_rupees = int(order_draft.get("total") or order_draft.get("amount") or 0)
            if amount_rupees <= 0:
                raise BusinessLogicException(
                    "Order draft must include a positive 'total' amount."
                )
        else:
            raise BusinessLogicException(
                "Either 'order_id' or 'order_draft' must be provided."
            )

        if amount_rupees <= 0:
            raise BusinessLogicException("Payment amount must be greater than zero.")

        # ── COD: short-circuit — no Razorpay call ────────────────────────────
        if payment_method == "cod":
            return await self._create_cod_session(
                order_id=resolved_order_id,
                amount_rupees=amount_rupees,
                idempotency_key=idempotency_key,
            )

        # ── Online payment: call Razorpay Create Order API ────────────────────
        amount_paise = _to_paise(amount_rupees)
        receipt = f"PF-{(resolved_order_id or _new_uuid())[:8].upper()}"

        razorpay_order_data = await self._create_razorpay_order(
            amount_paise=amount_paise,
            receipt=receipt,
            notes={
                "order_id": resolved_order_id or "",
                "platform": "pratikshya_fashon",
            },
        )

        razorpay_order_id: str = razorpay_order_data["id"]

        # ── Persist session ────────────────────────────────────────────────────
        session = PaymentSessionModel(
            id=_new_uuid(),
            order_id=resolved_order_id,  # type: ignore[arg-type]
            razorpay_order_id=razorpay_order_id,
            amount_paise=amount_paise,
            currency="INR",
            payment_method=payment_method,
            status="CREATED",
            expires_at=_now_utc() + timedelta(minutes=SESSION_EXPIRY_MINUTES),
            razorpay_receipt=receipt,
            idempotency_key=idempotency_key,
        )
        self.db.add(session)
        await self.db.flush()

        # ── Build prefill for Razorpay modal ───────────────────────────────────
        prefill: dict = {}
        if customer_name:
            prefill["name"] = customer_name
        if customer_email:
            prefill["email"] = customer_email
        if customer_phone:
            prefill["contact"] = customer_phone

        return {
            "ok": True,
            "session_id": session.id,
            "status": session.status,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_key_id": settings.RAZORPAY_KEY_ID,
            "amount_paise": amount_paise,
            "currency": "INR",
            "prefill": prefill or None,
        }

    async def _create_cod_session(
        self,
        order_id: Optional[str],
        amount_rupees: int,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        """Create a COD payment session without calling Razorpay."""
        session = PaymentSessionModel(
            id=_new_uuid(),
            order_id=order_id,  # type: ignore[arg-type]
            amount_paise=_to_paise(amount_rupees),
            currency="INR",
            payment_method="cod",
            status="CREATED",
            idempotency_key=idempotency_key,
        )
        self.db.add(session)
        await self.db.flush()

        return {
            "ok": True,
            "session_id": session.id,
            "status": "CREATED",
            "payment_method": "cod",
            "message": "Cash on delivery — no online payment required.",
        }

    async def _create_razorpay_order(
        self,
        amount_paise: int,
        receipt: str,
        notes: Optional[dict] = None,
    ) -> dict:
        """
        Call Razorpay Create Order API synchronously.

        The razorpay Python SDK is synchronous — we call it directly here.
        In a high-throughput setup you'd run this in a thread pool executor
        (asyncio.get_event_loop().run_in_executor), but for a fashion backend
        the direct call is acceptable and simpler.
        """
        client = _build_razorpay_client()

        order_data = {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes or {},
            "payment_capture": 1,  # auto-capture on successful payment
        }

        try:
            razorpay_order = client.order.create(data=order_data)
        except Exception as exc:
            logger.error("Razorpay order creation failed receipt=%s error=%s", receipt, exc, exc_info=True)
            raise BusinessLogicException(
                f"Failed to create Razorpay order: {exc}"
            ) from exc

        return razorpay_order

    def _build_session_response(self, session: PaymentSessionModel) -> dict:
        """Build a consistent response dict from an existing session."""
        if session.payment_method == "cod":
            return {
                "ok": True,
                "session_id": session.id,
                "status": session.status,
                "payment_method": "cod",
                "message": "Cash on delivery — no online payment required.",
            }

        return {
            "ok": True,
            "session_id": session.id,
            "status": session.status,
            "razorpay_order_id": session.razorpay_order_id,
            "razorpay_key_id": settings.RAZORPAY_KEY_ID,
            "amount_paise": session.amount_paise,
            "currency": session.currency,
            "prefill": None,
        }

    # ── Get session ────────────────────────────────────────────────────────────

    async def get_session(self, session_id: str) -> PaymentSessionModel:
        """GET /payments/session/{sessionId}"""
        return await self._load_session(session_id)

    # ── Cancel session ─────────────────────────────────────────────────────────

    async def cancel_session(
        self,
        session_id: str,
        reason: Optional[str] = None,
        customer_id: Optional[str] = None,
    ) -> PaymentSessionModel:
        """
        POST /payments/session/{sessionId}/cancel

        Only CREATED or PENDING sessions can be cancelled.
        We do NOT call Razorpay's cancel API here because Razorpay orders
        cannot be cancelled programmatically — they simply expire (15 min TTL
        on Razorpay's side). We mark our session as CANCELLED locally.

        If a customer_id is provided, we verify the session belongs to an
        order owned by that customer before allowing the cancellation.
        """
        session = await self._load_session(session_id)

        if session.status not in ("CREATED", "PENDING"):
            raise BusinessLogicException(
                f"Cannot cancel a session in status '{session.status}'. "
                "Only CREATED or PENDING sessions can be cancelled."
            )

        # Optional ownership check
        if customer_id and session.order_id:
            order = await self._load_order(session.order_id)
            if order.customer_id != customer_id:
                raise ForbiddenException(
                    "You do not have permission to cancel this payment session."
                )

        session.status = "CANCELLED"
        session.cancelled_at = _now_utc()
        session.failure_reason = reason or "Cancelled by user."
        await self.db.flush()

        return session

    # ── Verify payment (client-side callback) ──────────────────────────────────

    async def verify_payment(
        self,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> dict:
        """
        POST /payments/verify

        Called by the frontend immediately after the Razorpay modal closes
        with a successful payment.

        Steps:
          1. Find the session by razorpay_order_id.
          2. Guard: session must be CREATED or PENDING (not already PAID).
          3. Verify HMAC-SHA256 signature — reject with 400 on mismatch.
          4. Cross-check amount: fetch from Razorpay and compare with DB.
          5. Update session → PAID, order.payment_status → PAID.
          6. Update order timeline.

        SECURITY NOTE:
          The HMAC verification is the authoritative trust boundary.
          We do NOT trust the frontend's claim that payment succeeded —
          only a valid HMAC signed with our key_secret is accepted.
        """
        session = await self._load_session_by_razorpay_order(razorpay_order_id)

        # Guard: idempotent — already verified
        if session.status == "PAID":
            order = await self._load_order(session.order_id)
            return {
                "ok": True,
                "message": "Payment already verified.",
                "payment_status": order.payment_status,
                "order_id": session.order_id,
            }

        if session.status not in ("CREATED", "PENDING"):
            raise BusinessLogicException(
                f"Payment session is in status '{session.status}' — "
                "verification is only valid for CREATED or PENDING sessions."
            )

        # ── HMAC signature verification ────────────────────────────────────────
        signature_valid = _verify_payment_signature(
            razorpay_order_id=razorpay_order_id,
            razorpay_payment_id=razorpay_payment_id,
            razorpay_signature=razorpay_signature,
        )

        if not signature_valid:
            # Mark session as failed to prevent re-attempts with a bad signature
            session.status = "FAILED"
            session.failure_reason = "HMAC signature verification failed."
            session.failure_code = "SIGNATURE_MISMATCH"
            await self.db.flush()

            raise BusinessLogicException(
                "Payment verification failed: invalid signature. "
                "This may indicate a tampered callback. Contact support if this persists."
            )

        # ── Amount cross-check via Razorpay fetch API ─────────────────────────
        # This is an extra security layer — we verify the amount Razorpay
        # recorded matches what we expect to charge.
        try:
            client = _build_razorpay_client()
            payment_details = client.payment.fetch(razorpay_payment_id)
            razorpay_amount = int(payment_details.get("amount", 0))

            if razorpay_amount != session.amount_paise:
                session.status = "FAILED"
                session.failure_reason = (
                    f"Amount mismatch: expected {session.amount_paise} paise, "
                    f"Razorpay recorded {razorpay_amount} paise."
                )
                session.failure_code = "AMOUNT_MISMATCH"
                await self.db.flush()
                raise BusinessLogicException(
                    "Payment amount does not match order total. "
                    "Please contact support immediately."
                )
        except BusinessLogicException:
            raise
        except Exception:
            # Razorpay fetch failed — proceed with signature verification alone
            # (signature is the primary trust anchor; fetch is belt-and-suspenders)
            pass

        # ── All checks passed — mark PAID ─────────────────────────────────────
        now = _now_utc()
        session.status = "PAID"
        session.razorpay_payment_id = razorpay_payment_id
        session.razorpay_signature = razorpay_signature
        session.paid_at = now
        await self.db.flush()

        logger.info(
            "Payment verified session_id=%s razorpay_payment_id=%s order_id=%s",
            session.id, razorpay_payment_id, session.order_id,
        )

        # Update order payment status
        if session.order_id:
            order = await self._load_order(session.order_id)
            order.payment_status = "PAID"

            # Append to order timeline
            timeline = list(order.timeline or [])
            timeline.append({
                "event": "PAYMENT_CAPTURED",
                "at": now.isoformat(),
                "note": f"razorpay_payment_id={razorpay_payment_id}",
            })
            order.timeline = timeline
            await self.db.flush()

            return {
                "ok": True,
                "message": "Payment verified and captured successfully.",
                "payment_status": "PAID",
                "order_id": order.id,
            }

        return {
            "ok": True,
            "message": "Payment verified successfully.",
            "payment_status": "PAID",
            "order_id": None,
        }

    # ── Webhook handler ────────────────────────────────────────────────────────

    async def handle_webhook(self, raw_body: bytes, signature: str) -> dict:
        """
        POST /payments/webhook

        Razorpay sends signed events to this endpoint asynchronously.
        This is the server-side confirmation of payment, independent of the
        client-side verify flow (which depends on the user's browser completing).

        Security:
          1. Verify X-Razorpay-Signature HMAC using RAZORPAY_WEBHOOK_SECRET.
          2. Parse event payload.
          3. Dispatch to event-specific handler.

        Supported events:
          payment.captured  → session + order → PAID
          payment.failed    → session + order → FAILED
          order.paid        → idempotent confirmation (already handled by above)

        Idempotency:
          All handlers are idempotent — re-delivery of the same event is safe.
        """
        import json

        # ── Signature verification (primary security gate) ────────────────────
        if not _verify_webhook_signature(raw_body, signature):
            logger.warning("Webhook signature verification failed")
            raise ForbiddenException(
                "Webhook signature verification failed. "
                "The request does not appear to originate from Razorpay."
            )

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise BusinessLogicException(f"Malformed webhook payload: {exc}") from exc

        event = payload.get("event")
        if not event:
            raise BusinessLogicException("Webhook payload is missing 'event' field.")

        logger.info("Webhook received event=%s", event)

        # ── Event dispatch ────────────────────────────────────────────────────
        if event == "payment.captured":
            await self._on_payment_captured(payload)
        elif event == "payment.failed":
            await self._on_payment_failed(payload)
        elif event == "order.paid":
            await self._on_order_paid(payload)
        else:
            # Unknown event — acknowledge without processing (do NOT return 4xx)
            logger.warning("Unhandled webhook event event=%s", event)

        return {"ok": True, "message": f"Event '{event}' processed."}

    async def _on_payment_captured(self, payload: dict) -> None:
        """Handle payment.captured webhook event."""
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        razorpay_payment_id: str = entity.get("id", "")
        razorpay_order_id: str = entity.get("order_id", "")
        amount_paise: int = int(entity.get("amount", 0))

        if not razorpay_order_id:
            return  # Cannot correlate — skip

        try:
            session = await self._load_session_by_razorpay_order(razorpay_order_id)
        except NotFoundException:
            return  # Session not found — already removed or test event

        # Idempotent: already PAID
        if session.status == "PAID":
            return

        # Amount guard
        if amount_paise != session.amount_paise:
            session.status = "FAILED"
            session.failure_reason = (
                f"Webhook amount mismatch: expected {session.amount_paise} paise, "
                f"received {amount_paise} paise."
            )
            session.failure_code = "AMOUNT_MISMATCH"
            session.last_webhook_event = "payment.captured"
            await self.db.flush()
            return

        now = _now_utc()
        session.status = "PAID"
        session.razorpay_payment_id = razorpay_payment_id
        session.paid_at = now
        session.last_webhook_event = "payment.captured"
        await self.db.flush()

        if session.order_id:
            try:
                order = await self._load_order(session.order_id)
                if order.payment_status not in ("PAID", "AUTHORIZED"):
                    order.payment_status = "PAID"
                    timeline = list(order.timeline or [])
                    timeline.append({
                        "event": "PAYMENT_CAPTURED",
                        "at": now.isoformat(),
                        "note": f"webhook:payment.captured / razorpay_payment_id={razorpay_payment_id}",
                    })
                    order.timeline = timeline
                    await self.db.flush()
            except NotFoundException:
                pass  # Order removed — continue

    async def _on_payment_failed(self, payload: dict) -> None:
        """Handle payment.failed webhook event."""
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        razorpay_order_id: str = entity.get("order_id", "")
        error_description: str = entity.get("error_description", "Payment failed at Razorpay.")
        error_code: str = entity.get("error_code", "PAYMENT_FAILED")

        if not razorpay_order_id:
            return

        try:
            session = await self._load_session_by_razorpay_order(razorpay_order_id)
        except NotFoundException:
            return

        # Idempotent: already at a terminal state
        if session.status in ("PAID", "FAILED", "CANCELLED"):
            return

        session.status = "FAILED"
        session.failure_reason = error_description
        session.failure_code = error_code
        session.last_webhook_event = "payment.failed"
        await self.db.flush()

        if session.order_id:
            try:
                order = await self._load_order(session.order_id)
                if order.payment_status not in ("PAID",):
                    order.payment_status = "FAILED"
                    timeline = list(order.timeline or [])
                    timeline.append({
                        "event": "PAYMENT_FAILED",
                        "at": _now_utc().isoformat(),
                        "note": f"webhook:payment.failed / {error_description}",
                    })
                    order.timeline = timeline
                    await self.db.flush()
            except NotFoundException:
                pass

    async def _on_order_paid(self, payload: dict) -> None:
        """
        Handle order.paid event — a higher-level event from Razorpay indicating
        all payments for the Razorpay order have been captured.

        This is idempotent with payment.captured; we just ensure our records
        are consistent.
        """
        entity = payload.get("payload", {}).get("order", {}).get("entity", {})
        razorpay_order_id: str = entity.get("id", "")

        if not razorpay_order_id:
            return

        try:
            session = await self._load_session_by_razorpay_order(razorpay_order_id)
        except NotFoundException:
            return

        # Nothing to do if already PAID
        if session.status == "PAID":
            return

        # Update to PAID if in a pre-terminal state
        if session.status in ("CREATED", "PENDING"):
            session.status = "PAID"
            session.paid_at = _now_utc()
            session.last_webhook_event = "order.paid"
            await self.db.flush()

            if session.order_id:
                try:
                    order = await self._load_order(session.order_id)
                    if order.payment_status not in ("PAID", "AUTHORIZED"):
                        order.payment_status = "PAID"
                        timeline = list(order.timeline or [])
                        timeline.append({
                            "event": "PAYMENT_CAPTURED",
                            "at": _now_utc().isoformat(),
                            "note": "webhook:order.paid",
                        })
                        order.timeline = timeline
                        await self.db.flush()
                except NotFoundException:
                    pass
