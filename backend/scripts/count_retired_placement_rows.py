"""Read-only count and samples for retired marketing placements (B-06).

Refuses to run unless DATABASE_URL points at the disposable local database.
Never writes or modifies existing rows.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

async def main():
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.media.marketing_media import MarketingMediaModel
    from app.services.media.marketing_media_service import RETIRED_PLACEMENTS
    from app.testing.local_postgres import LocalDatabaseUnavailable, require_local_target

    try:
        require_local_target()
    except LocalDatabaseUnavailable as exc:
        print(f"REFUSING TO RUN: {exc}")
        return 2
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(MarketingMediaModel).where(MarketingMediaModel.placement.in_(RETIRED_PLACEMENTS))
        )).scalars().all()
    print("Retired placement rows (READ ONLY)")
    for placement in sorted(RETIRED_PLACEMENTS):
        matching = [row for row in rows if row.placement == placement]
        active = [row for row in matching if row.is_active]
        inactive = [row for row in matching if not row.is_active]
        print(f"{placement}: total={len(matching)} active={len(active)} inactive={len(inactive)}")
        for row in matching[:10]:
            print(f"  id={row.id} active={row.is_active} object_key={row.object_key}")
    return 0

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
