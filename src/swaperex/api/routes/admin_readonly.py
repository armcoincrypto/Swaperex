"""Read-only admin panel HTTP API (mounted only on ``app_admin``).

Phase P2.1+: overview, monitoring, swaps, revenue, wallet reconnect analytics —
all from the isolated admin DB. No custodial routers, no signing, no key material.

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


FEE_RAW_DECIMALS_NOTE = (
    "raw token units from receipt; display conversion will be improved later"
)


def _parse_fee_wei_decimal(val: Any) -> int | None:
    """Parse non-negative treasury fee wei from telemetry (decimal digits only)."""
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val if val >= 0 else None
    if isinstance(val, str):
        s = val.strip()
        if not s or not s.isdigit():
            return None
        return int(s)
    return None


def _fee_token_meta(ev: dict[str, Any]) -> tuple[str, str | None, bool]:
    """Return (symbol, address_lower_or_none, is_native) for ``feeToken``."""
    ft = ev.get("feeToken")
    if isinstance(ft, dict):
        sym = _token_symbol(ft) or "UNKNOWN"
        addr_raw = ft.get("address")
        if isinstance(addr_raw, str) and addr_raw.strip():
            addr = addr_raw.strip().lower()
        else:
            addr = None
        native = bool(ft.get("isNative"))
        return sym, addr, native
    return "UNKNOWN", None, False


def _route_mode_str(ev: dict[str, Any]) -> str | None:
    rm = ev.get("routeMode")
    if isinstance(rm, str) and rm.strip():
        return rm.strip()
    return _safe_str(rm)


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


@router.get(
    "/revenue",
    summary="Protocol revenue aggregates from swap_success fee telemetry (read-only)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_revenue(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    stmt = select(MonitoringIngestBatch).order_by(MonitoringIngestBatch.id.desc())
    batches = (await session.execute(stmt)).scalars().all()

    total_swaps = 0
    enriched_swaps_count = 0
    swaps_with_fee_data = 0

    totals_by_token: dict[tuple[str, str | None, bool], int] = {}
    totals_by_chain: dict[tuple[int, str, str | None, bool], int] = {}
    totals_by_route: dict[tuple[int, str, str, str | None, bool], int] = {}
    route_meta: dict[tuple[int, str, str, str | None, bool], dict[str, str | None]] = {}

    latest_fee_events_working: list[tuple[int, dict[str, Any]]] = []

    for batch in batches:
        batch_iso = _iso_received_at(batch.received_at)
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            try:
                if not isinstance(ev, dict):
                    continue
                if ev.get("event") != "swap_success":
                    continue
                chain = _safe_opt_int(ev.get("chainId"))
                if chain is None:
                    continue

                total_swaps += 1

                if "feeToTreasuryWei" in ev or "userNetWei" in ev:
                    enriched_swaps_count += 1

                fee_parsed = _parse_fee_wei_decimal(ev.get("feeToTreasuryWei"))
                has_fee = fee_parsed is not None
                if has_fee:
                    swaps_with_fee_data += 1

                sym, addr, native = _fee_token_meta(ev)
                route_label = _build_route_label(ev)
                route_mode_s = _route_mode_str(ev)
                provider_s = _safe_str(ev.get("provider"))
                wrapper_s = _safe_str(ev.get("wrapperRoute"))
                commission_s = _safe_str(ev.get("commissionRoute"))

                if has_fee:
                    tk = (sym, addr, native)
                    totals_by_token[tk] = totals_by_token.get(tk, 0) + fee_parsed

                    ck = (chain, sym, addr, native)
                    totals_by_chain[ck] = totals_by_chain.get(ck, 0) + fee_parsed

                    rk = (chain, route_label, sym, addr, native)
                    totals_by_route[rk] = totals_by_route.get(rk, 0) + fee_parsed
                    if rk not in route_meta:
                        route_meta[rk] = {
                            "provider": provider_s,
                            "route_mode": route_mode_s,
                            "wrapper_route": wrapper_s,
                            "commission_route": commission_s,
                        }

                    ts_raw = ev.get("ts")
                    ts_ms = int(ts_raw) if isinstance(ts_raw, (int, float)) else 0
                    latest_fee_events_working.append(
                        (
                            ts_ms,
                            {
                                "timestamp": _iso_from_ts_ms(ev.get("ts"), batch_iso),
                                "chain_id": chain,
                                "route_label": route_label,
                                "provider": provider_s,
                                "route_mode": route_mode_s,
                                "fee_token_symbol": sym,
                                "fee_token_address": addr,
                                "fee_token_is_native": native,
                                "raw_fee_wei": str(fee_parsed),
                                "protocol_fee_bps": _safe_opt_int(ev.get("protocolFeeBps")),
                                "tx_hash": _safe_str(ev.get("txHash")),
                                "commission_route": commission_s,
                                "wrapper_route": wrapper_s,
                            },
                        )
                    )
            except Exception:
                continue

    missing_fee_data = total_swaps - swaps_with_fee_data

    def _token_rows(totals: dict[tuple[Any, ...], int]) -> list[dict[str, Any]]:
        rows_out: list[dict[str, Any]] = []
        for key, raw_int in totals.items():
            symbol = str(key[0])
            address = key[1]
            is_native = bool(key[2])
            rows_out.append(
                {
                    "symbol": symbol,
                    "address": address,
                    "is_native": is_native,
                    "raw_total": str(raw_int),
                    "decimals_note": FEE_RAW_DECIMALS_NOTE,
                }
            )
        rows_out.sort(key=lambda r: int(r["raw_total"]), reverse=True)
        return rows_out

    total_fee_by_token = _token_rows(totals_by_token)

    revenue_by_chain: list[dict[str, Any]] = []
    for (cid, sym, addr, native), raw_int in sorted(
        totals_by_chain.items(),
        key=lambda kv: (-kv[1], kv[0][0], kv[0][1]),
    ):
        revenue_by_chain.append(
            {
                "chain_id": cid,
                "symbol": sym,
                "address": addr,
                "is_native": native,
                "raw_total": str(raw_int),
                "decimals_note": FEE_RAW_DECIMALS_NOTE,
            }
        )

    revenue_by_route: list[dict[str, Any]] = []
    for rk, raw_int in sorted(totals_by_route.items(), key=lambda kv: (-kv[1], kv[0])):
        cid, route_label, sym, addr, native = rk
        meta = route_meta.get(rk, {})
        revenue_by_route.append(
            {
                "chain_id": cid,
                "route_label": route_label,
                "provider": meta.get("provider"),
                "route_mode": meta.get("route_mode"),
                "wrapper_route": meta.get("wrapper_route"),
                "commission_route": meta.get("commission_route"),
                "symbol": sym,
                "address": addr,
                "is_native": native,
                "raw_total": str(raw_int),
                "decimals_note": FEE_RAW_DECIMALS_NOTE,
            }
        )

    latest_fee_events_working.sort(key=lambda x: (-x[0], x[1].get("tx_hash") or ""))
    latest_fee_events = [row for _, row in latest_fee_events_working[:25]]

    return {
        "total_swaps": total_swaps,
        "enriched_swaps_count": enriched_swaps_count,
        "swaps_with_fee_data": swaps_with_fee_data,
        "missing_fee_data": missing_fee_data,
        "total_fee_by_token": total_fee_by_token,
        "revenue_by_chain": revenue_by_chain,
        "revenue_by_route": revenue_by_route,
        "latest_fee_events": latest_fee_events,
    }


# --- P2.6 failure observability (read-only aggregates from monitoring ingest) ---

FAILURE_TAXONOMY_VERSION = "p2.6.0"
_FAILURE_EVENT_NAMES = frozenset(
    {
        "swap_failure",
        "quote_failure",
        "rpc_failure",
        "commission_missing",
        "wallet_rejected",
        "wallet_request_pending",
    }
)
_FAILURE_CAP = 2000
_FAILURE_MIN_SAMPLES_RATE = 5


def _lower_str(val: Any) -> str:
    s = _safe_str(val)
    return s.lower() if s else ""


def _normalize_failure_event(ev: dict[str, Any]) -> tuple[str, str, str] | None:
    """Map one monitoring event dict to (failure_type, severity, reason_code).

    Deterministic: uses only ``event`` name plus ``category``, ``phase``, and
    lowercase substrings of ``reason`` / ``reasonCode``. Returns ``None`` if
    the row is not a recognized failure envelope.
    """
    try:
        raw_name = ev.get("event")
        if not isinstance(raw_name, str) or not raw_name.strip():
            return None
        name = raw_name.strip()
        if name not in _FAILURE_EVENT_NAMES:
            return None

        cat = _lower_str(ev.get("category"))
        phase = _lower_str(ev.get("phase"))
        reason = _lower_str(ev.get("reason"))
        rcode = _lower_str(ev.get("reasonCode"))
        blob = f"{reason} {rcode}"

        def has_timeout(s: str) -> bool:
            return any(
                x in s
                for x in (
                    "timeout",
                    "timed out",
                    "504",
                    "503",
                    "502",
                    "deadline",
                    "etimedout",
                )
            )

        if name == "commission_missing":
            return "commission_missing", "HIGH", "commission_missing"

        if name == "wallet_rejected":
            return "wallet_rejected", "LOW", "user_rejected"

        if name == "wallet_request_pending":
            return "wallet_request_pending", "LOW", "wallet_sign_pending"

        if name == "rpc_failure":
            if has_timeout(blob):
                return "provider_timeout", "MEDIUM", "provider_timeout"
            return "rpc_error", "MEDIUM", "rpc_failure"

        if name == "quote_failure":
            if cat == "stale_quote" or "stale_quote" in blob or "stale_request" in blob:
                return "stale_quote", "LOW", "stale_quote"
            if "expired" in blob or "expired" in cat:
                return "quote_expired", "LOW", "quote_expired"
            if cat in ("network_error", "rpc_error"):
                if has_timeout(blob):
                    return "provider_timeout", "MEDIUM", "quote_provider_timeout"
                return "rpc_error", "MEDIUM", "quote_rpc"
            if any(
                x in blob
                for x in (
                    "no liquidity",
                    "no pool",
                    "insufficient liquidity",
                    "liquidity",
                )
            ):
                return "insufficient_liquidity", "LOW", "liquidity"
            if any(
                x in blob
                for x in (
                    "no route",
                    "no quotes available",
                    "does not support chain",
                    "unsupported",
                )
            ):
                return "unsupported_route", "LOW", "route"
            return "quote_failed", "LOW", "quote_failed"

        if name == "swap_failure":
            if cat == "user_rejected":
                return "wallet_rejected", "LOW", "user_rejected"
            if cat == "wallet_sign_pending":
                return "wallet_request_pending", "LOW", "wallet_sign_pending"
            if cat == "allowance_failed" or (phase == "pre_swap" and "allowance" in blob):
                return "allowance_failed", "MEDIUM", "allowance_failed"
            if phase == "approval":
                return "approval_failed", "MEDIUM", "approval_failed"
            if "revert" in blob or "reverted" in blob:
                return "tx_reverted", "HIGH", "tx_reverted"
            if "not successful" in blob or "blockchain rejected" in blob:
                return "tx_failed", "HIGH", "tx_failed"
            if cat in ("network_error", "rpc_error"):
                if has_timeout(blob):
                    return "provider_timeout", "MEDIUM", "swap_provider_timeout"
                return "rpc_error", "MEDIUM", "swap_rpc"
            if cat == "quote_error":
                return "quote_failed", "LOW", "swap_build"
            if cat == "insufficient_balance":
                return "unknown", "UNKNOWN", "insufficient_balance"
            return "unknown", "UNKNOWN", "unclassified_swap_failure"

        return None
    except Exception:
        return None


def _failure_telemetry_excerpt(ev: dict[str, Any]) -> dict[str, Any]:
    """Small subset for admin UI expand (no calldata / no provider objects)."""
    keys = (
        "event",
        "ts",
        "category",
        "phase",
        "reasonCode",
        "provider",
        "routeMode",
        "chainId",
        "txHash",
        "reason",
    )
    out: dict[str, Any] = {}
    for k in keys:
        if k not in ev:
            continue
        val = ev.get(k)
        if k == "reason" and isinstance(val, str) and len(val) > 240:
            val = val[:240] + "…"
        out[k] = val
    return out


def _failure_row_public(
    *,
    batch_id: int,
    client_session_id: str,
    batch_iso: str,
    ev: dict[str, Any],
    failure_type: str,
    severity: str,
    reason_code: str,
) -> dict[str, Any]:
    ts_iso = _iso_from_ts_ms(ev.get("ts"), batch_iso)
    chain = _safe_opt_int(ev.get("chainId"))
    prov = _safe_str(ev.get("provider"))
    rm = _route_mode_str(ev)
    raw_name = str(ev.get("event", "")).strip()
    txh = _safe_str(ev.get("txHash"))
    out: dict[str, Any] = {
        "timestamp": ts_iso,
        "failure_type": failure_type,
        "severity": severity,
        "event_name": raw_name,
        "reason_code": reason_code,
        "chain_id": chain,
        "provider": prov,
        "route_mode": rm,
        "batch_id": batch_id,
        "client_session_id": client_session_id,
        "tx_hash": txh,
        "payload_excerpt": _failure_telemetry_excerpt(ev),
    }
    return out


@router.get(
    "/failures",
    summary="P2.6 failure / error observability from monitoring ingest (read-only)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_failures(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    stmt = select(MonitoringIngestBatch).order_by(MonitoringIngestBatch.id.desc())
    batches = (await session.execute(stmt)).scalars().all()

    failure_rows: list[dict[str, Any]] = []
    swap_success_in_scope = 0
    meta_notes: list[str] = []
    unavailable: list[str] = []

    for batch in batches:
        if len(failure_rows) >= _FAILURE_CAP:
            break
        batch_iso = _iso_received_at(batch.received_at)
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            try:
                if not isinstance(ev, dict):
                    continue
                ev_name = ev.get("event")
                if ev_name == "swap_success":
                    swap_success_in_scope += 1
                parsed = _normalize_failure_event(ev)
                if parsed is None:
                    continue
                ftype, sev, rcode = parsed
                failure_rows.append(
                    _failure_row_public(
                        batch_id=batch.id,
                        client_session_id=batch.client_session_id,
                        batch_iso=batch_iso,
                        ev=ev,
                        failure_type=ftype,
                        severity=sev,
                        reason_code=rcode,
                    )
                )
                if len(failure_rows) >= _FAILURE_CAP:
                    break
            except Exception:
                continue
        if len(failure_rows) >= _FAILURE_CAP:
            break

    total_failures = len(failure_rows)

    by_type: dict[str, int] = {}
    by_chain: dict[int, int] = {}
    by_provider: dict[str, int] = {}
    for row in failure_rows:
        ft = row.get("failure_type") or "unknown"
        by_type[ft] = by_type.get(ft, 0) + 1
        cid = row.get("chain_id")
        if isinstance(cid, int):
            by_chain[cid] = by_chain.get(cid, 0) + 1
        pv = row.get("provider") or "unknown"
        by_provider[pv] = by_provider.get(pv, 0) + 1

    failures_by_type = [
        {"failure_type": k, "count": v}
        for k, v in sorted(by_type.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    failures_by_chain = [
        {"chain_id": k, "count": v}
        for k, v in sorted(by_chain.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    failures_by_provider = [
        {"provider": k, "count": v}
        for k, v in sorted(by_provider.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    recent_failures = list(reversed(failure_rows[-100:])) if failure_rows else []
    recent_commission_missing = [
        r
        for r in reversed(failure_rows)
        if r.get("failure_type") == "commission_missing"
    ][:50]

    timeline_buckets: dict[str, dict[str, int]] = {}
    for row in failure_rows:
        ts = row.get("timestamp")
        if not isinstance(ts, str):
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            bucket = dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0).isoformat()
        except Exception:
            continue
        slot = timeline_buckets.setdefault(bucket, {})
        ft = row.get("failure_type") or "unknown"
        slot[ft] = slot.get(ft, 0) + 1

    failure_timeline = [
        {
            "hour_bucket": k,
            "total": sum(v.values()),
            "by_type": dict(sorted(v.items(), key=lambda kv: (-kv[1], kv[0]))),
        }
        for k, v in sorted(timeline_buckets.items(), key=lambda kv: kv[0], reverse=True)
    ]

    def _rate(num: int, den: int) -> float | None:
        if den < _FAILURE_MIN_SAMPLES_RATE:
            return None
        return round(100.0 * float(num) / float(den), 4)

    wallet_rej = by_type.get("wallet_rejected", 0)
    prov_to = by_type.get("provider_timeout", 0)
    rpc_e = by_type.get("rpc_error", 0)
    stale_q = by_type.get("stale_quote", 0)

    wallet_rejection_rate = _rate(wallet_rej, wallet_rej + swap_success_in_scope)
    provider_timeout_rate = _rate(prov_to, total_failures) if total_failures else None
    rpc_failure_rate = _rate(rpc_e, total_failures) if total_failures else None
    stale_quote_rate = _rate(stale_q, total_failures) if total_failures else None

    meta_notes.append(
        "Rates use deterministic definitions over the latest failure window "
        f"(max {_FAILURE_CAP} failure events, newest batches first)."
    )
    meta_notes.append(
        "wallet_rejection_rate numerator = wallet_rejected; denominator = "
        "wallet_rejected + swap_success events seen while scanning those batches."
    )
    if total_failures < _FAILURE_MIN_SAMPLES_RATE:
        unavailable.append(
            "provider_timeout_rate / rpc_failure_rate / stale_quote_rate "
            f"(insufficient failure samples; need >= {_FAILURE_MIN_SAMPLES_RATE})"
        )
    if wallet_rej + swap_success_in_scope < _FAILURE_MIN_SAMPLES_RATE:
        unavailable.append(
            "wallet_rejection_rate (insufficient wallet_rejected + swap_success samples)"
        )

    return {
        "failure_taxonomy_version": FAILURE_TAXONOMY_VERSION,
        "total_failures": total_failures,
        "failures_by_type": failures_by_type,
        "failures_by_chain": failures_by_chain,
        "failures_by_provider": failures_by_provider,
        "recent_failures": recent_failures,
        "recent_commission_missing": recent_commission_missing,
        "failure_timeline": failure_timeline,
        "rates": {
            "wallet_rejection_rate": wallet_rejection_rate,
            "provider_timeout_rate": provider_timeout_rate,
            "rpc_failure_rate": rpc_failure_rate,
            "stale_quote_rate": stale_quote_rate,
        },
        "_meta": {
            "notes": meta_notes,
            "unavailable_metrics": unavailable,
        },
    }


WALLET_RECONNECT_EVENT_NAMES = frozenset(
    {
        "wallet_autoreconnect_scan",
        "appkit_reconnect_success",
        "legacy_wc_reconnect_attempt",
        "legacy_wc_reconnect_success",
        "legacy_wc_reconnect_failure",
    }
)

_WALLET_RECONNECT_CAP = 1000


def _wallet_reconnect_ts_ms(ev: dict[str, Any], batch_iso: str) -> int:
    ts_raw = ev.get("ts")
    if isinstance(ts_raw, (int, float)):
        return int(ts_raw)
    # fallback: parse batch_iso — rough ordering only
    return 0


def _wallet_scan_meta_from_ev(ev: dict[str, Any]) -> tuple[str | None, bool | None]:
    lc = ev.get("lastConnector")
    last_c = lc.strip() if isinstance(lc, str) else (_safe_str(lc) if lc is not None else None)
    wc = ev.get("wcProjectIdConfigured")
    if isinstance(wc, bool):
        wc_b: bool | None = wc
    else:
        wc_b = None
    return last_c, wc_b


@router.get(
    "/wallet-reconnect",
    summary="Wallet reconnect telemetry aggregates (read-only)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_wallet_reconnect(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    stmt = select(MonitoringIngestBatch).order_by(MonitoringIngestBatch.id.desc())
    batches = (await session.execute(stmt)).scalars().all()

    collected: list[tuple[int, str, str, dict[str, Any]]] = []
    for batch in batches:
        batch_iso = _iso_received_at(batch.received_at)
        sid = batch.client_session_id
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            try:
                if not isinstance(ev, dict):
                    continue
                name = ev.get("event")
                if not isinstance(name, str) or not name.strip():
                    continue
                ename = name.strip()
                if ename not in WALLET_RECONNECT_EVENT_NAMES:
                    continue
                ts_ms = _wallet_reconnect_ts_ms(ev, batch_iso)
                collected.append((ts_ms, sid, batch_iso, ev))
            except Exception:
                continue

    collected.sort(key=lambda x: -x[0])
    window = collected[:_WALLET_RECONNECT_CAP]

    totals = {
        "scans": 0,
        "appkit_success": 0,
        "legacy_attempts": 0,
        "legacy_success": 0,
        "legacy_failures": 0,
    }
    for ts_ms, _sid, _bio, ev in window:
        try:
            ename = str(ev.get("event", "")).strip()
            if ename == "wallet_autoreconnect_scan":
                totals["scans"] += 1
            elif ename == "appkit_reconnect_success":
                totals["appkit_success"] += 1
            elif ename == "legacy_wc_reconnect_attempt":
                totals["legacy_attempts"] += 1
            elif ename == "legacy_wc_reconnect_success":
                totals["legacy_success"] += 1
            elif ename == "legacy_wc_reconnect_failure":
                totals["legacy_failures"] += 1
        except Exception:
            continue

    successes = totals["appkit_success"] + totals["legacy_success"]
    failures = totals["legacy_failures"]
    denom = successes + failures
    reconnect_success_rate: float | None
    if denom == 0:
        reconnect_success_rate = None
    else:
        reconnect_success_rate = round(100.0 * successes / denom, 2)

    # Per-session last scan fields for enriching failure rows (processed oldest-first)
    scan_by_session: dict[str, dict[str, Any]] = {}
    window_chrono = sorted(window, key=lambda x: (x[0], x[1]))
    for ts_ms, sid, batch_iso, ev in window_chrono:
        try:
            ename = str(ev.get("event", "")).strip()
            if ename == "wallet_autoreconnect_scan":
                lc, wc_b = _wallet_scan_meta_from_ev(ev)
                scan_by_session[sid] = {
                    "last_connector": lc,
                    "wc_project_id_configured": wc_b,
                    "ts_ms": ts_ms,
                    "batch_iso": batch_iso,
                }
        except Exception:
            continue

    recent_failures_work: list[tuple[int, dict[str, Any]]] = []
    for ts_ms, sid, batch_iso, ev in window:
        try:
            if str(ev.get("event", "")).strip() != "legacy_wc_reconnect_failure":
                continue
            reason = _safe_str(ev.get("reason")) or "unknown"
            meta = scan_by_session.get(sid, {})
            last_c = _safe_str(ev.get("lastConnector")) or meta.get("last_connector")
            wc_cfg = ev.get("wcProjectIdConfigured")
            if isinstance(wc_cfg, bool):
                wc_out: bool | None = wc_cfg
            else:
                w = meta.get("wc_project_id_configured")
                wc_out = w if isinstance(w, bool) else None
            ts_iso = _iso_from_ts_ms(ev.get("ts"), batch_iso)
            recent_failures_work.append(
                (
                    ts_ms,
                    {
                        "timestamp": ts_iso,
                        "client_session_id": sid,
                        "reason": reason,
                        "last_connector": last_c,
                        "wc_project_id_configured": wc_out,
                    },
                )
            )
        except Exception:
            continue
    recent_failures_work.sort(key=lambda x: -x[0])
    recent_failures = [r for _, r in recent_failures_work[:50]]

    # Sessions aggregated over the processing window only
    by_session: dict[str, list[tuple[int, str, str, dict[str, Any]]]] = {}
    for ts_ms, sid, batch_iso, ev in window:
        try:
            ename = str(ev.get("event", "")).strip()
            by_session.setdefault(sid, []).append((ts_ms, ename, batch_iso, ev))
        except Exception:
            continue

    recent_sessions: list[dict[str, Any]] = []
    for sid, evs in by_session.items():
        try:
            evs_sorted = sorted(evs, key=lambda x: x[0])
            _last_ts, latest_name, last_batch_iso, last_ev_dict = evs_sorted[-1]
            last_seen_at = _iso_from_ts_ms(last_ev_dict.get("ts"), last_batch_iso)

            reconnect_count = sum(
                1
                for _t, n, _bio, _e in evs_sorted
                if n in ("appkit_reconnect_success", "legacy_wc_reconnect_success")
            )
            appkit_connected = any(n == "appkit_reconnect_success" for _t, n, _bio, _e in evs_sorted)

            recent_sessions.append(
                {
                    "client_session_id": sid,
                    "latest_event": latest_name,
                    "reconnect_count": reconnect_count,
                    "appkit_connected": appkit_connected,
                    "last_seen_at": last_seen_at,
                }
            )
        except Exception:
            continue

    recent_sessions.sort(key=lambda r: r.get("last_seen_at") or "", reverse=True)
    recent_sessions = recent_sessions[:50]

    timeline_buckets: dict[str, dict[str, int]] = {}
    for ts_ms, _sid, _batch_iso, ev in window:
        try:
            ename = str(ev.get("event", "")).strip()
            dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).replace(
                second=0, microsecond=0
            )
            bucket = dt.isoformat()
            slot = timeline_buckets.setdefault(bucket, {"scans": 0, "successes": 0, "failures": 0})
            if ename == "wallet_autoreconnect_scan":
                slot["scans"] += 1
            elif ename in ("appkit_reconnect_success", "legacy_wc_reconnect_success"):
                slot["successes"] += 1
            elif ename == "legacy_wc_reconnect_failure":
                slot["failures"] += 1
        except Exception:
            continue

    reconnect_timeline = [
        {
            "minute_bucket": k,
            "scans": v["scans"],
            "successes": v["successes"],
            "failures": v["failures"],
        }
        for k, v in sorted(timeline_buckets.items(), key=lambda kv: kv[0], reverse=True)
    ]

    return {
        "totals": totals,
        "reconnect_success_rate": reconnect_success_rate,
        "recent_failures": recent_failures,
        "recent_sessions": recent_sessions,
        "reconnect_timeline": reconnect_timeline,
    }
