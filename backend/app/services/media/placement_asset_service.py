"""Register hero/marketing placement objects as durable media assets.

This module closes the registration gap for storefront placement art: hero
slides and homepage section MEDIA slots must reference a *registered*
``media_media_asset`` row, but until now the only registration paths were
product-bound (``POST /media/products/{id}/objects`` and
``POST /media/register`` with its product-media role vocabulary and product
scope). Nothing could register ``hero/…`` or ``marketing/…`` objects, so on
a fresh environment no new hero slide could be created at all.

Contract (admin surface, ``media.upload`` permission):

  · NAMESPACE ALLOWLIST — only objects under ``hero/`` and ``marketing/``
    are eligible (``PLACEMENT_ASSET_NAMESPACES``). The namespace is derived
    from the normalised object key; a caller cannot declare one, and the
    route never becomes a generic registrar over the storage root.
  · OBJECT VERIFICATION — the object must exist in the configured store and
    its sniffed content type must be a supported placement image
    (``IMAGE_MIMES``). Missing objects are a 404, unsupported content a
    canonical 422. No arbitrary keys: ``normalize_object_key`` rejects
    traversal/unsafe keys before any of this happens.
  · OWNERSHIP — new rows are recorded with ``scope=marketing``
    (``MEDIA_ASSET_SCOPE_MARKETING``), never the product scope.
  · IDEMPOTENT — re-registering a key returns the existing row unchanged
    with ``created=False``; a duplicate is a no-op, never an error and
    never a second row (``uq_media_asset_object_key`` backs this).

The product-media registration contract (``POST /media/register``) is
deliberately untouched.
"""

from __future__ import annotations

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.config import settings
from app.core.exceptions import BusinessLogicException, ConflictException, NotFoundException
from app.models.media.media_asset import MediaAssetModel
from app.schemas.media.homepage import IMAGE_MIMES
from app.services.media.media_integrity import (
    CHECKSUM_MISMATCH_MESSAGE,
    checksum_conflict,
)
from app.schemas.media.media import (
    MEDIA_ASSET_SCOPE_MARKETING,
    MEDIA_ASSET_STATUS_UPLOADED,
    PLACEMENT_ASSET_NAMESPACES,
)
from app.services.media.media_service import MediaService
from app.storage import InvalidObjectKeyError, ObjectNotFoundError, normalize_object_key

#: Human-readable namespace list for rejection messages ("hero/, marketing/").
_NAMESPACE_LIST = ", ".join(f"{namespace}/" for namespace in PLACEMENT_ASSET_NAMESPACES)


async def register_placement_asset(
    db,
    object_key,
    *,
    uploaded_by=None,
    title=None,
    alt_text=None,
):
    """Validate and register one placement object; return ``(row, created)``.

    Raises the canonical exceptions — ``BusinessLogicException`` (422) for a
    bad key, an out-of-allowlist namespace or unsupported content, and
    ``NotFoundException`` (404) for an object missing from storage. The
    caller owns the transaction (the row is flushed, never committed here),
    so API routes, seed scripts and the legacy-image tooling share one
    implementation.
    """
    try:
        key = normalize_object_key(str(object_key or ""))
    except InvalidObjectKeyError as exc:
        raise BusinessLogicException(f"Invalid object key: {exc}") from exc

    namespace = key.split("/", 1)[0] if "/" in key else ""
    if namespace not in PLACEMENT_ASSET_NAMESPACES:
        raise BusinessLogicException(
            f"Only placement objects ({_NAMESPACE_LIST}) can be registered "
            f"through this path; '{namespace or '(none)'}' is not eligible. "
            "Product art is registered through the product media paths."
        )

    media = MediaService(db)
    try:
        meta = await run_in_threadpool(media.object_metadata, key)
    except ObjectNotFoundError as exc:
        raise NotFoundException("Media object not found.") from exc

    if meta.content_type not in IMAGE_MIMES:
        raise BusinessLogicException(
            f"Object content type '{meta.content_type}' is not a supported "
            f"placement image ({', '.join(sorted(IMAGE_MIMES))})."
        )

    existing = (
        await db.execute(select(MediaAssetModel).where(MediaAssetModel.object_key == key))
    ).scalars().first()
    if existing is not None:
        # A-15 / S-06: same rule as the product path — an idempotent re-register
        # is only safe while the stored bytes still match the row's snapshot.
        # A disagreement is a 409 and changes nothing (row and object intact).
        if checksum_conflict(meta.checksum_sha256, existing.checksum_sha256):
            raise ConflictException(CHECKSUM_MISMATCH_MESSAGE)
        return existing, False

    row = MediaAssetModel(
        object_key=key,
        storage_provider=settings.storage_provider_name,
        media_type="image",
        mime_type=meta.content_type,
        original_filename=key.rsplit("/", 1)[-1],
        file_size=meta.size,
        checksum_sha256=meta.checksum_sha256,
        status=MEDIA_ASSET_STATUS_UPLOADED,
        scope=MEDIA_ASSET_SCOPE_MARKETING,
        uploaded_by=uploaded_by,
        title=title,
        alt_text=alt_text,
    )
    db.add(row)
    await db.flush()
    return row, True
