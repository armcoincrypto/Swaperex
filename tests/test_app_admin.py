"""Tests for the isolated admin / monitoring FastAPI app.

These tests exist to make sure the safety boundaries of `app_admin` cannot
silently regress:

* Only the health, monitoring ingest, and **read-only admin** routers are mounted.
* Custodial routers (deposits, hdwallet, withdrawal, webhook, legacy admin)
  are NOT exposed.
* The monitoring ingest endpoint accepts a valid envelope and writes to the
  isolated admin DB only.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from swaperex.api.app_admin import create_admin_app
from swaperex.ledger.database import close_admin_db, init_admin_db


# Routers / path prefixes that MUST NOT appear in the admin app.
FORBIDDEN_PATH_PREFIXES = (
    "/api/v1/deposits",
    "/api/v1/withdrawal",
    "/admin",  # legacy custodial admin router (mounted at /admin in app.py)
    "/hdwallet",
    "/withdrawal",
    "/webhook",
)


def _route_paths(app) -> list[str]:
    """Return all HTTP route paths registered on `app`."""
    paths: list[str] = []
    for r in app.router.routes:
        path = getattr(r, "path", None)
        if isinstance(path, str):
            paths.append(path)
    return paths


def test_admin_app_exposes_health_monitoring_and_readonly_admin():
    """Whitelist: health (canonical + /api/v1 alias), monitoring ingest, admin panel."""
    app = create_admin_app()
    paths = _route_paths(app)

    # Canonical health (load balancer / direct curl)
    assert "/health" in paths, paths
    assert "/health/detailed" in paths, paths

    # Operational alias under /api/v1 — keeps every admin-app URL on the same
    # /api/v1/... prefix as the nginx route map and the monitoring ingest path.
    assert "/api/v1/health" in paths, paths
    assert "/api/v1/health/detailed" in paths, paths

    # Monitoring ingest
    assert "/api/v1/monitoring/events" in paths, paths

    # Read-only admin (token-protected)
    assert "/api/v1/admin/health" in paths, paths
    assert "/api/v1/admin/overview" in paths, paths
    assert "/api/v1/admin/events" in paths, paths
    assert "/api/v1/admin/swaps" in paths, paths
    assert "/api/v1/admin/revenue" in paths, paths
    assert "/api/v1/admin/wallet-reconnect" in paths, paths
    assert "/api/v1/admin/failures" in paths, paths
    assert "/api/v1/admin/revenue-normalized" in paths, paths
    assert "/api/v1/admin/revenue-reconciliation" in paths, paths
    assert "/api/v1/admin/swap-lifecycles" in paths, paths
    assert "/api/v1/admin/health-alerts" in paths, paths
    assert "/api/v1/admin/operator-intelligence" in paths, paths


def test_admin_app_does_not_expose_custodial_routes():
    """Negative test: forbidden custodial paths must not be present anywhere."""
    app = create_admin_app()
    paths = _route_paths(app)

    for prefix in FORBIDDEN_PATH_PREFIXES:
        offenders = [p for p in paths if p.startswith(prefix)]
        assert offenders == [], (
            f"app_admin must not expose {prefix!r} routes, got: {offenders}"
        )


def test_admin_app_does_not_import_custodial_modules():
    """Hard import boundary: custodial modules must not be transitively imported.

    `app_admin` is required to never reach `load_xpubs_from_db`, the legacy
    custodial admin/withdrawal/hdwallet/webhook routers, or signing helpers.
    We import a fresh process via subprocess to verify with an empty module
    cache.
    """
    import subprocess
    import sys
    import textwrap

    code = textwrap.dedent(
        """
        import sys
        import importlib

        # Prevent any chance of accidental imports from other tests.
        for m in list(sys.modules):
            if m.startswith("swaperex"):
                del sys.modules[m]

        importlib.import_module("swaperex.api.app_admin")

        forbidden = [
            "swaperex.api.routers.admin",
            "swaperex.api.routers.hdwallet",
            "swaperex.api.routers.withdrawal",
            "swaperex.api.routers.webhook",
            "swaperex.api.routes.deposits",
        ]
        leaked = [m for m in forbidden if m in sys.modules]
        if leaked:
            raise SystemExit(f"app_admin transitively imported: {leaked}")
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[1]),
    )
    assert result.returncode == 0, (
        f"Unexpected custodial imports: stdout={result.stdout!r} stderr={result.stderr!r}"
    )


@pytest_asyncio.fixture
async def admin_client(tmp_path, monkeypatch):
    """Boot the admin app against a throwaway SQLite admin DB for one test."""
    db_path = tmp_path / "swaperex_admin_test.db"
    db_url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setenv("ADMIN_DATABASE_URL", db_url)
    # Bust the cached Settings so the new env is picked up.
    from swaperex.config import get_settings

    get_settings.cache_clear()

    # Defensive: clear any cached admin engine from earlier tests.
    await close_admin_db()

    # Sanity: cached legacy engine (if any) must point at a different URL.
    legacy_url = get_settings().database_url
    assert legacy_url != db_url, "test would clobber legacy DB"

    app = create_admin_app()

    # `httpx.ASGITransport` does NOT fire FastAPI lifespan events by default,
    # so `init_admin_db()` is invoked explicitly here. Production deploys run
    # lifespan via `uvicorn`, so this branch only matters for tests.
    await init_admin_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://admin-test") as ac:
        yield ac, db_path

    await close_admin_db()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_db_contains_only_monitoring_table(admin_client):
    """`init_admin_db` must NOT create the legacy custodial tables.

    Regression guard for the `tables=[MonitoringIngestBatch.__table__]` scope
    on `Base.metadata.create_all`. A clean admin DB should expose exactly one
    user-defined table.
    """
    _, db_path = admin_client
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%' "
                "ORDER BY name"
            )
        )
        tables = [row[0] for row in result.fetchall()]
    await engine.dispose()

    assert tables == ["monitoring_ingest_batches"], (
        f"admin DB should contain only `monitoring_ingest_batches`, found {tables}"
    )


@pytest.mark.asyncio
async def test_init_admin_db_is_idempotent_on_existing_table(admin_client):
    """A second call must not raise even though the table already exists.

    Defense-in-depth against the multi-worker race that crashed startup.
    """
    _, _ = admin_client
    await init_admin_db()
    await init_admin_db()


@pytest.mark.asyncio
async def test_health_alias_under_api_v1(admin_client):
    """Both `/health` and the `/api/v1/health` alias must answer 200."""
    client, _ = admin_client

    canonical = await client.get("/health")
    assert canonical.status_code == 200, canonical.text
    assert canonical.json()["status"] == "healthy"

    alias = await client.get("/api/v1/health")
    assert alias.status_code == 200, alias.text
    assert alias.json()["status"] == "healthy"

    detailed = await client.get("/api/v1/health/detailed")
    assert detailed.status_code == 200, detailed.text
    assert detailed.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_monitoring_ingest_smoke(admin_client):
    """Posting a valid envelope returns 201 and writes to the admin DB only."""
    client, db_path = admin_client

    payload = {
        "schemaVersion": 1,
        "clientSessionId": "smoke-test",
        "exportedAt": 1_700_000_000_000,
        "events": [
            {"event": "swap_success", "ts": 1_700_000_000_001, "chainId": 1},
            {"event": "rpc_failure", "ts": 1_700_000_000_002, "phase": "quote"},
        ],
    }
    res = await client.post("/api/v1/monitoring/events", json=payload)
    assert res.status_code == 201, res.text
    assert res.json() == {"ok": True, "stored": 2}

    # Verify the row landed in the isolated admin DB and not the legacy one.
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    "SELECT event_count, schema_version, client_session_id "
                    "FROM monitoring_ingest_batches"
                )
            )
        ).first()
    await engine.dispose()
    assert row is not None
    assert row.event_count == 2
    assert row.schema_version == 1
    assert row.client_session_id == "smoke-test"


@pytest.mark.asyncio
async def test_monitoring_ingest_rejects_oversized_batch(admin_client):
    """Existing payload limit (max 200 events) must remain enforced."""
    client, _ = admin_client

    payload = {
        "schemaVersion": 1,
        "clientSessionId": "oversize",
        "exportedAt": 1,
        "events": [{"event": "swap_success", "ts": i} for i in range(201)],
    }
    res = await client.post("/api/v1/monitoring/events", json=payload)
    # Pydantic returns 422 for too-many-items
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_monitoring_ingest_rejects_bad_secret(admin_client, monkeypatch):
    """Optional shared secret still works after the dependency refactor."""
    monkeypatch.setenv("MONITORING_INGEST_SECRET", "expected-secret")

    client, _ = admin_client
    payload = {
        "schemaVersion": 1,
        "clientSessionId": "secret-test",
        "exportedAt": 1,
        "events": [],
    }
    bad = await client.post(
        "/api/v1/monitoring/events",
        json=payload,
        headers={"X-Swaperex-Monitoring-Key": "wrong"},
    )
    assert bad.status_code == 401

    good = await client.post(
        "/api/v1/monitoring/events",
        json=payload,
        headers={"X-Swaperex-Monitoring-Key": "expected-secret"},
    )
    assert good.status_code == 201


@pytest.mark.asyncio
async def test_admin_panel_requires_token(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()

    client, _ = admin_client
    no_hdr = await client.get("/api/v1/admin/overview")
    assert no_hdr.status_code == 401, no_hdr.text

    bad = await client.get("/api/v1/admin/overview", headers={"X-Admin-Token": "wrong"})
    assert bad.status_code == 401, bad.text

    ok = await client.get("/api/v1/admin/overview", headers={"X-Admin-Token": "panel-secret-test"})
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["service"] == "admin"
    assert body["status"] == "ok"
    assert "monitoring_batch_count" in body
    assert body["frontend_health"]["status"] == "unknown"

    health = await client.get("/api/v1/admin/health", headers={"X-Admin-Token": "panel-secret-test"})
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_panel_unconfigured_returns_503(admin_client, monkeypatch):
    monkeypatch.delenv("ADMIN_API_TOKEN", raising=False)
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client
    res = await client.get("/api/v1/admin/overview", headers={"X-Admin-Token": "anything"})
    assert res.status_code == 503
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_swaps_analytics_from_monitoring(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/swaps")).status_code == 401

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "swap-ws-1",
            "exportedAt": 100,
            "events": [
                {"event": "rpc_failure", "ts": 1, "reason": "x"},
                {
                    "event": "swap_success",
                    "ts": 1_700_000_000_000,
                    "txHash": "0xabc123",
                    "chainId": 42161,
                    "provider": "quote_aggregator",
                    "routeMode": "best",
                    "fromToken": {"symbol": "ETH", "address": None, "isNative": True},
                    "toToken": {"symbol": "USDC", "address": "0xusdc", "isNative": False},
                    "fromAmount": "1.0",
                    "quotedOutput": "3000",
                    "minimumReceived": "2950",
                    "protocolFeeBps": 25,
                    "userReceivedSource": "quote",
                    "gasUsed": "210000",
                    "effectiveGasPrice": "1000000000",
                    "receiptStatus": 1,
                    "commissionRoute": "wrapper",
                    "wrapperRoute": "uniswap-v3-wrapper",
                    "nativeOutput": False,
                },
                {"event": "swap_success", "notValid": True},
            ],
        },
    )

    hdr = {"X-Admin-Token": "panel-secret-test"}
    res = await client.get("/api/v1/admin/swaps", headers=hdr)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    row = body["items"][0]
    assert row["batch_id"] >= 1
    assert row["chain"] == 42161
    assert row["route_mode"] == "best"
    assert row["from_symbol"] == "ETH"
    assert row["to_symbol"] == "USDC"
    assert row["tx_hash"] == "0xabc123"
    assert row["protocol_fee_bps"] == 25
    assert row["native_output"] is False
    assert row["estimated_fee_usd"] is None
    assert "quote_aggregator" in row["route_label"]
    assert row["raw_event"]["event"] == "swap_success"

    chain_f = await client.get("/api/v1/admin/swaps?chain=1", headers=hdr)
    assert chain_f.json()["total"] == 0

    chain_ok = await client.get("/api/v1/admin/swaps?chain=42161", headers=hdr)
    assert chain_ok.json()["total"] == 1

    tok = await client.get("/api/v1/admin/swaps?token=usd", headers=hdr)
    assert tok.json()["total"] == 1

    rm = await client.get("/api/v1/admin/swaps?routeMode=WORST", headers=hdr)
    assert rm.json()["total"] == 0

    ws = await client.get("/api/v1/admin/swaps?walletSession=swap-ws-1", headers=hdr)
    assert ws.json()["total"] == 1

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "swap-ws-2",
            "exportedAt": 101,
            "events": [
                {
                    "event": "swap_success",
                    "ts": 1_800_000_000_000,
                    "txHash": "0xfail",
                    "chainId": 1,
                    "provider": "1inch",
                    "routeMode": "fast",
                    "receiptStatus": 0,
                },
            ],
        },
    )

    success_only = await client.get("/api/v1/admin/swaps?successOnly=true", headers=hdr)
    assert success_only.json()["total"] == 1

    all_rows = await client.get("/api/v1/admin/swaps?successOnly=false", headers=hdr)
    assert all_rows.json()["total"] == 2

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_failures_endpoint(admin_client, monkeypatch):
    """P2.6 GET /api/v1/admin/failures aggregates persisted failure-class events."""
    monkeypatch.setenv("ADMIN_API_TOKEN", "failures-panel-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/failures")).status_code == 401

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "fail-sess-1",
            "exportedAt": 2_000_000,
            "events": [
                {"event": "swap_success", "ts": 2_000_000_001, "chainId": 1},
                {
                    "event": "quote_failure",
                    "ts": 2_000_000_002,
                    "category": "stale_quote",
                    "chainId": 56,
                    "provider": "quote_aggregator",
                    "reasonCode": "stale_request_id",
                },
                {
                    "event": "wallet_rejected",
                    "ts": 2_000_000_003,
                    "phase": "swap",
                    "chainId": 56,
                    "provider": "1inch",
                    "reasonCode": "user_rejected",
                },
                {
                    "event": "rpc_failure",
                    "ts": 2_000_000_004,
                    "phase": "quote",
                    "chainId": 1,
                    "reason": "gateway timeout 504",
                },
                {
                    "event": "commission_missing",
                    "ts": 2_000_000_005,
                    "chainId": 1,
                    "provider": "uniswap-v3-wrapper-v2",
                    "txHash": "0xcomm1",
                    "routeMode": "best",
                    "reason": "no_treasury_transfer_in_output_token",
                },
                {
                    "event": "swap_failure",
                    "ts": 2_000_000_006,
                    "category": "transaction_error",
                    "chainId": 1,
                    "provider": "1inch",
                    "reason": "reverted by the smart contract",
                },
            ],
        },
    )

    hdr = {"X-Admin-Token": "failures-panel-test"}
    res = await client.get("/api/v1/admin/failures", headers=hdr)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["failure_taxonomy_version"]
    assert body["total_failures"] == 5
    assert body["rates"]["wallet_rejection_rate"] is None
    by_type = {r["failure_type"]: r["count"] for r in body["failures_by_type"]}
    assert by_type.get("stale_quote") == 1
    assert by_type.get("wallet_rejected") == 1
    assert by_type.get("provider_timeout") == 1
    assert by_type.get("commission_missing") == 1
    assert by_type.get("tx_reverted") == 1
    assert len(body["recent_commission_missing"]) == 1
    assert body["recent_commission_missing"][0]["tx_hash"] == "0xcomm1"
    assert "payload_excerpt" in body["recent_failures"][0]

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_failures_unsupported_commission_route_taxonomy(admin_client, monkeypatch):
    """P4.1-A: unsupported commission route events map to route_unsupported / LOW."""
    monkeypatch.setenv("ADMIN_API_TOKEN", "ucr-taxonomy-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client
    hdr = {"X-Admin-Token": "ucr-taxonomy-test"}

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "ucr-sess-1",
            "exportedAt": 2_010_000,
            "events": [
                {
                    "event": "unsupported_commission_route",
                    "ts": 2_010_000_001,
                    "chainId": 1,
                    "fromSymbol": "ETH",
                    "toSymbol": "PENDLE",
                    "commissionRequired": True,
                    "reasonCode": "unsupported_commission_route",
                },
                {
                    "event": "quote_failure",
                    "ts": 2_010_000_002,
                    "category": "quote_error",
                    "chainId": 1,
                    "provider": "quote_aggregator",
                    "reasonCode": "unsupported_commission_route",
                    "reason": "This pair is not supported by Swaperex commission routing yet.",
                },
            ],
        },
    )

    res = await client.get("/api/v1/admin/failures", headers=hdr)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_failures"] == 2
    by_type = {r["failure_type"]: r["count"] for r in body["failures_by_type"]}
    assert by_type.get("route_unsupported") == 2
    for row in body["recent_failures"]:
        assert row["severity"] == "LOW"
        assert row["reason_code"] == "unsupported_commission_route"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_revenue_normalized_endpoint(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "rev-norm-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/revenue-normalized")).status_code == 401

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "rev-norm-1",
            "exportedAt": 3_000_000,
            "events": [
                {
                    "event": "swap_success",
                    "ts": 3_000_000_001,
                    "chainId": 1,
                    "txHash": "0xfee1",
                    "provider": "uniswap-v3-wrapper-v2",
                    "routeMode": "best",
                    "feeToTreasuryWei": "1000000",
                    "feeToken": {
                        "symbol": "USDC",
                        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                        "isNative": False,
                    },
                    "protocolFeeBps": 20,
                },
                {
                    "event": "swap_success",
                    "ts": 3_000_000_002,
                    "chainId": 1,
                    "txHash": "0xfee2",
                    "feeToTreasuryWei": "not-a-number",
                    "feeToken": {
                        "symbol": "USDC",
                        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                        "isNative": False,
                    },
                },
            ],
        },
    )

    hdr = {"X-Admin-Token": "rev-norm-test"}
    res = await client.get("/api/v1/admin/revenue-normalized", headers=hdr)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["normalization_schema_version"]
    assert body["coverage"]["total_fee_events"] == 2
    assert body["coverage"]["normalized_count"] == 1
    assert body["coverage"]["invalid_raw_value_count"] == 1
    recent = body["recent_normalized_fee_events"]
    assert len(recent) == 2
    ok = [r for r in recent if r["normalization_status"] == "normalized"][0]
    assert ok["decimals"] == 6
    assert ok["decimals_source"] == "frontend_token_list"
    assert ok["normalized_amount"] == "1"
    assert ok["raw_fee_wei"] == "1000000"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_revenue_reconciliation_endpoint(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "rev-recon-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/revenue-reconciliation")).status_code == 401

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "rev-recon-1",
            "exportedAt": 4_000_000,
            "events": [
                {
                    "event": "swap_success",
                    "ts": 4_000_000_001,
                    "chainId": 1,
                    "txHash": "0xzero1",
                    "provider": "uniswap-v3-wrapper-v2",
                    "routeMode": "best",
                    "commissionRoute": "wrapper",
                    "wrapperRoute": "uniswap-v3-wrapper-v2",
                    "fromToken": {"symbol": "WETH", "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "isNative": False},
                    "toToken": {"symbol": "USDC", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "isNative": False},
                    "fromAmount": "0.1",
                    "quotedOutput": "300",
                    "feeToTreasuryWei": "0",
                    "feeToken": {
                        "symbol": "USDC",
                        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                        "isNative": False,
                    },
                    "protocolFeeBps": 20,
                },
                {
                    "event": "swap_success",
                    "ts": 4_000_000_002,
                    "chainId": 1,
                    "txHash": "0xmiss1",
                    "provider": "uniswap-v3-wrapper-v2",
                    "routeMode": "best",
                    "commissionRoute": "wrapper",
                    "wrapperRoute": "uniswap-v3-wrapper-v2",
                    "fromToken": {"symbol": "WETH", "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "isNative": False},
                    "toToken": {"symbol": "USDC", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "isNative": False},
                    "fromAmount": "0.1",
                    "quotedOutput": "300",
                    "feeToken": {
                        "symbol": "USDC",
                        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                        "isNative": False,
                    },
                    "protocolFeeBps": 20,
                },
                {
                    "event": "swap_success",
                    "ts": 4_000_000_003,
                    "chainId": 1,
                    "txHash": "0x1inch1",
                    "provider": "1inch",
                    "routeMode": "best",
                    "feeToTreasuryWei": "0",
                    "feeToken": {
                        "symbol": "USDC",
                        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                        "isNative": False,
                    },
                },
            ],
        },
    )

    allowed_status = {
        "reconciled",
        "telemetry_zero_fee",
        "telemetry_missing_fee",
        "missing_expected_bps",
        "missing_decimals",
        "route_wrapper_mismatch",
        "unsupported_route",
        "unknown",
    }
    hdr = {"X-Admin-Token": "rev-recon-test"}
    res = await client.get("/api/v1/admin/revenue-reconciliation", headers=hdr)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["schema_version"] == "p3.2.0"
    summ = body["summary"]
    assert summ["total_swap_success_events"] == 3
    assert summ["wrapper_swap_events"] == 2
    assert summ["events_with_zero_fee"] >= 1
    assert summ["events_missing_fee_fields"] >= 1
    assert isinstance(body["expected_fee_config"], list)
    assert body["checks"]
    recent = body["recent_reconciliation_events"]
    assert len(recent) == 3
    for row in recent:
        assert row["reconciliation_status"] in allowed_status
        assert row["severity"] in ("OK", "LOW", "MEDIUM", "HIGH")
    by_tx = {r["tx_hash"]: r for r in recent}
    assert by_tx["0xzero1"]["reconciliation_status"] == "telemetry_zero_fee"
    assert by_tx["0xmiss1"]["reconciliation_status"] == "telemetry_missing_fee"
    assert by_tx["0x1inch1"]["reconciliation_status"] == "unsupported_route"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_swap_lifecycles_endpoint(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "lifecycle-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/swap-lifecycles")).status_code == 401

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "life-sess-1",
            "exportedAt": 9_000_000_000_000,
            "events": [
                {
                    "event": "swap_lifecycle",
                    "ts": 5_000_001,
                    "swapFlowId": "flow-done",
                    "stage": "quote_requested",
                    "chainId": 1,
                    "provider": "uniswap-v3-wrapper-v2",
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 5_000_100,
                    "swapFlowId": "flow-done",
                    "stage": "tx_broadcasted",
                    "chainId": 1,
                    "txHash": "0xdone1",
                },
                {
                    "event": "swap_success",
                    "ts": 5_000_200,
                    "chainId": 1,
                    "txHash": "0xdone1",
                    "provider": "uniswap-v3-wrapper-v2",
                    "fromToken": {"symbol": "ETH"},
                    "toToken": {"symbol": "USDT"},
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 5_000_300,
                    "swapFlowId": "flow-bad",
                    "stage": "tx_broadcasted",
                    "chainId": 1,
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 5_000_400,
                    "swapFlowId": "flow-bad",
                    "stage": "quote_requested",
                    "chainId": 1,
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 5_000_500,
                    "swapFlowId": "flow-rej",
                    "stage": "swap_signature_requested",
                    "chainId": 56,
                },
                {
                    "event": "wallet_rejected",
                    "ts": 5_000_550,
                    "chainId": 56,
                    "phase": "swap",
                    "reasonCode": "user_rejected",
                },
                {"event": "swap_lifecycle", "ts": 1_000, "swapFlowId": "flow-old", "stage": "quote_requested", "chainId": 1},
            ],
        },
    )

    hdr = {"X-Admin-Token": "lifecycle-test"}
    res = await client.get("/api/v1/admin/swap-lifecycles", headers=hdr)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["schema_version"] == "p3.3.0"
    summ = body["summary"]
    assert summ["total_lifecycles"] >= 4
    assert isinstance(summ["avg_duration_ms"], int)
    assert isinstance(summ["p95_duration_ms"], int)
    assert len(body["phase_definitions"]) >= 5
    recent = body["recent_lifecycles"]
    by_id = {r["lifecycle_id"]: r for r in recent}
    assert by_id["flow-done"]["status"] == "completed"
    assert by_id["flow-done"]["checks"]["phase_order_valid"] is True
    assert by_id["flow-bad"]["status"] == "orphaned"
    assert by_id["flow-rej"]["status"] == "rejected"
    assert by_id["flow-old"]["status"] == "incomplete"

    get_settings.cache_clear()


def test_swap_lifecycle_reconstruction_lifecycle_id_filter():
    """Unit-test filter wiring (independent of httpx query serialization)."""
    from datetime import datetime, timezone

    from swaperex.api.swap_lifecycle_reconstruction import build_swap_lifecycles_payload

    class FakeBatch:
        received_at = datetime.now(timezone.utc)
        client_session_id = "s1"
        envelope = {
            "events": [
                {
                    "event": "swap_lifecycle",
                    "ts": 100,
                    "swapFlowId": "aaa",
                    "stage": "quote_requested",
                    "chainId": 1,
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 200,
                    "swapFlowId": "bbb",
                    "stage": "quote_requested",
                    "chainId": 1,
                },
            ],
        }

    out = build_swap_lifecycles_payload([FakeBatch()], lifecycle_id_filter="aaa")
    ids = {r["lifecycle_id"] for r in out["recent_lifecycles"]}
    assert ids == {"aaa"}


def test_swap_lifecycle_reconstruction_accepts_flow_id_alias():
    from datetime import datetime, timezone

    from swaperex.api.swap_lifecycle_reconstruction import build_swap_lifecycles_payload

    class FakeBatch:
        received_at = datetime.now(timezone.utc)
        client_session_id = "s1"
        envelope = {
            "events": [
                {
                    "event": "swap_lifecycle",
                    "ts": 100,
                    "flowId": "canonical-flow-1",
                    "stage": "quote_requested",
                    "chainId": 1,
                },
            ],
        }

    out = build_swap_lifecycles_payload([FakeBatch()], lifecycle_id_filter="canonical-flow-1")
    ids = {r["lifecycle_id"] for r in out["recent_lifecycles"]}
    assert ids == {"canonical-flow-1"}


@pytest.mark.asyncio
async def test_admin_health_alerts_endpoint(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "health-alerts-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/health-alerts")).status_code == 401
    hdr = {"X-Admin-Token": "health-alerts-test"}
    res0 = await client.get("/api/v1/admin/health-alerts", headers=hdr)
    assert res0.status_code == 200, res0.text
    body0 = res0.json()
    assert body0["schema_version"] == "p3.4.0"
    assert body0["overall"]["status"] in ("healthy", "warning", "critical", "unknown")
    assert isinstance(body0["overall"]["score"], int)
    assert 0 <= body0["overall"]["score"] <= 100
    assert body0["overall"]["highest_severity"] in ("OK", "LOW", "MEDIUM", "HIGH")
    blob0 = json.dumps(body0).lower()
    for bad in ("lost revenue", "treasury missing", "missing funds"):
        assert bad not in blob0

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "health-1",
            "exportedAt": 7_000_000,
            "events": [
                {
                    "event": "swap_success",
                    "ts": 7_000_000_001,
                    "chainId": 1,
                    "txHash": "0xhealthfee1",
                    "provider": "uniswap-v3-wrapper-v2",
                    "commissionRoute": "wrapper",
                    "wrapperRoute": "uniswap-v3-wrapper-v2",
                    "fromToken": {"symbol": "WETH"},
                    "toToken": {"symbol": "USDC"},
                    "feeToTreasuryWei": "0",
                    "feeToken": {
                        "symbol": "USDC",
                        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    },
                    "protocolFeeBps": 20,
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 7_000_000_050,
                    "swapFlowId": "health-lc-1",
                    "stage": "tx_broadcasted",
                    "chainId": 1,
                },
                {
                    "event": "swap_lifecycle",
                    "ts": 7_000_000_051,
                    "swapFlowId": "health-lc-1",
                    "stage": "quote_requested",
                    "chainId": 1,
                },
            ],
        },
    )
    res1 = await client.get("/api/v1/admin/health-alerts?maxBatches=50", headers=hdr)
    assert res1.status_code == 200, res1.text
    body1 = res1.json()
    assert body1["metrics"]["revenue_telemetry_zero_fee_count"] >= 1
    alert_ids = {a["id"] for a in body1["alerts"]}
    assert "fee_telemetry_gap" in alert_ids
    assert any(a["category"] == "lifecycle" for a in body1["alerts"])
    for al in body1["alerts"]:
        assert al["severity"] in ("LOW", "MEDIUM", "HIGH")
    blob1 = json.dumps(body1).lower()
    for bad in ("lost revenue", "treasury missing", "missing funds"):
        assert bad not in blob1

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_revenue_aggregation(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/revenue")).status_code == 401

    hdr = {"X-Admin-Token": "panel-secret-test"}
    empty = await client.get("/api/v1/admin/revenue", headers=hdr)
    assert empty.status_code == 200
    assert empty.json()["total_swaps"] == 0

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "rev-1",
            "exportedAt": 1,
            "events": [
                {
                    "event": "swap_success",
                    "ts": 1_900_000_000_000,
                    "chainId": 1,
                    "txHash": "0xaa",
                    "provider": "p",
                    "routeMode": "best",
                    "feeToTreasuryWei": "150",
                    "userNetWei": "999",
                    "feeToken": {"symbol": "USDT", "address": "0xUSDT", "isNative": False},
                    "protocolFeeBps": 10,
                },
                {
                    "event": "swap_success",
                    "ts": 1_900_000_000_001,
                    "chainId": 1,
                    "txHash": "0xbb",
                    "provider": "p",
                    "routeMode": "best",
                },
                {
                    "event": "swap_success",
                    "ts": 1_900_000_000_002,
                    "chainId": 2,
                    "txHash": "0xcc",
                    "feeToTreasuryWei": "bad",
                    "feeToken": {"symbol": "ETH", "address": None, "isNative": True},
                },
                {
                    "event": "swap_success",
                    "ts": 1_900_000_000_003,
                    "chainId": 2,
                    "txHash": "0xdd",
                    "feeToTreasuryWei": "0",
                    "feeToken": {"symbol": "ETH", "address": None, "isNative": True},
                },
            ],
        },
    )

    r = await client.get("/api/v1/admin/revenue", headers=hdr)
    assert r.status_code == 200
    body = r.json()
    assert body["total_swaps"] == 4
    assert body["enriched_swaps_count"] == 3
    assert body["swaps_with_fee_data"] == 2
    assert body["missing_fee_data"] == 2

    usdt_row = next(x for x in body["total_fee_by_token"] if x["symbol"] == "USDT")
    assert usdt_row["raw_total"] == "150"
    assert usdt_row["address"] == "0xusdt"
    eth_row = next(x for x in body["total_fee_by_token"] if x["symbol"] == "ETH")
    assert eth_row["raw_total"] == "0"

    assert len(body["latest_fee_events"]) == 2
    assert body["latest_fee_events"][0]["tx_hash"] == "0xdd"
    assert body["latest_fee_events"][1]["tx_hash"] == "0xaa"
    assert body["latest_fee_events"][0]["raw_fee_wei"] == "0"

    assert "revenue_by_chain" in body and len(body["revenue_by_chain"]) == 2
    assert "revenue_by_route" in body and len(body["revenue_by_route"]) >= 1

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_wallet_reconnect_analytics(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    assert (await client.get("/api/v1/admin/wallet-reconnect")).status_code == 401

    hdr = {"X-Admin-Token": "panel-secret-test"}
    z = await client.get("/api/v1/admin/wallet-reconnect", headers=hdr)
    assert z.status_code == 200
    assert z.json()["totals"]["scans"] == 0
    assert z.json()["reconnect_success_rate"] is None

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "wc-sess-1",
            "exportedAt": 1,
            "events": [
                {
                    "event": "wallet_autoreconnect_scan",
                    "ts": 1000,
                    "lastConnector": "walletconnect",
                    "wcProjectIdConfigured": True,
                },
                {"event": "legacy_wc_reconnect_attempt", "ts": 1001},
                {"event": "legacy_wc_reconnect_failure", "ts": 1002, "reason": "exception"},
                {"event": "appkit_reconnect_success", "ts": 2000},
            ],
        },
    )

    r = await client.get("/api/v1/admin/wallet-reconnect", headers=hdr)
    assert r.status_code == 200
    b = r.json()
    assert b["totals"]["scans"] == 1
    assert b["totals"]["appkit_success"] == 1
    assert b["totals"]["legacy_attempts"] == 1
    assert b["totals"]["legacy_success"] == 0
    assert b["totals"]["legacy_failures"] == 1
    assert b["reconnect_success_rate"] == 50.0
    assert len(b["recent_failures"]) == 1
    assert b["recent_failures"][0]["reason"] == "exception"
    assert b["recent_failures"][0]["last_connector"] == "walletconnect"
    assert b["recent_failures"][0]["wc_project_id_configured"] is True

    sess = next(s for s in b["recent_sessions"] if s["client_session_id"] == "wc-sess-1")
    assert sess["reconnect_count"] == 1
    assert sess["appkit_connected"] is True
    assert sess["latest_event"] == "appkit_reconnect_success"

    assert isinstance(b["reconnect_timeline"], list)
    assert len(b["reconnect_timeline"]) >= 1

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_events_requires_token(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    no_hdr = await client.get("/api/v1/admin/events")
    assert no_hdr.status_code == 401

    ok = await client.get("/api/v1/admin/events", headers={"X-Admin-Token": "panel-secret-test"})
    assert ok.status_code == 200
    body = ok.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["limit"] == 50
    assert body["offset"] == 0

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_events_lists_batches_and_filters(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "sess-alpha",
            "exportedAt": 10,
            "events": [
                {"event": "swap_success", "ts": 1},
                {"event": "rpc_failure", "ts": 2},
            ],
        },
    )
    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "sess-beta",
            "exportedAt": 20,
            "events": [{"event": "wallet_connect", "ts": 3}],
        },
    )

    hdr = {"X-Admin-Token": "panel-secret-test"}

    all_batches = await client.get("/api/v1/admin/events?limit=10&offset=0", headers=hdr)
    assert all_batches.status_code == 200
    data = all_batches.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    # Newest first (sess-beta posted second)
    assert data["items"][0]["client_session_id"] == "sess-beta"
    assert data["items"][0]["event_count"] == 1
    assert data["items"][0]["event_names"] == ["wallet_connect"]
    assert data["items"][0]["schema_version"] == 1
    assert "raw" not in data["items"][0]

    older = data["items"][1]
    assert older["event_names"] == ["swap_success", "rpc_failure"]
    assert "received_at" in older

    by_session = await client.get(
        "/api/v1/admin/events?clientSessionId=sess-alpha",
        headers=hdr,
    )
    assert by_session.json()["total"] == 1
    assert by_session.json()["items"][0]["client_session_id"] == "sess-alpha"

    by_event = await client.get("/api/v1/admin/events?event=swap_success", headers=hdr)
    assert by_event.json()["total"] == 1
    assert by_event.json()["items"][0]["client_session_id"] == "sess-alpha"

    with_raw = await client.get("/api/v1/admin/events?includeRaw=1&limit=1", headers=hdr)
    assert with_raw.status_code == 200
    first = with_raw.json()["items"][0]
    assert "raw" in first
    assert first["raw"]["clientSessionId"] == first["client_session_id"]

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_overview_counts_batches(admin_client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "ov-test",
            "exportedAt": 1,
            "events": [{"event": "swap_success", "ts": 2}],
        },
    )

    ov = await client.get("/api/v1/admin/overview", headers={"X-Admin-Token": "panel-secret-test"})
    assert ov.status_code == 200
    data = ov.json()
    assert data["monitoring_batch_count"] >= 1
    assert data["monitoring_latest_received_at"] is not None

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_admin_operator_intelligence_endpoint(admin_client, monkeypatch):
    """P5A — operator intelligence aggregates monitoring batches (read-only)."""
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, _ = admin_client
    hdr = {"X-Admin-Token": "panel-secret-test"}

    await client.post(
        "/api/v1/monitoring/events",
        json={
            "schemaVersion": 1,
            "clientSessionId": "oi-test",
            "exportedAt": 1,
            "events": [
                {
                    "event": "quote_success",
                    "ts": 1_700_000_000_000,
                    "chainId": 1,
                    "pairKey": "1|WETH|USDC",
                },
                {
                    "event": "swap_success",
                    "ts": 1_700_000_000_000,
                    "chainId": 1,
                    "pairKey": "1|WETH|USDC",
                    "fromAmount": "2",
                    "feeToTreasuryWei": "500",
                    "feeToken": {"symbol": "USDC"},
                },
            ],
        },
    )

    res = await client.get("/api/v1/admin/operator-intelligence?maxBatches=10", headers=hdr)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["schema_version"] == 3
    assert body["window"]["events_scanned"] >= 2
    assert "scan" in body["window"]
    assert body["window"]["scan"]["batches_scanned"] <= 10
    assert "funnel" in body
    assert "pairs" in body
    assert "alerts" in body
    assert "decision_support" in body
    assert body["telemetry_inventory_summary"]["event_counts"].get("quote_success", 0) >= 1

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_operator_intelligence_plain_get_no_snapshot_write(admin_client, monkeypatch):
    """P5B.1 — default GET must not persist daily snapshots."""
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, db_path = admin_client
    hdr = {"X-Admin-Token": "panel-secret-test"}

    import sqlalchemy as sa
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        before = (
            await conn.execute(
                sa.text(
                    "SELECT COUNT(*) FROM monitoring_ingest_batches "
                    "WHERE client_session_id = 'p5b-insight-store'"
                )
            )
        ).scalar_one()
    await engine.dispose()

    res = await client.get("/api/v1/admin/operator-intelligence", headers=hdr)
    assert res.status_code == 200

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        after = (
            await conn.execute(
                sa.text(
                    "SELECT COUNT(*) FROM monitoring_ingest_batches "
                    "WHERE client_session_id = 'p5b-insight-store'"
                )
            )
        ).scalar_one()
    await engine.dispose()
    assert after == before

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_operator_intelligence_persist_daily_idempotent(admin_client, monkeypatch):
    """P5B.1 — persistDaily=true writes at most one snapshot per UTC day."""
    monkeypatch.setenv("ADMIN_API_TOKEN", "panel-secret-test")
    from swaperex.config import get_settings

    get_settings.cache_clear()
    client, db_path = admin_client
    hdr = {"X-Admin-Token": "panel-secret-test"}

    url = "/api/v1/admin/operator-intelligence?persistDaily=true"
    r1 = await client.get(url, headers=hdr)
    r2 = await client.get(url, headers=hdr)
    assert r1.status_code == 200
    assert r2.status_code == 200

    import sqlalchemy as sa
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        count = (
            await conn.execute(
                sa.text(
                    "SELECT COUNT(*) FROM monitoring_ingest_batches "
                    "WHERE client_session_id = 'p5b-insight-store'"
                )
            )
        ).scalar_one()
    await engine.dispose()
    assert count == 1

    get_settings.cache_clear()
