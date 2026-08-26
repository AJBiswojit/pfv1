from fastapi import APIRouter

router = APIRouter(prefix="/roles", tags=["RBAC Roles"])


@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "roles", "status": "active"}
