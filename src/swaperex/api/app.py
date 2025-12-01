"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from swaperex.config import get_settings
from swaperex.ledger.database import close_db, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Swaperex API",
        description="Crypto wallet and swap API backend",
        version="0.1.0",
        lifespan=lifespan,
        debug=settings.debug,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.debug else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routes
    from swaperex.api.routers import admin, hdwallet
    from swaperex.api.routes import deposits, health

    app.include_router(health.router, tags=["Health"])
    app.include_router(deposits.router, prefix="/api/v1", tags=["Deposits"])
    app.include_router(admin.router, tags=["Admin"])
    app.include_router(hdwallet.router, tags=["HD Wallet"])

    return app


# Default app instance
app = create_app()
