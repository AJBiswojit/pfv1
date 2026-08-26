from fastapi import APIRouter

router = APIRouter(prefix="/audit", tags=["Activity Audit Logs"])


@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "audit", "status": "active"}
