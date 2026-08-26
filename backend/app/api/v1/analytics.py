from fastapi import APIRouter

router = APIRouter(prefix="/analytics", tags=["Analytics & Reporting"])


@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "analytics", "status": "active"}
