"""Read-only admin panel HTTP API (mounted only on ``app_admin``).

Phase P2.1+: overview, monitoring batches, swap_success analytics — all from the
isolated admin DB. No custodial routers, no signing, no key material.

Requires ``ADMIN_API_TOKEN`` and header ``X-Admin-Token`` on every route under
``/api/v1/admin/*``. Telemetry (P1.1) should confirm legacy WC usage before
tightening wallet dependencies; this surface is unrelated but ships in the same
admin process as monitoring ingest.
"""

from __future__ import annotations

import copy
import secrets
from datetime import datetime, timezone
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


def _iso_from_ts_ms(ts_ms: Any, fallback_iso: str) -> str:
    if isinstance(ts_ms, (int, float)):
        try:
            dt = datetime.fromtimestamp(float(ts_ms) / 1000.0, tz=timezone.utc)
            return dt.isoformat()
        except (OverflowError, OSError, ValueError):
            return fallback_iso
    return fallback_iso


def _token_symbol(tok: Any) -> str | None:
    if isinstance(tok, dict):
        sym = tok.get("symbol")
        if isinstance(sym, str) and sym.strip():
            return sym.strip()
        if sym is not None:
            return str(sym)
    return None


def _safe_str(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, str):
        return val if val else None
    try:
        return str(val)
    except Exception:
        return None


def _safe_opt_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _safe_bool(val: Any) -> bool:
    return bool(val)


def _build_route_label(ev: dict[str, Any]) -> str:
    parts: list[str] = []
    prov = ev.get("provider")
    if isinstance(prov, str) and prov.strip():
        parts.append(prov.strip())
    rm = ev.get("routeMode")
    if isinstance(rm, str) and rm.strip():
        parts.append(rm.strip())
    wr = ev.get("wrapperRoute")
    wrs = _safe_str(wr)
    if wrs:
        parts.append(f"wrapper:{wrs}")
    cr = ev.get("commissionRoute")
    crs = _safe_str(cr)
    if crs:
        parts.append(crs)
    return " · ".join(parts) if parts else "unknown"


def _estimate_fee_usd(_ev: dict[str, Any]) -> float | None:
    """Reserved for future ETH/USD oracle wiring; telemetry has no USD price today."""
    return None


def _swap_success_row_from_event(
    batch_id: int,
    client_session_id: str,
    batch_received_iso: str,
    ev: dict[str, Any],
) -> dict[str, Any] | None:
    """Flatten one ``swap_success`` monitoring row; return ``None`` if unusable."""
    try:
        if ev.get("event") != "swap_success":
            return None

        timestamp = _iso_from_ts_ms(ev.get("ts"), batch_received_iso)
        chain = _safe_opt_int(ev.get("chainId"))
        if chain is None:
            return None

        route_mode = ev.get("routeMode")
        route_mode_s = route_mode.strip() if isinstance(route_mode, str) else _safe_str(route_mode)

        wrapper_route = _safe_str(ev.get("wrapperRoute"))
        commission_route = _safe_str(ev.get("commissionRoute"))

        from_symbol = _token_symbol(ev.get("fromToken"))
        to_symbol = _token_symbol(ev.get("toToken"))

        receipt_status = _safe_opt_int(ev.get("receiptStatus"))

        row: dict[str, Any] = {
            "batch_id": batch_id,
            "timestamp": timestamp,
            "client_session_id": client_session_id,
            "chain": chain,
            "route_mode": route_mode_s,
            "wrapper_route": wrapper_route,
            "commission_route": commission_route,
            "from_symbol": from_symbol,
            "to_symbol": to_symbol,
            "from_amount": _safe_str(ev.get("fromAmount")),
            "quoted_output": _safe_str(ev.get("quotedOutput")),
            "minimum_received": _safe_str(ev.get("minimumReceived")),
            "protocol_fee_bps": _safe_opt_int(ev.get("protocolFeeBps")),
            "user_received_source": _safe_str(ev.get("userReceivedSource")),
            "gas_used": _safe_str(ev.get("gasUsed")),
            "effective_gas_price": _safe_str(ev.get("effectiveGasPrice")),
            "receipt_status": receipt_status,
            "tx_hash": _safe_str(ev.get("txHash")),
            "native_output": _safe_bool(ev.get("nativeOutput")),
            "estimated_fee_usd": _estimate_fee_usd(ev),
            "route_label": _build_route_label(ev),
            "provider": _safe_str(ev.get("provider")),
            "raw_event": copy.deepcopy(ev),
        }
        return row
    except Exception:
        return None


def _swap_row_matches_filters(
    row: dict[str, Any],
    *,
    chain: int | None,
    route_mode: str | None,
    token: str | None,
    wallet_session: str | None,
    success_only: bool,
) -> bool:
    if success_only and row.get("receipt_status") == 0:
        return False
    if chain is not None and row.get("chain") != chain:
        return False
    if route_mode is not None and route_mode.strip():
        rm = (row.get("route_mode") or "").strip().lower()
        if rm != route_mode.strip().lower():
            return False
    if token is not None and token.strip():
        needle = token.strip().lower()
        fs = (row.get("from_symbol") or "").lower()
        tsym = (row.get("to_symbol") or "").lower()
        if needle not in fs and needle not in tsym:
            return False
    if wallet_session is not None and wallet_session.strip():
        if (row.get("client_session_id") or "") != wallet_session.strip():
            return False
    return True


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


@router.get(
    "/swaps",
    summary="Swap analytics from swap_success monitoring events (read-only)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_swaps(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    chain: int | None = Query(default=None),
    route_mode: str | None = Query(default=None, alias="routeMode"),
    token: str | None = Query(default=None, description="Substring match on from/to symbol"),
    wallet_session: str | None = Query(
        default=None,
        alias="walletSession",
        max_length=80,
        description="Exact batch client_session_id",
    ),
    success_only: bool = Query(default=True, alias="successOnly"),
) -> dict[str, Any]:
    stmt = select(MonitoringIngestBatch).order_by(MonitoringIngestBatch.id.desc())
    batches = (await session.execute(stmt)).scalars().all()

    scored: list[tuple[int, int, int, dict[str, Any]]] = []
    seq = 0
    for batch in batches:
        batch_iso = _iso_received_at(batch.received_at)
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            if not isinstance(ev, dict):
                continue
            row = _swap_success_row_from_event(
                batch.id,
                batch.client_session_id,
                batch_iso,
                ev,
            )
            if row is None:
                continue
            if not _swap_row_matches_filters(
                row,
                chain=chain,
                route_mode=route_mode,
                token=token,
                wallet_session=wallet_session,
                success_only=success_only,
            ):
                continue
            ts_raw = ev.get("ts")
            ts_ms = int(ts_raw) if isinstance(ts_raw, (int, float)) else 0
            scored.append((-ts_ms, -batch.id, seq, row))
            seq += 1

    scored.sort(key=lambda x: (x[0], x[1], x[2]))
    ordered = [t[3] for t in scored]
    total = len(ordered)
    page = ordered[offset : offset + limit]

    return {
        "items": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
