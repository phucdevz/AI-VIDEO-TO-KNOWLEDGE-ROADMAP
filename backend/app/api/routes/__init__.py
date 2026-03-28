from fastapi import APIRouter

from app.api.routes import extraction, health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(extraction.router, prefix="/extraction", tags=["extraction"])

__all__ = ["api_router"]
