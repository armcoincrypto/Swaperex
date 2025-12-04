"""Hybrid Swap Engine.

Primary: mm2 (atomic P2P) for cheapest/no-custody swaps.
Fallback: THORChain for UTXO chains, DEX for smart contract chains.

Timeout: 3 minutes for mm2 to find counterparty.
Minimum: $100 to avoid fee losses.
"""

from swaperex.swap_engine.router import SwapRouter, SwapConfig
from swaperex.swap_engine.mm2_adapter import MM2Adapter
from swaperex.swap_engine.thor_adapter import THORChainSwapAdapter

__all__ = [
    "SwapRouter",
    "SwapConfig",
    "MM2Adapter",
    "THORChainSwapAdapter",
]
