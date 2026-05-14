"""P3.3 — Reconstruct swap lifecycles from persisted monitoring batches (read-only, telemetry-only).

Does not prove on-chain settlement. Correlates ``swap_lifecycle`` (swapFlowId), ``swap_success``,
``wallet_*``, ``quote_failure``, and ``swap_failure`` envelopes only.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

LIFECYCLE_SCHEMA_VERSION = "p3.3.0"

STALE_INCOMPLETE_MS = 30 * 60 * 1000
WALLET_ATTACH_WINDOW_MS = 12 * 60 * 1000

STAGE_TO_PHASE: dict[str, str] = {
    "quote_requested": "quote_requested",
    "quote_received": "quote_received",
    "preview_opened": "preview_opened",
    "approval_requested": "wallet_prompt",
    "approval_signed": "wallet_prompt",
    "approval_failed": "swap_failed",
    "swap_signature_requested": "wallet_prompt",
    "swap_signed": "wallet_prompt",
    "tx_broadcasted": "tx_broadcast",
    "tx_mined": "tx_confirmed",
    "receipt_decoded": "tx_confirmed",
    "reconciliation_completed": "tx_confirmed",
    "swap_failed": "swap_failed",
    "abandoned": "unknown_end_state",
}

PHASE_ORDER_RANK: dict[str, int] = {
    "quote_requested": 10,
    "quote_received": 20,
    "preview_opened": 30,
    "wallet_prompt": 40,
    "wallet_pending": 45,
    "wallet_rejected": 88,
    "tx_broadcast": 60,
    "tx_confirmed": 70,
    "swap_success": 100,
    "swap_failed": 100,
    "unknown_end_state": 100,
}

PHASE_DEFINITIONS: list[dict[str, str]] = [
    {"phase": "quote_requested", "description": "Quote pipeline started for a swap attempt."},
    {"phase": "quote_received", "description": "Quote payload accepted for preview / execution."},
    {"phase": "preview_opened", "description": "User opened the execution preview surface."},
    {"phase": "wallet_prompt", "description": "Wallet signature or approval was requested."},
    {"phase": "wallet_pending", "description": "Provider reported an in-flight wallet request (-32002 class)."},
    {"phase": "wallet_rejected", "description": "User dismissed or rejected a wallet request."},
    {"phase": "tx_broadcast", "description": "Signed transaction submitted to the network (telemetry only)."},
    {"phase": "tx_confirmed", "description": "Receipt / confirmation milestones from swap_lifecycle."},
    {"phase": "swap_success", "description": "swap_success monitoring envelope observed."},
    {"phase": "swap_failed", "description": "Terminal failure from lifecycle stage or swap_failure event."},
    {"phase": "unknown_end_state", "description": "Non-terminal or unclassified end (e.g. quote_failure only)."},
]


def _iso_from_ts_ms(ts_ms: int, fallback_iso: str) -> str:
    if ts_ms <= 0:
        return fallback_iso
    try:
        return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return fallback_iso


def _ts_ms(ev: dict[str, Any]) -> int:
    raw = ev.get("ts")
    if isinstance(raw, (int, float)):
        return int(raw)
    return 0


def _safe_str(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        return s or None
    return str(val)


def _token_sym(tok: Any) -> str | None:
    if isinstance(tok, dict):
        s = tok.get("symbol")
        if isinstance(s, str) and s.strip():
            return s.strip()
    return None


def _pair_from_swap_success(ev: dict[str, Any]) -> str:
    a = _token_sym(ev.get("fromToken")) or "?"
    b = _token_sym(ev.get("toToken")) or "?"
    return f"{a} → {b}"


def _phase_rank(phase: str) -> int:
    return PHASE_ORDER_RANK.get(phase, 0)


def _p95_ms(values: list[int]) -> int:
    if not values:
        return 0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, int(math.ceil(0.95 * len(s))) - 1))
    return int(s[idx])


@dataclass
class _FlowBucket:
    lifecycle_id: str
    session_id: str
    chain_id: int | None = None
    provider: str | None = None
    route_mode: str | None = None
    tx_hash: str | None = None
    wallet_address: str | None = None
    pair: str | None = None
    phases: list[dict[str, Any]] = field(default_factory=list)
    has_swap_success_event: bool = False
    has_wallet_rejected: bool = False
    has_wallet_pending: bool = False
    has_quote_failure: bool = False
    has_swap_failure: bool = False
    started_ts: int | None = None
    ended_ts: int | None = None


def _append_phase(
    flow: _FlowBucket,
    *,
    phase: str,
    ts_ms: int,
    event_name: str,
    metadata: dict[str, Any],
    batch_iso: str,
) -> None:
    if ts_ms > 0:
        flow.started_ts = ts_ms if flow.started_ts is None else min(flow.started_ts, ts_ms)
    meta = dict(metadata)
    meta["_ts_ms"] = ts_ms
    flow.phases.append(
        {
            "phase": phase,
            "time": _iso_from_ts_ms(ts_ms, batch_iso),
            "event_name": event_name,
            "metadata": meta,
        }
    )


def _finalize_phase_order(flow: _FlowBucket) -> tuple[bool, list[str]]:
    issues: list[str] = []
    prev = -1
    for p in flow.phases:
        pr = _phase_rank(str(p.get("phase") or ""))
        if pr < prev and pr > 0 and prev > 0:
            issues.append("phase_rank_regression_in_timeline")
            return False, issues
        prev = max(prev, pr)
    return True, issues


def _max_ts_from_phases(flow: _FlowBucket) -> int:
    m = 0
    for p in flow.phases:
        meta = p.get("metadata")
        if isinstance(meta, dict) and isinstance(meta.get("_ts_ms"), (int, float)):
            m = max(m, int(meta["_ts_ms"]))
    if flow.started_ts:
        m = max(m, flow.started_ts)
    return m


def _infer_status_severity(
    flow: _FlowBucket,
    *,
    now_ms: int,
    phase_order_ok: bool,
) -> tuple[str, str, list[str]]:
    issues: list[str] = []
    if not phase_order_ok:
        issues.append("inconsistent_phase_ordering")
        return "orphaned", "MEDIUM", issues

    if flow.has_swap_success_event:
        return "completed", "OK", issues

    if flow.has_wallet_rejected:
        return "rejected", "LOW", issues

    if flow.has_quote_failure or flow.has_swap_failure:
        return "failed", "MEDIUM", issues

    max_ev_ts = _max_ts_from_phases(flow)
    if flow.has_wallet_pending and max_ev_ts and (now_ms - max_ev_ts) < STALE_INCOMPLETE_MS:
        return "pending", "LOW", issues + ["wallet_sign_request_pending_without_terminal_yet"]

    if max_ev_ts and (now_ms - max_ev_ts) > STALE_INCOMPLETE_MS:
        return "incomplete", "LOW", issues + ["no_terminal_event_within_stale_window"]

    return "incomplete", "LOW", issues + ["no_terminal_event_observed_yet"]


def _nearest_open_flow(sid: str, ts: int, flows: dict[str, _FlowBucket]) -> _FlowBucket | None:
    candidates: list[tuple[int, _FlowBucket]] = []
    for fl in flows.values():
        if fl.session_id != sid:
            continue
        if fl.has_swap_success_event or fl.has_wallet_rejected:
            continue
        last = 0
        for p in fl.phases:
            m = p.get("metadata")
            if isinstance(m, dict) and isinstance(m.get("_ts_ms"), (int, float)):
                last = max(last, int(m["_ts_ms"]))
        if last and 0 < ts - last <= WALLET_ATTACH_WINDOW_MS:
            candidates.append((last, fl))
    if not candidates:
        return None
    candidates.sort(key=lambda x: -x[0])
    return candidates[0][1]


def build_swap_lifecycles_payload(
    batches: list[Any],
    *,
    now_ms: int | None = None,
    status_filter: str | None = None,
    provider_filter: str | None = None,
    chain_filter: int | None = None,
    lifecycle_id_filter: str | None = None,
    tx_hash_filter: str | None = None,
    max_recent: int = 80,
) -> dict[str, Any]:
    now = int(now_ms if now_ms is not None else datetime.now(timezone.utc).timestamp() * 1000)

    flat: list[tuple[int, str, str, dict[str, Any]]] = []
    for batch in batches:
        batch_iso = batch.received_at.isoformat() if getattr(batch, "received_at", None) else ""
        sid = str(getattr(batch, "client_session_id", "") or "")
        env = batch.envelope if isinstance(getattr(batch, "envelope", None), dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            if not isinstance(ev, dict):
                continue
            name = ev.get("event")
            if not isinstance(name, str) or not name.strip():
                continue
            name = name.strip()
            if name not in (
                "swap_lifecycle",
                "swap_success",
                "wallet_rejected",
                "wallet_request_pending",
                "quote_failure",
                "swap_failure",
            ):
                continue
            flat.append((_ts_ms(ev), batch_iso, sid, ev))

    flat.sort(key=lambda x: (x[0], x[2], str(x[3].get("event"))))

    flows: dict[str, _FlowBucket] = {}

    def get_flow(fid: str, sid: str) -> _FlowBucket:
        if fid not in flows:
            flows[fid] = _FlowBucket(lifecycle_id=fid, session_id=sid)
        return flows[fid]

    for ts, batch_iso, sid, ev in flat:
        if ev.get("event") != "swap_lifecycle":
            continue
        fid = _safe_str(ev.get("swapFlowId"))
        if not fid:
            continue
        fl = get_flow(fid, sid)
        st = _safe_str(ev.get("stage")) or "unknown"
        phase = STAGE_TO_PHASE.get(st, "unknown_end_state")
        meta = {k: v for k, v in ev.items() if k not in ("event", "ts", "swapFlowId")}
        _append_phase(fl, phase=phase, ts_ms=ts, event_name="swap_lifecycle", metadata=meta, batch_iso=batch_iso)
        cid = ev.get("chainId")
        if isinstance(cid, int):
            fl.chain_id = cid
        elif isinstance(cid, float):
            fl.chain_id = int(cid)
        fl.provider = _safe_str(ev.get("provider")) or fl.provider
        fl.route_mode = _safe_str(ev.get("routeMode")) or fl.route_mode
        th = _safe_str(ev.get("txHash"))
        if th:
            fl.tx_hash = th
        wa = _safe_str(ev.get("address")) or _safe_str(ev.get("fromAddress"))
        if wa:
            fl.wallet_address = wa

    for ts, batch_iso, sid, ev in flat:
        if ev.get("event") != "swap_success":
            continue
        th = _safe_str(ev.get("txHash"))
        pair = _pair_from_swap_success(ev)
        cid = ev.get("chainId")
        chain: int | None = None
        if isinstance(cid, int):
            chain = cid
        elif isinstance(cid, float):
            chain = int(cid)
        prov = _safe_str(ev.get("provider"))

        target_fid: str | None = None
        if th:
            for fid, fl in flows.items():
                if fl.tx_hash and th.lower() == fl.tx_hash.lower():
                    target_fid = fid
                    break
        if target_fid is None and th:
            target_fid = f"succ-{th.lower()}"
            fl = get_flow(target_fid, sid)
            fl.tx_hash = th
        elif target_fid is None:
            target_fid = f"succ-nohash-{sid}-{ts}"
            fl = get_flow(target_fid, sid)
        else:
            fl = flows[target_fid]

        fl.session_id = sid
        fl.has_swap_success_event = True
        fl.pair = pair
        fl.chain_id = chain or fl.chain_id
        fl.provider = prov or fl.provider
        fl.route_mode = _safe_str(ev.get("routeMode")) or fl.route_mode
        meta = {k: v for k, v in ev.items() if k not in ("event", "ts")}
        _append_phase(fl, phase="swap_success", ts_ms=ts, event_name="swap_success", metadata=meta, batch_iso=batch_iso)
        fl.ended_ts = ts

    for ts, batch_iso, sid, ev in flat:
        en = ev.get("event")
        if en == "wallet_rejected":
            fl = _nearest_open_flow(sid, ts, flows)
            if fl is None:
                fid = f"walletrej-{sid}-{ts}"
                fl = get_flow(fid, sid)
            fl.has_wallet_rejected = True
            meta = {k: v for k, v in ev.items() if k != "event"}
            _append_phase(
                fl,
                phase="wallet_rejected",
                ts_ms=ts,
                event_name="wallet_rejected",
                metadata=meta,
                batch_iso=batch_iso,
            )
            fl.ended_ts = ts
        elif en == "wallet_request_pending":
            fl = _nearest_open_flow(sid, ts, flows)
            if fl is None:
                fid = f"walletpend-{sid}-{ts}"
                fl = get_flow(fid, sid)
            fl.has_wallet_pending = True
            meta = {k: v for k, v in ev.items() if k != "event"}
            _append_phase(
                fl,
                phase="wallet_pending",
                ts_ms=ts,
                event_name="wallet_request_pending",
                metadata=meta,
                batch_iso=batch_iso,
            )

    for ts, batch_iso, sid, ev in flat:
        if ev.get("event") != "quote_failure":
            continue
        fid = f"quote-{sid}-{ts}"
        fl = get_flow(fid, sid)
        fl.has_quote_failure = True
        raw_c = ev.get("chainId")
        if isinstance(raw_c, int):
            fl.chain_id = raw_c
        elif isinstance(raw_c, float):
            fl.chain_id = int(raw_c)
        fl.provider = _safe_str(ev.get("provider")) or fl.provider
        meta = {k: v for k, v in ev.items() if k != "event"}
        _append_phase(
            fl,
            phase="unknown_end_state",
            ts_ms=ts,
            event_name="quote_failure",
            metadata=meta,
            batch_iso=batch_iso,
        )
        fl.ended_ts = ts

    for ts, batch_iso, sid, ev in flat:
        if ev.get("event") != "swap_failure":
            continue
        fl = _nearest_open_flow(sid, ts, flows)
        if fl is None:
            fid = f"swapfail-{sid}-{ts}"
            fl = get_flow(fid, sid)
        fl.has_swap_failure = True
        meta = {k: v for k, v in ev.items() if k != "event"}
        _append_phase(fl, phase="swap_failed", ts_ms=ts, event_name="swap_failure", metadata=meta, batch_iso=batch_iso)
        fl.ended_ts = ts

    for fl in flows.values():
        fl.phases.sort(key=lambda p: int((p.get("metadata") or {}).get("_ts_ms") or 0))

    def build_row(fid: str, fl: _FlowBucket) -> dict[str, Any]:
        order_ok, order_issues = _finalize_phase_order(fl)
        status, severity, issues = _infer_status_severity(fl, now_ms=now, phase_order_ok=order_ok)
        issues = list(dict.fromkeys(order_issues + issues))

        started = fl.started_ts or 0
        ended = fl.ended_ts or _max_ts_from_phases(fl)
        duration_ms = max(0, ended - started) if started and ended else 0

        has_quote = any(str(p.get("phase")) in ("quote_requested", "quote_received") for p in fl.phases)
        has_wallet_phase = any(
            str(p.get("phase")) in ("wallet_prompt", "wallet_pending", "wallet_rejected") for p in fl.phases
        )
        has_terminal = (
            fl.has_swap_success_event or fl.has_wallet_rejected or fl.has_quote_failure or fl.has_swap_failure
        )
        has_tx = bool(fl.tx_hash)

        phases_out: list[dict[str, Any]] = []
        for p in fl.phases:
            po = dict(p)
            m = po.get("metadata")
            if isinstance(m, dict):
                po["metadata"] = {k: v for k, v in m.items() if k != "_ts_ms"}
            phases_out.append(po)

        return {
            "lifecycle_id": fl.lifecycle_id,
            "session_id": fl.session_id,
            "status": status,
            "severity": severity,
            "chain_id": fl.chain_id,
            "provider": fl.provider,
            "route_mode": fl.route_mode,
            "pair": fl.pair or "—",
            "wallet_address": fl.wallet_address,
            "started_at": _iso_from_ts_ms(started, "") if started else None,
            "ended_at": _iso_from_ts_ms(ended, "") if ended else None,
            "duration_ms": duration_ms,
            "tx_hash": fl.tx_hash,
            "phases": phases_out,
            "issues": issues,
            "checks": {
                "has_quote": has_quote,
                "has_wallet_phase": has_wallet_phase,
                "has_terminal_phase": has_terminal,
                "has_tx_hash": has_tx,
                "phase_order_valid": order_ok,
            },
        }

    all_rows: list[dict[str, Any]] = []
    for fid, fl in flows.items():
        all_rows.append(build_row(fid, fl))

    def _row_sort_ts(r: dict[str, Any]) -> float:
        for key in ("ended_at", "started_at"):
            v = r.get(key)
            if isinstance(v, str) and v.strip():
                try:
                    return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp() * 1000.0
                except ValueError:
                    continue
        return 0.0

    all_rows.sort(key=lambda r: (-_row_sort_ts(r), str(r.get("lifecycle_id") or "")))

    summary_counts: dict[str, int] = {
        "total_lifecycles": 0,
        "completed": 0,
        "rejected": 0,
        "pending": 0,
        "failed": 0,
        "incomplete": 0,
        "orphaned": 0,
        "unknown": 0,
    }
    durations: list[int] = []

    def passes_filters(row: dict[str, Any]) -> bool:
        if status_filter and str(row.get("status") or "").lower() != status_filter.lower():
            return False
        prov = (row.get("provider") or "") if provider_filter else ""
        if provider_filter and provider_filter.lower() not in str(prov).lower():
            return False
        if chain_filter is not None and row.get("chain_id") != chain_filter:
            return False
        lid = str(row.get("lifecycle_id") or "")
        if lifecycle_id_filter and lifecycle_id_filter not in lid:
            return False
        tx = str(row.get("tx_hash") or "")
        if tx_hash_filter and tx_hash_filter.lower() not in tx.lower():
            return False
        return True

    filtered_rows = [r for r in all_rows if passes_filters(r)]

    for row in filtered_rows:
        summary_counts["total_lifecycles"] += 1
        st = str(row.get("status") or "")
        if st in summary_counts:
            summary_counts[st] += 1
        if st == "completed" and isinstance(row.get("duration_ms"), int) and row["duration_ms"] > 0:
            durations.append(int(row["duration_ms"]))

    recent = filtered_rows[:max_recent]

    return {
        "schema_version": LIFECYCLE_SCHEMA_VERSION,
        "summary": {
            **summary_counts,
            "avg_duration_ms": int(sum(durations) / len(durations)) if durations else 0,
            "p95_duration_ms": _p95_ms(durations),
        },
        "phase_definitions": PHASE_DEFINITIONS,
        "recent_lifecycles": recent,
        "_meta": {
            "notes": [
                "Lifecycle reconstruction is derived from persisted monitoring telemetry only.",
                "This endpoint does not guarantee on-chain settlement or treasury receipt.",
                "swap_lifecycle rows require monitoring ingest enabled and the swap_lifecycle allow-list.",
                "wallet_* events are correlated heuristically by client_session_id and time window.",
            ],
        },
    }
