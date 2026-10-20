"""
Seed canonical HOME_HERO marketing media — B-02.

Registers the 5 existing hero art files (hero001..hero005) as durable media
assets FIRST (the register-first contract), then creates the
media_marketing_media entries so GET /home returns the database-managed
hero.

Usage:
  python -m scripts.seed_marketing_hero            # DRY RUN (default) — writes nothing
  python -m scripts.seed_marketing_hero --apply    # actually register + create

Database safety:
  Reads ``DATABASE_URL`` (env or backend/.env) and refuses to run unless it
  points at a loopback host AND the disposable ``pratikshya_local`` database
  (`app.testing.local_postgres.require_local_target`). It never targets a
  shared/remote database. Even a DRY RUN needs the local server because it
  validates against the real database and storage.

Behaviour:
  · Idempotent — entries whose object key already exists are skipped, and
    asset registration is a no-op for objects that are already registered.
  · Accurate counts: an entry that cannot be registered or created is
    reported FAILED with the concrete reason and never counted as created.
  · The older version of this script created entries from bare object keys;
    the register-first contract now requires a genuine registered asset, so
    this script performs (or dry-run validates) registration first.
  · Does NOT copy/move files and does NOT touch product media.
"""

import argparse
import asyncio
import os
import sys

# Ensure app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


CANONICAL_HERO = [
    ("hero/hero001.avif", "Festive Elegance", "Handwoven stories for the season of celebration", "Explore Collection", "/shop", 0),
    ("hero/hero002.avif", "Bridal Couture", "Crafted for your most special day", "View Bridal", "/bridal", 1),
    ("hero/hero003.avif", "Heritage Weaves", "Six yards of timeless craft", "Shop Sarees", "/women/sarees", 2),
    ("hero/hero004.avif", "The Celebration Edit", "Dress up every moment", "Shop the Edit", "/shop", 3),
    ("hero/hero005.avif", "New Arrivals", "Fresh drapes, just landed", "Shop New", "/shop", 4),
]


async def seed_hero_entries(session, entries=None, apply=False, out=print):
    """Register assets then create HOME_HERO entries; return truthful counts.

    Importable and testable: takes an explicit session and never guards the
    database target (that is `main()`'s job through
    `app.testing.local_postgres.require_local_target`).

    With ``apply=False`` nothing persists: asset registrations are flushed,
    validated (the same `registered_asset` projection the live create path
    enforces — row present, object stored, supported image) and rolled back;
    hero creation is validated but never executed. With ``apply=True`` the
    real service create path runs and commits.
    """
    from app.schemas.media.marketing import HOME_HERO_PLACEMENT, MarketingMediaCreate
    from app.services.media.homepage_content_service import registered_asset
    from app.services.media.marketing_media_service import MarketingMediaService
    from app.services.media.placement_asset_service import register_placement_asset

    service = MarketingMediaService(session)
    existing = await service.list(placement=HOME_HERO_PLACEMENT, active_only=False)
    existing_keys = {row.object_key for row in existing}

    created = 0
    registered_new = 0
    reused_assets = 0
    skipped_existing = 0
    failed = []

    for object_key, title, subtitle, cta_label, cta_href, sort_order in (entries if entries is not None else CANONICAL_HERO):
        if object_key in existing_keys:
            skipped_existing += 1
            out(f"EXISTING  {object_key} — hero entry already present, untouched")
            continue

        try:
            asset, asset_created = await register_placement_asset(session, object_key)
        except Exception as exc:  # noqa: BLE001 — report the concrete reason
            failed.append((object_key, str(exc)))
            out(f"FAILED    {object_key}: {exc}")
            continue
        if asset_created:
            registered_new += 1
        else:
            reused_assets += 1

        try:
            if apply:
                row = await service.create(
                    MarketingMediaCreate(
                        placement=HOME_HERO_PLACEMENT,
                        objectKey=object_key,
                        mediaAssetId=asset.id,
                        title=title,
                        subtitle=subtitle,
                        ctaLabel=cta_label,
                        ctaHref=cta_href,
                        sortOrder=sort_order,
                        isActive=True,
                    )
                )
                created += 1
                out(f"CREATED   {row.object_key} id={row.id} order={row.sort_order}")
            else:
                # Validate exactly what create() will enforce, then undo the
                # asset flush so a dry run leaves the database untouched.
                await registered_asset(session, asset.id, object_key)
                created += 1  # would-create
                out(
                    f"DRY-RUN   {object_key} — would create hero entry "
                    f"(asset {'newly registered' if asset_created else 'already registered'})"
                )
        except Exception as exc:  # noqa: BLE001 — per-entry failure, keep going
            failed.append((object_key, str(exc)))
            out(f"FAILED    {object_key}: {exc}")

    if not apply:
        await session.rollback()

    mode = "APPLY" if apply else "DRY-RUN"
    verb = "created" if apply else "would_create"
    summary = {
        "mode": mode,
        verb: created,
        "assets_registered": registered_new,
        "assets_reused": reused_assets,
        "skipped_existing": skipped_existing,
        "failed": len(failed),
        "failures": failed,
    }
    out(
        f"\n[{mode}] {verb}={created} assets_registered={registered_new} "
        f"assets_reused={reused_assets} skipped_existing={skipped_existing} "
        f"failed={len(failed)} (total_existing_at_start={len(existing)})"
    )
    if not apply:
        out("Nothing was written. Re-run with --apply to make these changes.")
    return summary


async def main(argv=None):
    parser = argparse.ArgumentParser(description="Seed canonical HOME_HERO marketing media (registers assets first).")
    parser.add_argument("--apply", action="store_true", help="Persist changes. Default is a dry run that writes nothing.")
    args = parser.parse_args(argv)

    from app.core.database import AsyncSessionLocal
    from app.testing.local_postgres import LocalDatabaseUnavailable, require_local_target

    try:
        require_local_target()
    except LocalDatabaseUnavailable as exc:
        print(f"REFUSING TO RUN: {exc}")
        print("Point DATABASE_URL at a loopback PostgreSQL and the disposable 'pratikshya_local' database.")
        return 2

    async with AsyncSessionLocal() as session:
        summary = await seed_hero_entries(session, apply=args.apply)
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
