"""Routing module for swap quote aggregation.

Providers:
- Internal Reserve: DASH <-> USDT swaps via operator's liquidity reserve
- THORChain: Cross-chain native swaps (BTC, ETH, LTC, BCH, DOGE, AVAX, ATOM, BNB)
"""

from swaperex.routing.base import Quote, RouteAggregator, RouteProvider, SwapRoute
from swaperex.routing.dry_run import DryRunRouter
from swaperex.routing.factory import (
    create_aggregator,
    create_dash_only_aggregator,
    create_default_aggregator,
    create_internal_reserve_provider,
    create_production_aggregator,
    create_thorchain_only_aggregator,
    create_thorchain_provider,
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
    # Factory functions
    "create_aggregator",
    "create_default_aggregator",
    "create_production_aggregator",
    "create_dash_only_aggregator",
    "create_thorchain_only_aggregator",
    "create_internal_reserve_provider",
    "create_thorchain_provider",
]
