"""Factory for creating swap route providers and aggregators.

Creates real providers when API keys are available, otherwise
falls back to simulated providers.
"""

import logging
import os
from typing import Optional

from swaperex.config import get_settings
from swaperex.routing.base import RouteAggregator, RouteProvider

logger = logging.getLogger(__name__)


def create_thorchain_provider(use_real: bool = True) -> RouteProvider:
    """Create THORChain provider.

    THORChain doesn't require API keys, so real provider is default.
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


def create_oneinch_provider(
    chain: str = "ethereum",
    api_key: Optional[str] = None,
) -> RouteProvider:
    """Create 1inch DEX aggregator provider.

    Args:
        chain: Chain to use (ethereum, bsc, polygon, etc.)
        api_key: 1inch API key (uses ONEINCH_API_KEY env var if not provided)
    """
    settings = get_settings()
    api_key = api_key or os.environ.get("ONEINCH_API_KEY")

    if api_key and not settings.dry_run:
        try:
            from swaperex.routing.oneinch import OneInchProvider
            return OneInchProvider(api_key=api_key, chain=chain)
        except Exception as e:
            logger.warning(f"Failed to create real 1inch provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedDexAggregator
    return SimulatedDexAggregator()


def create_aggregator(
    include_thorchain: bool = True,
    include_oneinch: bool = True,
    oneinch_chains: Optional[list[str]] = None,
) -> RouteAggregator:
    """Create a route aggregator with configured providers.

    Args:
        include_thorchain: Include THORChain provider
        include_oneinch: Include 1inch providers
        oneinch_chains: List of chains for 1inch (default: ethereum, bsc, polygon)

    Returns:
        Configured RouteAggregator
    """
    settings = get_settings()
    aggregator = RouteAggregator()

    # Always add dry-run provider for testing
    from swaperex.routing.dry_run import DryRunRouter
    aggregator.add_provider(DryRunRouter())

    # Add THORChain for cross-chain swaps
    if include_thorchain:
        provider = create_thorchain_provider(use_real=not settings.dry_run)
        aggregator.add_provider(provider)
        logger.info(f"Added {provider.name} provider")

    # Add 1inch for EVM DEX swaps
    if include_oneinch:
        chains = oneinch_chains or ["ethereum"]
        for chain in chains:
            provider = create_oneinch_provider(chain=chain)
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")

    return aggregator


def create_production_aggregator() -> RouteAggregator:
    """Create aggregator with all production providers enabled."""
    return create_aggregator(
        include_thorchain=True,
        include_oneinch=True,
        oneinch_chains=["ethereum", "bsc", "polygon"],
    )


def create_minimal_aggregator() -> RouteAggregator:
    """Create aggregator with minimal providers (for testing)."""
    aggregator = RouteAggregator()
    from swaperex.routing.dry_run import DryRunRouter
    aggregator.add_provider(DryRunRouter())
    return aggregator
