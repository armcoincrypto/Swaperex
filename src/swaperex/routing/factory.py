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


def create_jupiter_provider(api_key: Optional[str] = None) -> RouteProvider:
    """Create Jupiter provider for Solana.

    Args:
        api_key: Optional Jupiter API key for higher rate limits
    """
    settings = get_settings()

    if not settings.dry_run:
        try:
            from swaperex.routing.jupiter import JupiterProvider
            return JupiterProvider(api_key=api_key)
        except Exception as e:
            logger.warning(f"Failed to create real Jupiter provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedJupiterRouter
    return SimulatedJupiterRouter()


def create_osmosis_provider() -> RouteProvider:
    """Create Osmosis provider for Cosmos ecosystem."""
    settings = get_settings()

    if not settings.dry_run:
        try:
            from swaperex.routing.osmosis import OsmosisProvider
            return OsmosisProvider()
        except Exception as e:
            logger.warning(f"Failed to create real Osmosis provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedOsmosisRouter
    return SimulatedOsmosisRouter()


def create_sunswap_provider(api_key: Optional[str] = None) -> RouteProvider:
    """Create SunSwap provider for Tron.

    Args:
        api_key: Optional TronGrid API key
    """
    settings = get_settings()
    api_key = api_key or os.environ.get("TRONGRID_API_KEY")

    if not settings.dry_run:
        try:
            from swaperex.routing.sunswap import SunSwapProvider
            return SunSwapProvider(api_key=api_key)
        except Exception as e:
            logger.warning(f"Failed to create real SunSwap provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedSunSwapRouter
    return SimulatedSunSwapRouter()


def create_stonfi_provider(api_key: Optional[str] = None) -> RouteProvider:
    """Create STON.fi provider for TON."""
    settings = get_settings()

    if not settings.dry_run:
        try:
            from swaperex.routing.stonfi import StonfiProvider
            return StonfiProvider(api_key=api_key)
        except Exception as e:
            logger.warning(f"Failed to create real STON.fi provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedStonfiRouter
    return SimulatedStonfiRouter()


def create_ref_finance_provider() -> RouteProvider:
    """Create Ref Finance provider for NEAR."""
    settings = get_settings()

    if not settings.dry_run:
        try:
            from swaperex.routing.ref_finance import RefFinanceProvider
            return RefFinanceProvider()
        except Exception as e:
            logger.warning(f"Failed to create real Ref Finance provider: {e}")

    # Fallback to simulated
    from swaperex.routing.dry_run import SimulatedRefFinanceRouter
    return SimulatedRefFinanceRouter()


def create_chain_aggregator(chain: str) -> RouteAggregator:
    """Create a route aggregator for a specific chain/DEX.

    This is the main factory function used by the swap handler.
    Creates real providers when available, with simulated fallbacks.

    Args:
        chain: The chain/DEX identifier (e.g., 'pancakeswap', 'uniswap', etc.)

    Returns:
        RouteAggregator with providers for the specified chain
    """
    aggregator = RouteAggregator()

    chain_lower = chain.lower()

    # Add chain-specific providers
    if chain_lower == "pancakeswap":
        # BNB Chain - Use 1inch aggregator for BSC
        aggregator.add_provider(create_oneinch_provider(chain="bsc"))
        logger.info("Added 1inch (BSC) provider for PancakeSwap")

    elif chain_lower == "uniswap":
        # Ethereum - Use 1inch aggregator
        aggregator.add_provider(create_oneinch_provider(chain="ethereum"))
        logger.info("Added 1inch (Ethereum) provider for Uniswap")

    elif chain_lower == "quickswap":
        # Polygon - Use 1inch aggregator
        aggregator.add_provider(create_oneinch_provider(chain="polygon"))
        logger.info("Added 1inch (Polygon) provider for QuickSwap")

    elif chain_lower == "traderjoe":
        # Avalanche - Use 1inch aggregator
        aggregator.add_provider(create_oneinch_provider(chain="avalanche"))
        logger.info("Added 1inch (Avalanche) provider for TraderJoe")

    elif chain_lower == "thorchain":
        # Cross-chain swaps
        aggregator.add_provider(create_thorchain_provider())
        logger.info("Added THORChain provider")

    elif chain_lower == "jupiter":
        # Solana
        aggregator.add_provider(create_jupiter_provider())
        logger.info("Added Jupiter provider")

    elif chain_lower == "osmosis":
        # Cosmos ecosystem
        aggregator.add_provider(create_osmosis_provider())
        logger.info("Added Osmosis provider")

    elif chain_lower == "sunswap":
        # Tron
        aggregator.add_provider(create_sunswap_provider())
        logger.info("Added SunSwap provider")

    elif chain_lower == "stonfi":
        # TON
        aggregator.add_provider(create_stonfi_provider())
        logger.info("Added STON.fi provider")

    elif chain_lower == "ref_finance":
        # NEAR
        aggregator.add_provider(create_ref_finance_provider())
        logger.info("Added Ref Finance provider")

    else:
        # Default: add dry-run router
        from swaperex.routing.dry_run import DryRunRouter
        aggregator.add_provider(DryRunRouter())
        logger.warning(f"Unknown chain '{chain}', using DryRunRouter")

    return aggregator


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
    aggregator = RouteAggregator()

    # EVM chains via 1inch
    for chain in ["ethereum", "bsc", "polygon", "avalanche"]:
        aggregator.add_provider(create_oneinch_provider(chain=chain))

    # Cross-chain
    aggregator.add_provider(create_thorchain_provider())

    # Non-EVM chains
    aggregator.add_provider(create_jupiter_provider())
    aggregator.add_provider(create_osmosis_provider())
    aggregator.add_provider(create_sunswap_provider())
    aggregator.add_provider(create_stonfi_provider())
    aggregator.add_provider(create_ref_finance_provider())

    logger.info("Created production aggregator with all providers")
    return aggregator


def create_minimal_aggregator() -> RouteAggregator:
    """Create aggregator with minimal providers (for testing)."""
    aggregator = RouteAggregator()
    from swaperex.routing.dry_run import DryRunRouter
    aggregator.add_provider(DryRunRouter())
    return aggregator
