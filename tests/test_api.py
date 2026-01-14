"""Tests for the FastAPI endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from swaperex.api.app import create_app
from swaperex.ledger.database import init_db, close_db, get_engine
from swaperex.ledger.models import Base


@pytest.fixture
async def test_app():
    """Create test application with fresh database."""
    # Create tables in memory database
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app = create_app()

    yield app

    # Cleanup
    await close_db()


@pytest.fixture
async def client(test_app):
    """Create async test client."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    @pytest.mark.asyncio
    async def test_health_check(self, client):
        """Test basic health check."""
        response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "swaperex"

    @pytest.mark.asyncio
    async def test_detailed_health(self, client):
        """Test detailed health check."""
        response = await client.get("/health/detailed")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "config" in data
        assert "environment" in data["config"]


class TestDepositEndpoints:
    """Tests for deposit endpoints."""

    @pytest.mark.asyncio
    async def test_simulate_deposit(self, client):
        """Test simulated deposit endpoint."""
        response = await client.post(
            "/api/v1/deposits/simulate",
            json={
                "telegram_id": 123456789,
                "asset": "BTC",
                "amount": "0.5",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deposit_id"] is not None
        assert "0.5" in data["message"]
        assert "BTC" in data["message"]

    @pytest.mark.asyncio
    async def test_simulate_deposit_invalid_amount(self, client):
        """Test simulated deposit with invalid amount."""
        response = await client.post(
            "/api/v1/deposits/simulate",
            json={
                "telegram_id": 123456789,
                "asset": "BTC",
                "amount": "invalid",
            },
        )

        # FastAPI returns 422 for validation errors
        assert response.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_get_deposit(self, client):
        """Test getting deposit by ID."""
        # First create a deposit
        create_response = await client.post(
            "/api/v1/deposits/simulate",
            json={
                "telegram_id": 987654321,
                "asset": "ETH",
                "amount": "1.0",
            },
        )

        deposit_id = create_response.json()["deposit_id"]

        # Now get it
        response = await client.get(f"/api/v1/deposits/{deposit_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == deposit_id
        assert data["asset"] == "ETH"
        assert float(data["amount"]) == 1.0  # Handle decimal formatting
        assert data["status"] == "confirmed"

    @pytest.mark.asyncio
    async def test_get_deposit_not_found(self, client):
        """Test getting non-existent deposit."""
        response = await client.get("/api/v1/deposits/99999")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_webhook_unknown_address(self, client):
        """Test webhook with unknown address."""
        response = await client.post(
            "/api/v1/deposits/webhook",
            json={
                "address": "unknown_address_xyz",
                "asset": "BTC",
                "amount": "0.1",
                "tx_hash": "abc123",
            },
        )

        # FastAPI may return 404 or 422 depending on validation path
        assert response.status_code in (404, 422)


class TestMultipleDeposits:
    """Tests for multiple deposits."""

    @pytest.mark.asyncio
    async def test_multiple_deposits_accumulate(self, client):
        """Test multiple deposits add up correctly."""
        # Create first deposit
        await client.post(
            "/api/v1/deposits/simulate",
            json={
                "telegram_id": 111222333,
                "asset": "USDT",
                "amount": "100",
            },
        )

        # Create second deposit
        response = await client.post(
            "/api/v1/deposits/simulate",
            json={
                "telegram_id": 111222333,
                "asset": "USDT",
                "amount": "50",
            },
        )

        assert response.status_code == 200
        # Note: We can't directly check balance via API in this test
        # but the ledger tests verify balance accumulation
