"""Routing module for swap quote aggregation.

Providers:
- Internal Reserve: DASH <-> USDT + USDT cross-chain bridging
- PancakeSwap: BSC DEX (BNB, BEP20 tokens)
- Uniswap: Ethereum DEX (ETH, ERC20 tokens)
- Jupiter: Solana DEX aggregator (SOL, SPL tokens)
- Osmosis: Cosmos ecosystem DEX (ATOM, OSMO, axl tokens)
- Trader Joe: Avalanche DEX (AVAX tokens)
- QuickSwap: Polygon DEX (MATIC tokens)
- THORChain: Cross-chain native swaps (BTC, ETH, LTC, etc.)
"""

from swaperex.routing.base import Quote, RouteAggregator, RouteProvider, SwapRoute
from swaperex.routing.dry_run import DryRunRouter
from swaperex.routing.factory import (
    create_aggregator,
    create_cheap_aggregator,
    create_default_aggregator,
    create_evm_aggregator,
    create_internal_reserve_provider,
    create_jupiter_provider,
    create_minimal_aggregator,
    create_osmosis_provider,
    create_pancakeswap_provider,
    create_production_aggregator,
    create_quickswap_provider,
    create_thorchain_provider,
    create_traderjoe_provider,
    create_uniswap_provider,
)
from swaperex.routing.internal_reserve import InternalReserveProvider
from swaperex.routing.thorchain import THORChainProvider

__all__ = [
    # Base classes
    "Quote",
    "SwapRoute",
    "RouteProvider",
    "RouteAggregator",
    # Providers
    "InternalReserveProvider",
    "THORChainProvider",
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
]
