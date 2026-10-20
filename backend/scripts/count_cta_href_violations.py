"""Count marketing rows whose CTA would fail the B-13 write validation — dry run.

B-13 added the homepage sections' site-relative CTA validation
(`app.schemas.media.homepage.safe_cta`) to marketing-media create/update
WRITES. Existing rows are deliberately NOT re-validated, rejected or
rewritten. This read-only counter answers the operator question: how many
rows in the CURRENT database would fail the new write rule?

Usage:
  python -m scripts.count_cta_href_violations           # count + samples
  python -m scripts.count_cta_href_violations --full    # list every bad row

Database safety:
  Same guard as the migration scripts — refuses to run unless DATABASE_URL
  points at a loopback host and the disposable ``pratikshya_local`` database
  (`app.testing.local_postgres.require_local_target`). READ ONLY: this
  script never writes, regardless of flags.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def main(argv=None):
    parser = argparse.ArgumentParser(description="Dry-run count of marketing CTA values invalid under the B-13 write rule (read only).")
    parser.add_argument("--full", action="store_true", help="List every invalid row instead of only samples.")
    args = parser.parse_args(argv)

    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.media.marketing_media import MarketingMediaModel
    from app.schemas.media.homepage import safe_cta
    from app.testing.local_postgres import LocalDatabaseUnavailable, require_local_target

    try:
        require_local_target()
    except LocalDatabaseUnavailable as exc:
        print(f"REFUSING TO RUN: {exc}")
        print("Point DATABASE_URL at a loopback PostgreSQL and the disposable 'pratikshya_local' database.")
        return 2

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(MarketingMediaModel))).scalars().all()

    invalid = []
    total_with_cta = 0
    for row in rows:
        value = (row.cta_href or "").strip()
        if not value:
            continue
        total_with_cta += 1
        try:
            safe_cta(value)
        except ValueError:
            invalid.append(row)

    print("\n=== Marketing CTA dry-run count (B-13, READ ONLY — nothing was written) ===")
    print(f"rows_total      : {len(rows)}")
    print(f"rows_with_cta   : {total_with_cta}")
    print(f"would_fail_write: {len(invalid)}")
    listed = invalid if args.full else invalid[:10]
    for row in listed:
        print(f"  {row.placement} {row.id}: cta_href={row.cta_href!r}")
    if not args.full and len(invalid) > len(listed):
        print(f"  … and {len(invalid) - len(listed)} more (re-run with --full)")
    print("\nExisting rows are NOT rewritten or rejected on read; the rule applies to new/updated writes only.")
    return 1 if invalid else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
