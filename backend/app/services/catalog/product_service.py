"""
ProductService — all business logic for the product catalogue.

Covers:
  - Storefront catalogue query with filtering, sorting, facet counts
  - Admin CRUD: create, draft, patch, change-id, duplicate, bulk
  - Workflow: submit-review, approve, reject, publish, unpublish, archive, restore
  - Assign employee
  - Availability checks (sku, slug)
  - Next stable product id
  - Publish-issue gate (getPublishIssues)
  - Pricing engine (computePricing, exactly matching frontend pricing.js)
  - Recently viewed
  - Recommendations
  - Catalogue metrics
"""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTL_PRODUCT_DETAIL, TTL_RECENTLY_VIEWED, cache
from app.core.exceptions import (
    BusinessLogicException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.models.catalog.category import CategoryModel
from app.models.catalog.product import ProductModel
from app.schemas.catalog.product import (
    EMPLOYEE_EDITABLE_FIELDS,
    PRODUCT_ID_RE,
    SORT_ALIASES,
    AdminProduct,
    AdminProductListQuery,
    AssignEmployeeRequest,
    BulkUpdateRequest,
    CatalogMetricsResponse,
    ChangeProductIdRequest,
    ClearReviewFlagsRequest,
    EmployeeProductUpdateRequest,
    FacetCounts,
    FacetValue,
    ProductCreateRequest,
    ProductDraftRequest,
    ProductListQuery,
    ProductUpdateRequest,
    RejectProductRequest,
    StorefrontProduct,
)

# ── Constants ────────────────────────────────────────────────────────────────

PRICE_BANDS = [
    {"id": "under-500", "label": "Under ₹500", "min": 0, "max": 499},
    {"id": "500-1000", "label": "₹500 – ₹1,000", "min": 500, "max": 1000},
    {"id": "1000-2500", "label": "₹1,000 – ₹2,500", "min": 1001, "max": 2500},
    {"id": "2500-5000", "label": "₹2,500 – ₹5,000", "min": 2501, "max": 5000},
    {"id": "above-5000", "label": "Above ₹5,000", "min": 5001, "max": 99_999_999},
]

ALLOW_SELLING_ABOVE_MRP = False

PLACEHOLDER_NAME_PATTERNS = re.compile(
    r"^(product\s*\d*|untitled|draft|new product|placeholder|tbd|to be|temp\w*)$",
    re.IGNORECASE,
)

# Category prefix mapping (from productIdPrefixes.js)
CATEGORY_ID_PREFIXES: Dict[str, str] = {
    "sarees": "SAR",
    "lehengas": "LEH",
    "kurtis-and-suits": "KUR",
    "bridal-couture": "BRI",
    "menswear": "MEN",
    "kidswear": "KID",
    "jewellery": "JWL",
    "innerwear": "INN",
    "bangles": "BNG",
    "dupattas": "DUP",
}

RECENTLY_VIEWED_LIMIT = 20
HISTORY_CAP = 60
PRICE_HISTORY_CAP = 24


# ── Utility helpers ───────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(text: str) -> str:
    """Convert text to a URL-safe lowercase slug."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[\s_]+", "-", text)


def _normalise_search(text: str) -> str:
    """Normalise for case/diacritic-insensitive substring search."""
    return (
        unicodedata.normalize("NFKD", text)
        .encode("ascii", "ignore")
        .decode()
        .lower()
    )


def _is_placeholder_name(name: str) -> bool:
    return bool(PLACEHOLDER_NAME_PATTERNS.match(name.strip()))


def _get_price_band(price: int) -> str:
    for band in PRICE_BANDS:
        if band["min"] <= price <= band["max"]:
            return band["id"]
    return "above-5000"


# ── Pricing engine ────────────────────────────────────────────────────────────

def compute_pricing(pricing: Dict[str, Any]) -> Dict[str, Any]:
    """
    Reimplementation of frontend computePricing() / src/utils/pricing.js.
    Returns dict with finalPrice, savings, effectiveDiscountPercent, errors[].
    """
    errors: List[str] = []

    mrp = int(pricing.get("mrp") or pricing.get("sellingPrice") or 0)
    selling = int(pricing.get("sellingPrice") or pricing.get("selling_price") or 0)
    discount_type = pricing.get("discountType") or pricing.get("discount_type") or "none"
    discount_value = float(pricing.get("discountValue") or pricing.get("discount_value") or 0)

    if mrp <= 0:
        errors.append("MRP must be greater than zero.")
    if selling <= 0:
        errors.append("Selling price must be greater than zero.")
    if mrp > 0 and selling > mrp and not ALLOW_SELLING_ABOVE_MRP:
        errors.append("Selling price cannot be above MRP.")

    if discount_type == "percentage":
        if not (0 <= discount_value <= 100):
            errors.append("Percentage discount must be between 0 and 100.")
        discount_amount = selling * discount_value / 100
    elif discount_type == "fixed":
        if discount_value < 0:
            errors.append("Fixed discount cannot be negative.")
        if discount_value > selling:
            errors.append("Fixed discount cannot exceed the selling price.")
        discount_amount = discount_value
    else:
        discount_amount = 0.0

    final_price = max(0, round(selling - discount_amount))
    if final_price < 0:
        errors.append("Final price must never be negative.")

    savings = max(0, mrp - final_price) if mrp > 0 else 0
    effective_discount = (
        round((savings / mrp) * 100, 2) if mrp > 0 and savings > 0 else 0.0
    )

    return {
        "finalPrice": final_price,
        "savings": savings,
        "effectiveDiscountPercent": effective_discount,
        "errors": errors,
    }


# ── Publish issue gate ────────────────────────────────────────────────────────

def get_publish_issues(product: ProductModel) -> List[str]:
    """
    Exact reimplementation of getPublishIssues() from frontend.
    Returns list of blocker messages; empty ⇒ safe to publish.
    """
    issues: List[str] = []

    if not product.id or not product.product_id:
        issues.append("Product ID is required.")
    if not product.name or not product.name.strip():
        issues.append("Product name is required.")
    elif _is_placeholder_name(product.name):
        issues.append("Product name must be real product information, not a placeholder.")
    if not product.sku or not product.sku.strip():
        issues.append("SKU is required.")
    if not product.category or not product.category.strip():
        issues.append("Category is required.")

    pricing = product.pricing or {}
    computed = compute_pricing(pricing) if pricing else {"finalPrice": product.price, "errors": []}
    final_price = computed.get("finalPrice", product.price)
    if (product.price or 0) <= 0 and final_price <= 0:
        issues.append("Selling price must be greater than zero.")
    for err in computed.get("errors", []):
        if err not in issues:
            issues.append(err)

    has_description = (product.description or "").strip() or (product.short_description or "").strip()
    if not has_description:
        issues.append("A description is required.")

    # Media check — authored image OR primary media must exist
    has_authored_image = bool((product.image or "").strip())
    has_primary_media = bool(product.primary_media_id)
    if not has_authored_image and not has_primary_media:
        issues.append("At least one cover image is required before publishing.")

    # Review flags — blocking subset
    blocking_flags = {
        "NAME_REVIEW_REQUIRED", "PRICE_REVIEW_REQUIRED", "TAXONOMY_REVIEW_REQUIRED",
        "GROUP_REVIEW_REQUIRED", "VARIANT_REVIEW_REQUIRED", "NEEDS_MEDIA",
        "MEDIA_OWNERSHIP_REVIEW", "CONFLICT_UNRESOLVED", "KIDS_MIGRATION_REVIEW",
    }
    product_flags = set(product.review_flags or [])
    active_blocking = product_flags & blocking_flags
    if active_blocking:
        issues.append(f"Review flags must be resolved before publishing: {', '.join(sorted(active_blocking))}.")

    return issues


# ── Service class ─────────────────────────────────────────────────────────────

class ProductService:
    """Business logic for the product catalogue."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _get_or_404(self, product_id: str) -> ProductModel:
        """Fetch by id or slug; raises NotFoundException if missing."""
        stmt = select(ProductModel).where(
            or_(ProductModel.id == product_id, ProductModel.slug == product_id)
        )
        result = await self.db.execute(stmt)
        product = result.scalars().first()
        if not product:
            raise NotFoundException(f"Product '{product_id}' not found.")
        return product

    def _append_history(
        self, product: ProductModel, field: str, from_val: Any, to_val: Any, actor: str
    ) -> None:
        history = list(product.history or [])
        if len(history) >= HISTORY_CAP:
            history = history[-(HISTORY_CAP - 1):]
        history.append(
            {"field": field, "from": from_val, "to": to_val, "actor": actor, "at": _now_utc().isoformat()}
        )
        product.history = history

    def _append_price_history(self, product: ProductModel, from_price: int, to_price: int, actor: str) -> None:
        ph = list(product.price_history or [])
        if len(ph) >= PRICE_HISTORY_CAP:
            ph = ph[-(PRICE_HISTORY_CAP - 1):]
        ph.append({"from": from_price, "to": to_price, "actor": actor, "at": _now_utc().isoformat()})
        product.price_history = ph

    def _to_storefront(self, p: ProductModel) -> StorefrontProduct:
        """Project a ProductModel onto a StorefrontProduct DTO."""
        pricing = p.pricing or {}
        computed = compute_pricing(pricing) if pricing else {}
        final_price = computed.get("finalPrice", p.price)
        effective_discount = computed.get("effectiveDiscountPercent", 0.0)
        original_price = p.original_price if (p.original_price and p.original_price > final_price) else None
        return StorefrontProduct(
            id=p.id,
            productId=p.product_id or p.id,
            name=p.name or "",
            slug=p.slug or "",
            sku=p.sku or "",
            brand=p.brand or "Pratikshya Fashon",
            productType=p.product_type or "fashion",
            category=p.category or "",
            subcategory=p.subcategory or "",
            gender=p.gender or "Women",
            shortDescription=p.short_description or "",
            description=p.description or "",
            highlights=p.highlights or [],
            careInstructions=p.care_instructions or [],
            deliveryInfo=p.delivery_info or "",
            returnInfo=p.return_info or "",
            fabric=p.fabric or "",
            material=p.material or "",
            primaryColor=p.primary_color or "",
            secondaryColor=p.secondary_color or "",
            colors=p.colors or [],
            patterns=p.patterns or [],
            occasion=p.occasion or [],
            sizes=p.sizes or [],
            unavailableColors=p.unavailable_colors or [],
            unavailableSizes=p.unavailable_sizes or [],
            season=p.season or "",
            fit=p.fit or "",
            length=p.length or "",
            collection=p.collection or "",
            collections=p.collections or [],
            tags=p.tags or [],
            badges=p.badges or [],
            isFeatured=p.is_featured,
            isBestseller=p.is_bestseller,
            isNew=p.is_new,
            isLimitedEdition=p.is_limited_edition,
            isTrending=p.is_trending,
            price=final_price,
            originalPrice=original_price,
            currency=p.currency or "INR",
            discountPercent=effective_discount,
            isOnSale=effective_discount > 0,
            stock=p.stock or 0,
            availability=p.availability or "in-stock",
            rating=float(p.rating) if p.rating else None,
            reviewCount=p.review_count or 0,
            image=p.image or "",
            hoverImage=p.hover_image or "",
            additionalImages=p.additional_images or [],
            primaryMediaId=p.primary_media_id,
            href=f"/products/{p.slug or p.id}",
            status=p.status,
        )

    def _to_admin(self, p: ProductModel) -> AdminProduct:
        """Project a ProductModel onto the full AdminProduct DTO."""
        return AdminProduct(
            id=p.id,
            productId=p.product_id or p.id,
            name=p.name or "",
            slug=p.slug or "",
            sku=p.sku or "",
            brand=p.brand or "Pratikshya Fashon",
            productType=p.product_type or "fashion",
            productCode=p.product_code or "",
            barcode=p.barcode or "",
            internalReference=p.internal_reference or "",
            category=p.category or "",
            subcategory=p.subcategory or "",
            gender=p.gender or "Women",
            shortDescription=p.short_description or "",
            description=p.description or "",
            highlights=p.highlights or [],
            specifications=p.specifications or {},
            careInstructions=p.care_instructions or [],
            deliveryInfo=p.delivery_info or "",
            returnInfo=p.return_info or "",
            fabric=p.fabric or "",
            material=p.material or "",
            primaryColor=p.primary_color or "",
            secondaryColor=p.secondary_color or "",
            colors=p.colors or [],
            patterns=p.patterns or [],
            work=p.work or [],
            occasion=p.occasion or [],
            sizes=p.sizes or [],
            unavailableColors=p.unavailable_colors or [],
            unavailableSizes=p.unavailable_sizes or [],
            season=p.season or "",
            fit=p.fit or "",
            length=p.length or "",
            collection=p.collection or "",
            collections=p.collections or [],
            tags=p.tags or [],
            badges=p.badges or [],
            isFeatured=p.is_featured,
            isBestseller=p.is_bestseller,
            isNew=p.is_new,
            isLimitedEdition=p.is_limited_edition,
            isTrending=p.is_trending,
            flags=p.flags or {},
            price=p.price or 0,
            originalPrice=p.original_price,
            compareAtPrice=p.compare_at_price,
            currency=p.currency or "INR",
            pricing=p.pricing,
            priceHistory=p.price_history or [],
            stock=p.stock or 0,
            availability=p.availability or "in-stock",
            inventoryTracked=p.inventory_tracked,
            lowStockThreshold=p.low_stock_threshold or 5,
            rating=float(p.rating) if p.rating else None,
            reviewCount=p.review_count or 0,
            seo=p.seo,
            status=p.status,
            published=p.published,
            review=p.review,
            reviewFlags=p.review_flags or [],
            assignedEmployeeId=p.assigned_employee_id,
            mediaIds=p.media_ids or [],
            primaryMediaId=p.primary_media_id,
            galleryMediaIds=p.gallery_media_ids or [],
            image=p.image or "",
            hoverImage=p.hover_image or "",
            additionalImages=p.additional_images or [],
            createdBy=p.created_by,
            createdAt=p.created_at.isoformat() if p.created_at else None,
            updatedBy=p.updated_by,
            updatedAt=p.updated_at.isoformat() if p.updated_at else None,
            publishedBy=p.published_by,
            publishedAt=p.published_at.isoformat() if p.published_at else None,
            history=p.history or [],
        )

    async def _category_status_map(self) -> Dict[str, str]:
        """Map category id/slug/name to status for storefront visibility."""
        result = await self.db.execute(select(CategoryModel))
        rows = result.scalars().all()
        status_map: Dict[str, str] = {}
        for category in rows:
            if category.id:
                status_map[category.id] = category.status
            if category.slug:
                status_map[category.slug] = category.status
            if category.name:
                status_map[category.name] = category.status
        return status_map

    # ── Public storefront catalogue ───────────────────────────────────────────

    async def list_storefront_products(
        self, query: ProductListQuery, category_status_map: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        GET /products — apply visibility gate + filters + facets + sort + pagination.
        Visibility gate: status PUBLISHED, published=True, category ACTIVE.
        """
        stmt = select(ProductModel).where(
            ProductModel.status == "PUBLISHED",
            ProductModel.published.is_(True),
        )
        result = await self.db.execute(stmt)
        all_products = list(result.scalars().all())

        # Apply category-active filter.  General storefront/search/explore
        # callers do not pass a map, so the service loads it from the existing
        # category table. Unknown legacy category values remain visible for
        # backward compatibility; known inactive/archived categories are hidden.
        if category_status_map is None:
            category_status_map = await self._category_status_map()
        if category_status_map:
            all_products = [
                p for p in all_products
                if category_status_map.get(p.category, "ACTIVE") == "ACTIVE"
            ]

        # When called from GET /collections/{id}/products the router pre-resolves
        # membership and passes the id list via _collection_product_ids.
        # Restrict the working set to only those products.
        _coll_ids = getattr(query, "_collection_product_ids", None)
        if _coll_ids is not None:
            allowed = set(_coll_ids)
            all_products = [p for p in all_products if p.id in allowed]

        # Convert to storefront DTOs for in-memory filtering
        items = [self._to_storefront(p) for p in all_products]

        # Apply search
        if query.q:
            norm_q = _normalise_search(query.q)
            items = [
                it for it in items
                if any(
                    norm_q in _normalise_search(str(v))
                    for v in [
                        it.name, it.brand, it.category, it.subcategory,
                        it.fabric, it.material, " ".join(it.colors),
                        " ".join(it.occasion), " ".join(it.tags),
                        it.collection, it.sku,
                    ]
                )
            ]

        # Apply facet filters (AND across facets, OR within)
        def _to_list(v) -> List[str]:
            if v is None:
                return []
            if isinstance(v, list):
                return [str(x) for x in v]
            return [str(v)]

        def _matches_facet(field_val: Any, filter_vals: List[str]) -> bool:
            if not filter_vals:
                return True
            if isinstance(field_val, list):
                return any(str(fv).lower() in [str(v).lower() for v in field_val] for fv in filter_vals)
            return str(field_val).lower() in [str(fv).lower() for fv in filter_vals]

        def _matches_price_band(price: int, band_ids: List[str]) -> bool:
            if not band_ids:
                return True
            for band_id in band_ids:
                band = next((b for b in PRICE_BANDS if b["id"] == band_id), None)
                if band and band["min"] <= price <= band["max"]:
                    return True
            return False

        filters = {
            "category": _to_list(query.category),
            "subcategory": _to_list(query.subcategory),
            "gender": _to_list(query.gender),
            "size": _to_list(query.size),
            "color": _to_list(query.color),
            "fabric": _to_list(query.fabric),
            "material": _to_list(query.material),
            "occasion": _to_list(query.occasion),
            "collection": _to_list(query.collection),
            "availability": _to_list(query.availability),
        }

        price_filters = _to_list(query.price)
        rating_filters = _to_list(query.rating)

        def _product_matches(it: StorefrontProduct) -> bool:
            return (
                _matches_facet(it.category, filters["category"])
                and _matches_facet(it.subcategory, filters["subcategory"])
                and _matches_facet(it.gender, filters["gender"])
                and _matches_facet(it.sizes, filters["size"])
                and _matches_facet(it.colors, filters["color"])
                and _matches_facet(it.fabric, filters["fabric"])
                and _matches_facet(it.material, filters["material"])
                and _matches_facet(it.occasion, filters["occasion"])
                and _matches_facet(it.collections + ([it.collection] if it.collection else []), filters["collection"])
                and _matches_facet(it.availability, filters["availability"])
                and _matches_price_band(it.price, price_filters)
                and (
                    not rating_filters
                    or (it.rating is not None and any(it.rating >= float(r) for r in rating_filters))
                )
            )

        filtered = [it for it in items if _product_matches(it)]

        # Build facets (counts against other applied filters)
        facets = self._build_facets(items, filtered, filters, price_filters, rating_filters)

        # Sort
        filtered = self._sort_products(filtered, query.sort)

        # Paginate
        total = len(filtered)
        page_size = max(1, query.page_size)
        page = max(1, query.page)
        offset = (page - 1) * page_size
        page_items = filtered[offset: offset + page_size]

        applied_filters = {k: v for k, v in filters.items() if v}
        if price_filters:
            applied_filters["price"] = price_filters

        return {
            "ok": True,
            "items": page_items,
            "total": total,
            "facets": facets,
            "appliedFilters": applied_filters,
        }

    def _build_facets(
        self,
        all_items: List[StorefrontProduct],
        filtered: List[StorefrontProduct],
        active_filters: Dict[str, List[str]],
        price_filters: List[str],
        rating_filters: List[str],
    ) -> FacetCounts:
        """
        Build facet counts — each facet counted against the other applied filters.
        Counts reflect what would remain if only that facet was deselected.
        """

        def _count_facet(
            facet_key: str,
            get_vals,
            items_without_this_facet: List[StorefrontProduct],
        ) -> List[FacetValue]:
            counts: Dict[str, int] = {}
            for it in items_without_this_facet:
                vals = get_vals(it)
                if isinstance(vals, list):
                    for v in vals:
                        counts[v] = counts.get(v, 0) + 1
                elif vals:
                    counts[str(vals)] = counts.get(str(vals), 0) + 1
            return [
                FacetValue(value=k, label=k, count=v)
                for k, v in sorted(counts.items(), key=lambda x: -x[1])
            ]

        def _items_excl(facet_key: str) -> List[StorefrontProduct]:
            """All items passing every filter EXCEPT the given facet."""
            excl_filters = {k: v for k, v in active_filters.items() if k != facet_key}
            excl_price = price_filters if facet_key != "price" else []
            excl_rating = rating_filters if facet_key != "rating" else []

            def _matches(it: StorefrontProduct) -> bool:
                for fk, fv in excl_filters.items():
                    if not fv:
                        continue
                    field = getattr(it, fk, None)
                    if fk == "size":
                        field = it.sizes
                    elif fk == "color":
                        field = it.colors
                    elif fk == "occasion":
                        field = it.occasion
                    elif fk == "collection":
                        field = it.collections + ([it.collection] if it.collection else [])
                    if isinstance(field, list):
                        if not any(str(f).lower() in [str(v).lower() for v in field] for f in fv):
                            return False
                    else:
                        if str(field or "").lower() not in [str(f).lower() for f in fv]:
                            return False
                if excl_price:
                    if not any(
                        b["min"] <= it.price <= b["max"]
                        for bid in excl_price
                        for b in PRICE_BANDS
                        if b["id"] == bid
                    ):
                        return False
                if excl_rating:
                    if it.rating is None or not any(it.rating >= float(r) for r in excl_rating):
                        return False
                return True

            return [it for it in all_items if _matches(it)]

        return FacetCounts(
            category=_count_facet("category", lambda it: it.category, _items_excl("category")),
            subcategory=_count_facet("subcategory", lambda it: it.subcategory, _items_excl("subcategory")),
            gender=_count_facet("gender", lambda it: it.gender, _items_excl("gender")),
            price=_count_facet(
                "price",
                lambda it: _get_price_band(it.price),
                _items_excl("price"),
            ),
            size=_count_facet("size", lambda it: it.sizes, _items_excl("size")),
            color=_count_facet("color", lambda it: it.colors, _items_excl("color")),
            fabric=_count_facet("fabric", lambda it: it.fabric, _items_excl("fabric")),
            material=_count_facet("material", lambda it: it.material, _items_excl("material")),
            occasion=_count_facet("occasion", lambda it: it.occasion, _items_excl("occasion")),
            collection=_count_facet(
                "collection",
                lambda it: it.collections + ([it.collection] if it.collection else []),
                _items_excl("collection"),
            ),
            rating=_count_facet(
                "rating",
                lambda it: str(int(it.rating)) if it.rating else None,
                _items_excl("rating"),
            ),
            availability=_count_facet("availability", lambda it: it.availability, _items_excl("availability")),
        )

    def _sort_products(self, items: List[StorefrontProduct], sort: str) -> List[StorefrontProduct]:
        """Sort products exactly as resolveSort / sortProducts in the frontend."""
        sort = SORT_ALIASES.get(sort, sort)
        if sort == "newest":
            return sorted(items, key=lambda it: it.id, reverse=True)
        elif sort == "price-asc":
            return sorted(items, key=lambda it: (it.price, it.id))
        elif sort == "price-desc":
            return sorted(items, key=lambda it: (-it.price, it.id))
        elif sort == "discount":
            return sorted(items, key=lambda it: (-it.discount_percent, it.id))
        elif sort == "name-asc":
            return sorted(items, key=lambda it: (it.name.lower(), it.id))
        elif sort == "popularity":
            return sorted(items, key=lambda it: (-(it.review_count or 0), it.id))
        elif sort == "rating":
            return sorted(items, key=lambda it: (-(it.rating or 0), it.id))
        else:  # recommended (default)
            return sorted(items, key=lambda it: it.id)

    # ── Get single product (storefront) ──────────────────────────────────────

    async def get_storefront_product(self, id_or_slug: str) -> StorefrontProduct:
        """
        GET /products/{id} — fetch single published product.

        Caches the serialised DTO in Redis for TTL_PRODUCT_DETAIL seconds.
        Cache key: ``product:storefront:{id_or_slug}``
        Cache is invalidated when the product is published, unpublished, updated,
        or archived (call invalidate_product_cache from those service methods).
        """
        cache_key = f"product:storefront:{id_or_slug}"
        cached = await cache.get_json(cache_key)
        if cached:
            return StorefrontProduct(**cached)

        p = await self._get_or_404(id_or_slug)
        if p.status != "PUBLISHED" or not p.published:
            raise NotFoundException(f"Product '{id_or_slug}' not found.")
        category_status_map = await self._category_status_map()
        if category_status_map.get(p.category, "ACTIVE") != "ACTIVE":
            raise NotFoundException(f"Product '{id_or_slug}' not found.")

        dto = self._to_storefront(p)
        await cache.set_json(cache_key, dto.model_dump(), TTL_PRODUCT_DETAIL)
        return dto

    async def invalidate_product_cache(self, product_id: str, slug: Optional[str] = None) -> None:
        """
        Remove all cached storefront representations for a product.
        Called after any status-changing write (publish, unpublish, update, archive).
        """
        keys = [f"product:storefront:{product_id}"]
        if slug:
            keys.append(f"product:storefront:{slug}")
        await cache.delete(*keys)
        # Also invalidate the broad catalog cache so listing pages refresh
        await cache.invalidate_pattern("pratikshya:cache:*products*")

    # ── Recommendations ───────────────────────────────────────────────────────

    async def get_recommendations(
        self, product_id: str, rec_type: str = "related"
    ) -> List[StorefrontProduct]:
        """
        GET /products/{id}/recommendations
        Simple category-affinity for now — same visibility gate applies.
        """
        source = await self._get_or_404(product_id)
        stmt = select(ProductModel).where(
            ProductModel.status == "PUBLISHED",
            ProductModel.published.is_(True),
            ProductModel.id != source.id,
        )
        if rec_type in ("related",):
            stmt = stmt.where(ProductModel.category == source.category)
        result = await self.db.execute(stmt.limit(12))
        products = result.scalars().all()
        category_status_map = await self._category_status_map()
        products = [p for p in products if category_status_map.get(p.category, "ACTIVE") == "ACTIVE"]
        return [self._to_storefront(p) for p in products]

    # ── Recently viewed ───────────────────────────────────────────────────────

    async def get_recently_viewed(self, customer_id: str) -> List[StorefrontProduct]:
        """
        GET /products/recently-viewed

        Reads the customer's recently-viewed list from Redis (key: ``rv:{customer_id}``).
        Products are fetched from the DB and filtered to only PUBLISHED ones.
        Missing / unpublished products are silently skipped.
        """
        product_ids = await cache.list_range(f"rv:{customer_id}", 0, RECENTLY_VIEWED_LIMIT - 1)
        if not product_ids:
            return []

        stmt = select(ProductModel).where(
            ProductModel.id.in_(product_ids),
            ProductModel.status == "PUBLISHED",
            ProductModel.published.is_(True),
        )
        result = await self.db.execute(stmt)
        category_status_map = await self._category_status_map()
        product_map: Dict[str, ProductModel] = {
            p.id: p
            for p in result.scalars().all()
            if category_status_map.get(p.category, "ACTIVE") == "ACTIVE"
        }

        # Preserve recency order (product_ids is already newest-first)
        return [
            self._to_storefront(product_map[pid])
            for pid in product_ids
            if pid in product_map
        ]

    async def add_recently_viewed(self, customer_id: str, product_id: str) -> None:
        """
        POST /products/recently-viewed

        Pushes *product_id* to the front of the customer's Redis List,
        removes any prior occurrence (dedup), and trims to RECENTLY_VIEWED_LIMIT.
        TTL is refreshed to TTL_RECENTLY_VIEWED (30 days) on every push.
        """
        await cache.list_push(
            key=f"rv:{customer_id}",
            value=product_id,
            maxlen=RECENTLY_VIEWED_LIMIT,
            ttl=TTL_RECENTLY_VIEWED,
        )

    # ── Admin — list products ─────────────────────────────────────────────────

    async def list_admin_products(self, query: AdminProductListQuery) -> Dict[str, Any]:
        stmt = select(ProductModel)
        if query.status:
            stmt = stmt.where(ProductModel.status == query.status)
        if query.category:
            stmt = stmt.where(ProductModel.category == query.category)
        if query.assigned_employee_id:
            stmt = stmt.where(ProductModel.assigned_employee_id == query.assigned_employee_id)
        if query.q:
            norm_q = f"%{query.q.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(ProductModel.name).like(norm_q),
                    func.lower(ProductModel.sku).like(norm_q),
                    func.lower(ProductModel.id).like(norm_q),
                )
            )
        result = await self.db.execute(stmt)
        products = result.scalars().all()
        items = [self._to_admin(p) for p in products]
        # Sort admin list
        if query.sort == "newest":
            items.sort(key=lambda p: p.created_at or "", reverse=True)
        return {"ok": True, "items": items, "total": len(items)}

    # ── Admin — create product ────────────────────────────────────────────────

    async def create_product(
        self, req: ProductCreateRequest, actor: str
    ) -> AdminProduct:
        """POST /admin/products — generates a runtime pf-<base36> id."""
        import time
        new_id = f"pf-{int(time.time() * 1000):x}"

        # Check for id collision (unlikely but safe)
        existing = await self.db.execute(
            select(ProductModel).where(ProductModel.id == new_id)
        )
        if existing.scalars().first():
            new_id = f"{new_id}-{int(time.time() * 1000) % 1000}"

        slug = await self._generate_unique_slug(req.name or new_id)
        sku = await self._generate_unique_sku()

        data = req.model_dump(exclude_unset=True, by_alias=False)
        pricing = data.pop("pricing", None)
        if pricing:
            computed = compute_pricing(pricing)
            price = computed["finalPrice"]
        else:
            price = data.pop("price", 0)

        product = ProductModel(
            id=new_id,
            product_id=new_id,
            name=data.get("name", ""),
            slug=slug,
            sku=data.get("sku", sku),
            category=data.get("category", ""),
            subcategory=data.get("subcategory", ""),
            gender=data.get("gender", "Women"),
            description=data.get("description", ""),
            short_description=data.get("short_description", ""),
            price=price,
            compare_at_price=data.get("compare_at_price"),
            pricing=pricing,
            stock=data.get("stock", 0),
            status="DRAFT",
            published=False,
            review={"state": "NONE", "submittedBy": None, "submittedAt": None,
                    "reviewedBy": None, "reviewedAt": None, "rejectionReason": ""},
            review_flags=[],
            history=[],
            price_history=[],
            created_by=actor,
        )
        self.db.add(product)
        await self.db.flush()
        return self._to_admin(product)

    # ── Admin — create draft with caller-supplied id ───────────────────────────

    async def create_draft(self, req: ProductDraftRequest, actor: str) -> AdminProduct:
        """POST /admin/products/draft — permanent id supplied by caller."""
        existing = await self.db.execute(
            select(ProductModel).where(ProductModel.id == req.id)
        )
        if existing.scalars().first():
            raise ConflictException(f"Product ID '{req.id}' is already taken.")

        slug = await self._generate_unique_slug(req.name or req.id)
        sku = await self._generate_unique_sku(prefix=req.id)

        product = ProductModel(
            id=req.id,
            product_id=req.id,
            name=req.name or "",
            slug=slug,
            sku=sku,
            category=req.category,
            subcategory=req.subcategory or "",
            media_ids=req.media_ids,
            status="DRAFT",
            published=False,
            review={"state": "NONE", "submittedBy": None, "submittedAt": None,
                    "reviewedBy": None, "reviewedAt": None, "rejectionReason": ""},
            review_flags=[],
            history=[],
            price_history=[],
            created_by=actor,
        )
        self.db.add(product)
        await self.db.flush()
        return self._to_admin(product)

    # ── Admin — get single ────────────────────────────────────────────────────

    async def get_admin_product(self, product_id: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        return self._to_admin(p)

    # ── Admin — update ────────────────────────────────────────────────────────

    async def update_product(
        self, product_id: str, req: ProductUpdateRequest, actor: str
    ) -> AdminProduct:
        """PATCH /admin/products/{id} — full-field patch for admins."""
        p = await self._get_or_404(product_id)
        data = req.model_dump(exclude_unset=True, by_alias=False)

        for field, new_val in data.items():
            old_val = getattr(p, field, None)
            if old_val != new_val:
                setattr(p, field, new_val)
                self._append_history(p, field, old_val, new_val, actor)

        # Handle price change → price history
        if "price" in data:
            self._append_price_history(p, data.get("price", 0), p.price, actor)

        # Keep published flag in sync
        p.published = p.status == "PUBLISHED"
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    # ── Employee — update (whitelist only) ────────────────────────────────────

    async def update_product_employee(
        self,
        product_id: str,
        req: EmployeeProductUpdateRequest,
        employee_id: str,
        is_super_admin: bool = False,
        employee_user_id: Optional[str] = None,
    ) -> AdminProduct:
        """PATCH /employee/products/{id} — whitelisted fields only."""
        p = await self._get_or_404(product_id)

        # Authorization check. `employee_id` is the employee code, which is the
        # canonical product assignment contract.  The UUID fallback preserves
        # access to legacy rows that were assigned before the identity fix.
        allowed_assignees = {str(employee_id)}
        if employee_user_id:
            allowed_assignees.add(str(employee_user_id))
        if not is_super_admin and str(p.assigned_employee_id) not in allowed_assignees:
            raise ForbiddenException("You are not assigned to this product.")

        data = req.model_dump(exclude_unset=True, by_alias=False)

        # Silently drop any fields not in whitelist
        snake_whitelist = {
            "name", "price", "compare_at_price", "description", "short_description",
            "category", "subcategory", "gender", "fabric", "material",
            "primary_color", "secondary_color", "colors", "patterns", "work",
            "occasion", "sizes", "season", "fit", "length", "highlights",
            "care_instructions", "collection_ids", "collections", "tags",
            "stock", "availability",
        }
        data = {k: v for k, v in data.items() if k in snake_whitelist}

        for field, new_val in data.items():
            old_val = getattr(p, field, None)
            if old_val != new_val:
                setattr(p, field, new_val)
                self._append_history(p, field, old_val, new_val, employee_id)

        if "price" in data:
            self._append_price_history(p, data["price"], p.price, employee_id)

        p.updated_by = employee_id
        await self.db.flush()
        return self._to_admin(p)

    # ── Assign employee ───────────────────────────────────────────────────────

    async def assign_employee(
        self, product_id: str, req: AssignEmployeeRequest, actor: str
    ) -> AdminProduct:
        p = await self._get_or_404(product_id)
        old = p.assigned_employee_id
        p.assigned_employee_id = req.employee_id
        self._append_history(p, "assignedEmployeeId", old, req.employee_id, actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    # ── Workflow actions ──────────────────────────────────────────────────────

    async def submit_for_review(
        self,
        product_id: str,
        actor: str,
        require_assignment: bool = False,
        employee_user_id: Optional[str] = None,
    ) -> AdminProduct:
        p = await self._get_or_404(product_id)

        if require_assignment:
            allowed_assignees = {str(actor)}
            if employee_user_id:
                # Legacy safety: old rows may have stored the user UUID. The
                # canonical contract remains employee_code and all new history
                # uses `actor` (employee code).
                allowed_assignees.add(str(employee_user_id))
            if not p.assigned_employee_id or str(p.assigned_employee_id) not in allowed_assignees:
                raise ForbiddenException("You can only submit products assigned to you.")

        status = (p.status or "DRAFT").upper()
        review_state = str((p.review or {}).get("state") or "NONE").upper()
        if status == "PUBLISHED":
            raise BusinessLogicException("This product is already published.")
        if status == "ARCHIVED":
            raise BusinessLogicException("Archived products cannot be submitted for review.")
        if status == "PENDING_REVIEW" or review_state == "PENDING":
            raise BusinessLogicException("This product is already pending review.")
        if review_state == "APPROVED":
            raise BusinessLogicException("Approved products cannot be resubmitted; publish or return them first.")

        previous_status = p.status or "DRAFT"
        now = _now_utc().isoformat()
        p.status = "PENDING_REVIEW"
        p.published = False
        p.review = {
            "state": "PENDING",
            "submittedBy": actor,
            "submittedAt": now,
            "reviewedBy": None,
            "reviewedAt": None,
            "rejectionReason": "",
        }
        self._append_history(p, "status", previous_status, "PENDING_REVIEW", actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    async def approve_product(self, product_id: str, actor: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        issues = get_publish_issues(p)
        if issues:
            raise BusinessLogicException(
                "Product has unresolved publish issues.", details={"errors": issues}
            )
        now = _now_utc()
        p.status = "PUBLISHED"
        p.published = True
        p.published_by = actor
        p.published_at = now
        p.review = {
            **(p.review or {}),
            "state": "APPROVED",
            "reviewedBy": actor,
            "reviewedAt": now.isoformat(),
        }
        self._append_history(p, "status", p.status, "PUBLISHED", actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    async def reject_product(self, product_id: str, req: RejectProductRequest, actor: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        now = _now_utc().isoformat()
        p.status = "DRAFT"
        p.published = False
        p.review = {
            **(p.review or {}),
            "state": "REJECTED",
            "reviewedBy": actor,
            "reviewedAt": now,
            "rejectionReason": req.reason,
        }
        self._append_history(p, "status", "PENDING_REVIEW", "DRAFT", actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    async def publish_product(self, product_id: str, actor: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        issues = get_publish_issues(p)
        if issues:
            raise BusinessLogicException(
                "Product has unresolved publish issues.", details={"errors": issues}
            )
        now = _now_utc()
        p.status = "PUBLISHED"
        p.published = True
        p.published_by = actor
        p.published_at = now
        self._append_history(p, "status", p.status, "PUBLISHED", actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    async def unpublish_product(self, product_id: str, actor: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        self._append_history(p, "status", p.status, "DRAFT", actor)
        p.status = "DRAFT"
        p.published = False
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    async def archive_product(self, product_id: str, actor: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        self._append_history(p, "status", p.status, "ARCHIVED", actor)
        p.status = "ARCHIVED"
        p.published = False
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    async def restore_product(self, product_id: str, actor: str) -> AdminProduct:
        p = await self._get_or_404(product_id)
        self._append_history(p, "status", p.status, "DRAFT", actor)
        p.status = "DRAFT"
        p.published = False
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    # ── Publish issues ────────────────────────────────────────────────────────

    async def get_publish_issues(self, product_id: str) -> List[str]:
        p = await self._get_or_404(product_id)
        return get_publish_issues(p)

    # ── Change ID ─────────────────────────────────────────────────────────────

    async def change_product_id(
        self, product_id: str, req: ChangeProductIdRequest, actor: str
    ) -> AdminProduct:
        p = await self._get_or_404(product_id)
        # Check new id is free
        existing = await self.db.execute(
            select(ProductModel).where(ProductModel.id == req.new_id)
        )
        if existing.scalars().first():
            raise ConflictException(f"Product ID '{req.new_id}' is already taken.")
        old_id = p.id
        # SQLAlchemy won't let us directly change the PK on most backends; we note this
        # is a BACKEND DECISION in the spec. We update product_id as the display label.
        p.product_id = req.new_id
        self._append_history(p, "productId", old_id, req.new_id, actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    # ── Duplicate ─────────────────────────────────────────────────────────────

    async def duplicate_product(self, product_id: str, actor: str) -> AdminProduct:
        import time
        p = await self._get_or_404(product_id)
        new_id = f"pf-{int(time.time() * 1000):x}"
        new_slug = await self._generate_unique_slug(f"{p.name}-copy")
        new_sku = await self._generate_unique_sku()

        dup = ProductModel(
            id=new_id,
            product_id=new_id,
            name=f"{p.name} (Copy)" if p.name else "",
            slug=new_slug,
            sku=new_sku,
            brand=p.brand,
            product_type=p.product_type,
            category=p.category,
            subcategory=p.subcategory,
            gender=p.gender,
            short_description=p.short_description,
            description=p.description,
            highlights=p.highlights,
            specifications=p.specifications,
            care_instructions=p.care_instructions,
            fabric=p.fabric,
            material=p.material,
            primary_color=p.primary_color,
            secondary_color=p.secondary_color,
            colors=p.colors,
            patterns=p.patterns,
            work=p.work,
            occasion=p.occasion,
            sizes=p.sizes,
            season=p.season,
            fit=p.fit,
            length=p.length,
            collection=p.collection,
            collections=p.collections,
            tags=p.tags,
            price=p.price,
            compare_at_price=p.compare_at_price,
            pricing=p.pricing,
            status="DRAFT",
            published=False,
            review={"state": "NONE", "submittedBy": None, "submittedAt": None,
                    "reviewedBy": None, "reviewedAt": None, "rejectionReason": ""},
            review_flags=[],
            history=[],
            price_history=[],
            created_by=actor,
        )
        self.db.add(dup)
        await self.db.flush()
        return self._to_admin(dup)

    # ── Bulk update ───────────────────────────────────────────────────────────

    async def bulk_update(self, req: BulkUpdateRequest, actor: str) -> Dict[str, Any]:
        updated = []
        for pid in req.product_ids:
            try:
                p = await self._get_or_404(pid)
                for field, val in req.updates.items():
                    setattr(p, field, val)
                p.updated_by = actor
                updated.append(pid)
            except NotFoundException:
                pass
        await self.db.flush()
        return {"ok": True, "updatedCount": len(updated), "updatedIds": updated}

    # ── Availability ──────────────────────────────────────────────────────────

    async def check_availability(
        self, sku: Optional[str] = None, slug: Optional[str] = None
    ) -> Dict[str, Any]:
        sku_taken = False
        slug_taken = False
        suggested_slug = None

        if sku:
            result = await self.db.execute(select(ProductModel).where(ProductModel.sku == sku))
            sku_taken = result.scalars().first() is not None

        if slug:
            result = await self.db.execute(select(ProductModel).where(ProductModel.slug == slug))
            slug_taken = result.scalars().first() is not None
            if slug_taken:
                suggested_slug = await self._generate_unique_slug(slug, base=True)

        return {"ok": True, "skuTaken": sku_taken, "slugTaken": slug_taken, "suggestedSlug": suggested_slug}

    # ── Next stable ID ────────────────────────────────────────────────────────

    async def get_next_id(
        self, category_id: str, preferred_number: Optional[int] = None
    ) -> str:
        """
        Deterministic nextStableProductId() — never random.
        Scans the register, honours preferredNumber, picks lowest free integer.
        """
        prefix = CATEGORY_ID_PREFIXES.get(category_id, "PF")
        result = await self.db.execute(
            select(ProductModel.id).where(
                ProductModel.id.like(f"{prefix}-%")
            )
        )
        taken_ids = {row[0] for row in result}

        pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
        taken_nums = set()
        for pid in taken_ids:
            m = pattern.match(pid)
            if m:
                taken_nums.add(int(m.group(1)))

        if preferred_number and preferred_number not in taken_nums:
            n = preferred_number
        else:
            n = 1
            while n in taken_nums:
                n += 1

        return f"{prefix}-{n:03d}"

    # ── Metrics ───────────────────────────────────────────────────────────────

    async def get_metrics(self) -> CatalogMetricsResponse:
        result = await self.db.execute(select(ProductModel.status))
        statuses = [row[0] for row in result]
        result2 = await self.db.execute(
            select(ProductModel.review_flags).where(ProductModel.status != "ARCHIVED")
        )
        blocking_flags = {
            "NAME_REVIEW_REQUIRED", "PRICE_REVIEW_REQUIRED", "TAXONOMY_REVIEW_REQUIRED",
            "GROUP_REVIEW_REQUIRED", "VARIANT_REVIEW_REQUIRED", "NEEDS_MEDIA",
            "MEDIA_OWNERSHIP_REVIEW", "CONFLICT_UNRESOLVED", "KIDS_MIGRATION_REVIEW",
        }
        blocked = sum(
            1 for (flags,) in result2
            if flags and set(flags) & blocking_flags
        )
        result3 = await self.db.execute(
            select(func.count()).where(
                ProductModel.assigned_employee_id.is_(None),
                ProductModel.status.in_(["DRAFT", "PENDING_REVIEW"]),
            )
        )
        unassigned = result3.scalar() or 0

        return CatalogMetricsResponse(
            total=len(statuses),
            draft=statuses.count("DRAFT"),
            pendingReview=statuses.count("PENDING_REVIEW"),
            published=statuses.count("PUBLISHED"),
            archived=statuses.count("ARCHIVED"),
            unassigned=unassigned,
            blocked=blocked,
        )

    # ── Clear review flags ────────────────────────────────────────────────────

    async def clear_review_flags(
        self, product_id: str, req: ClearReviewFlagsRequest, actor: str
    ) -> AdminProduct:
        p = await self._get_or_404(product_id)
        old_flags = list(p.review_flags or [])
        new_flags = [f for f in old_flags if f not in req.flags]
        p.review_flags = new_flags
        self._append_history(p, "reviewFlags", old_flags, new_flags, actor)
        p.updated_by = actor
        await self.db.flush()
        return self._to_admin(p)

    # ── Internal slug/sku helpers ─────────────────────────────────────────────

    async def _generate_unique_slug(self, base_text: str, base: bool = False) -> str:
        base_slug = _slugify(base_text) if not base else base_text
        slug = base_slug
        counter = 1
        while True:
            result = await self.db.execute(
                select(ProductModel).where(ProductModel.slug == slug)
            )
            if not result.scalars().first():
                return slug
            slug = f"{base_slug}-{counter}"
            counter += 1

    async def _generate_unique_sku(self, prefix: str = "PF") -> str:
        """Generate a unique SKU in PF-##### format."""
        import random
        for _ in range(100):
            n = random.randint(10000, 99999)
            candidate = f"{prefix[:2].upper()}-{n:05d}"
            result = await self.db.execute(
                select(ProductModel).where(ProductModel.sku == candidate)
            )
            if not result.scalars().first():
                return candidate
        raise BusinessLogicException("Could not generate a unique SKU.")
