from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("/health", summary="Module health check")
async def health_check():
    return {"module": "users", "status": "active"}
