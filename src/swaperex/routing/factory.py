"""Factory for creating swap route providers and aggregators.

Provider architecture:
1. Internal Reserve - DASH swaps + USDT bridging (instant, operator liquidity)
2. PancakeSwap - BSC DEX swaps (cheap)
3. Uniswap - Ethereum DEX swaps
4. Jupiter - Solana DEX aggregator (cheapest)
5. Osmosis - Cosmos ecosystem swaps
6. THORChain - Cross-chain native swaps
7. DryRun - Simulated fallback for testing
"""

import logging
import os
from decimal import Decimal
from typing import Optional

from swaperex.config import get_settings
from swaperex.routing.base import RouteAggregator, RouteProvider

logger = logging.getLogger(__name__)


def create_internal_reserve_provider(
    spread_percent: Optional[Decimal] = None,
    bridge_fee_percent: Optional[Decimal] = None,
) -> RouteProvider:
    """Create Internal Reserve provider for DASH swaps and USDT bridging.

    Supports:
    - DASH <-> USDT (any variant)
    - USDT cross-chain bridging (BEP20 <-> TRC20 etc.)

    Args:
        spread_percent: Spread for DASH swaps (default from env or 1.0%)
        bridge_fee_percent: Fee for USDT bridging (default 0.1%)
    """
    from swaperex.routing.internal_reserve import InternalReserveProvider

    if spread_percent is None:
        spread_str = os.environ.get("DASH_SPREAD_PCT", "1.0")
        spread_percent = Decimal(spread_str)

    if bridge_fee_percent is None:
        bridge_str = os.environ.get("USDT_BRIDGE_FEE_PCT", "0.1")
        bridge_fee_percent = Decimal(bridge_str)

    provider = InternalReserveProvider(
        spread_percent=spread_percent,
        bridge_fee_percent=bridge_fee_percent,
    )
    logger.info(f"Internal Reserve provider created (DASH spread: {spread_percent}%, USDT bridge: {bridge_fee_percent}%)")
    return provider


def create_pancakeswap_provider(
    rpc_url: Optional[str] = None,
    private_key: Optional[str] = None,
) -> RouteProvider:
    """Create PancakeSwap provider for BSC swaps.

    Supports: BNB, USDT-BEP20, USDC-BEP20, BUSD, BTCB, CAKE
    Low gas fees (~$0.10-0.30)
    """
    from swaperex.routing.pancakeswap import PancakeSwapProvider

    rpc_url = rpc_url or os.environ.get("BSC_RPC_URL", "https://bsc-dataseed.binance.org/")
    private_key = private_key or os.environ.get("BSC_PRIVATE_KEY")

    provider = PancakeSwapProvider(rpc_url=rpc_url, private_key=private_key)
    logger.info("PancakeSwap provider created (BSC)")
    return provider


def create_uniswap_provider(
    rpc_url: Optional[str] = None,
    private_key: Optional[str] = None,
) -> RouteProvider:
    """Create Uniswap provider for Ethereum swaps.

    Supports: ETH, USDT-ERC20, USDC, DAI, WBTC
    Higher gas fees (~$5-50)
    """
    from swaperex.routing.pancakeswap import UniswapProvider

    rpc_url = rpc_url or os.environ.get("ETH_RPC_URL", "https://eth.llamarpc.com")
    private_key = private_key or os.environ.get("ETH_PRIVATE_KEY")

    provider = UniswapProvider(rpc_url=rpc_url, private_key=private_key)
    logger.info("Uniswap provider created (Ethereum)")
    return provider


def create_jupiter_provider(
    private_key: Optional[str] = None,
) -> RouteProvider:
    """Create Jupiter provider for Solana swaps.

    Jupiter aggregates all Solana DEXes (Raydium, Orca, etc.)
    Supports: SOL, USDT-SPL, USDC-SPL, RAY, BONK, JUP
    Lowest gas fees (~$0.001)
    """
    from swaperex.routing.jupiter import JupiterProvider

    private_key = private_key or os.environ.get("SOL_PRIVATE_KEY")

    provider = JupiterProvider(private_key=private_key)
    logger.info("Jupiter provider created (Solana)")
    return provider


def create_osmosis_provider(
    mnemonic: Optional[str] = None,
) -> RouteProvider:
    """Create Osmosis provider for Cosmos ecosystem swaps.

    Supports: OSMO, ATOM, USDT (axlUSDT), USDC (axlUSDC), TIA
    Low gas fees (~$0.01)
    """
    from swaperex.routing.osmosis import OsmosisProvider

    mnemonic = mnemonic or os.environ.get("COSMOS_MNEMONIC")

    provider = OsmosisProvider(mnemonic=mnemonic)
    logger.info("Osmosis provider created (Cosmos)")
    return provider


def create_thorchain_provider(use_real: bool = True) -> RouteProvider:
    """Create THORChain provider for cross-chain swaps.

    THORChain enables native cross-chain swaps without wrapping.
    Supports: BTC, ETH, LTC, BCH, DOGE, AVAX, ATOM, BNB, RUNE
    """
    settings = get_settings()
    stagenet = not settings.is_production

    if use_real and not settings.dry_run:
        try:
            from swaperex.routing.thorchain import THORChainProvider
            return THORChainProvider(stagenet=stagenet)
        except Exception as e:
            logger.warning(f"Failed to create THORChain provider: {e}")

    from swaperex.routing.dry_run import SimulatedThorChainRouter
    return SimulatedThorChainRouter()


def create_aggregator(
    include_internal_reserve: bool = True,
    include_pancakeswap: bool = True,
    include_uniswap: bool = True,
    include_jupiter: bool = True,
    include_osmosis: bool = True,
    include_thorchain: bool = True,
    include_dry_run: bool = True,
) -> RouteAggregator:
    """Create a route aggregator with configured providers.

    Priority order (first match wins for same pair):
    1. Internal Reserve (DASH + USDT bridging)
    2. Chain-specific DEXes (PancakeSwap, Uniswap, Jupiter, Osmosis)
    3. THORChain (cross-chain fallback)
    4. DryRun (testing fallback)
    """
    settings = get_settings()
    aggregator = RouteAggregator()

    # Internal Reserve - DASH swaps and USDT bridging
    if include_internal_reserve:
        try:
            provider = create_internal_reserve_provider()
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")
        except Exception as e:
            logger.warning(f"Failed to add Internal Reserve: {e}")

    # PancakeSwap - BSC swaps (cheap)
    if include_pancakeswap:
        try:
            provider = create_pancakeswap_provider()
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")
        except Exception as e:
            logger.warning(f"Failed to add PancakeSwap: {e}")

    # Uniswap - Ethereum swaps
    if include_uniswap:
        try:
            provider = create_uniswap_provider()
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")
        except Exception as e:
            logger.warning(f"Failed to add Uniswap: {e}")

    # Jupiter - Solana swaps (cheapest)
    if include_jupiter:
        try:
            provider = create_jupiter_provider()
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")
        except Exception as e:
            logger.warning(f"Failed to add Jupiter: {e}")

    # Osmosis - Cosmos swaps
    if include_osmosis:
        try:
            provider = create_osmosis_provider()
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")
        except Exception as e:
            logger.warning(f"Failed to add Osmosis: {e}")

    # THORChain - cross-chain
    if include_thorchain:
        try:
            provider = create_thorchain_provider(use_real=not settings.dry_run)
            aggregator.add_provider(provider)
            logger.info(f"Added {provider.name} provider")
        except Exception as e:
            logger.warning(f"Failed to add THORChain: {e}")

    # DryRun fallback
    if include_dry_run:
        from swaperex.routing.dry_run import DryRunRouter
        aggregator.add_provider(DryRunRouter())
        logger.info("Added DryRun provider (fallback)")

    return aggregator


def create_production_aggregator() -> RouteAggregator:
    """Create aggregator with all production providers enabled.

    No dry-run fallback - real swaps only.
    """
    return create_aggregator(
        include_internal_reserve=True,
        include_pancakeswap=True,
        include_uniswap=True,
        include_jupiter=True,
        include_osmosis=True,
        include_thorchain=True,
        include_dry_run=False,
    )


def create_default_aggregator() -> RouteAggregator:
    """Create default aggregator for most use cases.

    Includes all providers with dry-run fallback.
    """
    return create_aggregator(
        include_internal_reserve=True,
        include_pancakeswap=True,
        include_uniswap=True,
        include_jupiter=True,
        include_osmosis=True,
        include_thorchain=True,
        include_dry_run=True,
    )


def create_minimal_aggregator() -> RouteAggregator:
    """Create aggregator with minimal providers (for testing)."""
    aggregator = RouteAggregator()
    from swaperex.routing.dry_run import DryRunRouter
    aggregator.add_provider(DryRunRouter())
    return aggregator


def create_evm_aggregator() -> RouteAggregator:
    """Create aggregator with only EVM DEXes.

    PancakeSwap (BSC) + Uniswap (ETH)
    """
    return create_aggregator(
        include_internal_reserve=False,
        include_pancakeswap=True,
        include_uniswap=True,
        include_jupiter=False,
        include_osmosis=False,
        include_thorchain=False,
        include_dry_run=True,
    )


def create_cheap_aggregator() -> RouteAggregator:
    """Create aggregator with only cheap DEXes.

    Internal Reserve + PancakeSwap (BSC) + Jupiter (Solana)
    """
    return create_aggregator(
        include_internal_reserve=True,
        include_pancakeswap=True,
        include_uniswap=False,  # Expensive
        include_jupiter=True,
        include_osmosis=True,
        include_thorchain=False,  # Can be expensive
        include_dry_run=True,
    )
