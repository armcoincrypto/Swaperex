"""Routing module for swap quote aggregation.

MM2 (AtomicDEX) is the default provider for all pairs, enabling trustless
atomic swaps across a wide range of assets.
"""

from swaperex.routing.base import Quote, RouteAggregator, RouteProvider, SwapRoute
from swaperex.routing.dry_run import DryRunRouter
from swaperex.routing.factory import (
    create_aggregator,
    create_default_aggregator,
    create_mm2_only_aggregator,
    create_mm2_provider,
    create_oneinch_provider,
    create_production_aggregator,
    create_thorchain_provider,
)
from swaperex.routing.mm2 import MM2Provider
from swaperex.routing.oneinch import OneInchProvider
from swaperex.routing.thorchain import THORChainProvider

__all__ = [
    # Base classes
    "Quote",
    "SwapRoute",
    "RouteProvider",
    "RouteAggregator",
    # Providers
    "MM2Provider",
    "THORChainProvider",
    "OneInchProvider",
    "DryRunRouter",
    # Factory functions
    "create_aggregator",
    "create_default_aggregator",
    "create_production_aggregator",
    "create_mm2_only_aggregator",
    "create_mm2_provider",
    "create_thorchain_provider",
    "create_oneinch_provider",
]
