"""Tests for the routing module."""

from decimal import Decimal

import pytest

from swaperex.routing.base import RouteAggregator
from swaperex.routing.dry_run import (
    DryRunRouter,
    SimulatedDexAggregator,
    SimulatedThorChainRouter,
    create_default_aggregator,
)


class TestDryRunRouter:
    """Tests for the DryRunRouter."""

    @pytest.mark.asyncio
    async def test_get_quote_basic(self):
        """Test basic quote generation."""
        router = DryRunRouter(add_random_variance=False)
        quote = await router.get_quote("BTC", "ETH", Decimal("1.0"))

        assert quote is not None
        assert quote.from_asset == "BTC"
        assert quote.to_asset == "ETH"
        assert quote.from_amount == Decimal("1.0")
        assert quote.to_amount > 0
        assert quote.is_simulated is True

    @pytest.mark.asyncio
    async def test_get_quote_with_fee(self):
        """Test quote with base fee."""
        router = DryRunRouter(
            base_fee_percent=Decimal("0.01"),  # 1% fee
            network_fee_usd=Decimal("1.00"),
            add_random_variance=False,
        )
        quote = await router.get_quote("USDT", "ETH", Decimal("1000"))

        assert quote is not None
        # Fee should be ~$10 (1% of $1000) + $1 network = $11
        assert quote.fee_amount >= Decimal("10")

    @pytest.mark.asyncio
    async def test_get_quote_unsupported_asset(self):
        """Test quote for unsupported asset returns None."""
        router = DryRunRouter()
        quote = await router.get_quote("UNKNOWN", "BTC", Decimal("1.0"))

        assert quote is None

    @pytest.mark.asyncio
    async def test_get_quote_zero_amount(self):
        """Test quote with zero amount returns None."""
        router = DryRunRouter()
        quote = await router.get_quote("BTC", "ETH", Decimal("0"))

        assert quote is None

    @pytest.mark.asyncio
    async def test_effective_rate(self):
        """Test effective rate calculation."""
        router = DryRunRouter(add_random_variance=False)
        quote = await router.get_quote("ETH", "USDT", Decimal("1.0"))

        assert quote is not None
        # ETH ~$3450, so rate should be around 3450 USDT per ETH
        assert quote.effective_rate > Decimal("3000")
        assert quote.effective_rate < Decimal("4000")

    @pytest.mark.asyncio
    async def test_execute_swap(self):
        """Test simulated swap execution."""
        router = DryRunRouter()
        quote = await router.get_quote("BTC", "ETH", Decimal("0.1"))

        from swaperex.routing.base import SwapRoute

        route = SwapRoute(quote=quote)
        result = await router.execute_swap(route)

        assert result["success"] is True
        assert "tx_hash" in result
        assert result["simulated"] is True


class TestSimulatedProviders:
    """Tests for simulated providers."""

    @pytest.mark.asyncio
    async def test_thorchain_supported_assets(self):
        """Test THORChain supported assets."""
        router = SimulatedThorChainRouter()

        assert "BTC" in router.supported_assets
        assert "ETH" in router.supported_assets
        assert "RUNE" in router.supported_assets
        # Should not support EVM-only tokens
        assert "UNI" not in router.supported_assets

    @pytest.mark.asyncio
    async def test_dex_aggregator_supported_assets(self):
        """Test DEX aggregator supported assets."""
        router = SimulatedDexAggregator()

        assert "ETH" in router.supported_assets
        assert "USDT" in router.supported_assets
        assert "UNI" in router.supported_assets
        # Should not support non-EVM assets
        assert "BTC" not in router.supported_assets

    @pytest.mark.asyncio
    async def test_provider_quote_comparison(self):
        """Test different providers give different quotes."""
        dry_run = DryRunRouter(add_random_variance=False)
        thorchain = SimulatedThorChainRouter()

        # Both support ETH -> USDT
        quote1 = await dry_run.get_quote("ETH", "USDT", Decimal("1.0"))
        quote2 = await thorchain.get_quote("ETH", "USDT", Decimal("1.0"))

        assert quote1 is not None
        assert quote2 is not None
        # Quotes should differ due to different fee structures
        assert quote1.to_amount != quote2.to_amount


class TestRouteAggregator:
    """Tests for the route aggregator."""

    @pytest.mark.asyncio
    async def test_aggregator_gets_all_quotes(self):
        """Test aggregator returns quotes from all providers."""
        aggregator = create_default_aggregator()

        # ETH -> USDT is supported by multiple providers
        quotes = await aggregator.get_all_quotes("ETH", "USDT", Decimal("1.0"))

        # Should get quotes from at least 2 providers
        assert len(quotes) >= 2

        providers = [q.provider for q in quotes]
        assert "dry_run" in providers

    @pytest.mark.asyncio
    async def test_aggregator_best_quote(self):
        """Test aggregator returns best quote."""
        # Use routers with no variance for deterministic results
        from swaperex.routing.base import RouteAggregator

        aggregator = RouteAggregator()
        aggregator.add_provider(DryRunRouter(add_random_variance=False))
        aggregator.add_provider(SimulatedThorChainRouter())
        aggregator.add_provider(SimulatedDexAggregator())

        best = await aggregator.get_best_quote("ETH", "USDT", Decimal("1.0"))

        assert best is not None
        # Best quote should have highest to_amount
        all_quotes = await aggregator.get_all_quotes("ETH", "USDT", Decimal("1.0"))
        max_to_amount = max(q.to_amount for q in all_quotes)

        assert best.to_amount == max_to_amount

    @pytest.mark.asyncio
    async def test_aggregator_cross_chain(self):
        """Test cross-chain swap (BTC -> ETH) routing."""
        aggregator = create_default_aggregator()

        quotes = await aggregator.get_all_quotes("BTC", "ETH", Decimal("0.1"))

        # Should have at least dry_run and thorchain
        assert len(quotes) >= 1

    @pytest.mark.asyncio
    async def test_aggregator_no_quotes_for_unsupported(self):
        """Test aggregator returns empty for unsupported pairs."""
        aggregator = RouteAggregator()
        # Add only DEX aggregator which doesn't support BTC
        aggregator.add_provider(SimulatedDexAggregator())

        quotes = await aggregator.get_all_quotes("BTC", "ETH", Decimal("1.0"))

        assert len(quotes) == 0


class TestSwapRoute:
    """Tests for SwapRoute."""

    @pytest.mark.asyncio
    async def test_route_to_dict(self):
        """Test route serialization."""
        from swaperex.routing.base import SwapRoute

        router = DryRunRouter()
        quote = await router.get_quote("BTC", "USDT", Decimal("0.5"))
        route = SwapRoute(quote=quote, expiry_seconds=120)

        data = route.to_dict()

        assert data["provider"] == "dry_run"
        assert data["from_asset"] == "BTC"
        assert data["to_asset"] == "USDT"
        assert data["expiry_seconds"] == 120
        assert data["is_simulated"] is True
