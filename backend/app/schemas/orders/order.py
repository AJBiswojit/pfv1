"""
Pydantic schemas for the Orders section.

Covers all 24 ORDERS endpoints from API_CONTRACT.md:
  Customer:
    POST  /orders                        PlaceOrderRequest  → OrderResponse
    GET   /orders                        OrderListResponse
    GET   /orders/{orderId}              OrderResponse
    GET   /orders/{orderId}/tracking     TrackingResponse
    POST  /orders/{orderId}/cancel       CancelOrderRequest → OrderResponse
    POST  /orders/{orderId}/returns      CreateReturnRequest → ReturnResponse
    GET   /orders/{orderId}/returns/{id} ReturnResponse
    POST  /orders/claim-guest            ClaimGuestOrdersRequest → OkResponse

  Admin (fulfillment + management):
    GET   /admin/orders                  AdminOrderListResponse
    GET   /admin/orders/{id}             AdminOrderDetailResponse
    POST  /admin/orders/{id}/allocate
    POST  /admin/orders/{id}/fulfillment FulfillmentAssignRequest
    POST  /admin/orders/{id}/pick/start
    POST  /admin/orders/{id}/pick/item   PickItemRequest
    POST  /admin/orders/{id}/pack
    POST  /admin/orders/{id}/ready
    POST  /admin/orders/{id}/dispatch    DispatchRequest
    POST  /admin/orders/{id}/out-for-delivery
    POST  /admin/orders/{id}/deliver
    POST  /admin/orders/{id}/cancel      AdminCancelRequest
    POST  /admin/orders/{id}/notes       AddNoteRequest
    POST  /admin/orders/{id}/status      ApplyStatusRequest
    POST  /admin/orders/{id}/force-status ForceStatusRequest
    GET   /admin/orders/{id}/invoice     InvoiceResponse

  Admin Returns desk:
    GET  /admin/returns
    GET  /admin/returns/{id}
    POST /admin/returns/{id}/approve
    POST /admin/returns/{id}/reject       ReturnRejectRequest
    POST /admin/returns/{id}/schedule-pickup SchedulePickupRequest
    POST /admin/returns/{id}/receive      ReceiveReturnRequest
    POST /admin/returns/{id}/inspect      InspectReturnRequest
    POST /admin/returns/{id}/refund/initiate
    POST /admin/returns/{id}/refund/complete
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Shared address shape (matches customer address contract) ──────────────────

class AddressSnapshot(BaseModel):
    full_name: str = Field(..., alias="fullName")
    phone: str
    address_line: str = Field(..., alias="addressLine")
    landmark: Optional[str] = None
    city: str
    state: str
    pincode: str
    type: Optional[str] = "Home"

    model_config = ConfigDict(populate_by_name=True)


# ── Order item shapes ─────────────────────────────────────────────────────────

class PlaceOrderItem(BaseModel):
    product_id: str = Field(..., alias="productId")
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: int = Field(..., ge=1)

    model_config = ConfigDict(populate_by_name=True)


class OrderItemResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    product_image: Optional[str] = None
    sku: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    unit_price: int
    original_price: int
    quantity: int
    line_total: int
    returned_quantity: int = 0

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ── Status history ────────────────────────────────────────────────────────────

class StatusHistoryEntry(BaseModel):
    id: str
    from_status: Optional[str] = None
    to_status: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Tracking shapes ───────────────────────────────────────────────────────────

class TrackingEvent(BaseModel):
    timestamp: str
    location: str
    description: str
    status: str


class TrackingResponse(BaseModel):
    ok: bool = True
    order_id: str
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    origin: str = "Bhubaneswar, Odisha"
    estimated_delivery: Optional[str] = None
    events: List[TrackingEvent] = []

    model_config = ConfigDict(populate_by_name=True)


# ── Full order response ───────────────────────────────────────────────────────

class OrderResponse(BaseModel):
    id: str
    order_number: str
    customer_id: Optional[str] = None
    guest_email: Optional[str] = None
    status: str
    payment_status: str
    payment_method: str
    delivery_method: str
    shipping_address: Optional[Dict[str, Any]] = None
    items: List[OrderItemResponse] = []
    subtotal: int
    product_discount: int
    coupon_discount: int
    coupon_code: Optional[str] = None
    shipping_fee: int
    cod_fee: int
    total: int
    customer_note: Optional[str] = None
    timeline: Optional[List[Dict[str, Any]]] = []
    status_history: List[StatusHistoryEntry] = []
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None
    estimated_delivery: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    dispatched_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_issued_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SingleOrderResponse(BaseModel):
    ok: bool = True
    order: OrderResponse


class OrderListResponse(BaseModel):
    ok: bool = True
    orders: List[OrderResponse]
    total: int


# ── Admin order response (includes internal_notes) ────────────────────────────

class AdminOrderResponse(OrderResponse):
    internal_notes: Optional[List[Dict[str, Any]]] = []
    fulfillment_location_id: Optional[str] = None
    fulfillment_handler_id: Optional[str] = None


class AdminSingleOrderResponse(BaseModel):
    ok: bool = True
    order: AdminOrderResponse


class AdminOrderListResponse(BaseModel):
    ok: bool = True
    orders: List[AdminOrderResponse]
    total: int
    page: int = 1
    page_size: int = 20


# ── Place order ───────────────────────────────────────────────────────────────

class CustomerSnapshot(BaseModel):
    first_name: str = Field(..., alias="firstName")
    last_name: str = Field(..., alias="lastName")
    email: str
    phone: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class PlaceOrderRequest(BaseModel):
    items: List[PlaceOrderItem]
    customer: CustomerSnapshot
    address: AddressSnapshot
    delivery_method: str = Field("standard", alias="deliveryMethod")
    payment_method: str = Field(..., alias="paymentMethod")
    coupon_code: Optional[str] = Field(None, alias="couponCode")
    customer_note: Optional[str] = Field(None, alias="customerNote")
    inventory_reservation_id: Optional[str] = Field(None, alias="inventoryReservationId")

    model_config = ConfigDict(populate_by_name=True)


# ── Cancel order ──────────────────────────────────────────────────────────────

class CancelOrderRequest(BaseModel):
    reason: Optional[str] = None


# ── Return order ──────────────────────────────────────────────────────────────

class ReturnItemRequest(BaseModel):
    line_id: str = Field(..., alias="lineId")
    quantity: int = Field(..., ge=1)
    reason: str

    model_config = ConfigDict(populate_by_name=True)


class CreateReturnRequest(BaseModel):
    items: List[ReturnItemRequest]
    pickup_method: str = Field("SCHEDULED_PICKUP", alias="pickupMethod")

    model_config = ConfigDict(populate_by_name=True)


class ReturnItemResponse(BaseModel):
    id: str
    order_item_id: str
    product_id: str
    product_name: str
    quantity: int
    reason: Optional[str] = None
    refund_amount: int = 0

    model_config = ConfigDict(from_attributes=True)


class ReturnResponse(BaseModel):
    id: str
    order_id: str
    return_number: str
    customer_id: Optional[str] = None
    status: str
    pickup_method: str
    refund_amount: int = 0
    refund_status: str
    items: List[ReturnItemResponse] = []
    timeline: Optional[List[Dict[str, Any]]] = []
    rejection_reason: Optional[str] = None
    rejection_reason_customer: Optional[str] = None
    package_condition: Optional[str] = None
    inspection_condition: Optional[str] = None
    inspection_notes: Optional[str] = None
    refund_method: Optional[str] = None
    refund_initiated_at: Optional[datetime] = None
    refund_completed_at: Optional[datetime] = None
    pickup_scheduled_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SingleReturnResponse(BaseModel):
    ok: bool = True
    return_order: ReturnResponse


class ReturnListResponse(BaseModel):
    ok: bool = True
    returns: List[ReturnResponse]
    total: int


# ── Claim guest orders ────────────────────────────────────────────────────────

class ClaimGuestOrdersRequest(BaseModel):
    email: str


class OkResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None


# ── Admin fulfillment requests ────────────────────────────────────────────────

class FulfillmentAssignRequest(BaseModel):
    location_id: Optional[str] = Field(None, alias="locationId")
    handler_id: Optional[str] = Field(None, alias="handlerId")

    model_config = ConfigDict(populate_by_name=True)


class PickItemRequest(BaseModel):
    order_item_id: str = Field(..., alias="orderItemId")

    model_config = ConfigDict(populate_by_name=True)


class DispatchRequest(BaseModel):
    carrier: Optional[str] = None
    tracking_number: Optional[str] = Field(None, alias="trackingNumber")
    estimated_delivery: Optional[datetime] = Field(None, alias="estimatedDelivery")

    model_config = ConfigDict(populate_by_name=True)


class AdminCancelRequest(BaseModel):
    reason: Optional[str] = None


class AddNoteRequest(BaseModel):
    note: str


class ApplyStatusRequest(BaseModel):
    status: str
    note: Optional[str] = None


class ForceStatusRequest(BaseModel):
    status: str
    reason: str   # Required for force transitions — always audited


class InvoiceResponse(BaseModel):
    ok: bool = True
    order_id: str
    invoice_number: Optional[str] = None
    issued_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


# ── Admin returns desk ────────────────────────────────────────────────────────

class ReturnRejectRequest(BaseModel):
    reason: str   # Internal reason code
    customer_message: Optional[str] = Field(None, alias="customerMessage")

    model_config = ConfigDict(populate_by_name=True)


class SchedulePickupRequest(BaseModel):
    scheduled_at: datetime = Field(..., alias="scheduledAt")
    pickup_address: Optional[Dict[str, Any]] = Field(None, alias="pickupAddress")

    model_config = ConfigDict(populate_by_name=True)


class ReceiveReturnRequest(BaseModel):
    package_condition: str = Field(..., alias="packageCondition")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class InspectReturnRequest(BaseModel):
    inspection_condition: str = Field(..., alias="inspectionCondition")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)
