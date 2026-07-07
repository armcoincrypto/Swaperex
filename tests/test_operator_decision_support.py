"""P5B / P5B.1 — operator decision support (unit tests)."""

from __future__ import annotations

from datetime import datetime, timezone

from swaperex.api.operator_decision_support import (
    MIN_QUOTES_HIGH,
    MIN_QUOTES_INSUFFICIENT,
    MIN_QUOTES_MEDIUM,
    TimedMetrics,
    _day_bounds_extended,
    build_data_confidence,
    build_daily_executive_summary,
    build_decision_support_payload,
    build_featured_pair_automation,
    build_health_score,
    build_operator_recommendations,
    build_trend_detection,
    snapshot_exists_for_day,
)
from swaperex.ledger.models import MonitoringIngestBatch


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts() -> int:
    return int(_now().timestamp() * 1000)


def _metrics_with_quotes(n: int, pk: str = "1|WETH|USDC", chain: int = 1) -> TimedMetrics:
    metrics = TimedMetrics()
    ts = _ts()
    for _ in range(n):
        metrics.quote_success.append((ts, pk, chain))
    metrics.pair_quotes_all[pk] = n
    return metrics


def test_data_confidence_thresholds():
    assert build_data_confidence(0)["level"] == "insufficient"
    assert build_data_confidence(9)["level"] == "insufficient"
    assert build_data_confidence(10)["level"] == "low"
    assert build_data_confidence(49)["level"] == "low"
    assert build_data_confidence(50)["level"] == "medium"
    assert build_data_confidence(199)["level"] == "medium"
    assert build_data_confidence(200)["level"] == "high"


def test_daily_executive_summary_insufficient_data():
    metrics = TimedMetrics()
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(0)
    daily = build_daily_executive_summary(metrics, bounds, alerts=[], data_confidence=dc)
    assert daily["status"]["label"] == "INSUFFICIENT_DATA"
    assert daily["status"]["level"] == "insufficient_data"
    assert daily["commission_today_wei"] == 0


def test_health_score_unavailable_when_insufficient():
    metrics = TimedMetrics()
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(0)
    health = build_health_score(metrics, bounds, [], 0, 0, dc)
    assert health["score"] is None
    assert health["sufficient"] is False


def test_health_score_deductions_on_failures():
    metrics = TimedMetrics()
    ts = _ts()
    bounds = _day_bounds_extended(_now())
    for _ in range(50):
        metrics.quote_success.append((ts, "1|WETH|USDC", 1))
    for _ in range(5):
        metrics.swap_failure.append((ts, "1|WETH|USDC", 1))
    for _ in range(2):
        metrics.swap_success.append((ts, "1|WETH|USDC", 1, 1.0))
    dc = build_data_confidence(50)
    health = build_health_score(metrics, bounds, [], 2, 10, dc)
    assert health["score"] is not None
    assert health["score"] < 100
    assert any(d["dimension"] == "swap_reliability" for d in health["deductions"])


def test_featured_automation_no_removal_on_empty():
    metrics = TimedMetrics()
    bounds = _day_bounds_extended(_now())
    featured = build_featured_pair_automation(metrics, bounds)
    assert featured["recommended_removal"] == []


def test_featured_automation_scores_with_sample():
    metrics = _metrics_with_quotes(10)
    bounds = _day_bounds_extended(_now())
    featured = build_featured_pair_automation(metrics, bounds)
    assert len(featured["recommended_featured"]) >= 1


def test_trend_detection_measured_change_only():
    metrics = _metrics_with_quotes(1)
    bounds = _day_bounds_extended(_now())
    trends = build_trend_detection(metrics, bounds)
    assert "note" in trends


def test_recommendations_empty_no_promote_demote():
    metrics = TimedMetrics()
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(0)
    daily = build_daily_executive_summary(metrics, bounds, [], dc)
    recs = build_operator_recommendations(
        metrics, bounds, daily, {}, {"recommended_featured": [], "recommended_removal": []}, {}, dc
    )
    assert len(recs) == 1
    assert recs[0]["id"] == "collect_more_data"
    assert "promote" not in recs[0]["id"]
    assert "demote" not in recs[0]["id"]


def test_recommendations_five_quotes_insufficient():
    metrics = _metrics_with_quotes(5)
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(5)
    daily = build_daily_executive_summary(metrics, bounds, [], dc)
    featured = build_featured_pair_automation(metrics, bounds)
    recs = build_operator_recommendations(metrics, bounds, daily, {}, featured, {}, dc)
    assert all("promote" not in r["id"] and "demote" not in r["id"] for r in recs)


def test_recommendations_twenty_quotes_watch_only():
    metrics = _metrics_with_quotes(20)
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(20)
    daily = build_daily_executive_summary(metrics, bounds, [], dc)
    featured = build_featured_pair_automation(metrics, bounds)
    health = build_health_score(metrics, bounds, [], 0, 0, dc)
    recs = build_operator_recommendations(metrics, bounds, daily, {}, featured, health, dc)
    assert any(r["id"] == "collect_more_data_low" for r in recs)
    assert all("promote" not in r["id"] and "demote" not in r["id"] for r in recs)


def test_recommendations_seventy_five_medium_promote():
    metrics = _metrics_with_quotes(75, pk="1|WETH|LINK", chain=1)
    ts = _ts()
    for _ in range(10):
        metrics.swap_success.append((ts, "1|WETH|LINK", 1, 1.0))
    metrics.fee_events_by_pair.append((ts, "1|WETH|LINK", 5000))
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(75)
    daily = build_daily_executive_summary(metrics, bounds, [], dc)
    trends = build_trend_detection(metrics, bounds)
    featured = build_featured_pair_automation(metrics, bounds)
    health = build_health_score(metrics, bounds, [], 10, 10, dc)
    recs = build_operator_recommendations(metrics, bounds, daily, trends, featured, health, dc)
    promote = [r for r in recs if r["id"].startswith("promote_")]
    assert promote
    assert promote[0]["confidence"] == "medium"
    assert promote[0]["sample_size"] == 75


def test_recommendations_two_fifty_high_confidence():
    metrics = _metrics_with_quotes(MIN_QUOTES_HIGH)
    bounds = _day_bounds_extended(_now())
    dc = build_data_confidence(MIN_QUOTES_HIGH)
    daily = build_daily_executive_summary(metrics, bounds, [], dc)
    featured = build_featured_pair_automation(metrics, bounds)
    health = build_health_score(metrics, bounds, [], 5, 20, dc)
    recs = build_operator_recommendations(metrics, bounds, daily, {}, featured, health, dc)
    assert recs
    assert all(r.get("sample_size") is not None for r in recs)
    high_recs = [r for r in recs if r.get("confidence") == "high"]
    assert high_recs or any(r["confidence"] in ("medium", "high") for r in recs)


def test_decision_support_payload_includes_data_confidence():
    metrics = _metrics_with_quotes(3)
    bounds = _day_bounds_extended(_now())
    payload = build_decision_support_payload(
        metrics,
        bounds,
        alerts=[],
        funnel_swap_success=0,
        funnel_pair_selected=0,
        insight_batches=[],
        now=_now(),
    )
    assert payload["data_confidence"]["level"] == "insufficient"
    assert payload["health_score"]["score"] is None


def test_snapshot_exists_for_day():
    batch = MonitoringIngestBatch(
        id=1,
        schema_version=3,
        client_session_id="p5b-insight-store",
        exported_at_ms=1,
        event_count=0,
        envelope={
            "kind": "operator_daily_snapshot",
            "snapshot": {"day": "2099-01-01"},
        },
    )
    assert snapshot_exists_for_day([batch], "2099-01-01")
    assert not snapshot_exists_for_day([batch], "2099-01-02")
