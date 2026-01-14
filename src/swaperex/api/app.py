"""FastAPI application factory."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from swaperex.config import get_settings
from swaperex.ledger.database import close_db, get_db, init_db

logger = logging.getLogger(__name__)


async def load_xpubs_from_db():
    """Load stored xpubs from database and set as environment variables.

    This ensures HD wallets use persistent xpubs after service restart.
    """
    from swaperex.crypto import decrypt_xpub
    from swaperex.hdwallet.factory import reset_wallet_cache
    from swaperex.ledger.repository import LedgerRepository

    try:
        async with get_db() as session:
            repo = LedgerRepository(session)
            xpubs = await repo.get_all_xpubs()

            for xpub_record in xpubs:
                # Decrypt if encrypted
                xpub_value = decrypt_xpub(xpub_record.encrypted_xpub)

                # Set environment variable
                env_key = f"XPUB_{xpub_record.asset.upper()}"
                os.environ[env_key] = xpub_value
                logger.info(f"Loaded xpub for {xpub_record.asset} from database")

            # Reset wallet cache so new xpubs are picked up
            if xpubs:
                reset_wallet_cache()
                logger.info(f"Loaded {len(xpubs)} xpubs from database")

    except Exception as e:
        logger.warning(f"Failed to load xpubs from database: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_db()
    await load_xpubs_from_db()
    yield
    # Shutdown
    await close_db()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Swaperex API",
        description="Crypto wallet and swap API backend for Telegram bot",
        version="0.1.0",
        lifespan=lifespan,
        debug=settings.debug,
        docs_url="/docs" if settings.debug else None,  # Disable docs in production
        redoc_url="/redoc" if settings.debug else None,
    )

    # CORS middleware - be careful with credentials
    if settings.is_production:
        # In production, only allow specific origins (configure via env)
        allowed_origins = os.environ.get("ALLOWED_ORIGINS", "").split(",")
        allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
        logger.info(f"CORS: Production mode, allowed origins: {allowed_origins or '(none)'}")
    else:
        # In development, allow all but log a warning
        allowed_origins = ["*"]
        logger.warning("CORS: Development mode - allowing all origins. Do NOT use in production!")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True if settings.is_production else False,  # Don't send credentials in dev
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    # Register routes
    from swaperex.api.routers import admin, hdwallet, webhook, withdrawal
    from swaperex.api.routes import deposits, health

    app.include_router(health.router, tags=["Health"])
    app.include_router(deposits.router, prefix="/api/v1", tags=["Deposits"])
    app.include_router(admin.router, tags=["Admin"])
    app.include_router(hdwallet.router, tags=["HD Wallet"])
    app.include_router(withdrawal.router, tags=["Withdrawals"])
    app.include_router(webhook.router, tags=["Webhooks"])

    return app


# Default app instance
app = create_app()
