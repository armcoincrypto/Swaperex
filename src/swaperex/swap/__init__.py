"""Swap execution module with full chain integration.

Provides:
- SwapExecutor: Main swap execution engine
- Transaction signers for all supported chains
"""

from swaperex.swap.executor import SwapExecutor, SwapResult, get_swap_executor
from swaperex.swap.signer import (
    ChainSigner,
    EVMSigner,
    SolanaSigner,
    CosmosSigner,
    CardanoSigner,
    BitcoinSigner,
    TransactionSignerFactory,
    get_signer_factory,
)

__all__ = [
    # Executor
    "SwapExecutor",
    "SwapResult",
    "get_swap_executor",
    # Signers
    "ChainSigner",
    "EVMSigner",
    "SolanaSigner",
    "CosmosSigner",
    "CardanoSigner",
    "BitcoinSigner",
    "TransactionSignerFactory",
    "get_signer_factory",
]
