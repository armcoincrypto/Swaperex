"""Request and response contracts for the web layer.

These Pydantic models define the API interface for web clients.
All contracts are for READ-ONLY or non-custodial operations.
"""

from swaperex.web.contracts.quotes import (
    QuoteRequest,
    QuoteResponse,
    MultiQuoteRequest,
    MultiQuoteResponse,
)
from swaperex.web.contracts.assets import (
    AssetInfo,
    AssetListResponse,
    ChainInfo,
    ChainListResponse,
)
from swaperex.web.contracts.transactions import (
    UnsignedTransaction,
    TransactionRequest,
    TransactionStatusResponse,
)

__all__ = [
    # Quote contracts
    "QuoteRequest",
    "QuoteResponse",
    "MultiQuoteRequest",
    "MultiQuoteResponse",
    # Asset contracts
    "AssetInfo",
    "AssetListResponse",
    "ChainInfo",
    "ChainListResponse",
    # Transaction contracts
    "UnsignedTransaction",
    "TransactionRequest",
    "TransactionStatusResponse",
]
