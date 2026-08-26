"""
Collection — Pydantic schemas.

Response shapes follow API_CONTRACT.md § COLLECTIONS verbatim.

Key points:
  - displayStatus is DERIVED from (status, startDate, endDate) — it is never
    sent by the client and never stored; the service sets it before returning.
  - resolvedProductCount is computed server-side.
  - rule shape: { flag?, occasion?, fabricIncludes? }
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ─────────────────────────────────────────────────────────────────────────────
# Collection rule schema
# ─────────────────────────────────────────────────────────────────────────────

class CollectionRule(BaseModel):
    flag: Optional[str] = None
    occasion: Optional[str] = None
    fabricIncludes: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Public response shape
# ─────────────────────────────────────────────────────────────────────────────

class CollectionResponse(BaseModel):
    """
    Public collection shape — verbatim from API_CONTRACT.md § COLLECTIONS.

    { id, name, slug, eyebrow, description, image, heroMediaId,
      thumbnailMediaId, type, status, displayStatus, featured, sortOrder,
      startDate, endDate, rule, explicitProductIds[], resolvedProductCount }
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    slug: str
    eyebrow: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = ""
    heroMediaId: Optional[str] = Field(None, alias="hero_media_id")
    thumbnailMediaId: Optional[str] = Field(None, alias="thumbnail_media_id")
    type: str = "MANUAL"
    status: str
    displayStatus: str = ""          # derived, injected by service
    featured: bool = False
    sortOrder: int = Field(0, alias="sort_order")
    startDate: Optional[datetime] = Field(None, alias="start_date")
    endDate: Optional[datetime] = Field(None, alias="end_date")
    rule: Optional[Dict[str, Any]] = None
    explicitProductIds: List[str] = Field(default_factory=list, alias="explicit_product_ids")
    resolvedProductCount: int = 0    # injected by service


# ─────────────────────────────────────────────────────────────────────────────
# Create / Update request bodies
# ─────────────────────────────────────────────────────────────────────────────

class CollectionCreateRequest(BaseModel):
    """Body for POST /admin/collections."""

    name: str
    slug: Optional[str] = None              # auto-derived from name if omitted
    eyebrow: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = ""
    hero_media_id: Optional[str] = None
    thumbnail_media_id: Optional[str] = None
    type: str = "MANUAL"                    # MANUAL | RULE_BASED
    featured: bool = False
    sort_order: int = 0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    # MANUAL collections
    explicit_product_ids: Optional[List[str]] = None
    # RULE_BASED collections
    rule: Optional[Dict[str, Any]] = None


class CollectionUpdateRequest(BaseModel):
    """Body for PATCH /admin/collections/{id} — all fields optional."""

    name: Optional[str] = None
    slug: Optional[str] = None
    eyebrow: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    hero_media_id: Optional[str] = None
    thumbnail_media_id: Optional[str] = None
    type: Optional[str] = None
    featured: Optional[bool] = None
    sort_order: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    explicit_product_ids: Optional[List[str]] = None
    rule: Optional[Dict[str, Any]] = None


class AssignProductsRequest(BaseModel):
    """
    Body for PUT /admin/collections/{id}/products.
    Replaces the full explicit product list (MANUAL collections only).
    Sources: assignProductsToCollection / addProductsToCollection /
             removeProductsFromCollection in the frontend.
    """

    productIds: List[str]


# ─────────────────────────────────────────────────────────────────────────────
# Response wrappers — keep the { ok: true, … } envelope
# ─────────────────────────────────────────────────────────────────────────────

class CollectionListResponse(BaseModel):
    ok: bool = True
    items: List[CollectionResponse]


class SingleCollectionResponse(BaseModel):
    ok: bool = True
    collection: CollectionResponse


class OkResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None
