"""Homepage authoring and live resolution. No browser or cached catalog authority."""
from datetime import datetime, timezone

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm.exc import StaleDataError

from app.core.exceptions import AppException, BusinessLogicException, ConflictException, ForbiddenException, NotFoundException
from app.models.media.homepage_section import HomepageSectionModel as Section, HomepageSectionItemModel as Item
from app.models.media.media_asset import MediaAssetModel
from app.schemas.media.homepage import REGISTRY, COPY_FIELDS, GROUPS, IMAGE_MIMES, validate_shape
from app.services.catalog.product_service import ProductService
from app.services.media.media_service import MediaService
from app.storage import normalize_object_key, build_media_url, InvalidObjectKeyError


async def grant(actor, db, *permissions):
    # A permission resolver alone is not an actor/workspace boundary.
    if actor.user_type not in ("admin", "employee"):
        raise ForbiddenException()
    from app.dependencies import require_staff_permission
    await require_staff_permission(actor, db, *permissions)


async def registered_asset(db, asset_id=None, object_key=None):
    stmt = select(MediaAssetModel)
    stmt = stmt.where(MediaAssetModel.id == asset_id) if asset_id else stmt.where(MediaAssetModel.object_key == object_key)
    asset = (await db.execute(stmt.with_for_update())).scalars().first()
    if not asset:
        raise BusinessLogicException("Select an existing registered image.")
    if object_key is not None and asset.object_key != object_key:
        raise BusinessLogicException("Asset ID and object key do not match.")
    result = await asset_projection(db, asset)
    if not result:
        raise BusinessLogicException("Registered image is unavailable or unsupported.")
    return asset


# ---------------------------------------------------------------------------
# B-14: per-process in-memory TTL cache for public asset_projection
# ---------------------------------------------------------------------------
# Per-process cache only; no Redis, no new dependency. Positive hits cached
# 60s, negative (not found / not eligible) cached at most 5s. Bounded LRU
# (1024 entries, simple eviction). Staff editor reads (public=False) never
# use the cache so draft/preview checks remain live. Invalidation is best-
# effort — failures never fail the write.
import time as _time

_ASSET_PROJECTION_CACHE: dict = {}
_ASSET_CACHE_MAX = 1024
_ASSET_POSITIVE_TTL = 60.0
_ASSET_NEGATIVE_TTL = 5.0


def _asset_cache_key(asset) -> str:
    # asset id + object key + updated timestamp if available distinguishes
    # a mutated row from a stale cached entry.
    ts = getattr(asset, "updated_at", None) or getattr(asset, "created_at", None) or ""
    # SQLAlchemy DateTime may be datetime; strify
    return f"{getattr(asset, 'id', '')}:{getattr(asset, 'object_key', '')}:{ts}"


def _now() -> float:
    # Monotonic wall for TTL; tests may monkeypatch this symbol with a fake clock.
    return _time.monotonic()


def _cache_get(cache_key: str, now: float):
    entry = _ASSET_PROJECTION_CACHE.get(cache_key)
    if entry is None:
        return None, False
    value, expires_at = entry
    if now >= expires_at:
        _ASSET_PROJECTION_CACHE.pop(cache_key, None)
        return None, False
    return value, True


def _cache_set(cache_key: str, value, now: float, is_positive: bool):
    ttl = _ASSET_POSITIVE_TTL if is_positive else _ASSET_NEGATIVE_TTL
    # Simple LRU/evict: if over max, drop oldest inserted (dict preserves insertion order on 3.7+)
    if len(_ASSET_PROJECTION_CACHE) >= _ASSET_CACHE_MAX:
        # pop first key
        try:
            first_key = next(iter(_ASSET_PROJECTION_CACHE))
            _ASSET_PROJECTION_CACHE.pop(first_key, None)
        except StopIteration:
            pass
    _ASSET_PROJECTION_CACHE[cache_key] = (value, now + ttl)


def invalidate_asset_projection_cache(*, asset=None, asset_id: str | None = None, object_key: str | None = None):
    """Best-effort invalidation; never raises."""
    try:
        if asset is not None:
            key = _asset_cache_key(asset)
            _ASSET_PROJECTION_CACHE.pop(key, None)
            # Also clear by id prefix in case updated_at changed and old key differs
            prefix = f"{getattr(asset, 'id', '')}:"
            for k in list(_ASSET_PROJECTION_CACHE.keys()):
                if k.startswith(prefix):
                    _ASSET_PROJECTION_CACHE.pop(k, None)
        elif asset_id is not None:
            prefix = f"{asset_id}:"
            for k in list(_ASSET_PROJECTION_CACHE.keys()):
                if k.startswith(prefix):
                    _ASSET_PROJECTION_CACHE.pop(k, None)
        elif object_key is not None:
            # object_key without id: remove any entry containing it
            for k in list(_ASSET_PROJECTION_CACHE.keys()):
                if object_key in k:
                    _ASSET_PROJECTION_CACHE.pop(k, None)
    except Exception:
        pass


def clear_asset_projection_cache():
    """For tests only."""
    _ASSET_PROJECTION_CACHE.clear()


async def asset_projection(db, asset, use_cache: bool = False):
    if not asset or asset.status != "uploaded" or asset.mime_type not in IMAGE_MIMES or asset.media_type != "image":
        return None
    try:
        key = normalize_object_key(asset.object_key)
    except InvalidObjectKeyError:
        return None
    # Cache only for public path (content(public=True)); staff reads stay live.
    cache_key = None
    now = None
    if use_cache:
        cache_key = _asset_cache_key(asset)
        now = _now()
        cached_val, hit = _cache_get(cache_key, now)
        if hit:
            return cached_val
    try:
        exists = await run_in_threadpool(MediaService(db).object_exists, key)
    except Exception as exc:
        raise AppException("Media storage unavailable; retry later.", 503, "STORAGE_UNAVAILABLE") from exc
    if not exists:
        if use_cache and cache_key is not None:
            _cache_set(cache_key, None, now, is_positive=False)
        return None
    result = {"id": asset.id, "objectKey": key, "url": build_media_url(key), "status": asset.status, "mimeType": asset.mime_type}
    if use_cache and cache_key is not None:
        _cache_set(cache_key, result, now, is_positive=True)
    return result


def copy_projection(row):
    return {"eyebrow": row.eyebrow, "title": row.title, "subtitle": row.subtitle,
            "ctaLabel": row.cta_label, "ctaHref": row.cta_href, "altText": row.alt_text}


def safe_product(dto):
    """Do not pass through inline/blob references retained by legacy resolver."""
    data = dto.model_dump(by_alias=True)
    def clean(value):
        if not isinstance(value, str):
            return ""
        v = value.strip()
        if v.lower().startswith(("data:", "blob:", "javascript:", "//")) or "\\" in v or any(ord(c) < 32 for c in v):
            return ""
        return v if v.startswith(("/api/v1/media/objects/", "/images/", "https://", "http://")) else ""
    for key in ("image", "hoverImage", "mobileImage"):
        if key in data:
            data[key] = clean(data[key])
    for key in ("images", "gallery", "additionalImages"):
        if isinstance(data.get(key), list):
            data[key] = [clean(v) for v in data[key] if clean(v)]
    return data


class HomepageContentService:
    def __init__(self, db):
        self.db = db

    def key(self, key):
        if key not in REGISTRY:
            raise BusinessLogicException("Unknown or delegated homepage section.")
        return key

    async def section(self, key, lock=False):
        self.key(key)
        stmt = select(Section).where(Section.section_key == key)
        if lock:
            stmt = stmt.with_for_update()
        return (await self.db.execute(stmt)).scalars().first()

    async def items(self, section_id):
        return list((await self.db.execute(select(Item).where(Item.section_id == section_id).order_by(Item.sort_order, Item.id))).scalars().all())

    async def content(self, public=False):
        sections = list((await self.db.execute(select(Section))).scalars().all())
        by_key = {s.section_key: s for s in sections}
        entries = list((await self.db.execute(select(Item).order_by(Item.sort_order, Item.id))).scalars().all())
        active_sections = {s.id for s in sections if s.is_active}
        owners = {s.id: s.section_key for s in sections}
        def spec_for(row):
            return next((spec for spec in REGISTRY.get(owners.get(row.section_id), ()) if spec["slotKey"] == row.slot_key and spec["contentType"] == row.content_type), None)
        resource_entries = [r for r in entries if spec_for(r) and (not public or (r.is_active and r.section_id in active_sections))]
        product_ids = [r.product_id for r in resource_entries if r.product_id]
        products = await ProductService(self.db).homepage_products_by_ids(product_ids)
        asset_ids = {r.media_asset_id for r in resource_entries if r.media_asset_id}
        assets = {}
        if asset_ids:
            rows = (await self.db.execute(select(MediaAssetModel).where(MediaAssetModel.id.in_(asset_ids)))).scalars().all()
            for row in rows:
                assets[row.id] = await asset_projection(self.db, row, use_cache=public)
        result = [{"key": "hero", "source": "heroSlides", "state": "delegated"}]
        for key, slots in REGISTRY.items():
            section = by_key.get(key)
            item = {"key": key, "configured": section is not None, "source": "sections" if section else "legacy", "state": "missing", "items": []}
            if not public:
                item["allowedSlots"] = slots
            if section:
                active_count = 0
                slot_counts = {}
                item.update(isActive=section.is_active, revision=section.revision)
                for row in entries:
                    if row.section_id != section.id:
                        continue
                    projected = {"id": row.id, "slotKey": row.slot_key, "contentType": row.content_type, "sortOrder": row.sort_order}
                    spec = spec_for(row)
                    warning = None if spec else "invalid_slot"
                    try:
                        validate_shape(row.content_type, {k: getattr(row, k) for k in (*COPY_FIELDS, "media_asset_id", "product_id")})
                    except ValueError:
                        warning = "invalid_content"
                    if row.content_type == "PRODUCT":
                        product = products.get(row.product_id)
                        warning = warning or (None if product else "product_not_public")
                        if product:
                            projected["product"] = safe_product(product)
                    elif row.content_type == "MEDIA":
                        media = assets.get(row.media_asset_id)
                        warning = warning or (None if media else "media_unavailable")
                        if media:
                            projected["media"] = {**media, **copy_projection(row)}
                    else:
                        projected["text"] = copy_projection(row)
                    if section.is_active and row.is_active and not warning:
                        typed_slot = (row.slot_key, row.content_type)
                        slot_counts[typed_slot] = slot_counts.get(typed_slot, 0) + 1
                        if slot_counts[typed_slot] > spec["capacity"]:
                            warning = "slot_capacity_exceeded"
                        else:
                            active_count += 1
                    if public:
                        if not section.is_active or not row.is_active or warning:
                            continue
                    else:
                        projected.update(isActive=row.is_active, warning=warning, mediaAssetId=row.media_asset_id, productId=row.product_id, **copy_projection(row))
                    item["items"].append(projected)
                item["state"] = "inactive" if not section.is_active else "ready" if active_count else "empty"
            result.append(item)
        return {"version": 1, "status": "ready", "sections": result}

    async def get(self, key):
        if key != "hero":
            self.key(key)
        return next(s for s in (await self.content())["sections"] if s["key"] == key)

    async def check_media_grant(self, actor, deleting=False):
        await grant(actor, self.db, "media.view", "media.delete" if deleting else "media.assign")

    async def validate_resource(self, kind, values):
        try:
            validate_shape(kind, values)
        except ValueError as exc:
            raise BusinessLogicException(str(exc)) from exc
        if kind == "MEDIA":
            await registered_asset(self.db, values["media_asset_id"])
        if kind == "PRODUCT":
            products = await ProductService(self.db).homepage_products_by_ids([values["product_id"]], for_update=True)
            if values["product_id"] not in products:
                raise BusinessLogicException("Product must currently be publicly eligible.")

    async def write(self, key, operation, payload, actor, item_id=None):
        """One transaction/lock/revision for every non-hero authored change."""
        self.key(key)
        await grant(actor, self.db, "marketing.view", "marketing.manage")
        try:
            section = await self.section(key, lock=True)
            expected = payload.expected_revision
            if section is None:
                if operation != "configure" or expected != 0:
                    raise ConflictException("Configure this section first; reload its revision.")
                section = Section(section_key=key, is_active=False, revision=1, created_by=actor.id, updated_by=actor.id)
                self.db.add(section)
                await self.db.flush()
            else:
                if section.revision != expected:
                    raise ConflictException("Content changed. Reload and reconcile before retrying.")
            new_revision = 1 if expected == 0 else expected + 1
            rows = await self.items(section.id)
            if operation == "configure":
                if payload.is_active:
                    for row in rows:
                        if row.is_active:
                            if row.content_type == "MEDIA":
                                await self.check_media_grant(actor)
                            await self.validate_resource(row.content_type, {k: getattr(row, k) for k in (*COPY_FIELDS, "media_asset_id", "product_id")})
                section.is_active = payload.is_active
            elif operation == "create":
                spec = next((s for s in REGISTRY[key] if s["slotKey"] == payload.slot_key and s["contentType"] == payload.content_type), None)
                if not spec:
                    raise BusinessLogicException("Unsupported typed slot.")
                same = [r for r in rows if r.slot_key == payload.slot_key and r.content_type == payload.content_type]
                if len(same) >= spec["capacity"] or (payload.product_id and any(r.product_id == payload.product_id for r in same)):
                    raise ConflictException("Slot capacity or duplicate assignment conflict.")
                if payload.content_type == "MEDIA":
                    await self.check_media_grant(actor)
                values = payload.model_dump(exclude={"expected_revision", "slot_key", "content_type"})
                await self.validate_resource(payload.content_type, values)
                reorder_group = next((members for (section_key, _, kind), members in GROUPS.items() if section_key == key and kind == payload.content_type and payload.slot_key in members), None)
                ordered = [r for r in rows if r.content_type == payload.content_type and r.slot_key in reorder_group] if reorder_group else same
                order = max([r.sort_order for r in ordered], default=-1) + 1 if payload.content_type == "PRODUCT" or reorder_group else REGISTRY[key].index(spec)
                self.db.add(Item(section_id=section.id, slot_key=payload.slot_key, content_type=payload.content_type, sort_order=order, created_by=actor.id, updated_by=actor.id, **values))
            elif operation in ("patch", "delete"):
                row = next((r for r in rows if r.id == item_id), None)
                if row is None:
                    raise NotFoundException("Entry does not belong to this section.")
                if row.content_type == "MEDIA":
                    await self.check_media_grant(actor, deleting=operation == "delete")
                if operation == "delete":
                    await self.db.delete(row)
                else:
                    changes = payload.model_dump(exclude_unset=True, exclude={"expected_revision"})
                    values = {k: getattr(row, k) for k in (*COPY_FIELDS, "media_asset_id", "product_id")}
                    values.update(changes)
                    try:
                        validate_shape(row.content_type, values)
                    except ValueError as exc:
                        raise BusinessLogicException(str(exc)) from exc
                    # Copy-only/deactivation remains possible for stale references.
                    if changes.get("is_active") or "media_asset_id" in changes or "product_id" in changes:
                        await self.validate_resource(row.content_type, values)
                    if row.content_type == "PRODUCT" and any(r.id != row.id and r.slot_key == row.slot_key and r.product_id == values["product_id"] for r in rows):
                        raise ConflictException("Duplicate product in slot.")
                    for k, v in changes.items():
                        setattr(row, k, v)
                    row.updated_by = actor.id
                    row.updated_at = datetime.now(timezone.utc)
            elif operation == "reorder":
                group = GROUPS.get((key, payload.slot_key, payload.content_type), (payload.slot_key,))
                if (key, payload.slot_key, payload.content_type) not in GROUPS and not any(s["slotKey"] == payload.slot_key and s["contentType"] == payload.content_type for s in REGISTRY[key]):
                    raise BusinessLogicException("Unsupported typed reorder slot.")
                selected = [r for r in rows if r.slot_key in group and r.content_type == payload.content_type]
                ids = payload.item_ids
                if len(ids) != len(set(ids)) or set(ids) != {r.id for r in selected}:
                    raise ConflictException("Reorder requires the exact current typed-slot membership.")
                if payload.content_type != "PRODUCT" and (key, payload.slot_key, payload.content_type) not in GROUPS:
                    raise BusinessLogicException("This singleton slot cannot be reordered.")
                if payload.content_type == "MEDIA":
                    await self.check_media_grant(actor)
                for order, identity in enumerate(ids):
                    row = next(r for r in selected if r.id == identity)
                    row.sort_order, row.updated_by = order, actor.id
            else:
                raise BusinessLogicException("Unsupported operation.")
            section.revision = new_revision
            section.updated_by = actor.id
            section.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
            # Materialize response before commit; any projection/storage error
            # rolls back rather than reporting an ambiguous partial success.
            response = {"ok": True, "section": await self.get(key)}
            await self.db.commit()
            # B-14: invalidate any media asset that was referenced in this write
            try:
                touched = set()
                if operation == "create" and payload.content_type == "MEDIA":
                    touched.add(getattr(payload, "media_asset_id", None))
                elif operation == "patch":
                    mid = getattr(payload, "media_asset_id", None)
                    if mid is not None:
                        touched.add(mid)
                for mid in touched:
                    if mid:
                        try:
                            invalidate_asset_projection_cache(asset_id=mid)
                        except Exception:
                            pass
            except Exception:
                pass
            return response
        except (IntegrityError, StaleDataError) as exc:
            await self.db.rollback()
            raise ConflictException("Concurrent configuration or duplicate slot; reload before retrying.") from exc
        except SQLAlchemyError as exc:
            await self.db.rollback()
            raise AppException("Homepage persistence unavailable; retry after schema/database verification.", 503, "HOMEPAGE_UNAVAILABLE") from exc
        except Exception:
            await self.db.rollback()
            raise


# ---------------------------------------------------------------------------
# Registered-media library filters (Batch 2 / B-11 picker search)
# ---------------------------------------------------------------------------

#: Maximum length of the free-text asset query ``q``. The cap keeps the
#: LIKE bind value bounded; longer input is a client error, not a silent
#: truncation.
ASSET_QUERY_MAX_LEN = 120

#: Valid values for the optional ``scope`` list filter. The stored scope
#: vocabulary is only {product, marketing}; placement art splits by object
#: namespace, so ``hero`` is the hero/ namespace and ``marketing`` the
#: marketing/ namespace of the marketing scope.
ASSET_SCOPE_FILTERS = ("product", "hero", "marketing")

#: Valid values for the optional ``type`` list filter (Batch 2). Classified by
#: the SNIFFED ``mime_type`` prefix — the same rule the media summary cards
#: use — because ``media_type`` is a duplicated column that every writer
#: hardcodes to "image" (product registration, placement registration, legacy
#: import). Filtering on it would list every video as an image and make
#: ``type=video`` permanently empty.
ASSET_MEDIA_TYPE_FILTERS = ("image", "video")


def escape_like_literal(text):
    """Escape the LIKE meta characters in a free-text search term.

    The user-facing ``q`` is meant to match literals: an unescaped ``%`` or
    ``_`` would silently widen the match (``%`` matches everything, so a
    product name search for "100%" would return every registered asset).
    Backslash is the escape character both here and in the SQL ``ESCAPE``
    clause, so it is escaped first.
    """
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def normalize_asset_page_filters(
    q,
    scope,
    mime,
    *,
    media_type=None,
    assigned=None,
    unassigned=None,
    placement=None,
):
    """Validate + normalize the optional registered-asset list filters.

    Shared by the admin registry list (``GET /media/assets``) and the
    employee picker page (``employee_asset_page``). With every input empty
    the returned condition list is empty and the endpoints behave exactly as
    before (unfiltered newest-first page). ``q`` matches LITERALLY — LIKE
    wildcards are escaped (`escape_like_literal` +
    ``ESCAPE '\\'``), never interpreted.

    Batch 2 adds four optional filters. They are keyword-only with an empty
    default, so the employee picker (which passes none of them) is
    byte-compatible with its previous behaviour:

      · ``media_type`` (wire name ``type``) — ``image`` or ``video``, matched
        on the sniffed ``mime_type`` prefix (see
        ``ASSET_MEDIA_TYPE_FILTERS``). Any other value is a 422.
      · ``assigned`` — product-scope assets that HAVE a ``media_product_media``
        row.
      · ``unassigned`` — product-scope assets that have NONE.
      · ``placement`` — the whole marketing scope, i.e. ``hero/`` AND
        ``marketing/`` placement art. No namespace test: declared scope is the
        truth (R4), and no row is reclassified.

    ``assigned`` and ``unassigned`` partition the product scope, so asking for
    both at once is contradictory and rejected with a 422 rather than silently
    returning an empty page.
    """
    from app.models.catalog.product import ProductModel
    from app.models.media.product_media import ProductMediaModel

    conditions = []
    text = (q or "").strip()
    if text:
        if len(text) > ASSET_QUERY_MAX_LEN:
            raise BusinessLogicException(
                f"The search text is limited to {ASSET_QUERY_MAX_LEN} characters."
            )
        like = f"%{escape_like_literal(text)}%"
        # Product-name / SKU matching goes through the existing product_media
        # mapping as an EXISTS subquery — assets stay one-row-per-asset (no
        # join fan-out) and the count stays truthful.
        product_match = (
            select(ProductMediaModel.id)
            .join(ProductModel, ProductModel.id == ProductMediaModel.product_id)
            .where(ProductMediaModel.media_id == MediaAssetModel.id)
            .where(
                ProductModel.name.ilike(like, escape="\\")
                | ProductModel.sku.ilike(like, escape="\\")
            )
            .exists()
        )
        conditions.append(MediaAssetModel.object_key.ilike(like, escape="\\") | product_match)
    if scope is not None and str(scope).strip():
        scope_text = str(scope).strip().lower()
        if scope_text not in ASSET_SCOPE_FILTERS:
            raise BusinessLogicException(
                "Unknown scope filter. Valid values: product, hero, marketing."
            )
        if scope_text == "hero":
            conditions.append(MediaAssetModel.scope == "marketing")
            conditions.append(MediaAssetModel.object_key.like("hero/%"))
        elif scope_text == "marketing":
            conditions.append(MediaAssetModel.scope == "marketing")
            conditions.append(MediaAssetModel.object_key.not_like("hero/%"))
        else:
            conditions.append(MediaAssetModel.scope == scope_text)
    if mime is not None and str(mime).strip():
        conditions.append(MediaAssetModel.mime_type == str(mime).strip().lower())
    if media_type is not None and str(media_type).strip():
        type_text = str(media_type).strip().lower()
        if type_text not in ASSET_MEDIA_TYPE_FILTERS:
            raise BusinessLogicException(
                "Unknown media type filter. Valid values: image, video."
            )
        conditions.append(MediaAssetModel.mime_type.ilike(f"{type_text}/%"))
    if assigned and unassigned:
        raise BusinessLogicException(
            "assigned=true and unassigned=true cannot be combined; "
            "product media is either mapped to a product or it is not."
        )
    if assigned:
        conditions.append(MediaAssetModel.scope == "product")
        conditions.append(
            select(ProductMediaModel.id)
            .where(ProductMediaModel.media_id == MediaAssetModel.id)
            .exists()
        )
    if unassigned:
        conditions.append(MediaAssetModel.scope == "product")
        conditions.append(
            ~select(ProductMediaModel.id)
            .where(ProductMediaModel.media_id == MediaAssetModel.id)
            .exists()
        )
    if placement:
        # Placement art = the entire marketing scope: hero/ AND marketing/.
        conditions.append(MediaAssetModel.scope == "marketing")
    return conditions


async def product_context_map(db, media_ids):
    """{media_id: {productId, productName, productSku}} from the existing
    media_product_media mapping — the picker shows the owning product's
    name/SKU for product-scoped assets. One row per asset (lowest product
    id wins when an asset is mapped to more than one product)."""
    from app.models.catalog.product import ProductModel
    from app.models.media.product_media import ProductMediaModel

    if not media_ids:
        return {}
    rows = (
        await db.execute(
            select(ProductMediaModel, ProductModel)
            .join(ProductModel, ProductModel.id == ProductMediaModel.product_id)
            .where(ProductMediaModel.media_id.in_(media_ids))
            .order_by(ProductModel.id)
        )
    ).all()
    context = {}
    for mapping, product in rows:
        context.setdefault(
            mapping.media_id,
            {"productId": product.id, "productName": product.name, "productSku": product.sku},
        )
    return context


async def employee_asset_page(db, page, page_size, q=None, scope=None, mime=None):
    """The employee homepage media-picker page.

    STATUS POLICY (intentional): this is a STAFF authoring surface
    (marketing.view + media.view, enforced by the route's `hero_access`),
    not a public read — so it deliberately lists registered assets of
    products in ANY lifecycle status (DRAFT / PENDING_REVIEW / PUBLISHED /
    ARCHIVED), because draft product art must be assignable to homepage
    sections before the product is published. The returned product context
    (name + SKU, via the existing product_media mapping) is intentional
    authoring context so the operator can tell draft assets apart from
    live ones. This endpoint does not widen any public surface: the public
    product media-set gates non-PUBLISHED products to a 404 that is
    indistinguishable from a missing product.
    """
    eligible = [MediaAssetModel.status == "uploaded", MediaAssetModel.media_type == "image", MediaAssetModel.mime_type.in_(IMAGE_MIMES)]
    eligible.extend(normalize_asset_page_filters(q, scope, mime))
    total = (await db.execute(select(func.count()).select_from(MediaAssetModel).where(*eligible))).scalar() or 0
    rows = (await db.execute(select(MediaAssetModel).where(*eligible).order_by(MediaAssetModel.created_at.desc(), MediaAssetModel.id.desc()).offset((page-1)*page_size).limit(page_size))).scalars().all()
    # Verify objects in this bounded page; total counts metadata-eligible rows.
    items = [item for row in rows if (item := await asset_projection(db, row))]
    scope_by_id = {row.id: row.scope for row in rows}
    context = await product_context_map(db, [item["id"] for item in items])
    for item in items:
        product = context.get(item["id"]) or {}
        item.update({
            "scope": scope_by_id.get(item["id"]),
            "productId": product.get("productId"),
            "productName": product.get("productName"),
            "productSku": product.get("productSku"),
        })
    return {"ok": True, "items": items, "total": total, "page": page, "pageSize": page_size}
