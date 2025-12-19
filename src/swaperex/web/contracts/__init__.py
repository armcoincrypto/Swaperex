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
from swaperex.web.contracts.swaps import (
    SwapQuoteRequest,
    SwapQuoteResponse,
    SwapRouteMetadata,
    GasEstimate,
    UnsignedSwapTransaction,
)
from swaperex.web.contracts.withdrawals import (
    WithdrawalRequest,
    WithdrawalResponse,
    WithdrawalFeeEstimate,
    UnsignedWithdrawalTransaction,
)
from swaperex.web.contracts.balances import (
    TokenBalance,
    WalletBalanceRequest,
    WalletBalanceResponse,
    MultiChainBalanceRequest,
    MultiChainBalanceResponse,
)
from swaperex.web.contracts.wallet import (
    WalletType,
    WalletSession,
    ChainConnection,
    ConnectWalletRequest,
    ConnectWalletResponse,
    SwitchChainRequest,
    SignatureRequest,
    SignatureResponse,
    WalletCapabilities,
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
    # Swap contracts
    "SwapQuoteRequest",
    "SwapQuoteResponse",
    "SwapRouteMetadata",
    "GasEstimate",
    "UnsignedSwapTransaction",
    # Withdrawal contracts
    "WithdrawalRequest",
    "WithdrawalResponse",
    "WithdrawalFeeEstimate",
    "UnsignedWithdrawalTransaction",
    # Balance contracts
    "TokenBalance",
    "WalletBalanceRequest",
    "WalletBalanceResponse",
    "MultiChainBalanceRequest",
    "MultiChainBalanceResponse",
    # Wallet contracts
    "WalletType",
    "WalletSession",
    "ChainConnection",
    "ConnectWalletRequest",
    "ConnectWalletResponse",
    "SwitchChainRequest",
    "SignatureRequest",
    "SignatureResponse",
    "WalletCapabilities",
]
