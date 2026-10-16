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


async def asset_projection(db, asset):
    if not asset or asset.status != "uploaded" or asset.mime_type not in IMAGE_MIMES or asset.media_type != "image":
        return None
    try:
        key = normalize_object_key(asset.object_key)
    except InvalidObjectKeyError:
        return None
    try:
        exists = await run_in_threadpool(MediaService(db).object_exists, key)
    except Exception as exc:
        raise AppException("Media storage unavailable; retry later.", 503, "STORAGE_UNAVAILABLE") from exc
    if not exists:
        return None
    return {"id": asset.id, "objectKey": key, "url": build_media_url(key), "status": asset.status, "mimeType": asset.mime_type}


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
                assets[row.id] = await asset_projection(self.db, row)
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


async def employee_asset_page(db, page, page_size):
    eligible = (MediaAssetModel.status == "uploaded", MediaAssetModel.media_type == "image", MediaAssetModel.mime_type.in_(IMAGE_MIMES))
    total = (await db.execute(select(func.count()).select_from(MediaAssetModel).where(*eligible))).scalar() or 0
    rows = (await db.execute(select(MediaAssetModel).where(*eligible).order_by(MediaAssetModel.created_at.desc(), MediaAssetModel.id.desc()).offset((page-1)*page_size).limit(page_size))).scalars().all()
    # Verify objects in this bounded page; total counts metadata-eligible rows.
    items = [item for row in rows if (item := await asset_projection(db, row))]
    return {"ok": True, "items": items, "total": total, "page": page, "pageSize": page_size}
