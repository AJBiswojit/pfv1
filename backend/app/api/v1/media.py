"""
Media — API router (Phase 6).

URL mapping:

  Public (no auth)
  ─────────────────────────────────────────────────────────────────────────
  GET    /media/health                              ← module health
  GET    /media/storage/status                      ← provider summary, no secrets
                                                       (bucket identity redacted
                                                       unless a staff session)
  GET    /media/objects/{object_key}                ← serve one object (bytes)
  HEAD   /media/objects/{object_key}                ← headers only
  GET    /media/object-meta/{object_key}            ← size / type / SHA-256
  POST   /media/references/resolve                  ← batch reference → URL decisions
  GET    /media/products/{product_id}/media-set     ← resolved media set for a product

  Admin (RBAC — existing media.* permission vocabulary)
  ─────────────────────────────────────────────────────────────────────────
  POST   /media/objects                             ← upload (media.upload)
  POST   /media/products/{product_id}/objects       ← upload for a product (media.upload)
  DELETE /media/objects/{object_key}                ← delete one object (media.delete)
  GET    /media/storage/readiness                   ← full storage config validation
                                                       (media.view)
  GET    /media/audit/orphans                       ← orphan report, DRY RUN only
                                                       (media.view)

Security notes
--------------
  · There is no `?path=` style endpoint. The only path-like input is an
    OBJECT KEY, validated by `app.storage.keys.normalize_object_key`
    (no traversal, no backslashes, no absolute/drive forms, namespace
    allow-list, character allow-list) before any I/O. A request cannot reach
    a file outside `LOCAL_MEDIA_ROOT`.
  · Error responses never include a filesystem path — only the object key
    the caller supplied.
  · Mutations sit behind the Phase-1 admin guard plus the fine-grained
    `media.upload` / `media.delete` permissions. Frontend visibility is not
    the control.
  · Uploads are validated by content signature, not by filename or by the
    client's `Content-Type` header.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, File, Form, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse, StreamingResponse

from app.core.exceptions import (
    BusinessLogicException,
    ConflictException,
    NotFoundException,
)
from app.core.logging import get_logger
from app.config import settings
from app.dependencies import (
    get_current_admin,
    get_current_employee,
    get_db,
    get_optional_user,
    get_user_roles_and_permissions,
    require_admin_permission,
    require_permission_for_user,
    resolve_account_level,
)
from app.core.rbac import ACCOUNT_LEVEL_SUPER_ADMIN
from app.models.auth.user import UserModel
from app.models.catalog.product import ProductModel
from app.models.media.media_asset import MediaAssetModel
from app.models.media.product_media import ProductMediaModel
from app.storage import get_storage_provider
from sqlalchemy import update
from app.schemas.media.media import (
    DEFAULT_PRODUCT_MEDIA_ROLE,
    MEDIA_ASSET_SCOPE_PRODUCT,
    MEDIA_ASSET_STATUS_UPLOADED,
    MEDIA_UPLOAD_NAMESPACES,
    PRODUCT_MEDIA_ROLE_VALUES,
    MediaAssetListResponse,
    MediaObjectMetaResponse,
    MediaObjectResponse,
    MediaOrphanReportResponse,
    MediaReferenceResolveRequest,
    MediaReferenceResolveResponse,
    MediaRegistrationResponse,
    MediaStorageReadinessResponse,
    MediaStorageStatusResponse,
    PlacementAssetRegistrationResponse,
    ProductMediaSetResponse,
    coerce_product_media_role,
)
from app.services.media.homepage_content_service import (
    normalize_asset_page_filters,
    product_context_map,
)
from app.services.media.placement_asset_service import (
    register_placement_asset as _register_placement_asset,
)
from app.api.v1.response_docs import canonical_error_responses
from app.services.media.media_service import MediaService
from app.services.media.media_validation import MediaValidationError
from app.services.media.media_reference_audit import (
    audit_object_references,
    orphan_report,
)
from app.services.media.product_media_records import (
    primary_item,
    registered_media_for_product,
)
from app.services.media.product_media_resolver import (
    resolve_many,
    resolve_product_image_list,
    resolve_product_image_reference,
)
from app.services.media.upload_service import UploadService
from app.storage import (
    InvalidObjectKeyError,
    ObjectCollisionError,
    ObjectNotFoundError,
    StorageError,
)
from app.storage.environment import (
    classify_environment,
    fatal_issues,
    validate_storage_environment,
)
from app.storage.urls import cache_control_for_key

def _storage_error_text(exc: BaseException) -> str:
    """
    Operator-safe text for a storage error surfaced by the readiness endpoint.

    The storage layer translates every driver exception into one of its own
    types, whose messages are written by us and name nothing sensitive.
    Anything else — a botocore error, an OSError — can carry an endpoint host,
    an STS ARN, a request id, a filesystem path or a credential, so for those
    only the exception class survives and the detail goes to the log.
    """
    if isinstance(exc, StorageError):
        return str(exc)
    logger.warning("Storage error surfaced by an admin endpoint: %s", type(exc).__name__)
    return f"{type(exc).__name__} — see the server log for details."


logger = get_logger("app.api.v1.media")

router = APIRouter(prefix="/media", tags=["Media Assets"])
employee_router = APIRouter(prefix="/employee/media", tags=["Employee media"])


# ---------------------------------------------------------------------------
# Shared product-media registration core (admin + employee surfaces)
# ---------------------------------------------------------------------------


async def _register_product_asset(
    db,
    actor,
    key,
    product_id,
    role,
    sort_order,
    is_primary,
    title=None,
    alt_text=None,
    preserve_existing_mapping=False,
):
    """Upsert the MediaAssetModel row + ProductMediaModel mapping for `key`.

    Caller MUST have checked permissions and validated the product row. The
    object must exist in storage — its row metadata (mime/size/checksum) comes
    from the stored object, never from client claims. Idempotent by object
    key: an existing asset row is reused (never duplicated) and an existing
    mapping for the same (product, asset) pair is updated in place — UNLESS
    `preserve_existing_mapping` is set (employee register-by-key: re-registering
    an already-mapped asset changes NOTHING about that mapping, so an admin-set
    primary / role / sort order can never be reshaped from the employee lane).

    Does NOT commit or touch caches — callers then call
    `_commit_and_invalidate_product_media`.
    """
    media = _get_media_service(db)
    try:
        meta = await run_in_threadpool(media.object_metadata, key)
    except ObjectNotFoundError as exc:
        raise NotFoundException("Media object not found.") from exc
    row = (
        await db.execute(select(MediaAssetModel).where(MediaAssetModel.object_key == key))
    ).scalars().first()
    if row is None:
        row = MediaAssetModel(
            object_key=key,
            storage_provider=settings.storage_provider_name,
            media_type="image",
            mime_type=meta.content_type,
            original_filename=key.rsplit("/", 1)[-1],
            file_size=meta.size,
            checksum_sha256=meta.checksum_sha256,
            status=MEDIA_ASSET_STATUS_UPLOADED,
            scope=MEDIA_ASSET_SCOPE_PRODUCT,
            uploaded_by=actor.id,
            title=title,
            alt_text=alt_text,
        )
        db.add(row)
        await db.flush()
    mapping = None
    if product_id is not None:
        if is_primary:
            await db.execute(
                update(ProductMediaModel)
                .where(ProductMediaModel.product_id == product_id)
                .values(is_primary=False)
            )
        mapping = (
            await db.execute(
                select(ProductMediaModel).where(
                    ProductMediaModel.product_id == product_id,
                    ProductMediaModel.media_id == row.id,
                )
            )
        ).scalars().first()
        if mapping is None:
            mapping = ProductMediaModel(
                product_id=product_id,
                media_id=row.id,
                role=role,
                sort_order=sort_order,
                is_primary=is_primary,
                assigned_by=actor.id,
            )
            db.add(mapping)
        elif not preserve_existing_mapping:
            mapping.role, mapping.sort_order, mapping.is_primary = role, sort_order, is_primary
    return row, mapping


async def _commit_and_invalidate_product_media(db, product_id):
    """Commit, then refresh the cached storefront product DTO.

    Cache maintenance must never fail a committed write — failures log only.
    """
    await db.commit()
    if not product_id:
        return
    try:
        from app.services.catalog.product_service import ProductService

        product = (
            await db.execute(select(ProductModel).where(ProductModel.id == product_id))
        ).scalars().first()
        if product is not None:
            await ProductService(db).invalidate_product_cache(product.id, product.slug)
    except Exception:
        logger.warning("Product media cache invalidation skipped", exc_info=True)
    # B-14: best-effort invalidation of public asset_projection cache for this product's assets
    try:
        from app.services.media.homepage_content_service import invalidate_asset_projection_cache
        from app.models.media.product_media import ProductMediaModel as _PMM

        rows = (
            await db.execute(select(_PMM).where(_PMM.product_id == product_id))
        ).scalars().all()
        for mapping in rows:
            try:
                invalidate_asset_projection_cache(asset_id=mapping.media_id)
            except Exception:
                pass
    except Exception:
        pass


async def _require_writable_product(db, product_id):
    """404 missing products; employee uploads must not extend ARCHIVED rows."""
    product = (
        await db.execute(select(ProductModel).where(ProductModel.id == product_id))
    ).scalars().first()
    if product is None:
        raise NotFoundException("Product not found.")
    return product


def _require_employee_write_scope(product, is_primary: bool) -> None:
    """Employee write hardening (decided policy).

    Employees may only attach media to products that are DRAFT or
    PENDING_REVIEW — a PUBLISHED product is customer-facing, so changing its
    media is an admin action, and ARCHIVED rows are frozen. Employees also
    can never claim the primary slot: the primary image of a product is set
    by an administrator (POST /media/register or the product media manager).
    Admin routes never call this guard.
    """
    if product.status == "ARCHIVED":
        raise BusinessLogicException("Archived products cannot receive new media.")
    if product.status == "PUBLISHED":
        raise BusinessLogicException(
            "Employees can only write product media while a product is DRAFT or "
            "PENDING_REVIEW. PUBLISHED products can only be changed by an administrator."
        )
    if is_primary:
        raise BusinessLogicException(
            "Employee uploads cannot become the primary image — an administrator "
            "sets the primary image for a product."
        )


async def _staff_can_read_unpublished_product_media(user, db) -> bool:
    """Read gate for the public product media-set (server-side session only).

    Anonymous and customer callers always get the public contract
    (PUBLISHED products only). Admins (any account level — the admin media
    surface is guarded by `get_current_admin` alone elsewhere) may read the
    set for ANY product status, and an EMPLOYEE may when their server-side
    grants include `media.view` or `media.upload` — resolved through the
    same `get_user_roles_and_permissions` engine the write lanes use
    (expansion + wildcard/SUPER_ADMIN bypass included). Denials are never
    audited here: an unauthorized reader simply falls back to the public
    contract (404, indistinguishable from a missing product).
    """
    if user is None:
        return False
    if user.user_type == "admin":
        return True
    if user.user_type != "employee":
        return False
    roles, permissions = await get_user_roles_and_permissions(user, db)
    permission_set = set(permissions)
    if resolve_account_level(user, roles) == ACCOUNT_LEVEL_SUPER_ADMIN or "*" in permission_set:
        return True
    return bool({"media.view", "media.upload"} & permission_set)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_media_service(db: Optional[AsyncSession] = None) -> MediaService:
    return MediaService(db)


def _invalid_key(message: str) -> BusinessLogicException:
    """422 for an unusable object key. Never echoes a filesystem path."""
    return BusinessLogicException(message)


def _safe_key(media: MediaService, raw: str) -> str:
    try:
        return media.coerce_object_key(raw)
    except InvalidObjectKeyError as exc:
        raise _invalid_key(f"Invalid media object key: {exc}") from exc


def _object_key_for_product(
    media: MediaService, filename: str, product_id: str
) -> str:
    try:
        return media.object_key_for_upload(
            filename, namespace="products", product_id=product_id
        )
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc


# ---------------------------------------------------------------------------
# Public reads
# ---------------------------------------------------------------------------

@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "media", "status": "active"}


@router.get(
    "/storage/status",
    response_model=MediaStorageStatusResponse,
    summary="Storage provider summary (no secrets)",
)
async def storage_status():
    """
    Which provider is active, the application-level media URL prefix, and
    whether a CDN is configured. Credentials and filesystem paths are never
    part of this payload.

    This endpoint is unauthenticated and must stay dependency-free (no database
    round-trip), so the S3 bucket name is ALWAYS redacted here. Operators who
    need the full picture — bucket, region, SSE mode — read
    `GET /media/storage/readiness`, which is admin-only.
    """
    return MediaService.storage_status(include_identifiers=False)


@router.get(
    "/storage/readiness",
    response_model=MediaStorageReadinessResponse,
    summary="Storage configuration readiness (admin) — full issue list",
    responses=canonical_error_responses(401, 403, 500),
)
async def storage_readiness(
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """
    Every storage configuration problem the backend can detect, with an
    actionable message for each.

    This is the same validation the process runs at startup, exposed without a
    restart. `ok` is false when any issue is fatal (`level: "error"`) — the
    application will refuse to start with that configuration.

    Being admin-only, this is the ONE endpoint that names the bucket and the
    region. The public `/media/storage/status` redacts them.
    """
    await require_admin_permission(current_user, db, "media.view")
    issues = validate_storage_environment()
    fatal = fatal_issues(issues)
    try:
        detail = get_storage_provider().describe(include_identifiers=True)
    except Exception as exc:  # noqa: BLE001 - a broken provider must not 500 here
        # An administrator may see the bucket name; they may not see a raw
        # driver message, which can carry an endpoint, an ARN or a request id.
        detail = {"error": _storage_error_text(exc)}
    return {
        "ok": not fatal,
        "environment": classify_environment(),
        "provider": settings.storage_provider_name,
        "cdnConfigured": bool(settings.media_cdn_base_url),
        "detail": detail,
        "issues": [issue.as_dict() for issue in issues],
        "fatalCount": len(fatal),
        "warningCount": len(issues) - len(fatal),
    }


@router.get(
    "/audit/orphans",
    response_model=MediaOrphanReportResponse,
    summary="Orphaned media report — DRY RUN, deletes nothing",
    responses=canonical_error_responses(401, 403, 500),
)
async def media_orphan_report(
    limit: int = Query(default=500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """
    Report — never repair.

    Lists registered assets that nothing references, and stored objects with no
    asset row at all (typically an upload that succeeded but whose database
    write failed). No automatic garbage collection is performed here: deleting
    anything reported requires a separate, explicitly authorised operation.
    """
    await require_admin_permission(current_user, db, "media.view")
    return await orphan_report(db, object_limit=limit)


@router.post(
    "/references/resolve",
    response_model=MediaReferenceResolveResponse,
    summary="Resolve product image references to canonical media URLs",
)
async def resolve_references(payload: MediaReferenceResolveRequest):
    """
    Batch resolution decisions.

    Each entry reports `status` — `resolved`, `legacy-fallback`,
    `passthrough`, `empty` or `disabled` — so the migration's dual-read
    behaviour is observable instead of silent.
    """
    entries = resolve_many(payload.references)
    return {"ok": True, "items": entries, "total": len(entries)}


@router.get(
    "/objects/{object_key:path}",
    summary="Serve one media object",
    responses={200: {"content": {"image/*": {}, "video/*": {}, "application/octet-stream": {}}}},
)
async def get_media_object(object_key: str, request: Request):
    """
    Return the bytes of a single object inside the configured media store.

    404 when the key is legal but absent; 422 when the key is not legal.
    """
    media = _get_media_service()
    key = _safe_key(media, object_key)

    try:
        metadata = await run_in_threadpool(media.object_metadata, key)
    except ObjectNotFoundError as exc:
        raise NotFoundException("Media object not found.") from exc
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc

    headers = {
        "ETag": f'"{metadata.etag or metadata.checksum_sha256}"',
        "Last-Modified": metadata.last_modified or "",
        "X-Content-Type-Options": "nosniff",
        # A content-addressed key (…-{sha256[:12]}.ext) can never change: if
        # the bytes change, the key changes. Those objects are immutable and
        # may be cached for a year. Every other key is replaceable by an admin,
        # so it keeps a short revalidating TTL — and an admin replacement
        # writes to a NEW content-addressed key rather than overwriting it.
        "Cache-Control": cache_control_for_key(key),
    }
    if not headers["Last-Modified"]:
        headers.pop("Last-Modified")

    provider = media.storage
    if hasattr(provider, "local_path"):
        try:
            path = await run_in_threadpool(provider.local_path, key)
        except ObjectNotFoundError as exc:
            raise NotFoundException("Media object not found.") from exc
        return FileResponse(str(path), media_type=metadata.content_type, headers=headers)

    stream = await run_in_threadpool(media.open_object, key)
    return StreamingResponse(stream, media_type=metadata.content_type, headers=headers)


@router.head("/objects/{object_key:path}", summary="Media object headers only")
async def head_media_object(object_key: str):
    media = _get_media_service()
    key = _safe_key(media, object_key)
    try:
        metadata = await run_in_threadpool(media.object_metadata, key)
    except ObjectNotFoundError as exc:
        raise NotFoundException("Media object not found.") from exc
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc
    return Response(
        status_code=200,
        media_type=metadata.content_type,
        headers={
            "Content-Length": str(metadata.size),
            "ETag": f'"{metadata.etag or metadata.checksum_sha256}"',
        },
    )


@router.get(
    "/object-meta/{object_key:path}",
    response_model=MediaObjectMetaResponse,
    summary="Media object metadata",
)
async def get_media_object_meta(object_key: str):
    media = _get_media_service()
    key = _safe_key(media, object_key)
    try:
        metadata = await run_in_threadpool(media.object_metadata, key)
    except ObjectNotFoundError as exc:
        raise NotFoundException("Media object not found.") from exc
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc
    return {
        "ok": True,
        "object": metadata.as_dict(),
        "url": media.object_url(key),
    }


@router.get(
    "/products/{product_id}/media-set",
    response_model=ProductMediaSetResponse,
    summary="Resolved media set for one product",
)
async def get_product_media_set(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_user),
):
    """
    The product's media set — BOTH halves of the Phase 7 dual-read.

    Legacy half (unchanged): the product's own authored columns (`image`,
    `hover_image`, `additional_images`) resolved through the storage layer.

    Registered half (Phase 7 source of truth for NEW media): the durable
    `media_product_media` associations joined to their `media_media_asset`
    rows, ordered primary-first — each with its object key and canonical
    `/media/objects/...` URL. A product with no registered rows answers
    exactly as it did before this phase.

    VISIBILITY (Batch 2): anonymous and customer callers receive the set
    only for PUBLISHED products (`status == "PUBLISHED"` and `published`,
    the storefront DTO gate). Any other status answers with the exact 404
    envelope of a missing product — the existence of a DRAFT /
    PENDING_REVIEW / ARCHIVED product is never leaked. Staff holding a
    server-side session (admins; employees with a media.view/media.upload
    grant) may read the set for any product status.
    """
    result = await db.execute(
        select(ProductModel).where(ProductModel.id == product_id)
    )
    product = result.scalars().first()
    if not product:
        raise NotFoundException(f"Product '{product_id}' not found.")
    publicly_visible = product.status == "PUBLISHED" and bool(product.published)
    if not publicly_visible and not await _staff_can_read_unpublished_product_media(current_user, db):
        raise NotFoundException(f"Product '{product_id}' not found.")

    primary = resolve_product_image_reference(product.image)
    hover = resolve_product_image_reference(product.hover_image)
    gallery = resolve_product_image_list(product.additional_images)
    # A gallery that repeats the cover is not a gallery.
    gallery = [item for item in gallery if item and item != primary] or list(gallery)

    registered = await registered_media_for_product(db, product.id)
    registered_primary = primary_item(registered)

    return {
        "ok": True,
        "productId": product.id,
        "primary": primary or None,
        "hover": hover or None,
        "gallery": gallery,
        "primaryMediaId": product.primary_media_id,
        "mediaIds": product.media_ids or [],
        "galleryMediaIds": product.gallery_media_ids or [],
        "mediaItems": registered,
        "primaryMediaUrl": registered_primary["url"] if registered_primary else None,
        "mediaRecordsAvailable": bool(registered),
        "note": (
            "Registered media records answer this product (mediaItems; "
            "primary-first). Legacy authored columns remain resolved for "
            "compatibility."
            if registered
            else "No registered media records for this product yet — the "
            "legacy authored image columns are resolved for compatibility."
        ),
    }


# ---------------------------------------------------------------------------
# Admin mutations (RBAC)
# ---------------------------------------------------------------------------

@router.post(
    "/objects",
    response_model=MediaObjectResponse,
    status_code=201,
    summary="Upload a media object (admin)",
)
async def upload_media_object(
    file: UploadFile = File(..., description="Image file to store"),
    namespace: str = Form(
        "products",
        description=(
            "Storage namespace. Closed vocabulary, enforced by "
            "`app.storage.keys` — a key whose first segment is not one of "
            "these is rejected before any I/O, which is what stops this "
            "route becoming a generic file server over the storage root. "
            "Case-sensitive. `products` additionally requires `productId`."
        ),
        json_schema_extra={"enum": list(MEDIA_UPLOAD_NAMESPACES)},
    ),
    product_id: Optional[str] = Form(None, alias="productId"),
    group: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """
    Store one image in the object store and return its canonical URL.

    The object key is derived from real identity (`products/{PRODUCT_ID}/
    {filename}`), never from a random temp name. Nothing is written to the
    database: persisting the reference onto a product uses the existing
    `PATCH /admin/products/{id}` media fields.

    `namespace` is validated against the closed storage vocabulary
    (`app.storage.keys.ALLOWED_NAMESPACES`); an unknown namespace is a 422
    `BUSINESS_RULE_VIOLATION` and no object is written.
    """
    await require_admin_permission(current_user, db, "media.upload")

    upload = UploadService(db)
    try:
        stored = await upload.store_upload(
            file_obj=file,
            filename=file.filename,
            declared_content_type=file.content_type,
            namespace=namespace,
            product_id=product_id,
            group=group,
        )
    except MediaValidationError as exc:
        raise BusinessLogicException(str(exc)) from exc
    except ObjectCollisionError as exc:
        raise ConflictException(str(exc)) from exc
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc

    return {"ok": True, "object": stored, "status": 201}


@router.post(
    "/products/{product_id}/objects",
    response_model=MediaObjectResponse,
    status_code=201,
    summary="Upload a media object for a product (admin)",
)
async def upload_product_media_object(
    product_id: str,
    file: UploadFile = File(..., description="Image file to store"),
    role: str = Form(
        DEFAULT_PRODUCT_MEDIA_ROLE,
        description=(
            "Product-media role. Closed vocabulary: "
            + ", ".join(PRODUCT_MEDIA_ROLE_VALUES)
            + f". Defaults to '{DEFAULT_PRODUCT_MEDIA_ROLE}'."
        ),
    ),
    is_primary: bool = Form(False),
    sort_order: int = Form(0),
    title: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None),
    replace_existing: bool = Form(
        False,
        description=(
            "Allow replacing an existing object that holds DIFFERENT bytes at "
            "the deterministic key. The new bytes are written to a NEW "
            "content-addressed key (products/{ID}/{stem}-{sha256[:12]}.{ext}) "
            "rather than overwriting the old one, so no browser or CDN cache "
            "can serve the new art under the old URL. Identical bytes are "
            "always reported as already-present and are never rewritten."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """
    Upload scoped to one product AND auto-register the asset in one request.

    This is the preferred upload path for product media: it stores the object,
    creates the MediaAssetModel row, and creates the ProductMediaModel
    association atomically — no separate POST /media/register call required.
    The generic POST /media/objects path still exists for non-product namespaces
    but requires a manual register step afterwards.

    If the database half fails after the object was written, the just-written
    object is removed again (best-effort compensation) so a failed upload can
    never leave an unmanaged object behind.
    """
    await require_admin_permission(current_user, db, "media.upload")

    result = await db.execute(
        select(ProductModel.id).where(ProductModel.id == product_id)
    )
    if result.scalars().first() is None:
        raise NotFoundException(f"Product '{product_id}' not found.")

    try:
        role = coerce_product_media_role(role)
    except ValueError as exc:
        raise BusinessLogicException(str(exc)) from exc

    upload = UploadService(db)
    try:
        stored = await upload.store_upload(
            file_obj=file,
            filename=file.filename,
            declared_content_type=file.content_type,
            namespace="products",
            product_id=product_id,
            replace_existing=replace_existing,
        )
    except MediaValidationError as exc:
        raise BusinessLogicException(str(exc)) from exc
    except ObjectCollisionError as exc:
        raise ConflictException(str(exc)) from exc
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc

    # Auto-register: create the MediaAssetModel row and ProductMediaModel
    # association in the same request so no DB record is ever left orphaned.
    try:
        await _register_product_asset(
            db, current_user, stored["key"], product_id, role, sort_order, is_primary, title, alt_text
        )
        await _commit_and_invalidate_product_media(db, product_id)
    except Exception:
        await _compensate_failed_registration(db, stored)
        raise
    return {"ok": True, "object": stored, "status": 201}


@router.post(
    "/register",
    response_model=MediaRegistrationResponse,
    status_code=201,
    summary="Register an uploaded object as a media asset",
    responses=canonical_error_responses(401, 403, 404, 422, 500),
)
async def register_media_object(
    object_key: str = Form(...), product_id: Optional[str] = Form(None),
    role: str = Form(
        DEFAULT_PRODUCT_MEDIA_ROLE,
        description=(
            "Product-media role. Closed vocabulary (plan §24 step 9): "
            + ", ".join(PRODUCT_MEDIA_ROLE_VALUES)
            + ". Matched case-insensitively and stored with the caller's own "
            "casing; an empty value stores the default "
            f"'{DEFAULT_PRODUCT_MEDIA_ROLE}'. Anything else is rejected with "
            "422 BUSINESS_RULE_VIOLATION."
        ),
    ),
    sort_order: int = Form(0), is_primary: bool = Form(False), title: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None), db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """Create the durable row only after verifying the real object exists.

    Idempotent by object key: re-registering the same key returns the same
    asset row and UPDATES the existing product association's role / sort
    order / primary flag instead of duplicating it. When `is_primary` is set,
    every other association of the same product is demoted in the same
    transaction — a product never has two primaries.

    `role` is checked against the declared product-media vocabulary before
    anything is written. Before plan §24 step 9 this column accepted any
    string: the value went straight into a `String(30)` column, so a long
    role was an HTTP 500 (`StringDataRightTruncation`) on PostgreSQL rather
    than a validation rejection.
    """
    await require_admin_permission(current_user, db, "media.upload")
    try:
        role = coerce_product_media_role(role)
    except ValueError as exc:
        raise BusinessLogicException(str(exc)) from exc
    media = _get_media_service(db); key = _safe_key(media, object_key)
    if product_id:
        await _require_writable_product(db, product_id)
    row, mapping = await _register_product_asset(
        db, current_user, key, product_id or None, role, sort_order, is_primary, title, alt_text
    )
    await _commit_and_invalidate_product_media(db, product_id)
    return {
        "ok": True,
        "media": {
            "id": row.id,
            "objectKey": row.object_key,
            "url": media.object_url(row.object_key),
            "mimeType": row.mime_type,
            "title": row.title,
            "altText": row.alt_text,
            "status": row.status,
        },
        "assigned": bool(product_id),
        "assignment": (
            {
                "productId": mapping.product_id,
                "mediaId": mapping.media_id,
                "role": mapping.role,
                "sortOrder": mapping.sort_order,
                "isPrimary": mapping.is_primary,
            }
            if mapping is not None
            else None
        ),
    }


@router.post(
    "/register-placement",
    response_model=PlacementAssetRegistrationResponse,
    status_code=201,
    summary="Register a hero/marketing object as a placement asset (admin)",
    responses=canonical_error_responses(401, 403, 404, 422, 500),
)
async def register_placement_media_object(
    object_key: str = Form(...),
    title: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """Register an existing hero/marketing object as a durable asset.

    This is the explicit, allowlisted registration path for storefront
    placement art (hero slides, homepage section MEDIA slots): hero and
    marketing entries must reference a *registered* image, and product-bound
    paths are the wrong tool for placement objects.

    Validation before anything is written:

      · the object key must normalise through the storage key rules (no
        arbitrary keys);
      · its namespace — derived from the key, never from the caller — must
        be ``hero/`` or ``marketing/`` (``PLACEMENT_ASSET_NAMESPACES``);
      · the object must exist in the configured store (404 otherwise);
      · its sniffed content type must be a supported placement image
        (422 otherwise).

    Idempotent by object key: re-registering returns the existing row with
    ``created: false``. New rows carry ``scope=marketing`` — placement art
    is never product media. Upload and registration stay two explicit
    steps (no auto-registration of arbitrary non-product objects); wire the
    pair through the admin Media Library's placement action.
    """
    await require_admin_permission(current_user, db, "media.upload")

    row, created = await _register_placement_asset(
        db, object_key, uploaded_by=current_user.id, title=title, alt_text=alt_text
    )
    await db.commit()
    # B-14: invalidate public cache for this placement asset
    try:
        from app.services.media.homepage_content_service import invalidate_asset_projection_cache

        invalidate_asset_projection_cache(asset=row)
        # also by object_key in case id changed
        invalidate_asset_projection_cache(object_key=row.object_key)
    except Exception:
        pass

    return {
        "ok": True,
        "created": created,
        "media": {
            "id": row.id,
            "objectKey": row.object_key,
            "url": MediaService(db).object_url(row.object_key),
            "mimeType": row.mime_type,
            "title": row.title,
            "altText": row.alt_text,
            "status": row.status,
        },
    }


@router.get(
    "/assets",
    response_model=MediaAssetListResponse,
    summary="List registered media assets",
    responses=canonical_error_responses(401, 403, 422, 500),
)
async def list_media_assets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
    q: Optional[str] = Query(default=None),
    scope: Optional[str] = Query(default=None),
    mime: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """
    List registered media assets — DB-side paginated.

    DB-load note (admin consolidation): the registry read previously had no
    LIMIT, so every library mount returned every asset ever registered. The
    read is now a bounded page with the full filtered count, newest first.

    Batch 2 (B-11): optional `q` (object key / filename, plus the owning
    product's name or SKU via the existing product_media mapping), `scope`
    (product / hero / marketing — hero is the hero/ namespace of the
    marketing scope) and `mime` filters. Defaults are unchanged: no params
    means the same unfiltered newest-first page. Every item additionally
    carries its `scope` and, when product-mapped, the owning product's
    name/SKU so the registered-media picker can show context.
    """
    # Reads use the view permission (least privilege); uploads stay on
    # media.upload and deletion on media.delete.
    await require_admin_permission(current_user, db, "media.view")
    conditions = normalize_asset_page_filters(q, scope, mime)
    total = (
        await db.execute(select(func.count()).select_from(MediaAssetModel).where(*conditions))
    ).scalar() or 0
    rows = (
        await db.execute(
            select(MediaAssetModel)
            .where(*conditions)
            .order_by(MediaAssetModel.created_at.desc(), MediaAssetModel.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    context = await product_context_map(db, [r.id for r in rows])
    return {
        "ok": True,
        "items": [
            {
                "id": r.id,
                "objectKey": r.object_key,
                "url": MediaService(db).object_url(r.object_key),
                "status": r.status,
                "mimeType": r.mime_type,
                "scope": r.scope,
                "productId": (context.get(r.id) or {}).get("productId"),
                "productName": (context.get(r.id) or {}).get("productName"),
                "productSku": (context.get(r.id) or {}).get("productSku"),
            }
            for r in rows
        ],
        "total": int(total),
        "page": page,
        "pageSize": page_size,
    }


@router.delete(
    "/objects/{object_key:path}",
    summary="Delete one media object (admin)",
)
async def delete_media_object(
    object_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin),
):
    """
    Delete exactly one explicitly named object.

    There is no cascade and no garbage collection: an object is only removed
    when an administrator names it AND nothing references it.

    The reference check is complete (audit S-9/D-1/D-2/D-3):

      · registered `media_product_media` mappings;
      · LEGACY product image columns — `image`, `hover_image`,
        `additional_images`, `media_ids`, `primary_media_id`,
        `gallery_media_ids` (previously not checked at all);
      · `homepage_section_item.media_asset_id` — whose FK is
        `ON DELETE CASCADE`, so removing the asset row would silently delete
        live homepage content;
      · `media_marketing_media` by object key AND by `media_asset_id` /
        `mobile_media_asset_id` (previously only the key was counted).

    Anything referenced answers 409 with the per-family counts so the caller
    can un-link it first. The asset row is committed away BEFORE the object is
    removed, so the register can never point at a deleted object; if the
    object delete then fails, the leftover is reported by
    `GET /media/audit/orphans` instead of being hidden.

    The original `frontend/public/images` mock assets live outside the storage
    root and can never be reached from here.
    """
    await require_admin_permission(current_user, db, "media.delete")

    media = _get_media_service(db)
    key = _safe_key(media, object_key)

    asset = (
        await db.execute(select(MediaAssetModel).where(MediaAssetModel.object_key == key))
    ).scalars().first()

    audit = await audit_object_references(db, key, asset=asset)
    if audit["isReferenced"]:
        raise ConflictException(
            "Media object is in use: " + "; ".join(audit["blocking"]) + ". "
            "Remove the references first."
        )

    # Row first, object second: a failed object delete leaves an orphan that
    # the audit reports, whereas a failed row delete would leave the register
    # pointing at bytes that no longer exist.
    if asset is not None:
        await db.delete(asset)
        await db.commit()
        _invalidate_asset_caches(asset=asset, object_key=key)
    else:
        _invalidate_asset_caches(asset=None, object_key=key)

    deleted = await run_in_threadpool(media.delete_object, key)
    if not deleted and asset is None:
        raise NotFoundException("Media object not found.")
    if not deleted:
        logger.warning(
            "Media asset row removed but the object was already absent from the "
            "store key=%s",
            key,
        )
    return {"ok": True, "deleted": True, "key": key, "audit": audit["references"]}


async def _compensate_failed_registration(db, stored: Optional[Dict[str, Any]]) -> None:
    """
    Remove an object whose database registration failed.

    Storage is written BEFORE the database rows, so a DB failure would
    otherwise leave a live object that no asset row points at — invisible to
    the product, billed for, and only findable by a manual bucket sweep. This
    undoes the storage half of a failed upload.

    Best-effort by design: if the cleanup also fails, the object is reported by
    `GET /media/audit/orphans` (`objectsWithoutAssetRows`) rather than
    disappearing silently.
    """
    if not stored or not stored.get("created") or not stored.get("key"):
        return
    key = stored["key"]
    try:
        await run_in_threadpool(_get_media_service(db).delete_object, key)
        logger.warning("Rolled back orphaned media object after a failed registration key=%s", key)
    except Exception:
        logger.error(
            "Could not roll back orphaned media object key=%s — it will appear in "
            "GET /media/audit/orphans",
            key,
            exc_info=True,
        )


def _invalidate_asset_caches(*, asset, object_key: str) -> None:
    """Best-effort projection-cache invalidation. Never fails the request."""
    try:
        from app.services.media.homepage_content_service import (
            invalidate_asset_projection_cache,
        )

        if asset is not None:
            invalidate_asset_projection_cache(asset=asset)
        invalidate_asset_projection_cache(object_key=object_key)
    except Exception:
        logger.debug("Asset projection cache invalidation skipped", exc_info=True)


# ---------------------------------------------------------------------------
# Employee-scoped product media (Track C)
# ---------------------------------------------------------------------------
#
# Employee actors may upload and register PRODUCT media only, through
# user-granted `media.upload` — hero/marketing placement registration stays
# admin-exclusive (`/media/register-placement`). The namespace is pinned to
# an existing, non-archived product's own `products/{product_id}/` object
# namespace, so no employee write can ever place an object anywhere else.


@employee_router.post(
    "/products/{product_id}/objects",
    response_model=MediaObjectResponse,
    status_code=201,
    summary="Upload a product image and register it (employee, media.upload)",
    responses=canonical_error_responses(401, 403, 404, 422, 500),
)
async def employee_upload_product_media_object(
    product_id: str,
    file: UploadFile = File(..., description="Image file to store"),
    role: str = Form(DEFAULT_PRODUCT_MEDIA_ROLE),
    is_primary: bool = Form(False),
    sort_order: int = Form(0),
    title: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_employee),
):
    """Employee mirror of the admin combined upload — same pipeline, narrower gate.

    · explicit `media.upload` grant required (decision: employees never get it
      by default), checked from the server-side grant records, never UI claims;
    · the product must exist and be DRAFT or PENDING_REVIEW only;
      is_primary=true is rejected — the primary image is admin-set;
    · the object lands in `products/{product_id}/` and is registered +
      mapped atomically, exactly like the admin route.
    """
    await require_permission_for_user(current_user, db, "media.upload")
    _require_employee_write_scope(product=await _require_writable_product(db, product_id), is_primary=is_primary)
    try:
        role = coerce_product_media_role(role)
    except ValueError as exc:
        raise BusinessLogicException(str(exc)) from exc
    upload = UploadService(db)
    try:
        stored = await upload.store_upload(
            file_obj=file,
            filename=file.filename,
            declared_content_type=file.content_type,
            namespace="products",
            product_id=product_id,
        )
    except MediaValidationError as exc:
        raise BusinessLogicException(str(exc)) from exc
    except ObjectCollisionError as exc:
        raise ConflictException(str(exc)) from exc
    except InvalidObjectKeyError as exc:
        raise _invalid_key(str(exc)) from exc
    try:
        await _register_product_asset(
            db, current_user, stored["key"], product_id, role, sort_order, is_primary, title, alt_text
        )
        await _commit_and_invalidate_product_media(db, product_id)
    except Exception:
        await _compensate_failed_registration(db, stored)
        raise
    return {"ok": True, "object": stored, "status": 201}


@employee_router.post(
    "/register",
    response_model=MediaRegistrationResponse,
    status_code=201,
    summary="Register an existing product object (employee, media.upload)",
    responses=canonical_error_responses(401, 403, 404, 422, 500),
)
async def employee_register_product_media_object(
    object_key: str = Form(...),
    product_id: str = Form(...),
    role: str = Form(DEFAULT_PRODUCT_MEDIA_ROLE),
    sort_order: int = Form(0),
    is_primary: bool = Form(False),
    title: Optional[str] = Form(None),
    alt_text: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_employee),
):
    """Employee register-by-key — PRODUCT namespace only.

    The key must live inside the product's own `products/{product_id}/`
    namespace: employees cannot bind hero/, marketing/, uploads/ or any
    other product's objects to a product. The product must be DRAFT or
    PENDING_REVIEW; is_primary=true is rejected; and re-registering an
    already-mapped key leaves that mapping COMPLETELY untouched (role, sort
    order, primary flag), so the employee lane can never reshape an
    admin-set mapping.
    """
    await require_permission_for_user(current_user, db, "media.upload")
    _require_employee_write_scope(product=await _require_writable_product(db, product_id), is_primary=is_primary)
    try:
        role = coerce_product_media_role(role)
    except ValueError as exc:
        raise BusinessLogicException(str(exc)) from exc
    media = _get_media_service(db); key = _safe_key(media, object_key)
    if not key.startswith(f"products/{product_id}/"):
        raise BusinessLogicException(
            "Employees can register product media only from the product's own "
            f"object namespace (products/{product_id}/)."
        )
    # In-place by key: an already-mapped asset is untouched — the employee
    # lane cannot reshape an admin's role / sort order / primary flag.
    row, mapping = await _register_product_asset(
        db, current_user, key, product_id, role, sort_order, is_primary, title, alt_text,
        preserve_existing_mapping=True,
    )
    await _commit_and_invalidate_product_media(db, product_id)
    return {
        "ok": True,
        "media": {
            "id": row.id,
            "objectKey": row.object_key,
            "url": media.object_url(row.object_key),
            "mimeType": row.mime_type,
            "title": row.title,
            "altText": row.alt_text,
            "status": row.status,
        },
        "assigned": True,
        "assignment": {
            "productId": mapping.product_id,
            "mediaId": mapping.media_id,
            "role": mapping.role,
            "sortOrder": mapping.sort_order,
            "isPrimary": mapping.is_primary,
        },
    }
