"""
Product Pydantic schemas.

Mirrors the full shape from PRODUCT_CATALOGUE_SPEC.md §3 and API_CONTRACT.md.
Envelope convention: { ok: true, ... } or { ok: false, error / errors }.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ── Enums / literal constants ────────────────────────────────────────────────

PRODUCT_STATUS_VALUES = ("DRAFT", "PENDING_REVIEW", "PUBLISHED", "ARCHIVED")
REVIEW_STATE_VALUES = ("NONE", "PENDING", "APPROVED", "REJECTED")
SORT_ALIASES: Dict[str, str] = {
    "price-low": "price-asc",
    "price-high": "price-desc",
    "name": "name-asc",
    "az": "name-asc",
}
VALID_SORTS = {
    "recommended", "newest", "price-asc", "price-desc",
    "discount", "name-asc", "popularity", "rating",
}
PRODUCT_ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{1,14}$")


# ── Nested sub-schemas ────────────────────────────────────────────────────────

class PricingDetail(BaseModel):
    mrp: int = 0
    selling_price: int = Field(0, alias="sellingPrice")
    discount_type: str = Field("none", alias="discountType")
    discount_value: float = Field(0.0, alias="discountValue")
    tax_mode: str = Field("INCLUSIVE", alias="taxMode")
    tax_rate: float = Field(0.0, alias="taxRate")
    custom_tax_rate: Optional[float] = Field(None, alias="customTaxRate")

    model_config = ConfigDict(populate_by_name=True)


class ReviewDetail(BaseModel):
    state: str = "NONE"
    submitted_by: Optional[str] = Field(None, alias="submittedBy")
    submitted_at: Optional[str] = Field(None, alias="submittedAt")
    reviewed_by: Optional[str] = Field(None, alias="reviewedBy")
    reviewed_at: Optional[str] = Field(None, alias="reviewedAt")
    rejection_reason: str = Field("", alias="rejectionReason")

    model_config = ConfigDict(populate_by_name=True)


class SeoDetail(BaseModel):
    title: str = ""
    description: str = ""


class ReturnPolicy(BaseModel):
    eligibility: str = ""
    window: str = ""
    notes: str = ""


class FacetValue(BaseModel):
    value: str
    label: str
    count: int


class FacetCounts(BaseModel):
    category: List[FacetValue] = []
    subcategory: List[FacetValue] = []
    gender: List[FacetValue] = []
    price: List[FacetValue] = []
    size: List[FacetValue] = []
    color: List[FacetValue] = []
    fabric: List[FacetValue] = []
    material: List[FacetValue] = []
    occasion: List[FacetValue] = []
    collection: List[FacetValue] = []
    rating: List[FacetValue] = []
    availability: List[FacetValue] = []


# ── Storefront (customer-facing) product ─────────────────────────────────────

class StorefrontProduct(BaseModel):
    """Public projection returned to customers — toStorefrontProduct()."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    product_id: str = Field(alias="productId", default="")
    name: str = ""
    slug: str = ""
    sku: str = ""
    brand: str = "Pratikshya Fashon"
    product_type: str = Field("fashion", alias="productType")
    category: str = ""
    subcategory: str = ""
    gender: str = "Women"

    short_description: str = Field("", alias="shortDescription")
    description: str = ""
    highlights: List[Any] = []
    care_instructions: List[Any] = Field([], alias="careInstructions")
    delivery_info: str = Field("", alias="deliveryInfo")
    return_info: str = Field("", alias="returnInfo")
    return_policy: Optional[ReturnPolicy] = Field(None, alias="returnPolicy")

    fabric: str = ""
    material: str = ""
    primary_color: str = Field("", alias="primaryColor")
    secondary_color: str = Field("", alias="secondaryColor")
    colors: List[str] = []
    patterns: List[str] = []
    occasion: List[str] = []
    sizes: List[str] = []
    unavailable_colors: List[str] = Field([], alias="unavailableColors")
    unavailable_sizes: List[str] = Field([], alias="unavailableSizes")
    season: str = ""
    fit: str = ""
    length: str = ""

    collection: str = ""
    collections: List[str] = []
    tags: List[str] = []
    badges: List[Any] = []
    is_featured: bool = Field(False, alias="isFeatured")
    is_bestseller: bool = Field(False, alias="isBestseller")
    is_new: bool = Field(False, alias="isNew")
    is_limited_edition: bool = Field(False, alias="isLimitedEdition")
    is_trending: bool = Field(False, alias="isTrending")

    price: int = 0
    original_price: Optional[int] = Field(None, alias="originalPrice")
    currency: str = "INR"
    # Derived from pricing engine
    discount_percent: float = Field(0.0, alias="discountPercent")
    is_on_sale: bool = Field(False, alias="isOnSale")

    stock: int = 0
    availability: str = "in-stock"

    rating: Optional[float] = None
    review_count: int = Field(0, alias="reviewCount")

    # Media
    image: str = ""
    hover_image: str = Field("", alias="hoverImage")
    additional_images: List[str] = Field([], alias="additionalImages")
    primary_media_id: Optional[str] = Field(None, alias="primaryMediaId")

    href: str = ""
    status: str = "PUBLISHED"


# ── Admin product (full record) ───────────────────────────────────────────────

class AdminProduct(BaseModel):
    """Full admin record — includes review workflow fields."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    product_id: str = Field(alias="productId", default="")
    name: str = ""
    slug: str = ""
    sku: str = ""
    brand: str = "Pratikshya Fashon"
    product_type: str = Field("fashion", alias="productType")
    product_code: str = Field("", alias="productCode")
    barcode: str = ""
    internal_reference: str = Field("", alias="internalReference")

    category: str = ""
    subcategory: str = ""
    gender: str = "Women"

    short_description: str = Field("", alias="shortDescription")
    description: str = ""
    highlights: List[Any] = []
    specifications: Dict[str, Any] = {}
    care_instructions: List[Any] = Field([], alias="careInstructions")
    delivery_info: str = Field("", alias="deliveryInfo")
    return_info: str = Field("", alias="returnInfo")
    return_policy: Optional[ReturnPolicy] = Field(None, alias="returnPolicy")

    fabric: str = ""
    material: str = ""
    primary_color: str = Field("", alias="primaryColor")
    secondary_color: str = Field("", alias="secondaryColor")
    colors: List[str] = []
    patterns: List[str] = []
    work: List[str] = []
    occasion: List[str] = []
    sizes: List[str] = []
    unavailable_colors: List[str] = Field([], alias="unavailableColors")
    unavailable_sizes: List[str] = Field([], alias="unavailableSizes")
    season: str = ""
    fit: str = ""
    length: str = ""

    collection: str = ""
    collections: List[str] = []
    tags: List[str] = []
    badges: List[Any] = []
    is_featured: bool = Field(False, alias="isFeatured")
    is_bestseller: bool = Field(False, alias="isBestseller")
    is_new: bool = Field(False, alias="isNew")
    is_limited_edition: bool = Field(False, alias="isLimitedEdition")
    is_trending: bool = Field(False, alias="isTrending")
    flags: Dict[str, bool] = {}

    price: int = 0
    original_price: Optional[int] = Field(None, alias="originalPrice")
    compare_at_price: Optional[int] = Field(None, alias="compareAtPrice")
    currency: str = "INR"
    pricing: Optional[PricingDetail] = None
    price_history: List[Dict[str, Any]] = Field([], alias="priceHistory")

    stock: int = 0
    availability: str = "in-stock"
    inventory_tracked: bool = Field(False, alias="inventoryTracked")
    low_stock_threshold: int = Field(5, alias="lowStockThreshold")

    rating: Optional[float] = None
    review_count: int = Field(0, alias="reviewCount")

    seo: Optional[SeoDetail] = None

    status: str = "DRAFT"
    published: bool = False
    review: Optional[ReviewDetail] = None
    review_flags: List[str] = Field([], alias="reviewFlags")
    assigned_employee_id: Optional[str] = Field(None, alias="assignedEmployeeId")

    media_ids: List[str] = Field([], alias="mediaIds")
    primary_media_id: Optional[str] = Field(None, alias="primaryMediaId")
    gallery_media_ids: List[str] = Field([], alias="galleryMediaIds")
    image: str = ""
    hover_image: str = Field("", alias="hoverImage")
    additional_images: List[str] = Field([], alias="additionalImages")

    created_by: Optional[str] = Field(None, alias="createdBy")
    created_at: Optional[str] = Field(None, alias="createdAt")
    updated_by: Optional[str] = Field(None, alias="updatedBy")
    updated_at: Optional[str] = Field(None, alias="updatedAt")
    published_by: Optional[str] = Field(None, alias="publishedBy")
    published_at: Optional[str] = Field(None, alias="publishedAt")
    history: List[Dict[str, Any]] = []


# ── Request bodies ────────────────────────────────────────────────────────────

class ProductCreateRequest(BaseModel):
    """POST /admin/products — create a product."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = ""
    category: str = ""
    subcategory: Optional[str] = ""
    gender: str = "Women"
    description: Optional[str] = ""
    short_description: Optional[str] = Field("", alias="shortDescription")
    sku: Optional[str] = ""
    price: int = 0
    compare_at_price: Optional[int] = Field(None, alias="compareAtPrice")
    pricing: Optional[PricingDetail] = None
    stock: int = 0
    # Allow arbitrary additional fields — stored as-is
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class ProductDraftRequest(BaseModel):
    """POST /admin/products/draft — create draft with caller-supplied permanent ID."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = Field(..., description="Permanent product ID, pattern ^[A-Z0-9][A-Z0-9-]{1,14}$")
    name: Optional[str] = ""
    category: str
    subcategory: Optional[str] = ""
    media_ids: List[str] = Field([], alias="mediaIds")

    @field_validator("id")
    @classmethod
    def validate_product_id(cls, v: str) -> str:
        if not PRODUCT_ID_RE.match(v):
            raise ValueError("Product ID must match ^[A-Z0-9][A-Z0-9-]{1,14}$")
        return v


class ProductUpdateRequest(BaseModel):
    """PATCH /admin/products/{id} — full-field patch for admin."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    name: Optional[str] = None
    slug: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    gender: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, alias="shortDescription")
    price: Optional[int] = None
    compare_at_price: Optional[int] = Field(None, alias="compareAtPrice")
    pricing: Optional[PricingDetail] = None
    status: Optional[str] = None
    assigned_employee_id: Optional[str] = Field(None, alias="assignedEmployeeId")


# 30-field whitelist from API_CONTRACT.md for employee edits
EMPLOYEE_EDITABLE_FIELDS = {
    "name", "price", "compare_at_price", "compareAtPrice",
    "description", "short_description", "shortDescription",
    "category", "subcategory", "gender", "fabric", "material",
    "primary_color", "primaryColor", "secondary_color", "secondaryColor",
    "colors", "patterns", "work", "occasion", "sizes", "season",
    "fit", "length", "highlights", "care_instructions", "careInstructions",
    "collection_ids", "collectionIds", "collections", "tags",
    "stock", "availability",
}


class EmployeeProductUpdateRequest(BaseModel):
    """PATCH /employee/products/{id} — whitelisted employee edit."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    name: Optional[str] = None
    price: Optional[int] = None
    compare_at_price: Optional[int] = Field(None, alias="compareAtPrice")
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, alias="shortDescription")
    category: Optional[str] = None
    subcategory: Optional[str] = None
    gender: Optional[str] = None
    fabric: Optional[str] = None
    material: Optional[str] = None
    primary_color: Optional[str] = Field(None, alias="primaryColor")
    secondary_color: Optional[str] = Field(None, alias="secondaryColor")
    colors: Optional[List[str]] = None
    patterns: Optional[List[str]] = None
    work: Optional[List[str]] = None
    occasion: Optional[List[str]] = None
    sizes: Optional[List[str]] = None
    season: Optional[str] = None
    fit: Optional[str] = None
    length: Optional[str] = None
    highlights: Optional[List[Any]] = None
    care_instructions: Optional[List[Any]] = Field(None, alias="careInstructions")
    collection_ids: Optional[List[str]] = Field(None, alias="collectionIds")
    collections: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    stock: Optional[int] = None
    availability: Optional[str] = None


class AssignEmployeeRequest(BaseModel):
    employee_id: Optional[str] = Field(None, alias="employeeId")

    model_config = ConfigDict(populate_by_name=True)


class RejectProductRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class ChangeProductIdRequest(BaseModel):
    new_id: str = Field(..., alias="newId")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("new_id")
    @classmethod
    def validate_new_id(cls, v: str) -> str:
        if not PRODUCT_ID_RE.match(v):
            raise ValueError("Product ID must match ^[A-Z0-9][A-Z0-9-]{1,14}$")
        return v


class BulkUpdateRequest(BaseModel):
    product_ids: List[str] = Field(..., alias="productIds")
    updates: Dict[str, Any]

    model_config = ConfigDict(populate_by_name=True)


class ClearReviewFlagsRequest(BaseModel):
    flags: List[str]


# ── Query params ──────────────────────────────────────────────────────────────

class ProductListQuery(BaseModel):
    """Query parameters for GET /products (storefront catalogue)."""

    q: Optional[str] = None
    category: Optional[Union[str, List[str]]] = None
    subcategory: Optional[Union[str, List[str]]] = None
    gender: Optional[Union[str, List[str]]] = None
    price: Optional[Union[str, List[str]]] = None
    size: Optional[Union[str, List[str]]] = None
    color: Optional[Union[str, List[str]]] = None
    fabric: Optional[Union[str, List[str]]] = None
    material: Optional[Union[str, List[str]]] = None
    occasion: Optional[Union[str, List[str]]] = None
    collection: Optional[Union[str, List[str]]] = None
    rating: Optional[Union[str, List[str]]] = None
    availability: Optional[Union[str, List[str]]] = None
    sort: str = "recommended"
    page: int = 1
    page_size: int = Field(20, alias="pageSize")
    # Internal — set by GET /collections/{id}/products to restrict results
    # to the pre-resolved membership set. Not a public query parameter.
    _collection_product_ids: Optional[List[str]] = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("sort")
    @classmethod
    def resolve_sort(cls, v: str) -> str:
        resolved = SORT_ALIASES.get(v, v)
        if resolved not in VALID_SORTS:
            return "recommended"
        return resolved


class AdminProductListQuery(BaseModel):
    """Query parameters for GET /admin/products."""

    status: Optional[str] = None
    category: Optional[str] = None
    assigned_employee_id: Optional[str] = Field(None, alias="assignedEmployeeId")
    q: Optional[str] = None
    sort: str = "newest"

    model_config = ConfigDict(populate_by_name=True)


# ── Response envelopes ────────────────────────────────────────────────────────

class ProductListResponse(BaseModel):
    ok: bool = True
    items: List[StorefrontProduct] = []
    total: int = 0
    facets: FacetCounts = Field(default_factory=FacetCounts)
    applied_filters: Dict[str, Any] = Field({}, alias="appliedFilters")

    model_config = ConfigDict(populate_by_name=True)


class AdminProductListResponse(BaseModel):
    ok: bool = True
    items: List[AdminProduct] = []
    total: int = 0


class SingleProductResponse(BaseModel):
    ok: bool = True
    product: AdminProduct


class StorefrontProductResponse(BaseModel):
    ok: bool = True
    product: Optional[StorefrontProduct] = None


class PublishIssuesResponse(BaseModel):
    ok: bool = True
    issues: List[str] = []


class AvailabilityResponse(BaseModel):
    ok: bool = True
    sku_taken: bool = Field(False, alias="skuTaken")
    slug_taken: bool = Field(False, alias="slugTaken")
    suggested_slug: Optional[str] = Field(None, alias="suggestedSlug")

    model_config = ConfigDict(populate_by_name=True)


class NextIdResponse(BaseModel):
    ok: bool = True
    next_id: str = Field(..., alias="nextId")

    model_config = ConfigDict(populate_by_name=True)


class CatalogMetricsResponse(BaseModel):
    ok: bool = True
    total: int = 0
    draft: int = 0
    pending_review: int = Field(0, alias="pendingReview")
    published: int = 0
    archived: int = 0
    unassigned: int = 0
    blocked: int = 0

    model_config = ConfigDict(populate_by_name=True)


class RecommendationsResponse(BaseModel):
    ok: bool = True
    items: List[StorefrontProduct] = []


class RecentlyViewedResponse(BaseModel):
    ok: bool = True
    items: List[StorefrontProduct] = []


class OkResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    ok: bool = False
    error: Optional[str] = None
    errors: Optional[List[str]] = None
