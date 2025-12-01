"""Health check endpoints."""

from fastapi import APIRouter

from swaperex.config import get_settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "swaperex"}


@router.get("/health/detailed")
async def detailed_health():
    """Detailed health check with configuration info."""
    settings = get_settings()
    return {
        "status": "healthy",
        "service": "swaperex",
        "version": "0.1.0",
        "config": settings.get_safe_dict(),
    }
