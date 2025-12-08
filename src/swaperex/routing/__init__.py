"""Routing module for swap quote aggregation.

DEX Providers:
- PancakeSwap: BSC DEX (BNB)
- Uniswap: Ethereum DEX (ETH, LINK, USDT-ERC20, USDC-ERC20)
- Jupiter: Solana DEX aggregator (SOL)
- Osmosis: Cosmos ecosystem DEX (ATOM)
- THORChain: Cross-chain native swaps (BTC, LTC)
- Minswap: Cardano DEX (ADA)
- Hyperliquid: Native L1 DEX (HYPE)
"""

from swaperex.routing.base import Quote, RouteAggregator, RouteProvider, SwapRoute
from swaperex.routing.dry_run import DryRunRouter
from swaperex.routing.factory import (
    create_aggregator,
    create_cheap_aggregator,
    create_default_aggregator,
    create_evm_aggregator,
    create_hyperliquid_provider,
    create_internal_reserve_provider,
    create_jupiter_provider,
    create_minimal_aggregator,
    create_minswap_provider,
    create_osmosis_provider,
    create_pancakeswap_provider,
    create_production_aggregator,
    create_quickswap_provider,
    create_thorchain_provider,
    create_traderjoe_provider,
    create_uniswap_provider,
)
from swaperex.routing.hyperliquid import HyperliquidProvider
from swaperex.routing.minswap import MinswapProvider
from swaperex.routing.thorchain import THORChainProvider

__all__ = [
    # Base classes
    "Quote",
    "SwapRoute",
    "RouteProvider",
    "RouteAggregator",
    # Providers
    "THORChainProvider",
    "MinswapProvider",
    "HyperliquidProvider",
    "DryRunRouter",
    # Factory functions - aggregators
    "create_aggregator",
    "create_default_aggregator",
    "create_production_aggregator",
    "create_minimal_aggregator",
    "create_evm_aggregator",
    "create_cheap_aggregator",
    # Factory functions - individual providers
    "create_internal_reserve_provider",
    "create_thorchain_provider",
    "create_pancakeswap_provider",
    "create_uniswap_provider",
    "create_jupiter_provider",
    "create_osmosis_provider",
    "create_traderjoe_provider",
    "create_quickswap_provider",
    "create_minswap_provider",
    "create_hyperliquid_provider",
]
