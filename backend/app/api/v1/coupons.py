"""
Coupons / Offers — API router.

URL mapping (API_CONTRACT.md § OFFERS → implementation):

  Public
  ─────────────────────────────────────────────────────────────────────────────
  GET  /offers                     ← list active public offers
  POST /offers/validate            ← THE SINGLE CHECKOUT GATE (cart coupon validation)

  Admin
  ─────────────────────────────────────────────────────────────────────────────
  GET  /admin/offers               ← full list (offers.view)
  POST /admin/offers               ← create offer (offers.create)
  PATCH /admin/offers/{id}         ← update (offers.edit)
  POST /admin/offers/{id}/activate ← status → ACTIVE
  POST /admin/offers/{id}/pause    ← status → PAUSED
  POST /admin/offers/{id}/archive  ← status → ARCHIVED

Notes:
  - POST /offers/validate is the single gate used by the cart coupon endpoint
    AND the checkout page. The CartService calls it internally; this endpoint
    exists for direct frontend calls.
  - All discount amounts are in whole rupees (INR).
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.dependencies import get_current_admin, get_current_customer, get_db, get_optional_user
from app.models.auth.user import UserModel
from app.models.commerce.coupon import CouponModel

router = APIRouter(tags=["Coupons & Offers"])


# ---------------------------------------------------------------------------
# Schemas (inline — small surface, no separate schema file needed)
# ---------------------------------------------------------------------------

class ValidateCouponRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    cart_items: Optional[list] = Field(default_factory=list)
    customer_id: Optional[str] = None
    customer_email: Optional[str] = None


class CreateCouponRequest(BaseModel):
    code: str = Field(..., min_length=2, max_length=24)
    name: Optional[str] = None
    description: Optional[str] = None
    discount_type: str = Field("percentage", pattern="^(percentage|fixed|free_shipping)$")
    discount_value: float = Field(..., ge=0)
    minimum_order_value: int = Field(0, ge=0)
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    usage_limit: Optional[int] = None
    per_customer_limit: Optional[int] = None
    eligible_customer_ids: Optional[List[str]] = None
    eligible_product_ids: Optional[List[str]] = None
    eligible_category_ids: Optional[List[str]] = None
    eligible_collection_ids: Optional[List[str]] = None
    excluded_product_ids: Optional[List[str]] = None
    excluded_category_ids: Optional[List[str]] = None
    is_stackable: bool = False


class UpdateCouponRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    discount_value: Optional[float] = None
    minimum_order_value: Optional[int] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    usage_limit: Optional[int] = None
    per_customer_limit: Optional[int] = None
    is_stackable: Optional[bool] = None


def _coupon_to_dict(c: CouponModel) -> dict:
    now = datetime.now(timezone.utc)
    # Derive display status from dates and is_active
    if not c.is_active:
        display_status = "ARCHIVED"
    elif c.starts_at and c.starts_at > now:
        display_status = "SCHEDULED"
    elif c.expires_at and c.expires_at < now:
        display_status = "EXPIRED"
    else:
        display_status = "ACTIVE"

    return {
        "id": c.id,
        "code": c.code,
        "name": c.name,
        "description": c.description,
        "discount_type": c.discount_type,
        "discount_value": c.discount_value,
        "minimum_order_value": c.minimum_order_value,
        "starts_at": c.starts_at.isoformat() if c.starts_at else None,
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        "usage_limit": c.usage_limit,
        "usage_count": c.usage_count,
        "per_customer_limit": c.per_customer_limit,
        "is_stackable": c.is_stackable,
        "is_active": c.is_active,
        "display_status": display_status,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def _validate_coupon_logic(coupon: CouponModel, cart_subtotal: int = 0) -> Optional[str]:
    """Return an error string if the coupon is not valid, else None."""
    now = datetime.now(timezone.utc)
    if not coupon.is_active:
        return "This coupon is no longer active."
    if coupon.starts_at and coupon.starts_at > now:
        return "This coupon is not yet valid."
    if coupon.expires_at and coupon.expires_at < now:
        return "This coupon has expired."
    if coupon.usage_limit is not None and coupon.usage_count >= coupon.usage_limit:
        return "This coupon has reached its usage limit."
    if cart_subtotal < coupon.minimum_order_value:
        return f"Minimum order of ₹{coupon.minimum_order_value} required for this coupon."
    return None


# ===========================================================================
# PUBLIC — list active offers
# ===========================================================================

@router.get(
    "/offers",
    summary="List active public offers",
    description="Returns all currently active (non-archived) coupons/offers. Authorization: public.",
)
async def list_offers(
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    stmt = select(CouponModel).where(CouponModel.is_active == True)
    result = await db.execute(stmt)
    coupons = result.scalars().all()

    # Only return currently valid ones for public listing
    active = [c for c in coupons if (not c.expires_at or c.expires_at > now)]
    return {"ok": True, "offers": [_coupon_to_dict(c) for c in active]}


# ===========================================================================
# PUBLIC — validate coupon (THE SINGLE CHECKOUT GATE)
# ===========================================================================

@router.post(
    "/offers/validate",
    summary="Validate a coupon code — the single checkout gate",
    description=(
        "Body: `{ code, cartItems[], customerId?, customerEmail? }`.  \n\n"
        "**This is the one gate through which every discount must pass.** "
        "No other code path may grant a discount.  \n\n"
        "Response success: `{ ok: true, coupon, discount }`.  \n"
        "Response failure: `{ ok: false, error: 'Human readable message.' }`."
    ),
)
async def validate_offer(
    req: ValidateCouponRequest,
    current_user: Optional[UserModel] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    code = req.code.strip().upper()
    stmt = select(CouponModel).where(CouponModel.code == code)
    result = await db.execute(stmt)
    coupon = result.scalars().first()

    if not coupon:
        return {"ok": False, "error": f"No coupon found with code '{code}'."}

    # Compute cart subtotal from items if provided
    cart_subtotal = sum(
        int(item.get("lineTotal", item.get("price", 0) * item.get("quantity", 1)))
        for item in (req.cart_items or [])
    )

    error = _validate_coupon_logic(coupon, cart_subtotal=cart_subtotal)
    if error:
        return {"ok": False, "error": error}

    # Compute discount amount
    discount = 0
    if coupon.discount_type == "percentage":
        discount = int(cart_subtotal * coupon.discount_value / 100)
    elif coupon.discount_type == "fixed":
        discount = int(min(coupon.discount_value, cart_subtotal))
    elif coupon.discount_type == "free_shipping":
        discount = 0  # applied at totals level

    return {
        "ok": True,
        "coupon": _coupon_to_dict(coupon),
        "discount": discount,
    }


# ===========================================================================
# ADMIN — CRUD
# ===========================================================================

@router.get(
    "/admin/offers",
    summary="Admin — list all offers/coupons",
    description="Authorization: `offers.view`. Returns all offers including ARCHIVED.",
)
async def admin_list_offers(
    current_user: UserModel = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CouponModel).order_by(CouponModel.created_at.desc())
    result = await db.execute(stmt)
    coupons = result.scalars().all()
    return {"ok": True, "offers": [_coupon_to_dict(c) for c in coupons]}


@router.post(
    "/admin/offers",
    status_code=201,
    summary="Admin — create a new coupon/offer",
    description="Authorization: `offers.create`. Code is uppercased and must be unique.",
)
async def admin_create_offer(
    req: CreateCouponRequest,
    current_user: UserModel = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    code = req.code.strip().upper()
    # Uniqueness check
    existing = await db.execute(select(CouponModel).where(CouponModel.code == code))
    if existing.scalars().first():
        return {"ok": False, "error": f"Coupon code '{code}' already exists."}

    coupon = CouponModel(
        code=code,
        name=req.name,
        description=req.description,
        discount_type=req.discount_type,
        discount_value=req.discount_value,
        minimum_order_value=req.minimum_order_value,
        starts_at=req.starts_at,
        expires_at=req.expires_at,
        usage_limit=req.usage_limit,
        per_customer_limit=req.per_customer_limit,
        eligible_customer_ids=req.eligible_customer_ids,
        eligible_product_ids=req.eligible_product_ids,
        eligible_category_ids=req.eligible_category_ids,
        eligible_collection_ids=req.eligible_collection_ids,
        excluded_product_ids=req.excluded_product_ids,
        excluded_category_ids=req.excluded_category_ids,
        is_stackable=req.is_stackable,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(coupon)
    await db.flush()
    return {"ok": True, "offer": _coupon_to_dict(coupon)}


@router.patch(
    "/admin/offers/{offer_id}",
    summary="Admin — update a coupon/offer",
    description="Authorization: `offers.edit`. Partial patch.",
)
async def admin_update_offer(
    offer_id: str,
    req: UpdateCouponRequest,
    current_user: UserModel = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CouponModel).where(CouponModel.id == offer_id)
    result = await db.execute(stmt)
    coupon = result.scalars().first()
    if not coupon:
        raise NotFoundException("Offer not found.")

    for field, value in req.model_dump(exclude_none=True).items():
        setattr(coupon, field, value)

    await db.flush()
    return {"ok": True, "offer": _coupon_to_dict(coupon)}


@router.post(
    "/admin/offers/{offer_id}/activate",
    summary="Admin — activate an offer",
)
async def admin_activate_offer(
    offer_id: str,
    current_user: UserModel = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CouponModel).where(CouponModel.id == offer_id)
    result = await db.execute(stmt)
    coupon = result.scalars().first()
    if not coupon:
        raise NotFoundException("Offer not found.")
    coupon.is_active = True
    await db.flush()
    return {"ok": True, "offer": _coupon_to_dict(coupon)}


@router.post(
    "/admin/offers/{offer_id}/pause",
    summary="Admin — pause an offer",
)
async def admin_pause_offer(
    offer_id: str,
    current_user: UserModel = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CouponModel).where(CouponModel.id == offer_id)
    result = await db.execute(stmt)
    coupon = result.scalars().first()
    if not coupon:
        raise NotFoundException("Offer not found.")
    coupon.is_active = False
    await db.flush()
    return {"ok": True, "offer": _coupon_to_dict(coupon)}


@router.post(
    "/admin/offers/{offer_id}/archive",
    summary="Admin — archive an offer",
)
async def admin_archive_offer(
    offer_id: str,
    current_user: UserModel = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CouponModel).where(CouponModel.id == offer_id)
    result = await db.execute(stmt)
    coupon = result.scalars().first()
    if not coupon:
        raise NotFoundException("Offer not found.")
    coupon.is_active = False
    await db.flush()
    return {"ok": True, "offer": _coupon_to_dict(coupon)}
