"""Factory for creating swap route providers and aggregators.

Provider architecture:
1. THORChain - Cross-chain native swaps (BTC, ETH, LTC, BCH, DOGE, AVAX, ATOM, BNB, RUNE)
2. Internal Reserve - DASH swaps via operator's liquidity reserve with CoinGecko pricing
3. DryRun - Simulated fallback for testing
"""

import logging
from decimal import Decimal
from typing import Optional

from swaperex.config import get_settings
from swaperex.routing.base import RouteAggregator, RouteProvider

logger = logging.getLogger(__name__)


def create_thorchain_provider(use_real: bool = True) -> RouteProvider:
    """Create THORChain provider.

    THORChain doesn't require API keys, so real provider is default.
    Supports: BTC, ETH, LTC, BCH, DOGE, AVAX, ATOM, BNB, RUNE
    """
    settings = get_settings()
    stagenet = not settings.is_production

    if use_real and not settings.dry_run:
        try:
            from swaperex.routing.thorchain import THORChainProvider
            return THORChainProvider(stagenet=stagenet)
        except Exception as e:
            logger.warning(f"Failed to create real THORChain provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedThorChainRouter
    return SimulatedThorChainRouter()


def create_internal_reserve_provider(
    spread_percent: Optional[Decimal] = None,
) -> RouteProvider:
    """Create Internal Reserve provider for DASH swaps.

    The operator maintains DASH + USDT reserves and acts as market maker.
    Uses CoinGecko for live pricing with configurable spread.

    Args:
        spread_percent: Spread percentage (default from DASH_SPREAD_PCT env or 1.0%)
    """
    import os

    from swaperex.routing.internal_reserve import InternalReserveProvider

    # Get spread from environment or use default
    if spread_percent is None:
        spread_str = os.environ.get("DASH_SPREAD_PCT", "1.0")
        spread_percent = Decimal(spread_str)

    provider = InternalReserveProvider(spread_percent=spread_percent)
    logger.info(f"Internal Reserve provider created with {spread_percent}% spread")
    return provider


def create_aggregator(
    include_thorchain: bool = True,
    include_internal_reserve: bool = True,
    include_dry_run: bool = True,
) -> RouteAggregator:
    """Create a route aggregator with configured providers.

    Args:
        include_thorchain: Include THORChain for cross-chain swaps
        include_internal_reserve: Include Internal Reserve for DASH swaps
        include_dry_run: Include dry-run fallback provider

    Returns:
        Configured RouteAggregator
    """
    settings = get_settings()
    aggregator = RouteAggregator()

    # Add Internal Reserve for DASH swaps (highest priority for DASH)
    if include_internal_reserve:
        provider = create_internal_reserve_provider()
        aggregator.add_provider(provider)
        logger.info(f"Added {provider.name} provider (DASH swaps)")

    # Add THORChain for cross-chain swaps
    if include_thorchain:
        provider = create_thorchain_provider(use_real=not settings.dry_run)
        aggregator.add_provider(provider)
        logger.info(f"Added {provider.name} provider (cross-chain)")

    # Add dry-run provider as fallback
    if include_dry_run:
        from swaperex.routing.dry_run import DryRunRouter
        aggregator.add_provider(DryRunRouter())
        logger.info("Added DryRun provider (fallback)")

    return aggregator


def create_production_aggregator() -> RouteAggregator:
    """Create aggregator with all production providers enabled.

    - Internal Reserve for DASH <-> USDT
    - THORChain for BTC, ETH, LTC, BCH, DOGE, AVAX, ATOM, BNB, RUNE
    """
    return create_aggregator(
        include_thorchain=True,
        include_internal_reserve=True,
        include_dry_run=False,  # No fallback in production
    )


def create_default_aggregator() -> RouteAggregator:
    """Create default aggregator for most use cases.

    Includes all providers with dry-run fallback.
    """
    return create_aggregator(
        include_thorchain=True,
        include_internal_reserve=True,
        include_dry_run=True,
    )


def create_minimal_aggregator() -> RouteAggregator:
    """Create aggregator with minimal providers (for testing)."""
    aggregator = RouteAggregator()
    from swaperex.routing.dry_run import DryRunRouter
    aggregator.add_provider(DryRunRouter())
    return aggregator


def create_dash_only_aggregator() -> RouteAggregator:
    """Create aggregator with only Internal Reserve provider.

    Use this for DASH-only swaps without cross-chain.
    """
    return create_aggregator(
        include_thorchain=False,
        include_internal_reserve=True,
        include_dry_run=True,
    )


def create_thorchain_only_aggregator() -> RouteAggregator:
    """Create aggregator with only THORChain provider.

    Use this for cross-chain swaps without DASH internal reserve.
    """
    return create_aggregator(
        include_thorchain=True,
        include_internal_reserve=False,
        include_dry_run=True,
    )
