"""P3.4 — Read-only operational health from persisted monitoring (telemetry-only).

Does not prove treasury settlement or accounting correctness. No automated actions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from swaperex.api.swap_lifecycle_reconstruction import build_swap_lifecycles_payload

HEALTH_ALERTS_SCHEMA_VERSION = "p3.4.0"

_MIN_EVENTS_STRICT = 20
_MIN_WALLET_RATE_SAMPLE = 5
_MIN_LIFECYCLE_RATIO_SAMPLE = 10
_FRESH_OK_SEC = 30 * 60
_FRESH_WARN_SEC = 2 * 60 * 60


def _max_severity(a: str, b: str) -> str:
    opts = ("OK", "LOW", "MEDIUM", "HIGH")
    ia = opts.index(a) if a in opts else 0
    ib = opts.index(b) if b in opts else 0
    return opts[max(ia, ib)]


def _iso_received_at(dt: Any) -> str:
    if dt is None:
        return ""
    try:
        d = dt
        if getattr(d, "tzinfo", None) is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()
    except Exception:
        return ""


def _flatten_monitoring_events(batches: list[Any]) -> list[dict[str, Any]]:
    """Return envelope events only."""
    flat: list[dict[str, Any]] = []
    for batch in batches:
        env = batch.envelope if isinstance(getattr(batch, "envelope", None), dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            if isinstance(ev, dict):
                flat.append(ev)
    return flat


def _event_ts_bounds(events: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    ts_vals: list[int] = []
    for ev in events:
        raw = ev.get("ts")
        if isinstance(raw, (int, float)) and int(raw) > 0:
            ts_vals.append(int(raw))
    if not ts_vals:
        return None, None
    lo = min(ts_vals)
    hi = max(ts_vals)
    try:
        return (
            datetime.fromtimestamp(lo / 1000.0, tz=timezone.utc).isoformat(),
            datetime.fromtimestamp(hi / 1000.0, tz=timezone.utc).isoformat(),
        )
    except (OverflowError, OSError, ValueError):
        return None, None


def _scan_wrapper_fee_flags(batches: list[Any]) -> dict[str, int]:
    """Align with P3.2 reconciliation rules (import at runtime to avoid circular imports)."""
    from swaperex.api.routes import admin_readonly as ar

    out = {
        "telemetry_zero_fee": 0,
        "telemetry_missing_fee": 0,
        "route_wrapper_mismatch": 0,
        "missing_expected_bps": 0,
    }
    for batch in batches:
        env = batch.envelope if isinstance(getattr(batch, "envelope", None), dict) else {}
        events = env.get("events")
        if not isinstance(events, list):
            continue
        for ev in events:
            if not isinstance(ev, dict) or ev.get("event") != "swap_success":
                continue
            chain = ar._safe_opt_int(ev.get("chainId"))
            if chain is None:
                continue
            is_wrapper = ar._is_wrapper_swap_event(ev)
            fee_key_present = "feeToTreasuryWei" in ev
            parsed_fee = ar._parse_fee_wei_decimal(ev.get("feeToTreasuryWei")) if fee_key_present else None
            expected_bps, _ = ar._expected_fee_bps_from_static_table(chain, ev)
            chain_ok = ar._chain_wrapper_consistent(chain, ev)
            route_ok = ar._route_wrapper_consistent(ev)

            if not is_wrapper:
                continue
            if not chain_ok or not route_ok:
                out["route_wrapper_mismatch"] += 1
                continue
            if expected_bps is None:
                out["missing_expected_bps"] += 1
            if not fee_key_present:
                out["telemetry_missing_fee"] += 1
            elif parsed_fee is not None and parsed_fee == 0 and expected_bps and expected_bps > 0:
                out["telemetry_zero_fee"] += 1
    return out


def build_health_alerts_payload(
    batches: list[Any],
    *,
    max_batches_scanned: int,
) -> dict[str, Any]:
    """Build health-alerts JSON from monitoring ingest batches (read-only)."""
    generated_at = datetime.now(timezone.utc).isoformat()
    now = datetime.now(timezone.utc)

    events = _flatten_monitoring_events(batches)
    total_events = len(events)
    oldest_ev, newest_ev = _event_ts_bounds(events)

    counts: dict[str, int] = {}
    for ev in events:
        name = ev.get("event")
        if not isinstance(name, str) or not name.strip():
            continue
        k = name.strip()
        counts[k] = counts.get(k, 0) + 1

    swap_success_count = counts.get("swap_success", 0)
    wallet_rejected_count = counts.get("wallet_rejected", 0)
    quote_failure_count = counts.get("quote_failure", 0)
    swap_failure_count = counts.get("swap_failure", 0)

    fee_flags = _scan_wrapper_fee_flags(batches)
    revenue_zero = int(fee_flags["telemetry_zero_fee"])
    revenue_missing = int(fee_flags["telemetry_missing_fee"])
    route_mismatch = int(fee_flags["route_wrapper_mismatch"])
    missing_expected_bps = int(fee_flags["missing_expected_bps"])

    lc = build_swap_lifecycles_payload(list(batches), max_recent=5000)
    lc_sum = lc.get("summary") if isinstance(lc.get("summary"), dict) else {}
    lifecycle_total = int(lc_sum.get("total_lifecycles", 0) or 0)
    lifecycle_incomplete = int(lc_sum.get("incomplete", 0) or 0)
    lifecycle_orphaned = int(lc_sum.get("orphaned", 0) or 0)

    checks: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    # --- Latest ingest freshness (server received_at) ---
    latest_recv: datetime | None = None
    for batch in batches:
        ra = getattr(batch, "received_at", None)
        if ra is None:
            continue
        dt = ra
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if latest_recv is None or dt > latest_recv:
            latest_recv = dt

    age_sec: float | None = None
    if latest_recv is not None:
        age_sec = max(0.0, (now - latest_recv).total_seconds())

    if latest_recv is None or not batches:
        fresh_status = "unknown"
        fresh_severity = "OK"
        fresh_reason = "No monitoring ingest batches in scanned window."
        fresh_val = "no batches"
        fresh_thr = f"<= {_FRESH_OK_SEC // 60}m healthy"
    elif age_sec is not None and age_sec <= _FRESH_OK_SEC:
        fresh_status = "healthy"
        fresh_severity = "OK"
        fresh_reason = "Latest batch received within expected operator window."
        fresh_val = f"{int(age_sec // 60)}m since last ingest"
        fresh_thr = f"<= {_FRESH_OK_SEC // 60}m healthy, <= {_FRESH_WARN_SEC // 60}m warning"
    elif age_sec is not None and age_sec <= _FRESH_WARN_SEC:
        fresh_status = "warning"
        fresh_severity = "MEDIUM"
        fresh_reason = "Monitoring ingest is delayed; verify client connectivity and POST /monitoring/events path."
        fresh_val = f"{int(age_sec // 60)}m since last ingest"
        fresh_thr = f"> {_FRESH_OK_SEC // 60}m warning, > {_FRESH_WARN_SEC // 60}m critical"
    else:
        fresh_status = "critical"
        fresh_severity = "HIGH"
        fresh_reason = "Monitoring ingest is stale; telemetry visibility may be incomplete."
        fresh_val = f"{int(age_sec // 60)}m since last ingest" if age_sec is not None else "unknown age"
        fresh_thr = f"> {_FRESH_WARN_SEC // 60}m critical"

    checks.append(
        {
            "id": "monitoring_freshness",
            "label": "Monitoring freshness",
            "status": fresh_status,
            "severity": fresh_severity,
            "value": fresh_val,
            "threshold": fresh_thr,
            "reason": fresh_reason,
            "evidence": {
                "latest_batch_received_at": latest_recv.isoformat() if latest_recv else None,
                "age_seconds": int(age_sec) if age_sec is not None else None,
            },
        }
    )
    if fresh_severity == "HIGH":
        alerts.append(
            {
                "id": "monitoring_freshness_stale",
                "severity": "HIGH",
                "category": "monitoring",
                "title": "Ingest staleness (critical window)",
                "message": fresh_reason,
                "evidence": checks[-1]["evidence"],
                "recommended_action": "Verify nginx routing, browser telemetry buffer, and admin ingest DB writer.",
            }
        )
    elif fresh_severity == "MEDIUM":
        alerts.append(
            {
                "id": "monitoring_freshness_delayed",
                "severity": "MEDIUM",
                "category": "monitoring",
                "title": "Ingest delay (warning window)",
                "message": fresh_reason,
                "evidence": checks[-1]["evidence"],
                "recommended_action": "Check recent deploys and client error rates; confirm batches still arrive.",
            }
        )

    # --- Sample volume ---
    low_sample = total_events < _MIN_EVENTS_STRICT
    vol_status = "unknown" if total_events == 0 else ("warning" if low_sample else "healthy")
    vol_severity = "OK" if total_events == 0 else ("LOW" if low_sample else "OK")
    vol_reason = (
        "No telemetry events in scanned batches."
        if total_events == 0
        else (
            f"Low event volume ({total_events} < {_MIN_EVENTS_STRICT}); rate-based alerts are damped."
            if low_sample
            else "Enough events for basic rate heuristics in this window."
        )
    )
    checks.append(
        {
            "id": "event_sample_volume",
            "label": "Event sample volume",
            "status": vol_status,
            "severity": vol_severity,
            "value": str(total_events),
            "threshold": f">= {_MIN_EVENTS_STRICT} for strict dominance rules",
            "reason": vol_reason,
            "evidence": {"total_events": total_events, "distinct_event_names": len(counts)},
        }
    )
    if total_events == 0 and latest_recv is not None:
        alerts.append(
            {
                "id": "telemetry_empty_window",
                "severity": "LOW",
                "category": "monitoring",
                "title": "Empty telemetry window",
                "message": "Batches exist but contain no parsable events in this scan.",
                "evidence": {"max_batches_scanned": max_batches_scanned},
                "recommended_action": "Confirm envelope schema and persisted batch contents in Events explorer.",
            }
        )

    # --- Wallet rejection rate (never HIGH by policy) ---
    wr_denom = wallet_rejected_count + swap_success_count
    wr_rate = (wallet_rejected_count / wr_denom) if wr_denom > 0 else None
    if wr_denom < _MIN_WALLET_RATE_SAMPLE or wr_rate is None:
        wr_status = "unknown" if wr_denom == 0 else "healthy"
        wr_sev = "OK"
        wr_msg = "Insufficient wallet outcome samples for rejection-rate signal."
        wr_val = "n/a"
    elif wr_rate < 0.30:
        wr_status = "healthy"
        wr_sev = "OK"
        wr_msg = "Wallet rejection rate is within a typical band (telemetry-only)."
        wr_val = f"{wr_rate * 100:.1f}%"
    elif wr_rate <= 0.60:
        wr_status = "warning"
        wr_sev = "LOW"
        wr_msg = "Elevated wallet rejection rate; often user-driven, not necessarily a system fault."
        wr_val = f"{wr_rate * 100:.1f}%"
        alerts.append(
            {
                "id": "wallet_rejection_rate_elevated",
                "severity": "LOW",
                "category": "wallet",
                "title": "Elevated wallet rejection rate",
                "message": wr_msg,
                "evidence": {
                    "wallet_rejected_count": wallet_rejected_count,
                    "swap_success_count": swap_success_count,
                    "rate": round(wr_rate, 4),
                },
                "recommended_action": "Review wallet UX prompts and provider errors; compare with lifecycle wallet phases.",
            }
        )
    else:
        wr_status = "warning"
        wr_sev = "MEDIUM"
        wr_msg = "High wallet rejection rate in window; treat as product/UX signal unless correlated with errors."
        wr_val = f"{wr_rate * 100:.1f}%"
        alerts.append(
            {
                "id": "wallet_rejection_rate_high",
                "severity": "MEDIUM",
                "category": "wallet",
                "title": "High wallet rejection rate",
                "message": wr_msg,
                "evidence": {
                    "wallet_rejected_count": wallet_rejected_count,
                    "swap_success_count": swap_success_count,
                    "rate": round(wr_rate, 4),
                },
                "recommended_action": "Cross-check failures tab and provider logs; avoid treating as treasury issue.",
            }
        )

    checks.append(
        {
            "id": "wallet_rejection_rate",
            "label": "Wallet rejection rate",
            "status": wr_status,
            "severity": wr_sev,
            "value": wr_val,
            "threshold": "<30% healthy, 30–60% LOW, >60% MEDIUM (requires min samples)",
            "reason": wr_msg,
            "evidence": {
                "wallet_rejected_count": wallet_rejected_count,
                "swap_success_count": swap_success_count,
                "denominator": wr_denom,
            },
        }
    )

    # --- Quote failures ---
    quote_high = (
        not low_sample
        and quote_failure_count >= 3
        and swap_success_count == 0
        and total_events >= _MIN_EVENTS_STRICT
    )
    if quote_failure_count == 0:
        q_status, q_sev, q_msg = "healthy", "OK", "No quote_failure events in scanned window."
    elif quote_high:
        q_sev = "HIGH"
        q_status = "critical"
        q_msg = "Quote failures dominate with no swap_success in a sufficiently large window."
        alerts.append(
            {
                "id": "quote_failure_dominant",
                "severity": "HIGH",
                "category": "quote",
                "title": "Quote path unhealthy (telemetry signal)",
                "message": q_msg,
                "evidence": {
                    "quote_failure_count": quote_failure_count,
                    "swap_success_count": swap_success_count,
                    "total_events": total_events,
                },
                "recommended_action": "Investigate routing/liquidity and provider responses before blaming wallet layer.",
            }
        )
    elif quote_failure_count == 1:
        q_status, q_sev, q_msg = "warning", "LOW", "Single quote_failure observed; may be benign or user abort."
        alerts.append(
            {
                "id": "quote_failure_observed",
                "severity": "LOW",
                "category": "quote",
                "title": "Quote failure observed",
                "message": "At least one quote_failure event is present in telemetry.",
                "evidence": {"quote_failure_count": quote_failure_count},
                "recommended_action": "Inspect Events explorer for provider/route context.",
            }
        )
    else:
        q_status, q_sev, q_msg = "warning", "MEDIUM", "Multiple quote_failure events in window."
        alerts.append(
            {
                "id": "quote_failure_repeated",
                "severity": "MEDIUM",
                "category": "quote",
                "title": "Repeated quote failures",
                "message": q_msg,
                "evidence": {"quote_failure_count": quote_failure_count},
                "recommended_action": "Check RPC health, slippage settings, and route availability.",
            }
        )

    checks.append(
        {
            "id": "quote_failures",
            "label": "Quote failures",
            "status": q_status,
            "severity": q_sev,
            "value": str(quote_failure_count),
            "threshold": "HIGH only with repeated failures, zero successes, enough samples",
            "reason": q_msg,
            "evidence": {"quote_failure_count": quote_failure_count},
        }
    )

    # --- Swap success vs swap_failure balance (informational) ---
    sf = swap_failure_count
    if sf == 0:
        bal_msg = "No swap_failure events in window."
        bal_status, bal_sev = "healthy", "OK"
    elif swap_success_count == 0 and not low_sample:
        bal_msg = "swap_failure events present with no swap_success in a large window."
        bal_status, bal_sev = "warning", "MEDIUM"
        alerts.append(
            {
                "id": "swap_failure_without_success",
                "severity": "MEDIUM",
                "category": "swap",
                "title": "Swap failures without successes (window)",
                "message": bal_msg,
                "evidence": {"swap_failure_count": sf, "swap_success_count": swap_success_count},
                "recommended_action": "Review Failures and lifecycle swap_failed phases for provider-specific errors.",
            }
        )
    else:
        bal_msg = "Some swap_failure events observed; compare with successes for context."
        bal_status, bal_sev = "warning", "LOW"

    checks.append(
        {
            "id": "swap_success_failure_balance",
            "label": "Swap success vs swap_failure",
            "status": bal_status,
            "severity": bal_sev,
            "value": f"success={swap_success_count}, failure={sf}",
            "threshold": "Contextual; damped when sample volume is low",
            "reason": bal_msg,
            "evidence": {"swap_success_count": swap_success_count, "swap_failure_count": sf},
        }
    )

    # --- Lifecycle incomplete / orphaned ---
    lc_bad = lifecycle_incomplete + lifecycle_orphaned
    if lifecycle_total == 0:
        lc_status, lc_sev, lc_msg = "unknown", "OK", "No reconstructed lifecycles in window (may lack swap_lifecycle rows)."
    elif lc_bad == 0:
        lc_status, lc_sev, lc_msg = "healthy", "OK", "No incomplete or orphaned lifecycles in reconstructed set."
    else:
        ratio = lc_bad / lifecycle_total if lifecycle_total else 0.0
        if lifecycle_total >= _MIN_LIFECYCLE_RATIO_SAMPLE and ratio > 0.30:
            lc_status, lc_sev = "critical", "HIGH"
            lc_msg = "High share of incomplete/orphaned lifecycles vs total reconstructed."
            alerts.append(
                {
                    "id": "lifecycle_quality_degraded",
                    "severity": "HIGH",
                    "category": "lifecycle",
                    "title": "Lifecycle reconstruction quality degraded",
                    "message": lc_msg,
                    "evidence": {
                        "lifecycle_total": lifecycle_total,
                        "lifecycle_incomplete_count": lifecycle_incomplete,
                        "lifecycle_orphaned_count": lifecycle_orphaned,
                        "ratio": round(ratio, 4),
                    },
                    "recommended_action": "Review lifecycle tab ordering issues and missing terminal events.",
                }
            )
        else:
            lc_status, lc_sev = "warning", "MEDIUM" if lc_bad > 2 else "LOW"
            lc_msg = "Some lifecycles are incomplete or orphaned; verify correlation and client staging coverage."
            alerts.append(
                {
                    "id": "lifecycle_incomplete_or_orphaned",
                    "severity": "MEDIUM" if lc_bad > 2 else "LOW",
                    "category": "lifecycle",
                    "title": "Lifecycle gaps detected",
                    "message": lc_msg,
                    "evidence": {
                        "lifecycle_total": lifecycle_total,
                        "lifecycle_incomplete_count": lifecycle_incomplete,
                        "lifecycle_orphaned_count": lifecycle_orphaned,
                    },
                    "recommended_action": "Inspect Lifecycle tab; confirm swap_lifecycle telemetry is allow-listed.",
                }
            )

    checks.append(
        {
            "id": "lifecycle_health",
            "label": "Lifecycle health",
            "status": lc_status,
            "severity": lc_sev,
            "value": f"incomplete={lifecycle_incomplete}, orphaned={lifecycle_orphaned}",
            "threshold": f"HIGH if >30% bad with >= {_MIN_LIFECYCLE_RATIO_SAMPLE} lifecycles",
            "reason": lc_msg,
            "evidence": {
                "lifecycle_total": lifecycle_total,
                "lifecycle_incomplete_count": lifecycle_incomplete,
                "lifecycle_orphaned_count": lifecycle_orphaned,
            },
        }
    )

    # --- Fee telemetry gaps (not accounting) ---
    if revenue_zero or revenue_missing or route_mismatch or missing_expected_bps:
        rev_status = "warning"
        rev_max = "LOW"
        if revenue_zero or revenue_missing:
            rev_max = "MEDIUM"
            alerts.append(
                {
                    "id": "fee_telemetry_gap",
                    "severity": "MEDIUM",
                    "category": "revenue",
                    "title": "Fee telemetry gap on wrapper swaps",
                    "message": "Wrapper swaps show missing or zero fee telemetry fields; this is a decoder/telemetry gap, not proof of missing treasury funds.",
                    "evidence": {
                        "telemetry_zero_fee_count": revenue_zero,
                        "telemetry_missing_fee_count": revenue_missing,
                    },
                    "recommended_action": "Compare with revenue reconciliation rows and receipt decode paths.",
                }
            )
        if route_mismatch:
            rev_max = _max_severity(rev_max, "MEDIUM")
            alerts.append(
                {
                    "id": "route_wrapper_metadata_mismatch",
                    "severity": "MEDIUM",
                    "category": "wrapper",
                    "title": "Route vs wrapper metadata mismatch",
                    "message": "commissionRoute/provider vs chain family inconsistent for wrapper-class swaps in telemetry.",
                    "evidence": {"route_wrapper_mismatch_count": route_mismatch},
                    "recommended_action": "Verify client commissionRoute and provider strings against expected wrapper routes.",
                }
            )
        if missing_expected_bps:
            rev_max = _max_severity(rev_max, "LOW")
            alerts.append(
                {
                    "id": "wrapper_expected_bps_missing",
                    "severity": "LOW",
                    "category": "wrapper",
                    "title": "Wrapper expected fee bps not in static table",
                    "message": "Some wrapper-class swaps use a provider key without a repo-aligned expected bps row.",
                    "evidence": {"missing_expected_bps_count": missing_expected_bps},
                    "recommended_action": "Update static expectations table if a new wrapper provider key shipped.",
                }
            )
        rev_msg = "Fee telemetry or wrapper metadata checks need operator review (read-only)."
    else:
        rev_status, rev_max, rev_msg = "healthy", "OK", "No fee telemetry gap flags in scanned wrapper swaps."

    checks.append(
        {
            "id": "revenue_fee_telemetry",
            "label": "Revenue / fee telemetry gaps",
            "status": rev_status,
            "severity": rev_max,
            "value": f"zero={revenue_zero}, missing={revenue_missing}",
            "threshold": "MEDIUM on zero/missing fee fields for expected wrapper fees",
            "reason": rev_msg,
            "evidence": {
                "telemetry_zero_fee_count": revenue_zero,
                "telemetry_missing_fee_count": revenue_missing,
                "route_wrapper_mismatch_count": route_mismatch,
                "missing_expected_bps_count": missing_expected_bps,
            },
        }
    )

    # --- Admin API / DB visibility ---
    admin_check_status = "healthy" if batches is not None else "unknown"
    checks.append(
        {
            "id": "admin_read_path",
            "label": "Admin read path",
            "status": admin_check_status,
            "severity": "OK",
            "value": f"batches_loaded={len(batches)}",
            "threshold": "This payload implies admin token DB read succeeded for the scan.",
            "reason": "Health-alerts response constructed from persisted monitoring batches.",
            "evidence": {"batch_count": len(batches), "max_batches_scanned": max_batches_scanned},
        }
    )

    # --- Overall score ---
    score = 100
    for al in alerts:
        sev = al.get("severity", "OK")
        if sev == "LOW":
            score -= 5
        elif sev == "MEDIUM":
            score -= 15
        elif sev == "HIGH":
            score -= 35
    score = max(0, min(100, int(score)))

    highest = "OK"
    for c in checks:
        highest = _max_severity(highest, str(c.get("severity") or "OK"))
    for al in alerts:
        highest = _max_severity(highest, str(al.get("severity") or "OK"))

    any_high_alert = any(str(a.get("severity")) == "HIGH" for a in alerts)
    any_med_low = any(str(a.get("severity")) in ("LOW", "MEDIUM") for a in alerts)

    if not batches:
        overall_status = "unknown"
    elif total_events == 0:
        overall_status = "unknown" if latest_recv is None else "warning"
    elif any_high_alert or score < 50:
        overall_status = "critical"
    elif score >= 85 and not any_high_alert and not any_med_low:
        overall_status = "healthy"
    else:
        overall_status = "warning"

    return {
        "schema_version": HEALTH_ALERTS_SCHEMA_VERSION,
        "overall": {
            "status": overall_status,
            "score": score,
            "highest_severity": highest,
            "generated_at": generated_at,
            "window": {
                "max_batches": max_batches_scanned,
                "event_count": total_events,
                "oldest_event_time": oldest_ev,
                "newest_event_time": newest_ev,
            },
        },
        "checks": checks,
        "alerts": alerts,
        "metrics": {
            "total_events": total_events,
            "swap_success_count": swap_success_count,
            "wallet_rejected_count": wallet_rejected_count,
            "quote_failure_count": quote_failure_count,
            "lifecycle_total": lifecycle_total,
            "lifecycle_incomplete_count": lifecycle_incomplete,
            "lifecycle_orphaned_count": lifecycle_orphaned,
            "revenue_telemetry_zero_fee_count": revenue_zero,
            "revenue_telemetry_missing_fee_count": revenue_missing,
        },
        "_meta": {
            "notes": [
                "Read-only health derived from monitoring telemetry in a bounded batch window.",
                "This does not prove treasury settlement or accounting correctness.",
                "Rate and dominance rules are damped when sample volume is low to reduce false criticals.",
            ],
        },
    }
