"""P5B — Operational intelligence & daily decision support (read-only aggregates)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from swaperex.api.operator_intelligence import (
    _commission_by_token_window,
    _in_window,
    _pair_label_from_key,
    _rate,
)
from swaperex.ledger.models import MonitoringIngestBatch

P5B_SCHEMA_VERSION = 3
INSIGHT_STORE_SESSION_ID = "p5b-insight-store"
INSIGHT_ENVELOPE_KIND = "operator_daily_snapshot"

# P5B.1 — sample thresholds for honest operator guidance
MIN_QUOTES_INSUFFICIENT = 10
MIN_QUOTES_MEDIUM = 50
MIN_QUOTES_HIGH = 200

DEFAULT_MAX_BATCHES = 500
HARD_MAX_BATCHES = 2000

INSUFFICIENT_DATA_MESSAGE = (
    "Not enough telemetry yet to make reliable operational recommendations."
)
INSUFFICIENT_DATA_UI_HINT = (
    "Swaperex needs at least 10 quote events in the last 7 days before showing "
    "operational recommendations."
)

STATIC_FEATURED_PAIR_KEYS = frozenset(
    {
        "1|WETH|USDC",
        "1|WETH|USDT",
        "1|WETH|DAI",
        "56|WBNB|USDT",
        "56|WBNB|USDC",
        "56|WBNB|CAKE",
    }
)

MS_PER_DAY = 86_400_000


@dataclass
class TimedMetrics:
    """Append-only event logs collected in a single monitoring scan."""

    fee_events: list[tuple[int, str, int]] = field(default_factory=list)
    fee_events_by_pair: list[tuple[int, str, int]] = field(default_factory=list)
    quote_success: list[tuple[int, str | None, int | None]] = field(default_factory=list)
    quote_failure: list[tuple[int, str | None, int | None]] = field(default_factory=list)
    swap_success: list[tuple[int, str | None, int | None, float | None]] = field(
        default_factory=list
    )
    swap_failure: list[tuple[int, str | None, int | None]] = field(default_factory=list)
    pair_preview: list[tuple[int, str | None]] = field(default_factory=list)
    unsupported_pair: list[tuple[int, str | None]] = field(default_factory=list)
    unsupported_chain: list[tuple[int, int | None]] = field(default_factory=list)
    largest_swaps: list[tuple[int, float, str, int | None]] = field(default_factory=list)
    largest_commission: list[tuple[int, int, str]] = field(default_factory=list)

    pair_quotes_all: dict[str, int] = field(default_factory=dict)
    pair_swaps_all: dict[str, int] = field(default_factory=dict)
    pair_commission_all: dict[str, int] = field(default_factory=dict)
    pair_quote_fail_all: dict[str, int] = field(default_factory=dict)
    pair_preview_all: dict[str, int] = field(default_factory=dict)

    chain_quotes_all: dict[int, int] = field(default_factory=dict)
    chain_swaps_all: dict[int, int] = field(default_factory=dict)
    chain_unsupported_all: dict[int, int] = field(default_factory=dict)


def _sum_wei_rows(rows: list[dict[str, Any]]) -> int:
    return sum(int(r["fee_wei"]) for r in rows)


def _count_in_window(log: list[tuple], start_ms: int, end_ms: int, idx: int = 0) -> int:
    return sum(1 for row in log if _in_window(row[idx], start_ms, end_ms))


def _pair_counts_in_window(
    log: list[tuple],
    start_ms: int,
    end_ms: int,
    key_idx: int = 1,
) -> dict[str, int]:
    acc: dict[str, int] = {}
    for row in log:
        if not _in_window(row[0], start_ms, end_ms):
            continue
        pk = row[key_idx]
        if isinstance(pk, str) and pk:
            acc[pk] = acc.get(pk, 0) + 1
    return acc


def _chain_counts_in_window(
    log: list[tuple],
    start_ms: int,
    end_ms: int,
    key_idx: int = 1,
) -> dict[int, int]:
    acc: dict[int, int] = {}
    for row in log:
        if not _in_window(row[0], start_ms, end_ms):
            continue
        cid = row[key_idx]
        if isinstance(cid, int):
            acc[cid] = acc.get(cid, 0) + 1
    return acc


def _pct_change(current: int | float, prior: int | float) -> float | None:
    if prior == 0:
        return None if current == 0 else 100.0
    return round(100.0 * (float(current) - float(prior)) / float(prior), 2)


def quotes_7d_count(metrics: TimedMetrics, bounds: dict[str, int]) -> int:
    return _count_in_window(metrics.quote_success, bounds["d7_ms"], bounds["now_exclusive_ms"])


def build_data_confidence(quotes_7d: int) -> dict[str, Any]:
    """Shared confidence model for status, health score, and recommendations."""
    if quotes_7d < MIN_QUOTES_INSUFFICIENT:
        level = "insufficient"
        label = "INSUFFICIENT_DATA"
    elif quotes_7d < MIN_QUOTES_MEDIUM:
        level = "low"
        label = "LOW_CONFIDENCE"
    elif quotes_7d < MIN_QUOTES_HIGH:
        level = "medium"
        label = "MEDIUM_CONFIDENCE"
    else:
        level = "high"
        label = "HIGH_CONFIDENCE"

    return {
        "level": level,
        "label": label,
        "quotes_7d": quotes_7d,
        "minimum_required": MIN_QUOTES_INSUFFICIENT,
        "medium_threshold": MIN_QUOTES_MEDIUM,
        "high_threshold": MIN_QUOTES_HIGH,
        "message": INSUFFICIENT_DATA_MESSAGE if level == "insufficient" else None,
        "ui_hint": INSUFFICIENT_DATA_UI_HINT if level == "insufficient" else None,
    }


def _rec_confidence_from_samples(quotes_7d: int) -> str:
    if quotes_7d >= MIN_QUOTES_HIGH:
        return "high"
    if quotes_7d >= MIN_QUOTES_MEDIUM:
        return "medium"
    if quotes_7d >= MIN_QUOTES_INSUFFICIENT:
        return "low"
    return "insufficient"


def _allow_promote_demote(data_confidence: dict[str, Any]) -> bool:
    return data_confidence["level"] in ("medium", "high")


def _allow_actionable_recommendations(data_confidence: dict[str, Any]) -> bool:
    return data_confidence["level"] != "insufficient"


def _day_bounds_extended(now: datetime) -> dict[str, int]:
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    d7 = today - timedelta(days=7)
    d30 = today - timedelta(days=30)
    now_ms = int(now.timestamp() * 1000)
    today_ms = int(today.timestamp() * 1000)
    yesterday_ms = int(yesterday.timestamp() * 1000)
    d7_ms = int(d7.timestamp() * 1000)
    d30_ms = int(d30.timestamp() * 1000)
    return {
        "now_ms": now_ms,
        "now_exclusive_ms": now_ms + 1,
        "today_ms": today_ms,
        "yesterday_ms": yesterday_ms,
        "d7_ms": d7_ms,
        "d30_ms": d30_ms,
        "prior_7d_start_ms": d7_ms - 7 * MS_PER_DAY,
        "prior_30d_start_ms": d30_ms - 30 * MS_PER_DAY,
    }


def _window_summary(
    metrics: TimedMetrics,
    bounds: dict[str, int],
    start_ms: int,
    end_ms: int,
) -> dict[str, Any]:
    comm = _commission_by_token_window(metrics.fee_events, start_ms, end_ms)
    quotes = _count_in_window(metrics.quote_success, start_ms, end_ms)
    quote_fail = _count_in_window(metrics.quote_failure, start_ms, end_ms)
    swaps = _count_in_window(metrics.swap_success, start_ms, end_ms)
    swap_fail = _count_in_window(metrics.swap_failure, start_ms, end_ms)
    return {
        "commission_wei": _sum_wei_rows(comm),
        "commission_by_token": comm,
        "quote_count": quotes,
        "quote_failure_count": quote_fail,
        "quote_success_rate_pct": _rate(quotes, quotes + quote_fail),
        "swap_count": swaps,
        "swap_failure_count": swap_fail,
        "swap_success_rate_pct": _rate(swaps, swaps + swap_fail),
    }


def _top_from_counts(counts: dict[str, int], limit: int = 1) -> dict[str, Any] | None:
    if not counts:
        return None
    pk, n = max(counts.items(), key=lambda kv: kv[1])
    return {"pair_key": pk, "pair_label": _pair_label_from_key(pk), "count": n}


def _top_chain(counts: dict[int, int]) -> dict[str, Any] | None:
    if not counts:
        return None
    cid, n = max(counts.items(), key=lambda kv: kv[1])
    return {"chain_id": cid, "count": n}


def _largest_in_window(
    metrics: TimedMetrics,
    start_ms: int,
    end_ms: int,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    swap_best: tuple[int, float, str, int | None] | None = None
    for row in metrics.largest_swaps:
        if _in_window(row[0], start_ms, end_ms) and (swap_best is None or row[1] > swap_best[1]):
            swap_best = row
    comm_best: tuple[int, int, str] | None = None
    for row in metrics.largest_commission:
        if _in_window(row[0], start_ms, end_ms) and (comm_best is None or row[1] > comm_best[1]):
            comm_best = row
    swap_out = (
        {
            "from_amount": swap_best[1],
            "pair_key": swap_best[2],
            "chain_id": swap_best[3],
            "timestamp_ms": swap_best[0],
        }
        if swap_best
        else None
    )
    comm_out = (
        {
            "fee_wei": str(comm_best[1]),
            "pair_or_token": comm_best[2],
            "timestamp_ms": comm_best[0],
        }
        if comm_best
        else None
    )
    return swap_out, comm_out


def _pair_movers(
    today_counts: dict[str, int],
    prior_counts: dict[str, int],
    *,
    limit: int = 5,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    deltas: list[tuple[str, int, float | None]] = []
    all_keys = set(today_counts) | set(prior_counts)
    for pk in all_keys:
        cur = today_counts.get(pk, 0)
        prev = prior_counts.get(pk, 0)
        deltas.append((pk, cur - prev, _pct_change(cur, prev)))
    deltas.sort(key=lambda x: -x[1])
    best = deltas[0] if deltas and deltas[0][1] > 0 else None
    worst = min(deltas, key=lambda x: x[1]) if deltas else None
    if worst and worst[1] >= 0:
        worst = None
    return (
        {
            "pair_key": best[0],
            "pair_label": _pair_label_from_key(best[0]),
            "delta_quotes": best[1],
            "change_pct": best[2],
        }
        if best
        else None,
        {
            "pair_key": worst[0],
            "pair_label": _pair_label_from_key(worst[0]),
            "delta_quotes": worst[1],
            "change_pct": worst[2],
        }
        if worst
        else None,
    )


def _daily_status(
    *,
    today: dict[str, Any],
    yesterday: dict[str, Any],
    week: dict[str, Any],
    prior_week: dict[str, Any],
    alerts: list[dict[str, Any]],
    unsupported_chain: int,
    unsupported_pair: int,
    data_confidence: dict[str, Any],
) -> dict[str, Any]:
    if data_confidence["level"] == "insufficient":
        return {
            "level": "insufficient_data",
            "label": "INSUFFICIENT_DATA",
            "reasons": [data_confidence.get("message") or INSUFFICIENT_DATA_MESSAGE],
        }

    reasons_red: list[str] = []
    reasons_yellow: list[str] = []

    comm_chg = _pct_change(week["commission_wei"], prior_week["commission_wei"])
    if comm_chg is not None and comm_chg <= -30:
        reasons_red.append(f"7d commission down {abs(comm_chg):.1f}%")
    elif comm_chg is not None and comm_chg <= -15:
        reasons_yellow.append(f"7d commission down {abs(comm_chg):.1f}%")

    q_rate = today.get("quote_success_rate_pct")
    if q_rate is not None and q_rate < 70:
        reasons_red.append(f"Quote success rate {q_rate}% today")
    elif q_rate is not None and q_rate < 85:
        reasons_yellow.append(f"Quote success rate {q_rate}% today")

    s_rate = today.get("swap_success_rate_pct")
    if s_rate is not None and s_rate < 70 and today.get("swap_count", 0) >= 3:
        reasons_red.append(f"Swap success rate {s_rate}% today")
    elif s_rate is not None and s_rate < 85 and today.get("swap_count", 0) >= 3:
        reasons_yellow.append(f"Swap success rate {s_rate}% today")

    if any(a.get("severity") == "critical" for a in alerts):
        reasons_red.append("Critical operational alert active")

    if unsupported_chain >= 15:
        reasons_yellow.append(f"{unsupported_chain} unsupported chain selections (7d)")
    if unsupported_pair >= 15:
        reasons_yellow.append(f"{unsupported_pair} unsupported pair requests (7d)")

    day_comm_chg = _pct_change(today["commission_wei"], yesterday["commission_wei"])
    if day_comm_chg is not None and day_comm_chg <= -25 and today["commission_wei"] < yesterday["commission_wei"]:
        reasons_yellow.append(f"Commission down {abs(day_comm_chg):.1f}% vs yesterday")

    if reasons_red:
        level = "red"
        label = "Needs attention"
    elif reasons_yellow:
        level = "yellow"
        label = "Watch"
    elif data_confidence["level"] == "low":
        level = "yellow"
        label = "Watch"
        reasons_yellow.append(
            f"Low telemetry sample ({data_confidence['quotes_7d']} quotes in 7d) — collect more data"
        )
    else:
        level = "green"
        label = "Normal"

    return {
        "level": level,
        "label": label,
        "reasons": reasons_red + reasons_yellow,
    }


def build_daily_executive_summary(
    metrics: TimedMetrics,
    bounds: dict[str, int],
    alerts: list[dict[str, Any]],
    data_confidence: dict[str, Any],
) -> dict[str, Any]:
    today = _window_summary(metrics, bounds, bounds["today_ms"], bounds["now_exclusive_ms"])
    yesterday = _window_summary(metrics, bounds, bounds["yesterday_ms"], bounds["today_ms"])
    week = _window_summary(metrics, bounds, bounds["d7_ms"], bounds["now_exclusive_ms"])
    prior_week = _window_summary(
        metrics, bounds, bounds["prior_7d_start_ms"], bounds["d7_ms"]
    )
    month = _window_summary(metrics, bounds, bounds["d30_ms"], bounds["now_exclusive_ms"])
    prior_month = _window_summary(
        metrics, bounds, bounds["prior_30d_start_ms"], bounds["d30_ms"]
    )

    today_pairs = _pair_counts_in_window(
        metrics.quote_success, bounds["today_ms"], bounds["now_exclusive_ms"]
    )
    yesterday_pairs = _pair_counts_in_window(
        metrics.quote_success, bounds["yesterday_ms"], bounds["today_ms"]
    )
    today_chains = _chain_counts_in_window(
        metrics.quote_success, bounds["today_ms"], bounds["now_exclusive_ms"], 2
    )
    week_chains = _chain_counts_in_window(
        metrics.quote_success, bounds["d7_ms"], bounds["now_exclusive_ms"], 2
    )

    biggest_improvement, biggest_decline = _pair_movers(today_pairs, yesterday_pairs)
    largest_swap, largest_comm = _largest_in_window(
        metrics, bounds["today_ms"], bounds["now_exclusive_ms"]
    )

    unsupported_chain_7d = _count_in_window(
        metrics.unsupported_chain, bounds["d7_ms"], bounds["now_exclusive_ms"]
    )
    unsupported_pair_7d = _count_in_window(
        metrics.unsupported_pair, bounds["d7_ms"], bounds["now_exclusive_ms"]
    )

    status = _daily_status(
        today=today,
        yesterday=yesterday,
        week=week,
        prior_week=prior_week,
        alerts=alerts,
        unsupported_chain=unsupported_chain_7d,
        unsupported_pair=unsupported_pair_7d,
        data_confidence=data_confidence,
    )

    return {
        "status": status,
        "data_confidence": data_confidence,
        "commission_today": today["commission_by_token"],
        "commission_yesterday": yesterday["commission_by_token"],
        "commission_today_wei": today["commission_wei"],
        "commission_yesterday_wei": yesterday["commission_wei"],
        "commission_7d_wei": week["commission_wei"],
        "commission_prior_7d_wei": prior_week["commission_wei"],
        "commission_7d_change_pct": _pct_change(week["commission_wei"], prior_week["commission_wei"]),
        "swap_count_today": today["swap_count"],
        "swap_count_yesterday": yesterday["swap_count"],
        "quote_count_today": today["quote_count"],
        "quote_count_yesterday": yesterday["quote_count"],
        "quote_success_rate_pct_today": today["quote_success_rate_pct"],
        "swap_success_rate_pct_today": today["swap_success_rate_pct"],
        "largest_swap_today": largest_swap,
        "largest_commission_today": largest_comm,
        "top_chain_today": _top_chain(today_chains),
        "top_chain_7d": _top_chain(week_chains),
        "top_pair_today": _top_from_counts(today_pairs),
        "top_pair_7d": _top_from_counts(
            _pair_counts_in_window(metrics.quote_success, bounds["d7_ms"], bounds["now_exclusive_ms"])
        ),
        "biggest_improvement": biggest_improvement,
        "biggest_decline": biggest_decline,
        "windows": {
            "today": today,
            "yesterday": yesterday,
            "last_7d": week,
            "prior_7d": prior_week,
            "last_30d": month,
            "prior_30d": prior_month,
        },
    }


def build_trend_detection(metrics: TimedMetrics, bounds: dict[str, int]) -> dict[str, Any]:
    def _pair_trends(start_cur: int, end_cur: int, start_prior: int, end_prior: int) -> dict[str, list]:
        cur = _pair_counts_in_window(metrics.quote_success, start_cur, end_cur)
        prior = _pair_counts_in_window(metrics.quote_success, start_prior, end_prior)
        rows: list[dict[str, Any]] = []
        for pk in set(cur) | set(prior):
            c, p = cur.get(pk, 0), prior.get(pk, 0)
            if c + p < 2:
                continue
            chg = _pct_change(c, p)
            rows.append(
                {
                    "pair_key": pk,
                    "pair_label": _pair_label_from_key(pk),
                    "current": c,
                    "prior": p,
                    "change_pct": chg,
                    "delta": c - p,
                }
            )
        growing = sorted(
            [r for r in rows if (r["delta"] or 0) > 0],
            key=lambda r: (-(r["delta"] or 0), -(r["current"] or 0)),
        )[:10]
        declining = sorted(
            [r for r in rows if (r["delta"] or 0) < 0],
            key=lambda r: (r["delta"] or 0, r["prior"] or 0),
        )[:10]
        return {"growing": growing, "declining": declining}

    def _chain_trends(start_cur: int, end_cur: int, start_prior: int, end_prior: int) -> dict[str, list]:
        cur = _chain_counts_in_window(metrics.quote_success, start_cur, end_cur, 2)
        prior = _chain_counts_in_window(metrics.quote_success, start_prior, end_prior, 2)
        rows: list[dict[str, Any]] = []
        for cid in set(cur) | set(prior):
            c, p = cur.get(cid, 0), prior.get(cid, 0)
            if c + p < 1:
                continue
            rows.append(
                {
                    "chain_id": cid,
                    "current": c,
                    "prior": p,
                    "change_pct": _pct_change(c, p),
                    "delta": c - p,
                }
            )
        growing = sorted([r for r in rows if r["delta"] > 0], key=lambda r: -r["delta"])[:5]
        declining = sorted([r for r in rows if r["delta"] < 0], key=lambda r: r["delta"])[:5]
        return {"growing": growing, "declining": declining}

    day_pair = _pair_trends(bounds["today_ms"], bounds["now_exclusive_ms"], bounds["yesterday_ms"], bounds["today_ms"])
    week_pair = _pair_trends(bounds["d7_ms"], bounds["now_exclusive_ms"], bounds["prior_7d_start_ms"], bounds["d7_ms"])
    month_pair = _pair_trends(bounds["d30_ms"], bounds["now_exclusive_ms"], bounds["prior_30d_start_ms"], bounds["d30_ms"])

    week = _window_summary(metrics, bounds, bounds["d7_ms"], bounds["now_exclusive_ms"])
    prior_week = _window_summary(metrics, bounds, bounds["prior_7d_start_ms"], bounds["d7_ms"])
    month = _window_summary(metrics, bounds, bounds["d30_ms"], bounds["now_exclusive_ms"])
    prior_month = _window_summary(metrics, bounds, bounds["prior_30d_start_ms"], bounds["d30_ms"])

    return {
        "pairs": {
            "today_vs_yesterday": day_pair,
            "last_7d_vs_prior_7d": week_pair,
            "last_30d_vs_prior_30d": month_pair,
        },
        "chains": {
            "today_vs_yesterday": _chain_trends(
                bounds["today_ms"], bounds["now_exclusive_ms"], bounds["yesterday_ms"], bounds["today_ms"]
            ),
            "last_7d_vs_prior_7d": _chain_trends(
                bounds["d7_ms"], bounds["now_exclusive_ms"], bounds["prior_7d_start_ms"], bounds["d7_ms"]
            ),
        },
        "commission": {
            "today_wei": _window_summary(metrics, bounds, bounds["today_ms"], bounds["now_exclusive_ms"])["commission_wei"],
            "yesterday_wei": _window_summary(metrics, bounds, bounds["yesterday_ms"], bounds["today_ms"])[
                "commission_wei"
            ],
            "last_7d_wei": week["commission_wei"],
            "prior_7d_wei": prior_week["commission_wei"],
            "change_7d_pct": _pct_change(week["commission_wei"], prior_week["commission_wei"]),
            "last_30d_wei": month["commission_wei"],
            "prior_30d_wei": prior_month["commission_wei"],
            "change_30d_pct": _pct_change(month["commission_wei"], prior_month["commission_wei"]),
        },
        "quotes": {
            "today": _count_in_window(metrics.quote_success, bounds["today_ms"], bounds["now_exclusive_ms"]),
            "yesterday": _count_in_window(
                metrics.quote_success, bounds["yesterday_ms"], bounds["today_ms"]
            ),
            "last_7d": week["quote_count"],
            "prior_7d": prior_week["quote_count"],
            "change_7d_pct": _pct_change(week["quote_count"], prior_week["quote_count"]),
        },
        "swaps": {
            "today": _count_in_window(metrics.swap_success, bounds["today_ms"], bounds["now_exclusive_ms"]),
            "yesterday": _count_in_window(
                metrics.swap_success, bounds["yesterday_ms"], bounds["today_ms"]
            ),
            "last_7d": week["swap_count"],
            "prior_7d": prior_week["swap_count"],
            "change_7d_pct": _pct_change(week["swap_count"], prior_week["swap_count"]),
        },
        "note": "Measured change only — no forecasting.",
    }


def _pair_feature_score(
    pk: str,
    *,
    quotes: int,
    swaps: int,
    commission: int,
    fails: int,
    previews: int,
    quotes_prior: int,
) -> tuple[float, str]:
    conv = _rate(swaps, quotes) or 0.0
    fail_rate = _rate(fails, fails + quotes) or 0.0
    abandon = max(0, previews - swaps)
    abandon_rate = _rate(abandon, previews) if previews else 0.0
    growth = _pct_change(quotes, quotes_prior) if quotes_prior else (100.0 if quotes >= 3 else 0.0)
    growth = growth or 0.0

    score = 0.0
    score += min(quotes, 50) * 1.2
    score += conv * 0.8
    score += math.log10(commission + 1) * 15
    score -= fail_rate * 0.6
    score -= (abandon_rate or 0) * 0.4
    score += max(-20, min(20, growth * 0.3))

    reasons: list[str] = []
    if quotes >= 5:
        reasons.append(f"{quotes} quotes")
    if conv >= 30:
        reasons.append(f"{conv}% conversion")
    if commission > 0:
        reasons.append("earns commission")
    if fail_rate >= 25:
        reasons.append(f"{fail_rate}% quote failures")
    if growth >= 20:
        reasons.append(f"+{growth}% quote growth")
    elif growth <= -20:
        reasons.append(f"{growth}% quote decline")

    return round(score, 2), "; ".join(reasons) if reasons else "insufficient signal"


def build_featured_pair_automation(metrics: TimedMetrics, bounds: dict[str, int]) -> dict[str, Any]:
    quotes_7d = _pair_counts_in_window(metrics.quote_success, bounds["d7_ms"], bounds["now_exclusive_ms"])
    quotes_prior_7d = _pair_counts_in_window(
        metrics.quote_success, bounds["prior_7d_start_ms"], bounds["d7_ms"]
    )
    swaps_7d = _pair_counts_in_window(metrics.swap_success, bounds["d7_ms"], bounds["now_exclusive_ms"])
    fails_7d = _pair_counts_in_window(metrics.quote_failure, bounds["d7_ms"], bounds["now_exclusive_ms"])
    previews_7d = _pair_counts_in_window(metrics.pair_preview, bounds["d7_ms"], bounds["now_exclusive_ms"])

    scored: list[dict[str, Any]] = []
    all_pairs = (
        set(quotes_7d)
        | set(metrics.pair_quotes_all)
        | STATIC_FEATURED_PAIR_KEYS
    )
    for pk in all_pairs:
        q = quotes_7d.get(pk, 0)
        if q < 1 and pk not in STATIC_FEATURED_PAIR_KEYS:
            continue
        s = swaps_7d.get(pk, 0)
        comm = 0
        for ts, pk_fee, wei in metrics.fee_events_by_pair:
            if pk_fee == pk and _in_window(ts, bounds["d7_ms"], bounds["now_exclusive_ms"]):
                comm += wei
        f = fails_7d.get(pk, 0)
        p = previews_7d.get(pk, 0)
        qp = quotes_prior_7d.get(pk, 0)
        score, reasoning = _pair_feature_score(
            pk, quotes=q, swaps=s, commission=comm, fails=f, previews=p, quotes_prior=qp
        )
        scored.append(
            {
                "pair_key": pk,
                "pair_label": _pair_label_from_key(pk),
                "score": score,
                "quotes_7d": q,
                "swaps_7d": s,
                "commission_wei": str(comm),
                "reasoning": reasoning,
                "currently_featured": pk in STATIC_FEATURED_PAIR_KEYS,
            }
        )

    scored.sort(key=lambda r: -r["score"])
    quotes_global = quotes_7d_count(metrics, bounds)
    recommended = [r for r in scored if r["score"] >= 10][:6]
    removal = [
        r
        for r in scored
        if r["currently_featured"]
        and quotes_global >= MIN_QUOTES_INSUFFICIENT
        and (r["quotes_7d"] < 2 or r["score"] < 5)
    ]

    return {
        "recommended_featured": recommended,
        "recommended_removal": removal,
        "static_featured_keys": sorted(STATIC_FEATURED_PAIR_KEYS),
        "scoring_note": "7d window: quotes, conversion, commission, failures, abandonment, growth.",
    }


def build_health_score(
    metrics: TimedMetrics,
    bounds: dict[str, int],
    alerts: list[dict[str, Any]],
    funnel_swap_success: int,
    funnel_pair_selected: int,
    data_confidence: dict[str, Any],
) -> dict[str, Any]:
    if data_confidence["level"] == "insufficient":
        return {
            "score": None,
            "sufficient": False,
            "caution": None,
            "deductions": [],
            "dimensions": [
                "swap_reliability",
                "revenue_stability",
                "commission_trend",
                "conversion",
                "unsupported_demand",
                "operational_alerts",
            ],
            "message": INSUFFICIENT_DATA_MESSAGE,
        }

    score = 100
    deductions: list[dict[str, Any]] = []
    caution = (
        "Health score shown with low sample — interpret cautiously."
        if data_confidence["level"] == "low"
        else None
    )

    week = _window_summary(metrics, bounds, bounds["d7_ms"], bounds["now_exclusive_ms"])
    prior_week = _window_summary(metrics, bounds, bounds["prior_7d_start_ms"], bounds["d7_ms"])

    swap_fail_rate = week.get("swap_success_rate_pct")
    if swap_fail_rate is not None:
        fail_pct = 100.0 - swap_fail_rate
        if fail_pct >= 15:
            deductions.append({"dimension": "swap_reliability", "points": 25, "reason": f"{fail_pct:.1f}% swap failures (7d)"})
            score -= 25
        elif fail_pct >= 8:
            deductions.append({"dimension": "swap_reliability", "points": 12, "reason": f"{fail_pct:.1f}% swap failures (7d)"})
            score -= 12

    comm_chg = _pct_change(week["commission_wei"], prior_week["commission_wei"])
    if comm_chg is not None and comm_chg <= -30:
        deductions.append({"dimension": "revenue_stability", "points": 20, "reason": f"Commission down {abs(comm_chg):.1f}% (7d)"})
        score -= 20
    elif comm_chg is not None and comm_chg <= -15:
        deductions.append({"dimension": "revenue_stability", "points": 10, "reason": f"Commission down {abs(comm_chg):.1f}% (7d)"})
        score -= 10

    if comm_chg is not None and comm_chg < 0:
        pts = min(15, int(abs(comm_chg) / 3))
        if pts >= 5:
            deductions.append({"dimension": "commission_trend", "points": pts, "reason": f"Negative 7d commission trend ({comm_chg:.1f}%)"})
            score -= pts

    conv = _rate(funnel_swap_success, funnel_pair_selected)
    if conv is not None and conv < 15 and funnel_pair_selected >= 5:
        deductions.append({"dimension": "conversion", "points": 15, "reason": f"Funnel conversion {conv}% (pair→swap)"})
        score -= 15
    elif conv is not None and conv < 30 and funnel_pair_selected >= 5:
        deductions.append({"dimension": "conversion", "points": 8, "reason": f"Funnel conversion {conv}% (pair→swap)"})
        score -= 8

    unsup_chain = _count_in_window(metrics.unsupported_chain, bounds["d7_ms"], bounds["now_exclusive_ms"])
    unsup_pair = _count_in_window(metrics.unsupported_pair, bounds["d7_ms"], bounds["now_exclusive_ms"])
    unsup_total = unsup_chain + unsup_pair
    quotes_7d = week["quote_count"] or 1
    unsup_ratio = 100.0 * unsup_total / quotes_7d
    if unsup_ratio >= 30:
        deductions.append({"dimension": "unsupported_demand", "points": 15, "reason": f"High unsupported demand ({unsup_ratio:.0f}% of quotes)"})
        score -= 15
    elif unsup_ratio >= 15:
        deductions.append({"dimension": "unsupported_demand", "points": 8, "reason": f"Elevated unsupported demand ({unsup_ratio:.0f}% of quotes)"})
        score -= 8

    for alert in alerts:
        sev = alert.get("severity")
        if sev == "critical":
            deductions.append({"dimension": "operational_alerts", "points": 10, "reason": alert.get("trigger", "critical alert")})
            score -= 10
        elif sev == "warning":
            deductions.append({"dimension": "operational_alerts", "points": 5, "reason": alert.get("trigger", "warning alert")})
            score -= 5

    score = max(0, min(100, score))
    return {
        "score": score,
        "sufficient": True,
        "caution": caution,
        "deductions": deductions,
        "dimensions": [
            "swap_reliability",
            "revenue_stability",
            "commission_trend",
            "conversion",
            "unsupported_demand",
            "operational_alerts",
        ],
    }


def build_operator_recommendations(
    metrics: TimedMetrics,
    bounds: dict[str, int],
    daily_summary: dict[str, Any],
    trends: dict[str, Any],
    featured: dict[str, Any],
    health: dict[str, Any],
    data_confidence: dict[str, Any],
) -> list[dict[str, Any]]:
    recs: list[dict[str, Any]] = []
    quotes_7d = data_confidence["quotes_7d"]

    if data_confidence["level"] == "insufficient":
        return [
            {
                "id": "collect_more_data",
                "title": "Collect more telemetry before making decisions",
                "reason": INSUFFICIENT_DATA_MESSAGE,
                "evidence": f"{quotes_7d} quote_success events in 7d (minimum {MIN_QUOTES_INSUFFICIENT})",
                "confidence": "insufficient",
                "sample_size": quotes_7d,
                "action": "Wait for more swap activity; re-check after P4A funnel events accumulate.",
                "priority": "low",
            }
        ]

    if data_confidence["level"] == "low":
        recs.append(
            {
                "id": "collect_more_data_low",
                "title": "Low sample — watch pairs before promoting or demoting",
                "reason": (
                    f"Only {quotes_7d} quotes in 7d — below {MIN_QUOTES_MEDIUM} needed for "
                    "medium-confidence pair actions."
                ),
                "evidence": f"7d quote_success count: {quotes_7d}",
                "confidence": "low",
                "sample_size": quotes_7d,
                "action": "Collect more swap activity before changing featured pairs.",
                "priority": "medium",
            }
        )

    if _allow_promote_demote(data_confidence):
        for row in featured.get("recommended_featured", [])[:3]:
            if row.get("currently_featured"):
                continue
            pair_q = int(row.get("quotes_7d") or 0)
            conf = _rec_confidence_from_samples(quotes_7d)
            recs.append(
                {
                    "id": f"promote_{row['pair_key']}",
                    "title": f"Promote {row['pair_label']}",
                    "reason": "High featured-pair score from observed 7d telemetry",
                    "evidence": row.get("reasoning", ""),
                    "confidence": conf,
                    "sample_size": quotes_7d,
                    "pair_quotes_7d": pair_q,
                    "action": f"Add {row['pair_label']} to featured chips after product review",
                    "priority": "high" if conf == "high" else "medium",
                }
            )

        for row in featured.get("recommended_removal", [])[:2]:
            pair_q = int(row.get("quotes_7d") or 0)
            conf = _rec_confidence_from_samples(quotes_7d)
            recs.append(
                {
                    "id": f"demote_{row['pair_key']}",
                    "title": f"Review featured placement for {row['pair_label']}",
                    "reason": "Low 7d engagement or poor score while currently featured",
                    "evidence": row.get("reasoning", ""),
                    "confidence": conf,
                    "sample_size": quotes_7d,
                    "pair_quotes_7d": pair_q,
                    "action": "Consider demoting or replacing in featured list",
                    "priority": "medium",
                }
            )

    fails_7d = _pair_counts_in_window(metrics.quote_failure, bounds["d7_ms"], bounds["now_exclusive_ms"])
    for pk, cnt in sorted(fails_7d.items(), key=lambda kv: -kv[1])[:3]:
        if cnt < 3:
            continue
        q = metrics.pair_quotes_all.get(pk, 0)
        fail_rate = _rate(cnt, cnt + q)
        if fail_rate is not None and fail_rate >= 20:
            conf = _rec_confidence_from_samples(quotes_7d)
            if conf == "insufficient":
                continue
            recs.append(
                {
                    "id": f"investigate_qf_{pk}",
                    "title": f"Investigate quote failures on {_pair_label_from_key(pk)}",
                    "reason": f"Elevated quote failure rate ({fail_rate}%)",
                    "evidence": f"{cnt} quote_failure events in 7d window",
                    "confidence": conf,
                    "sample_size": quotes_7d,
                    "pair_quotes_7d": cnt,
                    "action": "Check Failures tab for reason codes; verify wrapper/RPC health",
                    "priority": "high" if fail_rate >= 30 and conf == "high" else "medium",
                }
            )

    poly = sum(
        1
        for row in metrics.unsupported_chain
        if _in_window(row[0], bounds["d7_ms"], bounds["now_exclusive_ms"]) and row[1] == 137
    )
    if poly >= 5 and _allow_actionable_recommendations(data_confidence):
        recs.append(
            {
                "id": "polygon_demand",
                "title": "Polygon demand remains limited",
                "reason": f"{poly} balance-view chain selections on Polygon (7d)",
                "evidence": "chain_selected with swapCapable=false",
                "confidence": _rec_confidence_from_samples(quotes_7d),
                "sample_size": quotes_7d,
                "action": "Do not expand wrappers; monitor for sustained swap intent",
                "priority": "low",
            }
        )
    elif poly > 0 and _allow_actionable_recommendations(data_confidence):
        recs.append(
            {
                "id": "polygon_insignificant",
                "title": "Polygon demand remains insignificant",
                "reason": f"Only {poly} Polygon selection(s) in 7d",
                "evidence": "Insufficient evidence for Polygon wrapper",
                "confidence": "high" if quotes_7d >= MIN_QUOTES_HIGH else _rec_confidence_from_samples(quotes_7d),
                "sample_size": quotes_7d,
                "action": "No chain expansion",
                "priority": "low",
            }
        )

    unsup_chain_7d = _count_in_window(metrics.unsupported_chain, bounds["d7_ms"], bounds["now_exclusive_ms"])
    unsup_prior = _count_in_window(
        metrics.unsupported_chain, bounds["prior_7d_start_ms"], bounds["d7_ms"]
    )
    if unsup_chain_7d > unsup_prior and unsup_chain_7d >= 5 and _allow_actionable_recommendations(data_confidence):
        chg = _pct_change(unsup_chain_7d, unsup_prior)
        recs.append(
            {
                "id": "unsupported_chain_up",
                "title": "Unsupported chain requests increased",
                "reason": f"7d unsupported chain selections: {unsup_chain_7d} (was {unsup_prior})",
                "evidence": f"Change {chg}% vs prior 7d" if chg is not None else "",
                "confidence": _rec_confidence_from_samples(quotes_7d),
                "sample_size": quotes_7d,
                "action": "Review chain banner UX; do not expand without product sign-off",
                "priority": "medium",
            }
        )

    comm_chg = daily_summary.get("commission_7d_change_pct")
    if (
        comm_chg is not None
        and comm_chg <= -15
        and data_confidence["level"] in ("medium", "high")
    ):
        conf = _rec_confidence_from_samples(quotes_7d)
        recs.append(
            {
                "id": "commission_down",
                "title": f"Commission down {abs(comm_chg):.0f}%",
                "reason": "7d commission wei below prior 7d window",
                "evidence": (
                    f"Current {daily_summary.get('commission_7d_wei')} wei vs "
                    f"prior {daily_summary.get('commission_prior_7d_wei')} wei"
                ),
                "confidence": conf,
                "sample_size": quotes_7d,
                "action": "Check swap volume, pair mix, and commission_missing events",
                "priority": "high" if comm_chg <= -25 else "medium",
            }
        )

    q_chg = trends.get("quotes", {}).get("change_7d_pct")
    if (
        q_chg is not None
        and q_chg >= 15
        and data_confidence["level"] in ("medium", "high")
    ):
        recs.append(
            {
                "id": "quote_success_improved",
                "title": "Quote volume improved",
                "reason": f"Quote success events up {q_chg}% vs prior 7d",
                "evidence": f"7d quotes: {trends['quotes']['last_7d']}",
                "confidence": _rec_confidence_from_samples(quotes_7d),
                "sample_size": quotes_7d,
                "action": "Identify top growing pairs and ensure featured alignment",
                "priority": "medium",
            }
        )

    if (
        health.get("score") is not None
        and health["score"] >= 80
        and featured.get("recommended_featured")
        and data_confidence["level"] in ("medium", "high")
    ):
        top = featured["recommended_featured"][0]
        recs.insert(
            0,
            {
                "id": "top_commission_action",
                "title": f"Highest-impact action: promote {top['pair_label']}",
                "reason": "Best combined score for commission lift today",
                "evidence": top.get("reasoning", ""),
                "confidence": _rec_confidence_from_samples(quotes_7d),
                "sample_size": quotes_7d,
                "pair_quotes_7d": int(top.get("quotes_7d") or 0),
                "action": f"Feature {top['pair_label']} and monitor 48h conversion",
                "priority": "high" if data_confidence["level"] == "high" else "medium",
            },
        )

    priority_order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: priority_order.get(r.get("priority", "low"), 9))
    return recs[:12]


def extract_insight_snapshots(batches: list[MonitoringIngestBatch]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for batch in batches:
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        if env.get("kind") != INSIGHT_ENVELOPE_KIND:
            continue
        snap = env.get("snapshot")
        if isinstance(snap, dict):
            out.append(
                {
                    "batch_id": batch.id,
                    "received_at": batch.received_at.isoformat() if batch.received_at else None,
                    **snap,
                }
            )
    out.sort(key=lambda s: s.get("day", ""), reverse=True)
    return out


def build_condensed_snapshot(
    day: str,
    daily_summary: dict[str, Any],
    health: dict[str, Any],
    trends: dict[str, Any],
) -> dict[str, Any]:
    return {
        "day": day,
        "status_level": daily_summary.get("status", {}).get("level"),
        "health_score": health.get("score"),
        "commission_today_wei": daily_summary.get("commission_today_wei"),
        "commission_yesterday_wei": daily_summary.get("commission_yesterday_wei"),
        "commission_7d_change_pct": daily_summary.get("commission_7d_change_pct"),
        "quote_count_today": daily_summary.get("quote_count_today"),
        "swap_count_today": daily_summary.get("swap_count_today"),
        "quote_success_rate_pct_today": daily_summary.get("quote_success_rate_pct_today"),
        "top_pair_today": daily_summary.get("top_pair_today"),
        "commission_trend_7d_pct": trends.get("commission", {}).get("change_7d_pct"),
    }


def snapshot_exists_for_day(batches: list[MonitoringIngestBatch], day: str) -> bool:
    for batch in batches:
        env = batch.envelope if isinstance(batch.envelope, dict) else {}
        if env.get("kind") != INSIGHT_ENVELOPE_KIND:
            continue
        snap = env.get("snapshot")
        if isinstance(snap, dict) and snap.get("day") == day:
            return True
    return False


def make_insight_envelope(snapshot: dict[str, Any], exported_at_ms: int) -> dict[str, Any]:
    return {
        "schemaVersion": P5B_SCHEMA_VERSION,
        "kind": INSIGHT_ENVELOPE_KIND,
        "clientSessionId": INSIGHT_STORE_SESSION_ID,
        "exportedAt": exported_at_ms,
        "events": [],
        "snapshot": snapshot,
    }


async def persist_daily_snapshot_if_needed(
    session: Any,
    batches: list[MonitoringIngestBatch],
    snapshot: dict[str, Any] | None,
    *,
    exported_at_ms: int,
) -> bool:
    """Append one daily snapshot row to monitoring ingest (reuses existing table)."""
    if not snapshot or not isinstance(snapshot.get("day"), str):
        return False
    day = snapshot["day"]
    if snapshot_exists_for_day(batches, day):
        return False
    row = MonitoringIngestBatch(
        schema_version=P5B_SCHEMA_VERSION,
        client_session_id=INSIGHT_STORE_SESSION_ID,
        exported_at_ms=exported_at_ms,
        event_count=0,
        envelope=make_insight_envelope(snapshot, exported_at_ms),
    )
    session.add(row)
    await session.commit()
    return True


def build_insight_history(
    batches: list[MonitoringIngestBatch],
    current_day: str,
    current_snapshot: dict[str, Any],
) -> dict[str, Any]:
    stored = extract_insight_snapshots(batches)
    by_day = {s["day"]: s for s in stored if isinstance(s.get("day"), str)}

    def _get(day_offset: int) -> dict[str, Any] | None:
        target = (datetime.fromisoformat(current_day).date() - timedelta(days=day_offset)).isoformat()
        if target == current_day:
            return current_snapshot
        return by_day.get(target)

    return {
        "today": current_snapshot,
        "yesterday": _get(1),
        "days_7_ago": _get(7),
        "days_30_ago": _get(30),
        "stored_days": sorted(by_day.keys(), reverse=True)[:30],
        "storage": {
            "method": "monitoring_ingest_batches",
            "session_id": INSIGHT_STORE_SESSION_ID,
            "kind": INSIGHT_ENVELOPE_KIND,
        },
    }


def build_decision_support_payload(
    metrics: TimedMetrics,
    bounds: dict[str, int],
    *,
    alerts: list[dict[str, Any]],
    funnel_swap_success: int,
    funnel_pair_selected: int,
    insight_batches: list[MonitoringIngestBatch],
    now: datetime,
) -> dict[str, Any]:
    q7 = quotes_7d_count(metrics, bounds)
    data_confidence = build_data_confidence(q7)
    daily = build_daily_executive_summary(metrics, bounds, alerts, data_confidence)
    trends = build_trend_detection(metrics, bounds)
    featured = build_featured_pair_automation(metrics, bounds)
    health = build_health_score(
        metrics,
        bounds,
        alerts,
        funnel_swap_success,
        funnel_pair_selected,
        data_confidence,
    )
    recommendations = build_operator_recommendations(
        metrics, bounds, daily, trends, featured, health, data_confidence
    )
    day_str = now.strftime("%Y-%m-%d")
    condensed = build_condensed_snapshot(day_str, daily, health, trends)
    history = build_insight_history(insight_batches, day_str, condensed)

    return {
        "schema_version": P5B_SCHEMA_VERSION,
        "data_confidence": data_confidence,
        "daily_executive_summary": daily,
        "recommendations": recommendations,
        "trends": trends,
        "featured_automation": featured,
        "health_score": health,
        "insight_history": history,
        "persist_snapshot": condensed,
    }
