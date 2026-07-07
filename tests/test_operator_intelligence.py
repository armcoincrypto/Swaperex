"""P5A — operator intelligence aggregation (unit tests)."""

from __future__ import annotations

from datetime import datetime, timezone

from swaperex.api.operator_intelligence import build_operator_intelligence_payload
from swaperex.ledger.models import MonitoringIngestBatch


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _batch(
    batch_id: int,
    session_id: str,
    events: list[dict],
) -> MonitoringIngestBatch:
    return MonitoringIngestBatch(
        id=batch_id,
        schema_version=1,
        client_session_id=session_id,
        exported_at_ms=_now_ms(),
        event_count=len(events),
        envelope={"events": events},
    )


def test_operator_intelligence_empty_batches():
    payload = build_operator_intelligence_payload([])
    assert payload["schema_version"] == 3
    assert payload["window"]["events_scanned"] == 0
    assert payload["funnel"]["stages"][0]["stage"] == "pair_selected"
    assert payload["alerts"] == []
    assert "decision_support" in payload
    assert payload["decision_support"]["health_score"]["score"] is None
    assert payload["decision_support"]["data_confidence"]["level"] == "insufficient"
    assert payload["decision_support"]["daily_executive_summary"]["status"]["label"] == "INSUFFICIENT_DATA"


def test_operator_intelligence_funnel_and_commission():
    ts = _now_ms()
    pk = "1|WETH|USDC"
    events = [
        {"event": "pair_selected", "ts": ts, "chainId": 1, "pairKey": pk, "source": "featured_chip"},
        {"event": "quote_success", "ts": ts, "chainId": 1, "pairKey": pk},
        {"event": "preview_opened", "ts": ts, "chainId": 1, "pairKey": pk},
        {"event": "approve_clicked", "ts": ts, "chainId": 1, "pairKey": pk},
        {
            "event": "swap_success",
            "ts": ts,
            "chainId": 1,
            "pairKey": pk,
            "fromAmount": "1.5",
            "provider": "uniswap_v3",
            "feeToTreasuryWei": "1000",
            "feeToken": {"symbol": "USDC"},
        },
    ]
    batches = [_batch(1, "sess-funnel", events)]
    payload = build_operator_intelligence_payload(batches)

    funnel = {s["stage"]: s["count"] for s in payload["funnel"]["stages"]}
    assert funnel["pair_selected"] == 1
    assert funnel["quote_success"] == 1
    assert funnel["preview_opened"] == 1
    assert funnel["approve_clicked"] == 1
    assert funnel["swap_success"] == 1

    assert payload["revenue"]["average_swap_size"] == 1.5
    assert payload["revenue"]["median_swap_size"] == 1.5
    assert payload["pairs"]["top_revenue"][0]["pair_key"] == pk
    assert payload["pairs"]["top_requested"][0]["count"] == 1
    assert payload["executive_summary"]["quote_success_rate_pct"] == 100.0
    assert payload["decision_support"]["daily_executive_summary"]["swap_count_today"] == 1
    assert payload["window"]["scan"]["batches_scanned"] == 1


def test_operator_intelligence_unsupported_chain_selection():
    ts = _now_ms()
    events = [
        {"event": "chain_selected", "ts": ts, "chainId": 137, "swapCapable": False},
        {"event": "chain_selected", "ts": ts, "chainId": 137, "swapCapable": False},
    ]
    payload = build_operator_intelligence_payload([_batch(2, "sess-poly", events)])
    poly = next(r for r in payload["chains"] if r["chain_id"] == 137)
    assert poly["unsupported_chain_selections"] == 2
    assert poly["recommendation"] == "balance_view_only"


def test_operator_intelligence_quote_failure_alert():
    ts = _now_ms()
    events = [{"event": "quote_failure", "ts": ts, "chainId": 1, "pairKey": "1|WETH|USDC"}] * 6
    events += [{"event": "quote_success", "ts": ts, "chainId": 1, "pairKey": "1|WETH|USDC"}] * 2
    payload = build_operator_intelligence_payload([_batch(3, "sess-qf", events)])
    alert_ids = {a["id"] for a in payload["alerts"]}
    assert "quote_failure_elevated" in alert_ids


def test_operator_intelligence_preview_abandonment_heuristic():
    ts = _now_ms()
    events = [
        {"event": "preview_opened", "ts": ts, "chainId": 1, "pairKey": "1|WETH|USDT"},
    ]
    payload = build_operator_intelligence_payload([_batch(4, "sess-abandon", events)])
    assert payload["funnel"]["preview_abandonment_sessions"] == 1
