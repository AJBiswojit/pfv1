"""
OrderService — all business logic for the Orders section.

Covers:
  Customer
  ─────────────────────────────────────────────────────────────────────────────
  place_order          POST  /orders
  list_orders          GET   /orders
  get_order            GET   /orders/{orderId}
  get_tracking         GET   /orders/{orderId}/tracking
  cancel_order         POST  /orders/{orderId}/cancel
  create_return        POST  /orders/{orderId}/returns
  get_return           GET   /orders/{orderId}/returns/{returnId}
  claim_guest_orders   POST  /orders/claim-guest

  Admin / Fulfillment
  ─────────────────────────────────────────────────────────────────────────────
  admin_list_orders    GET   /admin/orders
  admin_get_order      GET   /admin/orders/{id}
  allocate             POST  /admin/orders/{id}/allocate
  assign_fulfillment   POST  /admin/orders/{id}/fulfillment
  start_picking        POST  /admin/orders/{id}/pick/start
  pick_item            POST  /admin/orders/{id}/pick/item
  mark_packed          POST  /admin/orders/{id}/pack
  mark_ready           POST  /admin/orders/{id}/ready
  dispatch_order       POST  /admin/orders/{id}/dispatch
  mark_out_for_delivery POST /admin/orders/{id}/out-for-delivery
  mark_delivered       POST  /admin/orders/{id}/deliver
  admin_cancel         POST  /admin/orders/{id}/cancel
  add_note             POST  /admin/orders/{id}/notes
  apply_status         POST  /admin/orders/{id}/status
  force_status         POST  /admin/orders/{id}/force-status
  get_invoice          GET   /admin/orders/{id}/invoice

ORDER_TRANSITIONS (from frontend orderConfig.js — enforced server-side):
  PENDING_PAYMENT      → PAYMENT_CONFIRMED | CANCELLED
  PAYMENT_CONFIRMED    → ORDER_CONFIRMED
  ORDER_CONFIRMED      → ALLOCATED | CANCELLED
  ALLOCATED            → PICKING | CANCELLED
  PICKING              → PACKED
  PACKED               → READY_TO_DISPATCH
  READY_TO_DISPATCH    → SHIPPED
  SHIPPED              → OUT_FOR_DELIVERY
  OUT_FOR_DELIVERY     → DELIVERED
  DELIVERED            → (terminal)
  CANCELLED            → (terminal)

CANCELLABLE_STATUSES (customer):
  PENDING_PAYMENT, PLACED, PAYMENT_CONFIRMED, ORDER_CONFIRMED, CONFIRMED,
  PROCESSING, ALLOCATED, PICKING

ADMIN_CANCELLABLE adds:
  PACKED, READY_TO_DISPATCH
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BusinessLogicException, ForbiddenException, NotFoundException
from app.models.orders.order import OrderModel
from app.models.orders.order_item import OrderItemModel
from app.models.orders.order_status_history import OrderStatusHistoryModel
from app.schemas.orders.order import (
    AddNoteRequest,
    AdminCancelRequest,
    ApplyStatusRequest,
    CancelOrderRequest,
    CreateReturnRequest,
    DispatchRequest,
    ForceStatusRequest,
    FulfillmentAssignRequest,
    PickItemRequest,
    PlaceOrderRequest,
)

# ── Constants ─────────────────────────────────────────────────────────────────

FREE_SHIPPING_THRESHOLD = 5_000
FLAT_SHIPPING_FEE = 99
EXPRESS_SHIPPING_FEE = 199
COD_FEE = 49

RETURN_WINDOW_DAYS = 7  # default; ideally read from settings

CANCELLABLE_STATUSES = {
    "PENDING_PAYMENT", "PLACED", "PAYMENT_CONFIRMED",
    "ORDER_CONFIRMED", "CONFIRMED", "PROCESSING", "ALLOCATED", "PICKING",
}
ADMIN_CANCELLABLE_STATUSES = CANCELLABLE_STATUSES | {"PACKED", "READY_TO_DISPATCH"}

# Adjacency map — valid forward transitions
ORDER_TRANSITIONS: Dict[str, set] = {
    "PENDING_PAYMENT":    {"PAYMENT_CONFIRMED", "CANCELLED"},
    "PAYMENT_CONFIRMED":  {"ORDER_CONFIRMED"},
    "ORDER_CONFIRMED":    {"ALLOCATED", "CANCELLED"},
    "PLACED":             {"ORDER_CONFIRMED", "ALLOCATED", "CANCELLED"},
    "CONFIRMED":          {"ALLOCATED", "CANCELLED"},
    "PROCESSING":         {"ALLOCATED", "CANCELLED"},
    "ALLOCATED":          {"PICKING", "CANCELLED"},
    "PICKING":            {"PACKED"},
    "PACKED":             {"READY_TO_DISPATCH"},
    "READY_TO_DISPATCH":  {"SHIPPED"},
    "SHIPPED":            {"OUT_FOR_DELIVERY"},
    "OUT_FOR_DELIVERY":   {"DELIVERED"},
    "DELIVERED":          set(),
    "CANCELLED":          set(),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _generate_order_number() -> str:
    """Generate PF-ORD-XXXXXX (6 random hex digits, upper)."""
    suffix = uuid.uuid4().hex[:6].upper()
    return f"PF-ORD-{suffix}"


def _generate_return_number() -> str:
    suffix = uuid.uuid4().hex[:6].upper()
    return f"PF-RET-{suffix}"


def _can_transition(current: str, next_status: str) -> bool:
    return next_status in ORDER_TRANSITIONS.get(current, set())


def _timeline_event(event: str, actor_id: Optional[str] = None, note: Optional[str] = None) -> Dict[str, Any]:
    entry: Dict[str, Any] = {"event": event, "at": _now_utc().isoformat()}
    if actor_id:
        entry["actorId"] = actor_id
    if note:
        entry["note"] = note
    return entry


def _compute_shipping(subtotal_after_coupon: int, delivery_method: str) -> int:
    if delivery_method == "express":
        return EXPRESS_SHIPPING_FEE  # express is never free
    return 0 if subtotal_after_coupon >= FREE_SHIPPING_THRESHOLD else FLAT_SHIPPING_FEE


def _compute_cod_fee(payment_method: str) -> int:
    return COD_FEE if payment_method == "cod" else 0


# ── Order query helper ────────────────────────────────────────────────────────

async def _load_order(db: AsyncSession, order_id: str) -> OrderModel:
    stmt = (
        select(OrderModel)
        .where(OrderModel.id == order_id)
        .options(
            selectinload(OrderModel.items),
            selectinload(OrderModel.status_history),
            selectinload(OrderModel.returns),
        )
    )
    result = await db.execute(stmt)
    order = result.scalars().first()
    if not order:
        raise NotFoundException(f"Order '{order_id}' not found.")
    return order


async def _load_order_by_number(db: AsyncSession, order_number: str) -> OrderModel:
    stmt = (
        select(OrderModel)
        .where(OrderModel.order_number == order_number)
        .options(
            selectinload(OrderModel.items),
            selectinload(OrderModel.status_history),
        )
    )
    result = await db.execute(stmt)
    order = result.scalars().first()
    if not order:
        raise NotFoundException(f"Order '{order_number}' not found.")
    return order


def _append_status_history(
    db: AsyncSession,
    order: OrderModel,
    from_status: str,
    to_status: str,
    actor_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    entry = OrderStatusHistoryModel(
        id=_new_uuid(),
        order_id=order.id,
        from_status=from_status,
        to_status=to_status,
        actor_id=actor_id,
        actor_name=actor_name,
        note=note,
    )
    db.add(entry)


def _set_status(
    db: AsyncSession,
    order: OrderModel,
    new_status: str,
    actor_id: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    """Transition order to new_status, writing history and timeline."""
    prev = order.status
    order.status = new_status
    _append_status_history(db, order, prev, new_status, actor_id=actor_id, note=note)
    timeline = list(order.timeline or [])
    timeline.append(_timeline_event(f"STATUS_{new_status}", actor_id=actor_id, note=note))
    order.timeline = timeline


# ── Service ───────────────────────────────────────────────────────────────────

class OrderService:
    """Business logic for the Orders section."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    # ── Customer: place order ─────────────────────────────────────────────────

    async def place_order(
        self,
        req: PlaceOrderRequest,
        customer_id: Optional[str],
    ) -> OrderModel:
        """POST /orders — create and persist a new order."""
        from app.models.catalog.product import ProductModel

        if not req.items:
            raise BusinessLogicException("Order must contain at least one item.")

        # ── Resolve products & compute totals ─────────────────────────────────
        product_ids = [item.product_id for item in req.items]
        stmt = select(ProductModel).where(ProductModel.id.in_(product_ids))
        result = await self.db.execute(stmt)
        products: Dict[str, ProductModel] = {p.id: p for p in result.scalars().all()}

        order_items: List[OrderItemModel] = []
        subtotal = 0
        product_discount = 0

        for line in req.items:
            product = products.get(line.product_id)
            if not product:
                raise BusinessLogicException(f"Product '{line.product_id}' not found.")
            if product.status != "PUBLISHED":
                raise BusinessLogicException(f"Product '{product.name}' is not available.")

            # Resolve selling price
            unit_price = int(product.price or 0)
            original_price = unit_price
            pricing = product.pricing or {}
            if pricing:
                selling = int(pricing.get("sellingPrice") or pricing.get("selling_price") or unit_price)
                disc_type = pricing.get("discountType") or pricing.get("discount_type") or "none"
                disc_val = float(pricing.get("discountValue") or pricing.get("discount_value") or 0)
                if disc_type == "percentage":
                    unit_price = max(0, round(selling - selling * disc_val / 100))
                elif disc_type == "fixed":
                    unit_price = max(0, round(selling - disc_val))
                else:
                    unit_price = selling
                original_price = selling

            line_total = unit_price * line.quantity
            subtotal += line_total
            if original_price > unit_price:
                product_discount += (original_price - unit_price) * line.quantity

            order_items.append(
                OrderItemModel(
                    id=_new_uuid(),
                    product_id=line.product_id,
                    product_name=product.name or "",
                    product_image=getattr(product, "image", None),
                    sku=getattr(product, "sku", None),
                    color=line.color,
                    size=line.size,
                    unit_price=unit_price,
                    original_price=original_price,
                    quantity=line.quantity,
                    line_total=line_total,
                )
            )

        # ── Coupon / discount ─────────────────────────────────────────────────
        coupon_discount = 0
        coupon_code = None
        coupon_id = None

        if req.coupon_code:
            from app.models.commerce.coupon import CouponModel
            coupon_stmt = select(CouponModel).where(
                CouponModel.code == req.coupon_code.upper()
            )
            coupon_result = await self.db.execute(coupon_stmt)
            coupon = coupon_result.scalars().first()
            if coupon and coupon.is_active:
                if coupon.discount_type == "percentage":
                    coupon_discount = round(subtotal * coupon.discount_value / 100)
                elif coupon.discount_type == "fixed":
                    coupon_discount = min(int(coupon.discount_value), subtotal)
                coupon_code = coupon.code
                coupon_id = coupon.id
                # Increment usage count
                coupon.usage_count = (coupon.usage_count or 0) + 1

        discounted_subtotal = subtotal - coupon_discount
        shipping_fee = _compute_shipping(discounted_subtotal, req.delivery_method)
        cod_fee = _compute_cod_fee(req.payment_method)
        total = discounted_subtotal + shipping_fee + cod_fee

        # ── Initial status ────────────────────────────────────────────────────
        # COD → PENDING; online → PAID
        payment_status = "PENDING" if req.payment_method == "cod" else "PAID"

        # Seed status history
        now = _now_utc()
        status_chain = [
            ("PENDING_PAYMENT", "PAYMENT_CONFIRMED"),
            ("PAYMENT_CONFIRMED", "ORDER_CONFIRMED"),
        ]

        order = OrderModel(
            id=_new_uuid(),
            order_number=_generate_order_number(),
            customer_id=customer_id,
            guest_email=req.customer.email if not customer_id else None,
            guest_phone=req.customer.phone if not customer_id else None,
            shipping_address={
                "fullName": req.address.full_name,
                "phone": req.address.phone,
                "addressLine": req.address.address_line,
                "landmark": req.address.landmark,
                "city": req.address.city,
                "state": req.address.state,
                "pincode": req.address.pincode,
                "type": req.address.type,
            },
            delivery_method=req.delivery_method,
            payment_method=req.payment_method,
            status="ORDER_CONFIRMED",
            payment_status=payment_status,
            subtotal=subtotal,
            product_discount=product_discount,
            coupon_discount=coupon_discount,
            shipping_fee=shipping_fee,
            cod_fee=cod_fee,
            total=total,
            coupon_code=coupon_code,
            coupon_id=coupon_id,
            customer_note=req.customer_note,
            inventory_reservation_id=req.inventory_reservation_id,
            timeline=[
                _timeline_event("ORDER_CREATED"),
                _timeline_event("PAYMENT_CONFIRMED"),
                _timeline_event("ORDER_CONFIRMED"),
            ],
            internal_notes=[],
        )

        self.db.add(order)
        await self.db.flush()  # get order.id

        # Attach items
        for item in order_items:
            item.order_id = order.id
            self.db.add(item)

        # Seed status history rows
        for from_s, to_s in status_chain:
            self.db.add(OrderStatusHistoryModel(
                id=_new_uuid(),
                order_id=order.id,
                from_status=from_s,
                to_status=to_s,
            ))
        # Final state
        self.db.add(OrderStatusHistoryModel(
            id=_new_uuid(),
            order_id=order.id,
            from_status="PAYMENT_CONFIRMED",
            to_status="ORDER_CONFIRMED",
        ))

        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Customer: list own orders ─────────────────────────────────────────────

    async def list_orders(
        self,
        customer_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """GET /orders — customer's own order list."""
        base_stmt = (
            select(OrderModel)
            .where(OrderModel.customer_id == customer_id)
            .options(
                selectinload(OrderModel.items),
                selectinload(OrderModel.status_history),
            )
            .order_by(OrderModel.created_at.desc())
        )

        count_stmt = select(func.count()).select_from(
            select(OrderModel.id).where(OrderModel.customer_id == customer_id).subquery()
        )
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        offset = (page - 1) * page_size
        paginated = base_stmt.offset(offset).limit(page_size)
        result = await self.db.execute(paginated)
        orders = result.scalars().all()

        return {"orders": orders, "total": total}

    # ── Customer: get single order ────────────────────────────────────────────

    async def get_order(self, order_id: str, customer_id: str) -> OrderModel:
        """GET /orders/{orderId} — customer must own the order."""
        order = await _load_order(self.db, order_id)
        if order.customer_id != customer_id:
            raise ForbiddenException("You do not have access to this order.")
        return order

    # ── Customer: tracking ────────────────────────────────────────────────────

    async def get_tracking(self, order_id: str, customer_id: str) -> Dict[str, Any]:
        """GET /orders/{orderId}/tracking — mock carrier data."""
        order = await _load_order(self.db, order_id)
        if order.customer_id != customer_id:
            raise ForbiddenException("You do not have access to this order.")

        events = []
        if order.status in ("SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"):
            events = [
                {
                    "timestamp": (order.dispatched_at or _now_utc()).isoformat(),
                    "location": "Bhubaneswar, Odisha",
                    "description": "Order dispatched from warehouse",
                    "status": "SHIPPED",
                }
            ]
        if order.status in ("OUT_FOR_DELIVERY", "DELIVERED"):
            events.append({
                "timestamp": _now_utc().isoformat(),
                "location": order.shipping_address.get("city", "") if order.shipping_address else "",
                "description": "Out for delivery",
                "status": "OUT_FOR_DELIVERY",
            })
        if order.status == "DELIVERED":
            events.append({
                "timestamp": (order.delivered_at or _now_utc()).isoformat(),
                "location": order.shipping_address.get("city", "") if order.shipping_address else "",
                "description": "Delivered successfully",
                "status": "DELIVERED",
            })

        return {
            "order_id": order.id,
            "carrier": order.carrier,
            "tracking_number": order.tracking_number,
            "origin": "Bhubaneswar, Odisha",
            "estimated_delivery": order.estimated_delivery.isoformat() if order.estimated_delivery else None,
            "events": events,
        }

    # ── Customer: cancel ──────────────────────────────────────────────────────

    async def cancel_order(
        self, order_id: str, customer_id: str, req: CancelOrderRequest
    ) -> OrderModel:
        """POST /orders/{orderId}/cancel."""
        order = await _load_order(self.db, order_id)
        if order.customer_id != customer_id:
            raise ForbiddenException("You do not have access to this order.")
        if order.status not in CANCELLABLE_STATUSES:
            raise BusinessLogicException(
                f"Order cannot be cancelled in status '{order.status}'."
            )

        _set_status(self.db, order, "CANCELLED", actor_id=customer_id, note=req.reason)
        order.cancelled_at = _now_utc()
        order.cancellation_reason = req.reason
        order.cancelled_by = customer_id
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Customer: create return ───────────────────────────────────────────────

    async def create_return(
        self, order_id: str, customer_id: str, req: CreateReturnRequest
    ) -> Any:
        """POST /orders/{orderId}/returns."""
        from app.models.orders.return_order import ReturnOrderModel
        from app.models.orders.return_item import ReturnItemModel

        order = await _load_order(self.db, order_id)
        if order.customer_id != customer_id:
            raise ForbiddenException("You do not have access to this order.")
        if order.status != "DELIVERED":
            raise BusinessLogicException("Returns are only accepted for delivered orders.")

        # Check return window (7 days from delivery)
        if order.delivered_at:
            delta = (_now_utc() - order.delivered_at).days
            if delta > RETURN_WINDOW_DAYS:
                raise BusinessLogicException(
                    f"Return window of {RETURN_WINDOW_DAYS} days has expired."
                )

        # Build item index
        items_by_id = {item.id: item for item in order.items}

        return_items = []
        total_refund = 0

        for ri in req.items:
            order_item = items_by_id.get(ri.line_id)
            if not order_item:
                raise BusinessLogicException(f"Order item '{ri.line_id}' not found in this order.")
            returnable_qty = order_item.quantity - order_item.returned_quantity
            if ri.quantity > returnable_qty:
                raise BusinessLogicException(
                    f"Cannot return {ri.quantity} units of '{order_item.product_name}'; "
                    f"only {returnable_qty} are returnable."
                )
            line_refund = order_item.unit_price * ri.quantity
            total_refund += line_refund

            return_items.append(ReturnItemModel(
                id=_new_uuid(),
                order_item_id=order_item.id,
                product_id=order_item.product_id,
                product_name=order_item.product_name,
                quantity=ri.quantity,
                reason=ri.reason,
                refund_amount=line_refund,
            ))

        return_order = ReturnOrderModel(
            id=_new_uuid(),
            order_id=order.id,
            return_number=_generate_return_number(),
            customer_id=customer_id,
            pickup_method=req.pickup_method,
            status="RETURN_REQUESTED",
            refund_amount=total_refund,
            refund_status="NOT_REQUESTED",
            timeline=[_timeline_event("RETURN_REQUESTED", actor_id=customer_id)],
        )
        self.db.add(return_order)
        await self.db.flush()

        for ri_model in return_items:
            ri_model.return_order_id = return_order.id
            self.db.add(ri_model)

        # Update returned_quantity on order items
        for ri in req.items:
            order_item = items_by_id.get(ri.line_id)
            if order_item:
                order_item.returned_quantity += ri.quantity

        await self.db.flush()
        return await self._load_return(return_order.id)

    # ── Customer: get return ──────────────────────────────────────────────────

    async def get_return(
        self, order_id: str, return_id: str, customer_id: str
    ) -> Any:
        """GET /orders/{orderId}/returns/{returnId}."""
        ret = await self._load_return(return_id)
        if ret.order_id != order_id:
            raise NotFoundException("Return not found for this order.")
        if ret.customer_id != customer_id:
            raise ForbiddenException("You do not have access to this return.")
        return ret

    # ── Customer: claim guest orders ──────────────────────────────────────────

    async def claim_guest_orders(self, email: str, customer_id: str) -> int:
        """POST /orders/claim-guest — attach guest orders to an account."""
        stmt = select(OrderModel).where(
            OrderModel.guest_email == email,
            OrderModel.customer_id.is_(None),
        )
        result = await self.db.execute(stmt)
        guest_orders = result.scalars().all()

        for order in guest_orders:
            order.customer_id = customer_id
            order.guest_email = None  # claimed — no longer a guest order

        await self.db.flush()
        return len(guest_orders)

    # ── Admin: list orders ────────────────────────────────────────────────────

    async def admin_list_orders(
        self,
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        q: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """GET /admin/orders."""
        conditions = []
        if status:
            conditions.append(OrderModel.status == status)
        if customer_id:
            conditions.append(OrderModel.customer_id == customer_id)
        if q:
            conditions.append(OrderModel.order_number.ilike(f"%{q}%"))

        base_query = select(OrderModel)
        if conditions:
            base_query = base_query.where(*conditions)

        count_stmt = select(func.count()).select_from(
            base_query.subquery()
        )
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        paginated = (
            base_query
            .options(
                selectinload(OrderModel.items),
                selectinload(OrderModel.status_history),
            )
            .order_by(OrderModel.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(paginated)
        orders = result.scalars().all()

        return {"orders": orders, "total": total, "page": page, "page_size": page_size}

    # ── Admin: get single order ───────────────────────────────────────────────

    async def admin_get_order(self, order_id: str) -> OrderModel:
        """GET /admin/orders/{id} — full record incl. internal notes."""
        return await _load_order(self.db, order_id)

    # ── Admin: allocate ───────────────────────────────────────────────────────

    async def allocate(self, order_id: str, actor_id: str) -> OrderModel:
        """POST /admin/orders/{id}/allocate → ALLOCATED."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "ALLOCATED"):
            raise BusinessLogicException(
                f"Cannot allocate order in status '{order.status}'."
            )
        _set_status(self.db, order, "ALLOCATED", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: assign fulfillment ─────────────────────────────────────────────

    async def assign_fulfillment(
        self, order_id: str, req: FulfillmentAssignRequest, actor_id: str
    ) -> OrderModel:
        """POST /admin/orders/{id}/fulfillment."""
        order = await _load_order(self.db, order_id)
        if req.location_id:
            order.fulfillment_location_id = req.location_id
        if req.handler_id:
            order.fulfillment_handler_id = req.handler_id
        timeline = list(order.timeline or [])
        timeline.append(_timeline_event("FULFILLMENT_ASSIGNED", actor_id=actor_id))
        order.timeline = timeline
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: start picking ──────────────────────────────────────────────────

    async def start_picking(self, order_id: str, actor_id: str) -> OrderModel:
        """POST /admin/orders/{id}/pick/start → PICKING."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "PICKING"):
            raise BusinessLogicException(
                f"Cannot start picking in status '{order.status}'."
            )
        _set_status(self.db, order, "PICKING", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: pick item ──────────────────────────────────────────────────────

    async def pick_item(
        self, order_id: str, req: PickItemRequest, actor_id: str
    ) -> OrderModel:
        """POST /admin/orders/{id}/pick/item — mark one line as picked."""
        order = await _load_order(self.db, order_id)
        if order.status != "PICKING":
            raise BusinessLogicException("Order must be in PICKING status.")
        # Timeline note only — per-item pick state could extend to an items sub-model
        timeline = list(order.timeline or [])
        timeline.append(_timeline_event(
            "ITEM_PICKED", actor_id=actor_id,
            note=f"item:{req.order_item_id}"
        ))
        order.timeline = timeline
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: pack ───────────────────────────────────────────────────────────

    async def mark_packed(self, order_id: str, actor_id: str) -> OrderModel:
        """POST /admin/orders/{id}/pack → PACKED."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "PACKED"):
            raise BusinessLogicException(
                f"Cannot pack order in status '{order.status}'."
            )
        _set_status(self.db, order, "PACKED", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: ready to dispatch ──────────────────────────────────────────────

    async def mark_ready(self, order_id: str, actor_id: str) -> OrderModel:
        """POST /admin/orders/{id}/ready → READY_TO_DISPATCH."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "READY_TO_DISPATCH"):
            raise BusinessLogicException(
                f"Cannot mark ready in status '{order.status}'."
            )
        _set_status(self.db, order, "READY_TO_DISPATCH", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: dispatch ───────────────────────────────────────────────────────

    async def dispatch_order(
        self, order_id: str, req: DispatchRequest, actor_id: str
    ) -> OrderModel:
        """POST /admin/orders/{id}/dispatch → SHIPPED."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "SHIPPED"):
            raise BusinessLogicException(
                f"Cannot dispatch order in status '{order.status}'."
            )
        if req.carrier:
            order.carrier = req.carrier
        if req.tracking_number:
            order.tracking_number = req.tracking_number
        if req.estimated_delivery:
            order.estimated_delivery = req.estimated_delivery

        order.dispatched_at = _now_utc()
        _set_status(self.db, order, "SHIPPED", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: out for delivery ───────────────────────────────────────────────

    async def mark_out_for_delivery(self, order_id: str, actor_id: str) -> OrderModel:
        """POST /admin/orders/{id}/out-for-delivery → OUT_FOR_DELIVERY."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "OUT_FOR_DELIVERY"):
            raise BusinessLogicException(
                f"Cannot mark out-for-delivery in status '{order.status}'."
            )
        _set_status(self.db, order, "OUT_FOR_DELIVERY", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: deliver ────────────────────────────────────────────────────────

    async def mark_delivered(self, order_id: str, actor_id: str) -> OrderModel:
        """POST /admin/orders/{id}/deliver → DELIVERED."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, "DELIVERED"):
            raise BusinessLogicException(
                f"Cannot mark delivered in status '{order.status}'."
            )
        order.delivered_at = _now_utc()
        _set_status(self.db, order, "DELIVERED", actor_id=actor_id)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: cancel ─────────────────────────────────────────────────────────

    async def admin_cancel(
        self, order_id: str, req: AdminCancelRequest, actor_id: str
    ) -> OrderModel:
        """POST /admin/orders/{id}/cancel — broader cancellable set."""
        order = await _load_order(self.db, order_id)
        if order.status not in ADMIN_CANCELLABLE_STATUSES:
            raise BusinessLogicException(
                f"Order cannot be cancelled in status '{order.status}'."
            )
        _set_status(self.db, order, "CANCELLED", actor_id=actor_id, note=req.reason)
        order.cancelled_at = _now_utc()
        order.cancellation_reason = req.reason
        order.cancelled_by = actor_id
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: add note ───────────────────────────────────────────────────────

    async def add_note(
        self, order_id: str, req: AddNoteRequest, actor_id: str, actor_name: Optional[str] = None
    ) -> OrderModel:
        """POST /admin/orders/{id}/notes."""
        order = await _load_order(self.db, order_id)
        notes = list(order.internal_notes or [])
        notes.append({
            "id": _new_uuid(),
            "authorId": actor_id,
            "authorName": actor_name or actor_id,
            "note": req.note,
            "createdAt": _now_utc().isoformat(),
        })
        order.internal_notes = notes
        timeline = list(order.timeline or [])
        timeline.append(_timeline_event("NOTE_ADDED", actor_id=actor_id))
        order.timeline = timeline
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: apply validated status ─────────────────────────────────────────

    async def apply_status(
        self, order_id: str, req: ApplyStatusRequest, actor_id: str
    ) -> OrderModel:
        """POST /admin/orders/{id}/status — validated by ORDER_TRANSITIONS."""
        order = await _load_order(self.db, order_id)
        if not _can_transition(order.status, req.status):
            raise BusinessLogicException(
                f"Transition '{order.status}' → '{req.status}' is not allowed."
            )
        _set_status(self.db, order, req.status, actor_id=actor_id, note=req.note)
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: force status (bypasses adjacency) ──────────────────────────────

    async def force_status(
        self, order_id: str, req: ForceStatusRequest, actor_id: str
    ) -> OrderModel:
        """POST /admin/orders/{id}/force-status — bypasses ORDER_TRANSITIONS; always audited."""
        order = await _load_order(self.db, order_id)
        # Force — no adjacency check; reason is mandatory (enforced by schema)
        _set_status(
            self.db, order, req.status,
            actor_id=actor_id,
            note=f"[FORCE] {req.reason}",
        )
        await self.db.flush()
        return await _load_order(self.db, order.id)

    # ── Admin: invoice ────────────────────────────────────────────────────────

    async def get_invoice(self, order_id: str) -> Dict[str, Any]:
        """GET /admin/orders/{id}/invoice."""
        order = await _load_order(self.db, order_id)
        return {
            "order_id": order.id,
            "invoice_number": order.invoice_number,
            "issued_at": order.invoice_issued_at,
        }

    # ── Internal: load return ─────────────────────────────────────────────────

    async def _load_return(self, return_id: str) -> Any:
        from app.models.orders.return_order import ReturnOrderModel
        from app.models.orders.return_item import ReturnItemModel

        stmt = (
            select(ReturnOrderModel)
            .where(ReturnOrderModel.id == return_id)
            .options(selectinload(ReturnOrderModel.items))
        )
        result = await self.db.execute(stmt)
        ret = result.scalars().first()
        if not ret:
            raise NotFoundException(f"Return '{return_id}' not found.")
        return ret
