from fastapi import APIRouter

router = APIRouter(prefix="/media", tags=["Media Assets"])


@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "media", "status": "active"}
