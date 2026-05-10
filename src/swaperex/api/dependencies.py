"""Shared FastAPI dependencies.

Defines a single `get_session` dependency that yields an SQLAlchemy
`AsyncSession`. The default implementation reads from the legacy custodial
ledger database (`get_db`). The admin / monitoring app overrides it via
`app.dependency_overrides[get_session] = get_admin_session` so the same
routers can be reused without ever sharing an engine or DB file with the
custodial ledger.
"""

from __future__ import annotations

from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from swaperex.ledger.database import get_admin_db, get_db


async def get_session() -> AsyncIterator[AsyncSession]:
    """Default session dependency — legacy ledger DB."""
    async with get_db() as session:
        yield session


async def get_admin_session() -> AsyncIterator[AsyncSession]:
    """Admin / monitoring session dependency — isolated admin DB."""
    async with get_admin_db() as session:
        yield session
