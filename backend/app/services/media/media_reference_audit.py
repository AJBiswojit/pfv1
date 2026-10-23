"""
app/services/media/media_reference_audit.py — "is it safe to delete this object?"

Deletion is the one media operation that can destroy real content, so the
question "what still points at this object?" must be answered completely and
in one place. Before this module, `DELETE /media/objects/{key}` counted only
two of the five reference families that exist in this schema:

  · media_product_media            — the registered product↔asset mapping
  · catalog_product (legacy cols)  — image / hover_image / additional_images /
                                     media_ids / primary_media_id /
                                     gallery_media_ids   ← was MISSING
  · homepage_section_item          — media_asset_id      ← was MISSING, and its
                                     FK is ON DELETE CASCADE, so deleting the
                                     asset row silently deleted homepage
                                     content
  · media_marketing_media          — object_key / media_asset_id /
                                     mobile_media_asset_id
                                     (only object_key was counted)

This module is PURE READ + REPORT. It deletes nothing. Deletion remains an
explicit, authorised, per-object operation in the media router, which refuses
whenever `is_referenced` is true.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog.product import ProductModel
from app.models.media.homepage_section import HomepageSectionItemModel
from app.models.media.marketing_media import MarketingMediaModel
from app.models.media.media_asset import MediaAssetModel
from app.models.media.product_media import ProductMediaModel
from app.storage import build_media_url, get_storage_provider

#: Legacy Vite `public/` prefix — a legacy reference may still be spelled
#: `/images/{object_key}` and must be recognised as pointing at the object.
LEGACY_PUBLIC_IMAGE_PREFIX = "/images/"

#: Reference families reported by `audit_object_references`.
REFERENCE_KINDS = (
    "productMedia",
    "productLegacy",
    "homepageSection",
    "marketingPlacement",
)


def _reference_forms(object_key: str, asset_id: Optional[str] = None) -> List[str]:
    """
    Every string a legacy reference may legitimately use to point at `key`.

    A legacy column may hold the bare object key, the old Vite `/images/…`
    path, or an already-canonical media URL — and the JSON id columns hold the
    asset id. All of them count as a reference.
    """
    forms = {object_key, f"{LEGACY_PUBLIC_IMAGE_PREFIX}{object_key}"}
    try:
        forms.add(build_media_url(object_key))
    except Exception:  # pragma: no cover - defensive
        pass
    if asset_id:
        forms.add(str(asset_id))
    return sorted(forms)


def _legacy_predicates(column, needles: List[str]):
    """
    Match a legacy column against every known spelling of the reference.

    `image` / `hover_image` / `primary_media_id` are plain text, so equality is
    enough. `additional_images` / `media_ids` / `gallery_media_ids` are JSON
    arrays, so the column is cast to text and searched for the value — the
    portable spelling that works on both PostgreSQL (JSONB) and the SQLite
    shim the tests use.
    """
    from sqlalchemy import String, cast

    # Equality is only valid on the genuinely textual columns. The JSON id
    # columns are JSONB in the migrated schema (597f883749d8), and PostgreSQL
    # rejects `jsonb = character varying` with
    # `operator does not exist: jsonb = character varying` — which the API maps
    # to DATABASE_SCHEMA_ERROR and misreports as a missing column. Render those
    # columns to text and search them instead; SQLite (the unit-test shim)
    # accepts the same spelling.
    clauses = []
    if isinstance(column.type, String):
        clauses.extend(column == needle for needle in needles)
    clauses.extend(cast(column, String).like(f"%{needle}%") for needle in needles)
    return or_(*clauses)


async def audit_object_references(
    db: AsyncSession,
    object_key: str,
    *,
    asset: Optional[MediaAssetModel] = None,
) -> Dict[str, Any]:
    """
    Count every reference to `object_key` across all five families.

    Returns::

        {
          "objectKey": str,
          "assetId": str | None,
          "registered": bool,          # an asset row exists
          "existsInStorage": bool,
          "references": {"productMedia": n, "productLegacy": n, ...},
          "total": n,
          "isReferenced": bool,
          "blocking": [ "…" ],        # human-readable reasons
        }
    """
    from app.storage import normalize_object_key

    key = normalize_object_key(object_key)

    if asset is None:
        asset = (
            await db.execute(select(MediaAssetModel).where(MediaAssetModel.object_key == key))
        ).scalars().first()

    references: Dict[str, int] = {kind: 0 for kind in REFERENCE_KINDS}
    blocking: List[str] = []

    # 1. Registered product ↔ media mappings --------------------------------
    if asset is not None:
        references["productMedia"] = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(ProductMediaModel)
                    .where(ProductMediaModel.media_id == asset.id)
                )
            ).scalar()
            or 0
        )

    # 2. Legacy product image columns ---------------------------------------
    forms = _reference_forms(key, asset.id if asset is not None else None)
    legacy_clauses = [
        _legacy_predicates(ProductModel.image, forms),
        _legacy_predicates(ProductModel.hover_image, forms),
        _legacy_predicates(ProductModel.additional_images, forms),
        _legacy_predicates(ProductModel.media_ids, forms),
        _legacy_predicates(ProductModel.gallery_media_ids, forms),
        _legacy_predicates(ProductModel.primary_media_id, forms),
    ]
    references["productLegacy"] = int(
        (
            await db.execute(
                select(func.count()).select_from(ProductModel).where(or_(*legacy_clauses))
            )
        ).scalar()
        or 0
    )

    # 3. Homepage section items (FK is ON DELETE CASCADE — must be explicit) --
    if asset is not None:
        references["homepageSection"] = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(HomepageSectionItemModel)
                    .where(HomepageSectionItemModel.media_asset_id == asset.id)
                )
            ).scalar()
            or 0
        )

    # 4. Marketing / hero placements ----------------------------------------
    marketing_clauses = [MarketingMediaModel.object_key == key]
    if asset is not None:
        marketing_clauses.append(MarketingMediaModel.media_asset_id == asset.id)
        marketing_clauses.append(MarketingMediaModel.mobile_media_asset_id == asset.id)
    references["marketingPlacement"] = int(
        (
            await db.execute(
                select(func.count())
                .select_from(MarketingMediaModel)
                .where(or_(*marketing_clauses))
            )
        ).scalar()
        or 0
    )

    if references["productMedia"]:
        blocking.append(
            f"{references['productMedia']} registered product media mapping(s)"
        )
    if references["productLegacy"]:
        blocking.append(
            f"{references['productLegacy']} legacy product image reference(s) "
            "(image / hover_image / additional_images / media_ids)"
        )
    if references["homepageSection"]:
        blocking.append(
            f"{references['homepageSection']} homepage section item(s) — deleting "
            "the asset would cascade-delete live homepage content"
        )
    if references["marketingPlacement"]:
        blocking.append(
            f"{references['marketingPlacement']} marketing/hero placement(s)"
        )

    total = sum(references.values())
    return {
        "objectKey": key,
        "assetId": str(asset.id) if asset is not None else None,
        "registered": asset is not None,
        "existsInStorage": _object_exists(key),
        "references": references,
        "total": total,
        "isReferenced": total > 0,
        "blocking": blocking,
    }


def _object_exists(key: str) -> bool:
    """Best-effort storage existence check; never raises into the audit."""
    try:
        return bool(get_storage_provider().object_exists(key))
    except Exception:  # pragma: no cover - storage outage must not block an audit
        return False


# ---------------------------------------------------------------------------
# Orphan report — DRY RUN ONLY
# ---------------------------------------------------------------------------

async def orphan_report(
    db: AsyncSession,
    *,
    object_limit: int = 500,
) -> Dict[str, Any]:
    """
    Report orphaned media WITHOUT deleting anything.

    Two families are reported:

      · `assetsWithoutReferences` — a registered `media_media_asset` row that
        no product mapping, homepage item or marketing placement points at;
      · `objectsWithoutAssetRows` — an object sitting in the configured store
        with no asset row at all (typically the residue of an upload that
        succeeded and a database write that failed).

    There is deliberately no automatic garbage collection here. Cleanup is a
    separate, explicitly authorised operation.
    """
    assets = (
        await db.execute(
            select(MediaAssetModel).order_by(MediaAssetModel.created_at.desc()).limit(object_limit)
        )
    ).scalars().all()

    mapped_asset_ids = {
        row[0]
        for row in (
            await db.execute(select(ProductMediaModel.media_id).distinct())
        ).all()
        if row[0]
    }
    homepage_asset_ids = {
        row[0]
        for row in (
            await db.execute(select(HomepageSectionItemModel.media_asset_id).distinct())
        ).all()
        if row[0]
    }
    marketing_asset_ids = {
        row[0]
        for row in (
            await db.execute(select(MarketingMediaModel.media_asset_id).distinct())
        ).all()
        if row[0]
    }
    marketing_mobile_ids = {
        row[0]
        for row in (
            await db.execute(select(MarketingMediaModel.mobile_media_asset_id).distinct())
        ).all()
        if row[0]
    }
    known_object_keys = {
        row[0]
        for row in (await db.execute(select(MarketingMediaModel.object_key).distinct())).all()
        if row[0]
    }

    orphans: List[Dict[str, Any]] = []
    for asset in assets:
        if asset.id in mapped_asset_ids:
            continue
        if asset.id in homepage_asset_ids:
            continue
        if asset.id in marketing_asset_ids or asset.id in marketing_mobile_ids:
            continue
        if asset.object_key in known_object_keys:
            continue
        orphans.append(
            {
                "assetId": str(asset.id),
                "objectKey": asset.object_key,
                "scope": asset.scope,
                "mimeType": asset.mime_type,
                "fileSize": asset.file_size,
                "existsInStorage": _object_exists(asset.object_key),
                "url": build_media_url(asset.object_key),
            }
        )

    registered_keys = {asset.object_key for asset in assets}
    stored_without_rows: List[Dict[str, Any]] = []
    try:
        for key in get_storage_provider().list_objects(limit=object_limit):
            if key in registered_keys or key in known_object_keys:
                continue
            stored_without_rows.append({"objectKey": key, "url": build_media_url(key)})
    except Exception:  # pragma: no cover - a listing failure must not break the report
        stored_without_rows.append(
            {"objectKey": "<unavailable>", "url": "", "detail": "object listing failed"}
        )

    return {
        "mode": "dry-run",
        "deletionPerformed": False,
        "assetsWithoutReferences": orphans,
        "objectsWithoutAssetRows": stored_without_rows,
        "counts": {
            "assetsInspected": len(assets),
            "assetsWithoutReferences": len(orphans),
            "objectsWithoutAssetRows": len(stored_without_rows),
        },
        "note": (
            "Report only — nothing was deleted. Cleaning up an entry requires an "
            "explicit, authorised delete of that single object key."
        ),
    }


__all__ = [
    "LEGACY_PUBLIC_IMAGE_PREFIX",
    "REFERENCE_KINDS",
    "audit_object_references",
    "orphan_report",
]
