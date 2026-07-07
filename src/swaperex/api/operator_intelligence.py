"""P5A — Operator intelligence aggregates from monitoring ingest (read-only).

Scans persisted ``monitoring_ingest_batches`` envelopes at request time.
No schema changes; no PII (wallet addresses / tx hashes excluded from rollups).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any

from swaperex.ledger.models import MonitoringIngestBatch

SCHEMA_VERSION = 3
P4A_DEPLOY_ISO = "2026-07-07T16:27:32+00:00"
SWAP_READY_CHAINS = frozenset({1, 56})

NOTIONAL_BUCKET_MID: dict[str, float] = {
    "micro": 0.005,
    "small": 0.05,
    "medium": 0.5,
    "large": 5.0,
    "xlarge": 25.0,
    "unknown": 0.0,
}

FUNNEL_STAGES = (
    "pair_selected",
    "quote_success",
    "preview_opened",
    "approve_clicked",
    "swap_success",
)


def _safe_opt_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _parse_fee_wei(val: Any) -> int | None:
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val if val >= 0 else None
    if isinstance(val, str):
        s = val.strip()
        return int(s) if s.isdigit() else None
    return None


def _ts_ms(ev: dict[str, Any]) -> int:
    raw = ev.get("ts")
    if isinstance(raw, (int, float)):
        return int(raw)
    return 0


def _pair_label_from_key(pair_key: str | None) -> str:
    if not pair_key or "|" not in pair_key:
        return pair_key or "unknown"
    parts = pair_key.split("|")
    if len(parts) >= 3:
        return f"{parts[1]} ⇄ {parts[2]}"
    return pair_key


def _pair_key_from_ev(ev: dict[str, Any]) -> str | None:
    pk = ev.get("pairKey")
    if isinstance(pk, str) and pk.strip():
        return pk.strip()
    chain = _safe_opt_int(ev.get("chainId"))
    fs = ev.get("fromSymbol")
    ts = ev.get("toSymbol")
    if chain is not None and isinstance(fs, str) and isinstance(ts, str):
        return f"{chain}|{fs.strip().upper()}|{ts.strip().upper()}"
    ft = ev.get("fromToken")
    tt = ev.get("toToken")
    if chain is not None and isinstance(ft, dict) and isinstance(tt, dict):
        f_sym = ft.get("symbol")
        t_sym = tt.get("symbol")
        if isinstance(f_sym, str) and isinstance(t_sym, str):
            return f"{chain}|{f_sym.strip().upper()}|{t_sym.strip().upper()}"
    return None


def _parse_amount(val: Any) -> float | None:
    if val is None:
        return None
    try:
        n = float(val)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _in_window(ts: int, start_ms: int, end_ms: int) -> bool:
    return start_ms <= ts < end_ms


def _day_bounds_utc(now: datetime) -> tuple[int, int, int, int]:
    """Return start_ms for today, yesterday, 7d ago, 30d ago."""
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    d7 = today - timedelta(days=7)
    d30 = today - timedelta(days=30)
    now_ms = int(now.timestamp() * 1000)
    return (
        int(today.timestamp() * 1000),
        int(yesterday.timestamp() * 1000),
        int(d7.timestamp() * 1000),
        int(d30.timestamp() * 1000),
    )


def _commission_by_token_window(
    fee_events: list[tuple[int, str, int]],
    start_ms: int,
    end_ms: int,
) -> list[dict[str, Any]]:
    acc: dict[str, int] = defaultdict(int)
    for ts, sym, wei in fee_events:
        if _in_window(ts, start_ms, end_ms):
            acc[sym] += wei
    return [{"token": k, "fee_wei": str(v)} for k, v in sorted(acc.items(), key=lambda kv: -kv[1])]


def _rate(num: int, den: int) -> float | None:
    if den <= 0:
        return None
    return round(100.0 * float(num) / float(den), 2)


def _build_alerts(
    *,
    quote_success: int,
    quote_failure: int,
    unsupported_chain: int,
    unsupported_pair: int,
    swap_failure: int,
    swap_success: int,
    commission_7d_wei: int,
    commission_prior_7d_wei: int,
    p4a_post_quote_success: int,
    p4a_pre_quote_success: int,
) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    qf_rate = _rate(quote_failure, quote_failure + quote_success)
    if qf_rate is not None and qf_rate >= 25.0 and quote_failure >= 5:
        alerts.append(
            {
                "id": "quote_failure_elevated",
                "severity": "warning",
                "trigger": f"Quote failure rate {qf_rate}% ({quote_failure} failures / {quote_success} successes)",
                "action": "Inspect quote_failure reasons in Failures tab; check RPC and wrapper health.",
            }
        )

    if unsupported_chain >= 10:
        alerts.append(
            {
                "id": "unsupported_chain_spike",
                "severity": "info",
                "trigger": f"{unsupported_chain} chain_selected events on non-swap networks",
                "action": "Review P4A chain banner copy; do not expand wrappers without product decision.",
            }
        )

    if unsupported_pair >= 10:
        alerts.append(
            {
                "id": "unsupported_pair_spike",
                "severity": "warning",
                "trigger": f"{unsupported_pair} unsupported_commission_route events",
                "action": "Rank unsupported pairs; consider audit expansion only for high-volume majors.",
            }
        )

    if swap_failure >= 5 and swap_success > 0:
        sf_rate = _rate(swap_failure, swap_failure + swap_success)
        if sf_rate is not None and sf_rate >= 15.0:
            alerts.append(
                {
                    "id": "swap_failure_elevated",
                    "severity": "critical",
                    "trigger": f"Swap failure rate {sf_rate}% ({swap_failure} failures)",
                    "action": "Check wrapper pause state, RPC, and recent deploy regressions.",
                }
            )

    if commission_prior_7d_wei > 0 and commission_7d_wei < int(commission_prior_7d_wei * 0.7):
        alerts.append(
            {
                "id": "commission_drop_30pct",
                "severity": "warning",
                "trigger": "7d commission wei down >30% vs prior 7d window in scanned data",
                "action": "Compare swap volume and pair mix; verify fee telemetry decode coverage.",
            }
        )

    if p4a_post_quote_success > 0 or p4a_pre_quote_success > 0:
        alerts.append(
            {
                "id": "p4a_funnel_baseline",
                "severity": "info",
                "trigger": (
                    f"Post-P4A quote_success={p4a_post_quote_success}, "
                    f"pre-P4A quote_success={p4a_pre_quote_success} (ingest window)"
                ),
                "action": "Re-check after 7d of P4A telemetry for featured-pair lift.",
            }
        )

    return alerts


def build_operator_intelligence_payload(
    batches: list[MonitoringIngestBatch],
    *,
    max_batches: int = 500,
    scan_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Aggregate operator metrics from monitoring batches (newest first)."""
    now = datetime.now(timezone.utc)
    today_ms, yesterday_ms, d7_ms, d30_ms = _day_bounds_utc(now)
    now_ms = int(now.timestamp() * 1000)
    p4a_ms = int(datetime.fromisoformat(P4A_DEPLOY_ISO).timestamp() * 1000)

    event_counts: dict[str, int] = defaultdict(int)
    funnel_counts: dict[str, int] = defaultdict(int)

    fee_events: list[tuple[int, str, int]] = []
    swap_amounts: list[float] = []
    swap_amounts_by_chain: dict[int, list[float]] = defaultdict(list)

    pair_quotes: dict[str, int] = defaultdict(int)
    pair_swaps: dict[str, int] = defaultdict(int)
    pair_commission: dict[str, int] = defaultdict(int)
    pair_quote_fail: dict[str, int] = defaultdict(int)
    pair_preview: dict[str, int] = defaultdict(int)
    pair_approve: dict[str, int] = defaultdict(int)
    pair_unsupported: dict[str, int] = defaultdict(int)

    chain_quotes: dict[int, int] = defaultdict(int)
    chain_swaps: dict[int, int] = defaultdict(int)
    chain_unsupported_sel: dict[int, int] = defaultdict(int)

    provider_commission: dict[str, int] = defaultdict(int)
    provider_swap_counts: dict[str, int] = defaultdict(int)
    largest_swaps: list[tuple[int, float, str, int | None]] = []
    largest_commission: list[tuple[int, int, str]] = []

    sessions_with_stage: dict[str, set[str]] = defaultdict(set)
    preview_abandon_sessions: set[str] = set()
    approve_abandon_sessions: set[str] = set()

    pair_selected_by_source: dict[str, int] = defaultdict(int)

    p4a_pre_quote = 0
    p4a_post_quote = 0
    p4a_pre_swap = 0
    p4a_post_swap = 0

    events_scanned = 0
    batches_scanned = 0
    from swaperex.api.operator_decision_support import TimedMetrics

    timed = TimedMetrics()

    ordered = sorted(batches, key=lambda b: b.id, reverse=True)[:max_batches]

    for batch in ordered:
        batches_scanned += 1
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        sid = batch.client_session_id or ""

        for ev in events:
            if not isinstance(ev, dict):
                continue
            events_scanned += 1
            name = str(ev.get("event", "")).strip()
            if not name:
                continue
            event_counts[name] += 1
            ts = _ts_ms(ev)
            pk = _pair_key_from_ev(ev)
            chain = _safe_opt_int(ev.get("chainId"))

            if name in FUNNEL_STAGES:
                funnel_counts[name] += 1
                if sid:
                    sessions_with_stage[sid].add(name)

            if name == "pair_selected":
                src = ev.get("source")
                if isinstance(src, str):
                    pair_selected_by_source[src] += 1
                if pk:
                    pair_quotes[pk] += 0  # touch for key existence via quote below

            if name == "quote_success":
                timed.quote_success.append((ts, pk, chain))
                if pk:
                    pair_quotes[pk] += 1
                if chain is not None:
                    chain_quotes[chain] += 1
                if ts < p4a_ms:
                    p4a_pre_quote += 1
                else:
                    p4a_post_quote += 1

            if name == "quote_failure":
                timed.quote_failure.append((ts, pk, chain))
                if pk:
                    pair_quote_fail[pk] += 1

            if name == "preview_opened":
                timed.pair_preview.append((ts, pk))
                if pk:
                    pair_preview[pk] += 1
                if sid and "swap_success" not in sessions_with_stage.get(sid, set()):
                    preview_abandon_sessions.add(sid)

            if name == "approve_clicked":
                if pk:
                    pair_approve[pk] += 1
                if sid:
                    approve_abandon_sessions.add(sid)

            if name == "unsupported_commission_route":
                timed.unsupported_pair.append((ts, pk))
                if pk:
                    pair_unsupported[pk] += 1
                fs = ev.get("fromSymbol") or ev.get("from")
                tsym = ev.get("toSymbol") or ev.get("to")
                if isinstance(fs, str) and isinstance(tsym, str):
                    uk = f"{chain or '?'}|{fs}|{tsym}"
                    pair_unsupported[uk] += 1

            if name == "chain_selected":
                cid = _safe_opt_int(ev.get("chainId"))
                swap_cap = ev.get("swapCapable")
                if cid is not None and swap_cap is False:
                    timed.unsupported_chain.append((ts, cid))
                    chain_unsupported_sel[cid] += 1

            if name == "swap_failure":
                timed.swap_failure.append((ts, pk, chain))

            if name == "swap_success":
                timed.swap_success.append((ts, pk, chain, _parse_amount(ev.get("fromAmount"))))
                if pk:
                    pair_swaps[pk] += 1
                if chain is not None:
                    chain_swaps[chain] += 1
                prov = ev.get("provider")
                if isinstance(prov, str):
                    provider_swap_counts[prov] += 1
                amt = _parse_amount(ev.get("fromAmount"))
                if amt is not None:
                    swap_amounts.append(amt)
                    if chain is not None:
                        swap_amounts_by_chain[chain].append(amt)
                    largest_swaps.append((ts, amt, pk or "unknown", chain))
                fee_wei = _parse_fee_wei(ev.get("feeToTreasuryWei"))
                ft = ev.get("feeToken")
                sym = "UNKNOWN"
                if isinstance(ft, dict) and isinstance(ft.get("symbol"), str):
                    sym = ft["symbol"]
                if fee_wei is not None:
                    fee_events.append((ts, sym, fee_wei))
                    timed.fee_events.append((ts, sym, fee_wei))
                    if pk:
                        timed.fee_events_by_pair.append((ts, pk, fee_wei))
                        pair_commission[pk] = pair_commission.get(pk, 0) + fee_wei
                    if chain is not None:
                        provider_commission[f"chain:{chain}"] = (
                            provider_commission.get(f"chain:{chain}", 0) + fee_wei
                        )
                    prov_s = ev.get("provider")
                    if isinstance(prov_s, str):
                        provider_commission[prov_s] = provider_commission.get(prov_s, 0) + fee_wei
                    largest_commission.append((ts, fee_wei, pk or sym))
                if ts < p4a_ms:
                    p4a_pre_swap += 1
                else:
                    p4a_post_swap += 1
                if sid and sid in approve_abandon_sessions:
                    approve_abandon_sessions.discard(sid)

    timed.fee_events = fee_events
    timed.largest_swaps = largest_swaps
    timed.largest_commission = largest_commission
    timed.pair_quotes_all = dict(pair_quotes)
    timed.pair_swaps_all = dict(pair_swaps)
    timed.pair_commission_all = dict(pair_commission)
    timed.pair_quote_fail_all = dict(pair_quote_fail)
    timed.pair_preview_all = dict(pair_preview)
    timed.chain_quotes_all = dict(chain_quotes)
    timed.chain_swaps_all = dict(chain_swaps)
    timed.chain_unsupported_all = dict(chain_unsupported_sel)

    # Commission windows
    comm_today = _commission_by_token_window(fee_events, today_ms, now_ms)
    comm_yesterday = _commission_by_token_window(fee_events, yesterday_ms, today_ms)
    comm_7d = _commission_by_token_window(fee_events, d7_ms, now_ms)
    comm_30d = _commission_by_token_window(fee_events, d30_ms, now_ms)
    comm_prior_7d = _commission_by_token_window(
        fee_events, d7_ms - (7 * 86400 * 1000), d7_ms
    )

    def _sum_wei(rows: list[dict[str, Any]]) -> int:
        return sum(int(r["fee_wei"]) for r in rows)

    # Funnel conversion
    funnel_stages_out: list[dict[str, Any]] = []
    prior_count: int | None = None
    largest_drop: dict[str, Any] | None = None
    max_drop = 0.0

    for stage in FUNNEL_STAGES:
        count = funnel_counts[stage]
        conv = _rate(count, prior_count) if prior_count is not None else None
        funnel_stages_out.append(
            {
                "stage": stage,
                "count": count,
                "conversion_from_prior_pct": conv,
            }
        )
        if prior_count is not None and prior_count > 0:
            drop = 100.0 - (100.0 * count / prior_count)
            if drop > max_drop:
                max_drop = drop
                largest_drop = {
                    "from_stage": FUNNEL_STAGES[FUNNEL_STAGES.index(stage) - 1],
                    "to_stage": stage,
                    "drop_pct": round(drop, 2),
                }
        prior_count = count

    def _top_pairs(
        data: dict[str, int],
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        return [
            {
                "pair_key": k,
                "pair_label": _pair_label_from_key(k),
                "count": v,
            }
            for k, v in sorted(data.items(), key=lambda kv: -kv[1])[:limit]
        ]

    def _pair_conversion_rank() -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for pk, q in pair_quotes.items():
            if q < 2:
                continue
            s = pair_swaps.get(pk, 0)
            rows.append(
                {
                    "pair_key": pk,
                    "pair_label": _pair_label_from_key(pk),
                    "quotes": q,
                    "swaps": s,
                    "conversion_pct": _rate(s, q),
                }
            )
        rows.sort(key=lambda r: (-(r["conversion_pct"] or 0), -r["quotes"]))
        return rows[:10]

    def _pair_abandon_rank() -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for pk, prev in pair_preview.items():
            if prev < 2:
                continue
            swaps = pair_swaps.get(pk, 0)
            abandon = max(0, prev - swaps)
            rows.append(
                {
                    "pair_key": pk,
                    "pair_label": _pair_label_from_key(pk),
                    "previews": prev,
                    "swaps": swaps,
                    "abandon_estimate": abandon,
                    "abandon_pct": _rate(abandon, prev),
                }
            )
        rows.sort(key=lambda r: (-r["abandon_estimate"], -r["previews"]))
        return rows[:10]

    def _featured_suggestions() -> list[dict[str, Any]]:
        suggestions: list[dict[str, Any]] = []
        for pk, q in sorted(pair_quotes.items(), key=lambda kv: -kv[1]):
            if q < 3:
                continue
            swaps = pair_swaps.get(pk, 0)
            conv = _rate(swaps, q) or 0.0
            comm = pair_commission.get(pk, 0)
            fails = pair_quote_fail.get(pk, 0)
            fail_rate = _rate(fails, fails + q) or 0.0
            if conv >= 40 and fail_rate < 20 and comm > 0:
                action = "promote"
            elif conv < 10 or fail_rate >= 40:
                action = "demote"
            elif q >= 5 and conv >= 20:
                action = "keep"
            else:
                action = "watch"
            suggestions.append(
                {
                    "pair_key": pk,
                    "pair_label": _pair_label_from_key(pk),
                    "quotes": q,
                    "swaps": swaps,
                    "conversion_pct": conv,
                    "commission_wei": str(comm),
                    "recommendation": action,
                }
            )
        suggestions.sort(
            key=lambda r: (
                {"promote": 0, "keep": 1, "watch": 2, "demote": 3}[r["recommendation"]],
                -r["quotes"],
            )
        )
        return suggestions[:15]

    chain_rows: list[dict[str, Any]] = []
    all_chain_ids = set(chain_quotes) | set(chain_swaps) | set(chain_unsupported_sel)
    for cid in sorted(all_chain_ids):
        recommendation = "swap_ready" if cid in SWAP_READY_CHAINS else "balance_view_only"
        if cid not in SWAP_READY_CHAINS and chain_unsupported_sel.get(cid, 0) >= 5:
            recommendation = "high_unsupported_swap_attempts"
        chain_rows.append(
            {
                "chain_id": cid,
                "quotes": chain_quotes.get(cid, 0),
                "unsupported_chain_selections": chain_unsupported_sel.get(cid, 0),
                "completed_swaps": chain_swaps.get(cid, 0),
                "recommendation": recommendation,
            }
        )

    largest_swaps.sort(key=lambda x: -x[1])
    largest_commission.sort(key=lambda x: -x[1])

    quote_ok = funnel_counts["quote_success"]
    quote_fail = event_counts.get("quote_failure", 0)

    alerts = _build_alerts(
        quote_success=quote_ok,
        quote_failure=quote_fail,
        unsupported_chain=sum(chain_unsupported_sel.values()),
        unsupported_pair=event_counts.get("unsupported_commission_route", 0),
        swap_failure=event_counts.get("swap_failure", 0),
        swap_success=funnel_counts["swap_success"],
        commission_7d_wei=_sum_wei(comm_7d),
        commission_prior_7d_wei=_sum_wei(comm_prior_7d),
        p4a_post_quote_success=p4a_post_quote,
        p4a_pre_quote_success=p4a_pre_quote,
    )

    from swaperex.api.operator_decision_support import (
        _day_bounds_extended,
        build_decision_support_payload,
    )

    bounds = _day_bounds_extended(now)
    p5b = build_decision_support_payload(
        timed,
        bounds,
        alerts=alerts,
        funnel_swap_success=funnel_counts["swap_success"],
        funnel_pair_selected=funnel_counts["pair_selected"],
        insight_batches=batches,
        now=now,
    )
    persist_snapshot = p5b.pop("persist_snapshot", None)

    scan = {
        "batches_scanned": batches_scanned,
        "events_scanned": events_scanned,
        "max_batches": max_batches,
        "scan_limited": bool(scan_metadata.get("scan_limited")) if scan_metadata else False,
        "scan_duration_ms": scan_metadata.get("scan_duration_ms") if scan_metadata else None,
        "total_batches_in_db": scan_metadata.get("total_batches_in_db") if scan_metadata else None,
    }

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now.isoformat(),
        "p4a_deploy_at": P4A_DEPLOY_ISO,
        "window": {
            "max_batches": max_batches,
            "batches_scanned": batches_scanned,
            "events_scanned": events_scanned,
            "scan": scan,
        },
        "telemetry_inventory_summary": {
            "distinct_event_types": len(event_counts),
            "event_counts": dict(sorted(event_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
            "never_visualized_before_p5a": [
                e
                for e in (
                    "quote_success",
                    "pair_selected",
                    "chain_selected",
                    "preview_opened",
                    "approve_clicked",
                )
                if event_counts.get(e, 0) > 0
            ],
        },
        "executive_summary": {
            "commission_today": comm_today,
            "commission_yesterday": comm_yesterday,
            "commission_7d": comm_7d,
            "commission_30d": comm_30d,
            "completed_swaps_7d": sum(
                1 for ts, _, _ in fee_events if _in_window(ts, d7_ms, now_ms)
            ),
            "quote_success_rate_pct": _rate(quote_ok, quote_ok + quote_fail),
            "p4a_comparison": {
                "quote_success_pre_deploy": p4a_pre_quote,
                "quote_success_post_deploy": p4a_post_quote,
                "swap_success_pre_deploy": p4a_pre_swap,
                "swap_success_post_deploy": p4a_post_swap,
                "note": "P4A deployed 2026-07-07; low sample until ingest accumulates.",
            },
        },
        "revenue": {
            "commission_by_chain": [
                {"chain_id": int(k.split(":")[1]), "fee_wei": str(v)}
                for k, v in sorted(
                    ((k, v) for k, v in provider_commission.items() if k.startswith("chain:")),
                    key=lambda kv: -kv[1],
                )
            ],
            "commission_by_pair": _top_pairs(pair_commission, 15),
            "commission_by_provider": [
                {"provider": k, "fee_wei": str(v)}
                for k, v in sorted(
                    ((k, v) for k, v in provider_commission.items() if not k.startswith("chain:")),
                    key=lambda kv: -kv[1],
                )
            ],
            "largest_swaps": [
                {
                    "timestamp_ms": t,
                    "from_amount": amt,
                    "pair_key": pk,
                    "chain_id": chain,
                }
                for t, amt, pk, chain in largest_swaps[:10]
            ],
            "largest_commission": [
                {"timestamp_ms": t, "fee_wei": str(wei), "pair_or_token": label}
                for t, wei, label in largest_commission[:10]
            ],
            "average_swap_size": round(sum(swap_amounts) / len(swap_amounts), 6)
            if swap_amounts
            else None,
            "median_swap_size": round(median(swap_amounts), 6) if swap_amounts else None,
            "swap_size_sample_count": len(swap_amounts),
        },
        "funnel": {
            "stages": funnel_stages_out,
            "largest_drop_off": largest_drop,
            "preview_abandonment_sessions": len(preview_abandon_sessions),
            "approve_abandonment_sessions": len(approve_abandon_sessions),
            "pair_selected_by_source": [
                {"source": k, "count": v}
                for k, v in sorted(pair_selected_by_source.items(), key=lambda kv: -kv[1])
            ],
            "limitations": [
                "No landing_page_view or wallet_connected events — funnel starts at pair_selected.",
                "Session correlation is client_session_id only; multi-tab users may duplicate.",
                "preview/approve abandonment is heuristic (preview without swap_success in same session).",
            ],
        },
        "pairs": {
            "top_requested": _top_pairs(pair_quotes),
            "top_revenue": _top_pairs(pair_commission),
            "top_conversion": _pair_conversion_rank(),
            "top_abandoned": _pair_abandon_rank(),
            "top_unsupported": _top_pairs(pair_unsupported),
            "featured_suggestions": _featured_suggestions(),
        },
        "chains": chain_rows,
        "quality": {
            "quote_failures": quote_fail,
            "swap_failures": event_counts.get("swap_failure", 0),
            "unsupported_commission_routes": event_counts.get("unsupported_commission_route", 0),
            "wallet_rejections": event_counts.get("wallet_rejected", 0),
            "rpc_failures": event_counts.get("rpc_failure", 0),
            "commission_missing": event_counts.get("commission_missing", 0),
        },
        "alerts": alerts,
        "decision_support": p5b,
        "_meta": {
            "limitations": [
                "Monitoring scan is DB-limited (default 500 batches, hard max 2000).",
                "Commission totals require feeToTreasuryWei on swap_success (receipt decode).",
                "No USD conversion in telemetry; wei/raw token units only.",
                "P4A funnel events only accumulate after client deploy e145b22.",
                "Daily snapshots are optional (persistDaily=true); append-only when enabled.",
                "Recommendations require minimum 7d quote sample (10+ for actionable guidance).",
            ],
            "persist_snapshot": persist_snapshot,
        },
    }
