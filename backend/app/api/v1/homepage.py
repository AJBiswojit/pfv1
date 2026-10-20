"""Explicit workspace-bound homepage routes; existing admin guards stay intact."""
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError

from app.dependencies import get_db, get_current_admin, get_current_employee
from app.schemas.media.homepage import SectionWrite, ItemCreate, ItemPatch, ReorderDTO, RevisionDTO, HeroCreate, HeroPatch, HeroReorder
from app.schemas.media.marketing import MarketingMediaCreate, MarketingMediaUpdate
from app.services.media.homepage_content_service import HomepageContentService, employee_asset_page, grant, registered_asset
from app.services.media.marketing_media_service import MarketingMediaService
from app.core.exceptions import AppException, BusinessLogicException, ConflictException, NotFoundException

router = APIRouter(tags=["Homepage content"])


async def read_section_content(db, key=None):
    try:
        service = HomepageContentService(db)
        return await service.get(key) if key else await service.content()
    except SQLAlchemyError as exc:
        await db.rollback()
        raise AppException("Homepage schema/database unavailable; retry after verification.", 503, "HOMEPAGE_UNAVAILABLE") from exc


def workspace_routes(prefix, guard):
    scoped = APIRouter(prefix=prefix)

    @scoped.get("/sections")
    async def sections(db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        await grant(actor, db, "marketing.view")
        return {"ok": True, **await read_section_content(db)}

    @scoped.get("/sections/{key}")
    async def section(key: str, db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        await grant(actor, db, "marketing.view")
        return {"ok": True, "section": await read_section_content(db, key)}

    @scoped.put("/sections/{key}")
    async def configure(key: str, payload: SectionWrite, response: Response, db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        result = await HomepageContentService(db).write(key, "configure", payload, actor)
        if payload.expected_revision == 0:
            response.status_code = 201
        return result

    @scoped.post("/sections/{key}/items", status_code=201)
    async def create(key: str, payload: ItemCreate, db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        return await HomepageContentService(db).write(key, "create", payload, actor)

    @scoped.patch("/sections/{key}/items/{item_id}")
    async def patch(key: str, item_id: str, payload: ItemPatch, db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        return await HomepageContentService(db).write(key, "patch", payload, actor, item_id)

    @scoped.delete("/sections/{key}/items/{item_id}")
    async def delete(key: str, item_id: str, expected_revision: int = Query(..., alias="expectedRevision", ge=1), db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        return await HomepageContentService(db).write(key, "delete", RevisionDTO(expectedRevision=expected_revision), actor, item_id)

    @scoped.put("/sections/{key}/reorder")
    async def reorder(key: str, payload: ReorderDTO, db: AsyncSession = Depends(get_db), actor=Depends(guard)):
        return await HomepageContentService(db).write(key, "reorder", payload, actor)

    return scoped


router.include_router(workspace_routes("/admin/homepage", get_current_admin))
router.include_router(workspace_routes("/employee/homepage", get_current_employee))
employee = APIRouter(prefix="/employee/homepage")


async def hero_access(actor, db, permission="media.view", write=False):
    codes = ["marketing.view", "media.view", permission]
    if write:
        codes.append("marketing.manage")
    await grant(actor, db, *codes)


async def hero_row(service, identity):
    row = await service.get_by_id(identity)
    if row.placement != "HOME_HERO":
        raise NotFoundException("Homepage hero entry not found.")
    return row


@employee.get("/media-assets")
async def assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(24, alias="pageSize", ge=1, le=100),
    q: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    mime: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    actor=Depends(get_current_employee),
):
    """The employee registered-media picker page.

    Batch 2 (B-11): optional `q` (key/filename + owning product name/SKU),
    `scope` (product/hero/marketing) and `mime` filters; pagination and the
    unfiltered default are unchanged.

    INTENTIONAL: as a staff authoring surface this lists registered assets
    of products in ANY status and shows the owning product's name/SKU as
    authoring context — it never reaches the public contract (see
    `employee_asset_page` for the full policy note).
    """
    await hero_access(actor, db)
    return await employee_asset_page(db, page, page_size, q=q, scope=scope, mime=mime)


@employee.get("/hero/items")
async def heroes(db: AsyncSession = Depends(get_db), actor=Depends(get_current_employee)):
    await hero_access(actor, db)
    service = MarketingMediaService(db)
    rows = await service.list(placement="HOME_HERO", active_only=False)
    return {"ok": True, "items": service.to_response_list(rows), "total": len(rows), "placement": "HOME_HERO"}


@employee.post("/hero/items", status_code=201)
async def create_hero(payload: HeroCreate, db: AsyncSession = Depends(get_db), actor=Depends(get_current_employee)):
    await hero_access(actor, db, "media.upload", write=True)
    asset = await registered_asset(db, payload.media_asset_id)
    values = payload.model_dump(exclude={"eyebrow"})
    row = await MarketingMediaService(db).create(MarketingMediaCreate(placement="HOME_HERO", objectKey=asset.object_key, **values), actor_id=actor.id)
    return MarketingMediaService(db).to_response(row)


@employee.patch("/hero/items/{identity}")
async def patch_hero(identity: str, payload: HeroPatch, db: AsyncSession = Depends(get_db), actor=Depends(get_current_employee)):
    await hero_access(actor, db, "media.assign", write=True)
    service = MarketingMediaService(db)
    await hero_row(service, identity)
    values = payload.model_dump(exclude_unset=True, exclude={"eyebrow"})
    if "media_asset_id" in values:
        if not values["media_asset_id"]:
            raise BusinessLogicException("Media reference cannot be null.")
        asset = await registered_asset(db, values["media_asset_id"])
        values["object_key"] = asset.object_key
    if "is_active" in values and values["is_active"] is None:
        raise BusinessLogicException("Active state cannot be null.")
    row = await service.update(identity, MarketingMediaUpdate(**values), actor_id=actor.id)
    return service.to_response(row)


@employee.delete("/hero/items/{identity}")
async def delete_hero(identity: str, db: AsyncSession = Depends(get_db), actor=Depends(get_current_employee)):
    await hero_access(actor, db, "media.delete", write=True)
    service = MarketingMediaService(db)
    await hero_row(service, identity)
    await service.delete(identity)
    return {"ok": True}


@employee.put("/hero/reorder")
async def reorder_hero(payload: HeroReorder, db: AsyncSession = Depends(get_db), actor=Depends(get_current_employee)):
    await hero_access(actor, db, "media.assign", write=True)
    service = MarketingMediaService(db)
    rows = await service.list(placement="HOME_HERO", active_only=False)
    ids = payload.item_ids
    if len(ids) != len(set(ids)) or set(ids) != {r.id for r in rows}:
        raise ConflictException("Reorder requires exact HOME_HERO membership.")
    if not ids:
        return {"ok": True, "items": []}
    result = await service.reorder("HOME_HERO", [{"id": identity, "sort_order": i} for i, identity in enumerate(ids)], actor_id=actor.id)
    return {"ok": True, "items": service.to_response_list(result)}


router.include_router(employee)
