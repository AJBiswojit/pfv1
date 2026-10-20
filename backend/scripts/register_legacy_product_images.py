"""
Register legacy product-column images as durable media assets — Track E.

Walks ``catalog_product.image`` / ``hover_image`` / ``additional_images``,
verifies each reference against the real object store (existence + sniffed
content type, via the existing media services) and registers the verifiable
ones as ``media_media_asset`` (scope=product) plus the ``media_product_media``
mapping. Everything else is skipped and reported with a reason.

Usage:
  python -m scripts.register_legacy_product_images                 # DRY RUN (default) — writes nothing
  python -m scripts.register_legacy_product_images --apply         # register into the database
  python -m scripts.register_legacy_product_images --limit 25      # scan at most 25 products

Database safety:
  Reads ``DATABASE_URL`` (env or backend/.env) and refuses to run unless it
  points at a loopback host AND the disposable ``pratikshya_local`` database
  (`app.testing.local_postgres.require_local_target`). Never targets a
  shared/remote database. Even the dry run needs the local server because it
  validates against the real database and storage.

Guarantees:
  · additive only — product columns are never modified, nothing is deleted;
  · idempotent — already-registered references are skipped (asset + mapping
    both present), so re-running after review is safe;
  · truthful counts — would-register applies only to candidates that passed
    existence + content checks; every skip has a reason; samples included.
"""

import argparse
import asyncio
import os
import sys

# Ensure app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _print_report(report):
    mode = report["mode"]
    verb = "registered" if mode == "APPLY" else "would_register"
    print(f"\n=== Legacy product image registration — {mode} ===")
    print(f"products_scanned : {report['products_scanned']}")
    print(f"candidates       : {report['candidates']} (distinct non-empty references)")
    print(f"{verb:19s}: {report[verb] if verb in report else report['registered']}")
    if report["mode"] == "APPLY":
        print(f"assets_created   : {report['assets_created']}")
        print(f"assets_reused    : {report['assets_reused']} (asset row existed, mapping created)")
        print(f"mappings_created : {report['mappings_created']}")
    skipped = report["skipped"]
    print("skips            : " + (", ".join(f"{k}={v}" for k, v in skipped.items() if v) or "none"))
    if report["samples"]:
        print(f"\nsample rows (up to {len(report['samples'])}):")
        for entry in report["samples"]:
            print(f"  {entry['productId']} {entry['source']}: {entry['reference']} -> {entry['objectKey']}")
    reasons_with_samples = [reason for reason, rows in report["skip_samples"].items() if rows]
    if reasons_with_samples:
        print("\nskip samples:")
        for reason in reasons_with_samples:
            for row in report["skip_samples"][reason]:
                print(f"  [{reason}] {row['productId']} {row['source']}: {row['reference']}")
    if mode == "DRY-RUN":
        print("\nNothing was written. Review the plan, then re-run with --apply.")


async def main(argv=None):
    parser = argparse.ArgumentParser(description="Register legacy product-column images as media assets (dry run by default).")
    parser.add_argument("--apply", action="store_true", help="Persist registrations. Default is a dry run that writes nothing.")
    parser.add_argument("--limit", type=int, default=None, help="Scan at most N products (smoke runs).")
    args = parser.parse_args(argv)

    from app.core.database import AsyncSessionLocal
    from app.services.media.legacy_image_registration import register_legacy_product_images
    from app.testing.local_postgres import LocalDatabaseUnavailable, require_local_target

    try:
        require_local_target()
    except LocalDatabaseUnavailable as exc:
        print(f"REFUSING TO RUN: {exc}")
        print("Point DATABASE_URL at a loopback PostgreSQL and the disposable 'pratikshya_local' database.")
        return 2

    async with AsyncSessionLocal() as session:
        report = await register_legacy_product_images(session, apply=args.apply, product_limit=args.limit)
        if args.apply:
            await session.commit()

    _print_report(report)
    return 1 if report["skipped"].get("register-error") else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
