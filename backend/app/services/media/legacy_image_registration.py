"""Register legacy product-column images as durable media assets (Track E).

History: catalogue products reference images through the legacy columns
``catalog_product.image`` / ``hover_image`` / ``additional_images`` —
``/images/products/…`` public paths, bare object keys, canonical media URLs
or external URLs. The homepage editor and the registered read model only
see *registered* ``media_media_asset`` rows, so any product image that was
never uploaded through the media pipeline is invisible to the homepage
pickers.

This module walks those legacy references and — using the EXISTING
services — decides, per reference, whether it can become a registered
product asset:

  · mapping: ``product_media_resolver.candidate_object_key`` (the single
    place that ever reinterpreted legacy references as object keys);
  · existence + identity: ``MediaService.object_exists`` /
    ``object_metadata`` (content type comes from magic-byte sniffing in the
    storage layer — a filename is never trusted);
  · content policy: the runtime ``settings.allowed_image_types`` (the same
    ceiling the upload path enforces).

Anything else is SKIPPED and REPORTED, never guessed: external/absolute
URLs, legacy public paths with no backing object in storage, unreadable
objects, non-image content.

Writes are ADDITIVE ONLY:

  · a missing asset row is created with ``scope=product`` (the legacy
    columns declared product ownership all along);
  · a missing ``media_product_media`` mapping is created with the declared
    default role ``GALLERY``, ``is_primary=False`` (this tool NEVER claims
    primacy — ranking and publish-gate signals stay exactly as they are);
  · product columns are never modified and nothing is ever deleted (the
    resolver keeps serving legacy paths for anything not migrated);
  · re-running is a no-op for references already registered (asset +
    mapping both present).

The callable surface is the async ``register_legacy_product_images``
(report dict), which takes an explicit session and knows nothing about CLI
or target guarding — `scripts/register_legacy_product_images.py` owns
``--apply``/``--dry-run`` and the local-database guard.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.models.catalog.product import ProductModel
from app.models.media.media_asset import MediaAssetModel
from app.models.media.product_media import ProductMediaModel
from app.schemas.media.media import (
    DEFAULT_PRODUCT_MEDIA_ROLE,
    MEDIA_ASSET_SCOPE_PRODUCT,
    MEDIA_ASSET_STATUS_UPLOADED,
)
from app.services.media.media_service import MediaService
from app.services.media.product_media_resolver import candidate_object_key
from app.storage import ObjectNotFoundError

#: Deterministic placement of the legacy columns inside a product's new
#: gallery: primary image first, hover second, additions after. Never
#: primary (see module docstring), role always the declared default.
_SOURCES = (("image", 0), ("hover_image", 1))

_SKIP_EXTERNAL_URL = "external-url"
_SKIP_NO_KEY = "not-an-object-reference"
_SKIP_MISSING = "missing-object"
_SKIP_UNREADABLE = "unreadable"
_SKIP_NOT_IMAGE = "not-a-supported-image"
_SKIP_ALREADY = "already-registered"
_SKIP_REGISTER_ERROR = "register-error"

_SAMPLE_LIMIT = 10
SKIP_REASONS = (
    _SKIP_EXTERNAL_URL,
    _SKIP_NO_KEY,
    _SKIP_MISSING,
    _SKIP_UNREADABLE,
    _SKIP_NOT_IMAGE,
    _SKIP_ALREADY,
    _SKIP_REGISTER_ERROR,
)


def _allowed_image_types() -> set:
    # `settings.allowed_image_types` is the runtime content policy the upload
    # path enforces (a parsed list of MIME types).
    return {
        str(part).strip().lower()
        for part in (settings.allowed_image_types or [])
        if str(part).strip()
    }


def _is_external_or_inline(reference: str) -> bool:
    lowered = reference.lower()
    return (
        lowered.startswith("http://")
        or lowered.startswith("https://")
        or lowered.startswith("data:")
        or lowered.startswith("blob:")
        or lowered.startswith("//")
    )


async def _candidate_references(session, product_limit: Optional[int]) -> Tuple[List[Dict[str, Any]], int]:
    """All (product, reference) pairs worth inspecting, with scan count."""
    stmt = select(ProductModel).order_by(ProductModel.id)
    if product_limit:
        stmt = stmt.limit(product_limit)
    products = (await session.execute(stmt)).scalars().all()

    pairs: List[Dict[str, Any]] = []
    for product in products:
        seen = set()
        for column, order in _SOURCES:
            reference = str(getattr(product, column, None) or "").strip()
            if reference and reference not in seen:
                seen.add(reference)
                pairs.append(
                    {"product": product, "source": column, "reference": reference, "order": order}
                )
        for index, extra in enumerate(product.additional_images or []):
            reference = str(extra or "").strip()
            if reference and reference not in seen:
                seen.add(reference)
                pairs.append(
                    {
                        "product": product,
                        "source": f"additional_images[{index}]",
                        "reference": reference,
                        "order": 10 + index,
                    }
                )
    return pairs, len(products)


def _empty_report(*, mode: str) -> Dict[str, Any]:
    return {
        "mode": mode,
        "products_scanned": 0,
        "candidates": 0,
        "registered": 0,
        "would_register": 0,
        "assets_created": 0,
        "assets_reused": 0,
        "mappings_created": 0,
        "skipped": {reason: 0 for reason in SKIP_REASONS},
        "samples": [],
        "skip_samples": {reason: [] for reason in SKIP_REASONS},
    }


def _note_skip(report: Dict[str, Any], reason: str, product_id: str, source: str, reference: str) -> None:
    report["skipped"][reason] += 1
    bucket = report["skip_samples"][reason]
    if len(bucket) < 3:
        bucket.append({"productId": product_id, "source": source, "reference": reference[:120]})


def _note_sample(report: Dict[str, Any], entry: Dict[str, Any]) -> None:
    if len(report["samples"]) < _SAMPLE_LIMIT:
        report["samples"].append(entry)


async def register_legacy_product_images(
    session,
    *,
    apply: bool = False,
    product_limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Scan legacy product image columns and register what is verifiable.

    With ``apply=False`` nothing is written: every write-worthy candidate is
    counted under ``would_register`` and the report describes exactly what an
    apply run would do. With ``apply=True`` asset/mapping rows are flushed
    (each candidate inside its own SAVEPOINT so one failure cannot poison the
    run) and the CALLER commits.
    """
    report = _empty_report(mode="APPLY" if apply else "DRY-RUN")
    allowed_types = _allowed_image_types()
    media = MediaService(session)

    pairs, scanned = await _candidate_references(session, product_limit)
    report["products_scanned"] = scanned
    report["candidates"] = len(pairs)

    for pair in pairs:
        product = pair["product"]
        reference = pair["reference"]
        source = pair["source"]

        if _is_external_or_inline(reference):
            _note_skip(report, _SKIP_EXTERNAL_URL, product.id, source, reference)
            continue

        object_key = candidate_object_key(reference)
        if object_key is None:
            _note_skip(report, _SKIP_NO_KEY, product.id, source, reference)
            continue

        try:
            exists = await run_in_threadpool(media.object_exists, object_key)
        except Exception:  # noqa: BLE001 — storage layer trouble, not a judgement call
            _note_skip(report, _SKIP_UNREADABLE, product.id, source, reference)
            continue
        if not exists:
            _note_skip(report, _SKIP_MISSING, product.id, source, reference)
            continue
        try:
            meta = await run_in_threadpool(media.object_metadata, object_key)
        except ObjectNotFoundError:
            _note_skip(report, _SKIP_MISSING, product.id, source, reference)
            continue
        except Exception:  # noqa: BLE001
            _note_skip(report, _SKIP_UNREADABLE, product.id, source, reference)
            continue

        content_type = str(meta.content_type or "").lower()
        if content_type not in allowed_types:
            _note_skip(report, _SKIP_NOT_IMAGE, product.id, source, reference)
            continue

        asset = (
            await session.execute(
                select(MediaAssetModel).where(MediaAssetModel.object_key == object_key)
            )
        ).scalars().first()

        if asset is not None:
            mapping = (
                await session.execute(
                    select(ProductMediaModel).where(
                        ProductMediaModel.product_id == product.id,
                        ProductMediaModel.media_id == asset.id,
                    )
                )
            ).scalars().first()
            if mapping is not None:
                _note_skip(report, _SKIP_ALREADY, product.id, source, reference)
                continue
            # Asset exists, mapping missing → the row is reused at write time.

        entry = {
            "productId": product.id,
            "source": source,
            "reference": reference[:120],
            "objectKey": object_key,
        }

        if not apply:
            report["would_register"] += 1
            _note_sample(report, entry)
            continue

        try:
            async with session.begin_nested():
                if asset is None:
                    asset = MediaAssetModel(
                        object_key=object_key,
                        storage_provider=settings.storage_provider_name,
                        media_type="image",
                        mime_type=content_type,
                        original_filename=object_key.rsplit("/", 1)[-1],
                        file_size=meta.size,
                        checksum_sha256=meta.checksum_sha256,
                        status=MEDIA_ASSET_STATUS_UPLOADED,
                        scope=MEDIA_ASSET_SCOPE_PRODUCT,
                        uploaded_by=None,
                        title=None,
                        alt_text=None,
                    )
                    session.add(asset)
                    await session.flush()
                    report["assets_created"] += 1
                else:
                    report["assets_reused"] += 1
                session.add(
                    ProductMediaModel(
                        product_id=product.id,
                        media_id=asset.id,
                        role=DEFAULT_PRODUCT_MEDIA_ROLE,
                        sort_order=pair["order"],
                        is_primary=False,
                        assigned_by=None,
                        assignment_note="legacy column registration (Track E)",
                    )
                )
                await session.flush()
                report["mappings_created"] += 1
        except SQLAlchemyError:
            _note_skip(report, _SKIP_REGISTER_ERROR, product.id, source, reference)
            continue

        report["registered"] += 1
        _note_sample(report, entry)

    return report
