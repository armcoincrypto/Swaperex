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
import json
import secrets
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
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


# --- P3.1 fee telemetry normalization (read-only; no USD; explicit decimals sources) ---

NORMALIZATION_SCHEMA_VERSION = "p3.1.0"

_CHAIN_TOKEN_LIST_FILES: dict[int, str] = {
    1: "ethereum.json",
    56: "bsc.json",
    137: "polygon.json",
    42161: "arbitrum.json",
    10: "optimism.json",
    43114: "avalanche.json",
    100: "gnosis.json",
    250: "fantom.json",
    8453: "base.json",
}

_NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

# Explicit EVM gas-token decimals only for chains we ship token lists for.
_NATIVE_EVM_DECIMALS: dict[int, tuple[int, str]] = {
    cid: (18, "chain_native_canonical")
    for cid in _CHAIN_TOKEN_LIST_FILES.keys()
}

_token_address_decimals_cache: dict[tuple[int, str], tuple[int, str]] | None = None


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _load_token_address_decimals_registry() -> dict[tuple[int, str], tuple[int, str]]:
    """Map (chain_id, token_address lower) -> (decimals, source_label)."""
    global _token_address_decimals_cache
    if _token_address_decimals_cache is not None:
        return _token_address_decimals_cache
    out: dict[tuple[int, str], tuple[int, str]] = {}
    root = _repo_root()
    for chain_id, fname in _CHAIN_TOKEN_LIST_FILES.items():
        fp = root / "frontend" / "src" / "tokens" / fname
        if not fp.is_file():
            continue
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        tokens = data.get("tokens")
        if not isinstance(tokens, list):
            continue
        for t in tokens:
            if not isinstance(t, dict):
                continue
            addr = t.get("address")
            dec = t.get("decimals")
            if not isinstance(addr, str) or not addr.startswith("0x"):
                continue
            if not isinstance(dec, int) or dec < 0 or dec > 36:
                continue
            out[(chain_id, addr.lower())] = (dec, "frontend_token_list")
    _token_address_decimals_cache = out
    return out


def _resolve_fee_token_decimals(
    chain_id: int,
    fee_token: Any,
) -> tuple[int | None, str | None]:
    """Return (decimals, source) for fee token wire object; no silent defaults."""
    if not isinstance(fee_token, dict):
        return None, None
    addr_raw = fee_token.get("address")
    addr = addr_raw.strip().lower() if isinstance(addr_raw, str) and addr_raw.startswith("0x") else None
    native = bool(fee_token.get("isNative"))
    if native or (addr and addr == _NATIVE_SENTINEL):
        hit = _NATIVE_EVM_DECIMALS.get(chain_id)
        if hit:
            return hit[0], hit[1]
        return None, None
    if addr:
        reg = _load_token_address_decimals_registry().get((chain_id, addr))
        if reg:
            return reg[0], reg[1]
    return None, None


def _format_normalized_amount(wei: int, decimals: int) -> str:
    if decimals < 0 or decimals > 36:
        raise ValueError("decimals out of range")
    q = Decimal(wei) / (Decimal(10) ** decimals)
    s = format(q, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"


def _classify_fee_telemetry_row(
    *,
    chain_id: int,
    fee_token_obj: Any,
    fee_raw_field: Any,
) -> tuple[str, int | None, str | None, str | None, str | None]:
    """Return (status, decimals|None, decimals_source, normalized_amount|None, raw_wei_str|None)."""
    if not isinstance(fee_token_obj, dict):
        parsed = _parse_fee_wei_decimal(fee_raw_field)
        raw_s = str(parsed) if parsed is not None else None
        return "unsupported_token", None, None, None, raw_s

    parsed = _parse_fee_wei_decimal(fee_raw_field)
    if parsed is None:
        return "invalid_raw_value", None, None, None, None

    raw_s = str(parsed)
    dec, dsrc = _resolve_fee_token_decimals(chain_id, fee_token_obj)
    if dec is None:
        return "missing_decimals", None, None, None, raw_s
    try:
        norm = _format_normalized_amount(parsed, dec)
    except Exception:
        return "unknown", None, None, None, raw_s
    return "normalized", dec, dsrc, norm, raw_s


@router.get(
    "/revenue-normalized",
    summary="P3.1 fee telemetry with explicit decimals / normalization status (read-only)",
    dependencies=[Depends(require_admin_api_token)],
)
async def admin_revenue_normalized(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    stmt = select(MonitoringIngestBatch).order_by(MonitoringIngestBatch.id.desc())
    batches = (await session.execute(stmt)).scalars().all()

    coverage_counter: Counter[str] = Counter()
    total_fee_events = 0
    recent_work: list[tuple[int, dict[str, Any]]] = []

    bucket_raw: dict[tuple[int, str, str | None, bool], int] = {}
    bucket_norm_sum: dict[tuple[int, str, str | None, bool], Decimal] = {}
    bucket_norm_events: dict[tuple[int, str, str | None, bool], int] = {}
    bucket_status_counts: dict[tuple[int, str, str | None, bool], Counter[str]] = {}

    chain_raw: dict[int, int] = {}
    chain_norm_sum: dict[int, Decimal] = {}

    route_raw: dict[tuple[int, str], int] = {}
    route_norm_sum: dict[tuple[int, str], Decimal] = {}
    route_meta: dict[tuple[int, str], dict[str, str | None]] = {}

    def bucket_key(
        chain: int,
        sym: str,
        addr: str | None,
        native: bool,
    ) -> tuple[int, str, str | None, bool]:
        return (chain, sym, addr.lower() if isinstance(addr, str) else None, native)

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
                if "feeToTreasuryWei" not in ev:
                    continue
                total_fee_events += 1
                fee_tok = ev.get("feeToken")
                sym, addr, native = _fee_token_meta(ev)
                status, dec, dsrc, norm_amt, raw_s = _classify_fee_telemetry_row(
                    chain_id=chain,
                    fee_token_obj=fee_tok,
                    fee_raw_field=ev.get("feeToTreasuryWei"),
                )
                coverage_counter[status] += 1

                parsed = _parse_fee_wei_decimal(ev.get("feeToTreasuryWei"))
                bk = bucket_key(chain, sym, addr, native)
                if bk not in bucket_status_counts:
                    bucket_status_counts[bk] = Counter()
                bucket_status_counts[bk][status] += 1

                if parsed is not None:
                    bucket_raw[bk] = bucket_raw.get(bk, 0) + parsed
                    if status == "normalized" and norm_amt is not None and dec is not None:
                        try:
                            dnorm = Decimal(norm_amt)
                            bucket_norm_sum[bk] = bucket_norm_sum.get(bk, Decimal(0)) + dnorm
                            bucket_norm_events[bk] = bucket_norm_events.get(bk, 0) + 1
                        except Exception:
                            pass
                    chain_raw[chain] = chain_raw.get(chain, 0) + parsed
                    if status == "normalized" and norm_amt is not None:
                        try:
                            chain_norm_sum[chain] = chain_norm_sum.get(chain, Decimal(0)) + Decimal(norm_amt)
                        except Exception:
                            pass

                    route_label = _build_route_label(ev)
                    rk = (chain, route_label)
                    route_raw[rk] = route_raw.get(rk, 0) + parsed
                    if status == "normalized" and norm_amt is not None:
                        try:
                            route_norm_sum[rk] = route_norm_sum.get(rk, Decimal(0)) + Decimal(norm_amt)
                        except Exception:
                            pass
                    if rk not in route_meta:
                        route_meta[rk] = {
                            "provider": _safe_str(ev.get("provider")),
                            "route_mode": _route_mode_str(ev),
                            "wrapper_route": _safe_str(ev.get("wrapperRoute")),
                            "commission_route": _safe_str(ev.get("commissionRoute")),
                        }
                else:
                    route_label = _build_route_label(ev)

                ts_raw = ev.get("ts")
                ts_ms = int(ts_raw) if isinstance(ts_raw, (int, float)) else 0
                row_out: dict[str, Any] = {
                    "timestamp": _iso_from_ts_ms(ev.get("ts"), batch_iso),
                    "chain_id": chain,
                    "token_symbol": sym,
                    "token_address": addr.lower() if isinstance(addr, str) else None,
                    "fee_token_is_native": native,
                    "raw_fee_wei": raw_s if raw_s is not None else None,
                    "normalized_amount": norm_amt,
                    "decimals": dec,
                    "decimals_source": dsrc,
                    "normalization_status": status,
                    "protocol_fee_bps": _safe_opt_int(ev.get("protocolFeeBps")),
                    "provider": _safe_str(ev.get("provider")),
                    "route_mode": _route_mode_str(ev),
                    "wrapper_route": _safe_str(ev.get("wrapperRoute")),
                    "commission_route": _safe_str(ev.get("commissionRoute")),
                    "route_label": route_label,
                    "tx_hash": _safe_str(ev.get("txHash")),
                }
                recent_work.append((ts_ms, row_out))
            except Exception:
                continue

    normalized_n = int(coverage_counter.get("normalized", 0))
    cov_pct = round(100.0 * float(normalized_n) / float(total_fee_events), 4) if total_fee_events else 0.0

    totals_by_token: list[dict[str, Any]] = []
    all_buckets = set(bucket_raw.keys()) | set(bucket_status_counts.keys())
    for bk in sorted(all_buckets, key=lambda k: (-bucket_raw.get(k, 0), k)):
        chain, symbol, address, is_native = bk
        raw_sum = int(bucket_raw.get(bk, 0))
        ns = bucket_norm_sum.get(bk, Decimal(0))
        norm_total_s = str(ns) if bucket_norm_events.get(bk, 0) > 0 else None
        stc = bucket_status_counts.get(bk, Counter())
        dominant = stc.most_common(1)[0][0] if stc else "unknown"
        if len(stc) > 1:
            bucket_status_label = "unknown"
        else:
            bucket_status_label = dominant
        totals_by_token.append(
            {
                "chain_id": chain,
                "token_symbol": symbol,
                "token_address": address,
                "is_native": is_native,
                "raw_fee_wei_total": str(raw_sum),
                "normalized_amount_total": norm_total_s,
                "normalized_event_count": int(bucket_norm_events.get(bk, 0)),
                "bucket_event_count": int(sum(stc.values())),
                "normalization_status": bucket_status_label,
                "status_mix": dict(stc),
            }
        )

    totals_by_chain: list[dict[str, Any]] = []
    for cid in sorted(chain_raw.keys(), key=lambda c: -chain_raw[c]):
        nr = chain_norm_sum.get(cid, Decimal(0))
        totals_by_chain.append(
            {
                "chain_id": cid,
                "raw_fee_wei_total": str(chain_raw[cid]),
                "normalized_amount_total": str(nr) if cid in chain_norm_sum else None,
            }
        )

    totals_by_route: list[dict[str, Any]] = []
    for rk, raw_sum in sorted(route_raw.items(), key=lambda kv: (-kv[1], kv[0])):
        cid, rlab = rk
        nr = route_norm_sum.get(rk, Decimal(0))
        meta = route_meta.get(rk, {})
        totals_by_route.append(
            {
                "chain_id": cid,
                "route_label": rlab,
                "provider": meta.get("provider"),
                "route_mode": meta.get("route_mode"),
                "wrapper_route": meta.get("wrapper_route"),
                "commission_route": meta.get("commission_route"),
                "raw_fee_wei_total": str(raw_sum),
                "normalized_amount_total": str(nr) if rk in route_norm_sum else None,
            }
        )

    recent_work.sort(key=lambda x: (-x[0], x[1].get("tx_hash") or ""))
    recent_normalized_fee_events = [r for _, r in recent_work[:40]]

    notes = [
        "USD conversion is intentionally not included.",
        "Decimals for ERC-20/BEP-20 style fee tokens come from checked-in "
        "`frontend/src/tokens/*.json` lists (address match on chain).",
        "Native gas tokens use `chain_native_canonical` where the chain is in the supported list.",
        "Buckets with multiple normalization statuses collapse aggregate `normalization_status` to `unknown`.",
    ]

    return {
        "normalization_schema_version": NORMALIZATION_SCHEMA_VERSION,
        "coverage": {
            "total_fee_events": total_fee_events,
            "normalized_count": int(coverage_counter.get("normalized", 0)),
            "missing_decimals_count": int(coverage_counter.get("missing_decimals", 0)),
            "invalid_raw_value_count": int(coverage_counter.get("invalid_raw_value", 0)),
            "unsupported_token_count": int(coverage_counter.get("unsupported_token", 0)),
            "unknown_count": int(coverage_counter.get("unknown", 0)),
            "coverage_pct": cov_pct,
        },
        "totals_by_token": totals_by_token,
        "totals_by_chain": totals_by_chain,
        "totals_by_route": totals_by_route,
        "recent_normalized_fee_events": recent_normalized_fee_events,
        "_meta": {
            "notes": notes,
            "decimals_registry_chains": sorted(_CHAIN_TOKEN_LIST_FILES.keys()),
        },
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
