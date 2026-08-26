from fastapi import APIRouter

router = APIRouter(prefix="/permissions", tags=["RBAC Permissions"])


@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "permissions", "status": "active"}
