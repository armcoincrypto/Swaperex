"""Isolated FastAPI app for the web-DEX admin / monitoring surface.

Phase 1 scope: receive frontend monitoring batches at
``POST /api/v1/monitoring/events`` and persist them in a *separate* database
(`data/swaperex_admin.db` by default) so the legacy custodial ledger is never
touched.

Strict isolation rules enforced by this module:

* Mounts only the public health router and the monitoring router.
* Does **not** import or include any custodial routers
  (deposits, hdwallet, withdrawal, webhook, legacy admin).
* Does **not** call ``load_xpubs_from_db`` — the admin process never reads
  encrypted xpubs / wallet material.
* Uses an isolated DB engine (``get_admin_engine`` /
  ``init_admin_db`` / ``close_admin_db``) via the ``get_admin_session``
  dependency override so the legacy ``swaperex.db`` file is untouched.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from swaperex.api.dependencies import get_admin_session, get_session
from swaperex.api.routes import health, monitoring
from swaperex.config import get_settings
from swaperex.ledger.database import close_admin_db, init_admin_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the admin DB only — never the legacy ledger."""
    await init_admin_db()
    try:
        yield
    finally:
        await close_admin_db()


def create_admin_app() -> FastAPI:
    """Create the isolated admin / monitoring FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Swaperex Admin / Monitoring",
        description=(
            "Isolated read/ingest surface for web-DEX monitoring and operator "
            "dashboards. No custodial endpoints, no signing, no key material."
        ),
        version="0.1.0",
        lifespan=lifespan,
        debug=False,  # Always disabled here regardless of global settings.debug
        docs_url="/docs" if settings.debug and not settings.is_production else None,
        redoc_url="/redoc" if settings.debug and not settings.is_production else None,
        openapi_url="/openapi.json" if settings.debug and not settings.is_production else None,
    )

    # CORS: the admin app is reverse-proxied behind the same nginx host as the
    # static SPA, so it is same-origin in production. We mirror the legacy
    # behaviour for parity and read `ADMIN_ALLOWED_ORIGINS` (falls back to
    # the public `ALLOWED_ORIGINS` so production deploys do not need a new var).
    if settings.is_production:
        raw_origins = os.environ.get(
            "ADMIN_ALLOWED_ORIGINS", os.environ.get("ALLOWED_ORIGINS", "")
        )
        allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
        logger.info(
            "CORS (admin): production mode, allowed origins: %s",
            allowed_origins or "(none — same-origin only)",
        )
    else:
        allowed_origins = ["*"]
        logger.warning(
            "CORS (admin): development mode — allowing all origins. Do NOT use in production!"
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,  # No cookies in v1 ingest path
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    # Route the shared `get_session` dependency at the isolated admin DB.
    # Any router that calls `Depends(get_session)` will read/write from
    # `data/swaperex_admin.db` (or whatever `ADMIN_DATABASE_URL` points to).
    app.dependency_overrides[get_session] = get_admin_session

    # Whitelist: ONLY the monitoring router and the public health router.
    # Custodial routers (deposits / hdwallet / withdrawal / webhook / legacy
    # admin) are intentionally not imported above and not mounted here.
    #
    # Health is mounted twice on purpose:
    #   /health and /health/detailed                  -> canonical, load balancers
    #   /api/v1/health and /api/v1/health/detailed    -> operational alias so all
    #   admin-app URLs share the /api/v1/... prefix used by nginx and curl smoke
    #   tests. Same router instance is included twice; no extra route logic.
    app.include_router(health.router, tags=["Health"])
    app.include_router(health.router, prefix="/api/v1", tags=["Health (alias)"])
    app.include_router(monitoring.router, prefix="/api/v1", tags=["Monitoring"])

    return app


# Default app instance for `uvicorn swaperex.api.app_admin:app`
app = create_admin_app()
