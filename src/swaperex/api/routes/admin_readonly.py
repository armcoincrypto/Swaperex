"""Read-only admin panel HTTP API (mounted only on ``app_admin``).

Phase P2.1+: authenticated overview + monitoring batch explorer from the isolated
admin DB. No custodial routers, no signing, no key material.

Requires ``ADMIN_API_TOKEN`` and header ``X-Admin-Token`` on every route under
``/api/v1/admin/*``. Telemetry (P1.1) should confirm legacy WC usage before
tightening wallet dependencies; this surface is unrelated but ships in the same
admin process as monitoring ingest.
"""

from __future__ import annotations

import secrets
from datetime import timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import bindparam, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from swaperex.api.dependencies import get_session
from swaperex.config import get_settings
from swaperex.ledger.models import MonitoringIngestBatch

router = APIRouter(prefix="/admin", tags=["Admin (read-only)"])


def _require_admin_api_token(x_admin_token: str | None, configured: str) -> None:
    """Constant-time check; rejects wrong lengths without calling compare_digest."""
    expected = configured.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API token not configured",
        )
    if x_admin_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if len(x_admin_token) != len(expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if not secrets.compare_digest(x_admin_token.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


async def require_admin_api_token(
    x_admin_token: Annotated[str | None, Header(alias="X-Admin-Token")] = None,
) -> None:
    _require_admin_api_token(x_admin_token, get_settings().admin_api_token)


def _event_names_from_envelope(envelope: dict[str, Any]) -> list[str]:
    """Extract monitoring ``event`` field strings from stored envelope (camelCase keys)."""
    out: list[str] = []
    raw_events = envelope.get("events")
    if not isinstance(raw_events, list):
        return out
    for ev in raw_events:
        if not isinstance(ev, dict):
            continue
        name = ev.get("event")
        if isinstance(name, str) and name.strip():
            out.append(name.strip())
        elif name is not None:
            out.append(str(name))
    return out


def _batch_contains_named_event_clause(dialect_name: str, event_name: str) -> Any:
    """SQL fragment: batch has at least one event with matching ``event`` name."""
    if dialect_name == "sqlite":
        return text(
            "EXISTS (SELECT 1 FROM json_each(monitoring_ingest_batches.envelope, '$.events') AS je "
            "WHERE json_extract(je.value, '$.event') = :event_name)"
        ).bindparams(bindparam("event_name", event_name))
    if dialect_name == "postgresql":
        return text(
            "EXISTS (SELECT 1 FROM jsonb_array_elements("
            "(monitoring_ingest_batches.envelope)::jsonb->'events') AS je "
            "WHERE je->>'event' = :event_name)"
        ).bindparams(bindparam("event_name", event_name))
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="event filter is not supported for this database dialect",
    )


def _iso_received_at(dt: Any) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


@router.get(
    "/health",
    summary="Admin process health (token required)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_health() -> dict[str, Any]:
    return {"service": "admin", "status": "healthy"}


@router.get(
    "/overview",
    summary="High-level read-only overview",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_overview(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    count_stmt = select(func.count()).select_from(MonitoringIngestBatch)
    max_stmt = select(func.max(MonitoringIngestBatch.received_at))

    total = (await session.execute(count_stmt)).scalar_one()
    latest_raw = (await session.execute(max_stmt)).scalar_one_or_none()

    latest_iso: str | None = None
    if latest_raw is not None:
        dt = latest_raw
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        latest_iso = dt.isoformat()

    return {
        "service": "admin",
        "status": "ok",
        "monitoring_batch_count": int(total),
        "monitoring_latest_received_at": latest_iso,
        "frontend_health": {
            "status": "unknown",
            "note": "Placeholder — wire uptime probe in a later phase.",
        },
    }


@router.get(
    "/events",
    summary="List monitoring ingest batches (paginated)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_events(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    event: str | None = Query(default=None, description="Filter batches that include this event name"),
    client_session_id: str | None = Query(
        default=None,
        alias="clientSessionId",
        max_length=80,
        description="Filter by client session id",
    ),
    include_raw: bool = Query(default=False, alias="includeRaw"),
) -> dict[str, Any]:
    conn = await session.connection()
    dialect_name = conn.dialect.name

    filters: list[Any] = []
    if client_session_id is not None and client_session_id.strip():
        filters.append(MonitoringIngestBatch.client_session_id == client_session_id.strip())
    if event is not None and event.strip():
        filters.append(_batch_contains_named_event_clause(dialect_name, event.strip()))

    base_from = select(MonitoringIngestBatch)
    if filters:
        base_from = base_from.where(*filters)

    count_stmt = select(func.count()).select_from(MonitoringIngestBatch)
    if filters:
        count_stmt = count_stmt.where(*filters)

    total = int((await session.execute(count_stmt)).scalar_one())

    list_stmt = (
        base_from.order_by(
            MonitoringIngestBatch.received_at.desc(),
            MonitoringIngestBatch.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )
    rows = (await session.execute(list_stmt)).scalars().all()

    items: list[dict[str, Any]] = []
    for row in rows:
        env = row.envelope if isinstance(row.envelope, dict) else {}
        item: dict[str, Any] = {
            "id": row.id,
            "received_at": _iso_received_at(row.received_at),
            "client_session_id": row.client_session_id,
            "event_count": row.event_count,
            "schema_version": row.schema_version,
            "event_names": _event_names_from_envelope(env),
        }
        if include_raw:
            item["raw"] = env
        items.append(item)

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
