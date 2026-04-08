from fastapi import APIRouter

from app.api.routes import admin_panel, extraction, health, quiz, tutor

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(extraction.router, prefix="/extraction", tags=["extraction"])
api_router.include_router(tutor.router, prefix="/tutor", tags=["tutor"])
api_router.include_router(quiz.router, prefix="/quiz", tags=["quiz"])
api_router.include_router(admin_panel.router, prefix="/admin", tags=["admin"])

__all__ = ["api_router"]
