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
