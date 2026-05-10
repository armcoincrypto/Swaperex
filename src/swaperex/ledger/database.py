"""Database connection and session management."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from swaperex.config import get_settings

# Import all models to ensure they're registered with Base.metadata
from swaperex.ledger.models import (  # noqa: F401
    Balance,
    Base,
    Deposit,
    DepositAddress,
    HDWalletState,
    MonitoringIngestBatch,
    ProcessedTransaction,
    Swap,
    User,
    XpubKey,
)

# Global engine and session factory (legacy custodial ledger DB)
_engine = None
_session_factory = None

# Isolated engine and session factory for the admin / monitoring DB.
# Kept separate so `swaperex.api.app_admin` can never write to the legacy
# custodial ledger and vice versa.
_admin_engine = None
_admin_session_factory = None


def _normalize_sqlite_url(url: str) -> str:
    """Ensure SQLite URLs use the async aiosqlite driver."""
    if url.startswith("sqlite:///") and "aiosqlite" not in url:
        return url.replace("sqlite:///", "sqlite+aiosqlite:///")
    return url


def get_engine():
    """Get or create the legacy database engine."""
    global _engine
    if _engine is None:
        settings = get_settings()
        db_url = _normalize_sqlite_url(settings.database_url)

        _engine = create_async_engine(
            db_url,
            echo=settings.debug and not settings.is_production,
            future=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get or create the legacy session factory."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get a legacy database session context manager."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize the legacy database by creating all tables."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close legacy database connections."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None


# ---------------------------------------------------------------------------
# Admin / monitoring DB (isolated)
# ---------------------------------------------------------------------------


def get_admin_engine():
    """Get or create the admin/monitoring database engine.

    Reads `settings.admin_database_url`. Pointed at a separate file/DB by default
    so `app_admin` writes can never reach the legacy custodial ledger.
    """
    global _admin_engine
    if _admin_engine is None:
        settings = get_settings()
        db_url = _normalize_sqlite_url(settings.admin_database_url)

        _admin_engine = create_async_engine(
            db_url,
            echo=settings.debug and not settings.is_production,
            future=True,
        )
    return _admin_engine


def get_admin_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get or create the admin session factory."""
    global _admin_session_factory
    if _admin_session_factory is None:
        _admin_session_factory = async_sessionmaker(
            bind=get_admin_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _admin_session_factory


@asynccontextmanager
async def get_admin_db() -> AsyncGenerator[AsyncSession, None]:
    """Get an admin database session context manager."""
    session_factory = get_admin_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_admin_db() -> None:
    """Initialize the admin database — creates ONLY the monitoring table.

    Restricting the create_all call to `MonitoringIngestBatch.__table__` keeps
    the admin DB free of the legacy custodial tables (`users`, `balances`,
    `deposits`, ...) that share `Base.metadata`. The admin app never reads or
    writes those tables, so they have no business being in `swaperex_admin.db`.

    Race tolerance: when multiple uvicorn workers run the lifespan in parallel,
    SQLite can raise `OperationalError: table ... already exists` even with
    `checkfirst=True` because the two workers race the write transaction.
    The current systemd unit pins `--workers 1` for this reason, but the
    handler stays defensive so a future bump cannot crash startup.
    """
    from sqlalchemy.exc import OperationalError

    from swaperex.ledger.models import MonitoringIngestBatch

    engine = get_admin_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(
                Base.metadata.create_all,
                tables=[MonitoringIngestBatch.__table__],
                checkfirst=True,
            )
    except OperationalError as exc:
        msg = str(exc).lower()
        if "already exists" not in msg:
            raise


async def close_admin_db() -> None:
    """Close admin database connections."""
    global _admin_engine, _admin_session_factory
    if _admin_engine is not None:
        await _admin_engine.dispose()
        _admin_engine = None
        _admin_session_factory = None
