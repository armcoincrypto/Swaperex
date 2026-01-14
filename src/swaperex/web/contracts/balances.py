"""Balance contracts for non-custodial web mode.

In WEB_NON_CUSTODIAL mode, balances are fetched from blockchain state,
NOT from the internal ledger. The ledger is only used in TELEGRAM_CUSTODIAL mode.
"""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class TokenBalance(BaseModel):
    """Balance of a single token/asset."""

    symbol: str = Field(..., description="Token symbol (ETH, USDT, etc.)")
    name: Optional[str] = Field(None, description="Token name")
    contract_address: Optional[str] = Field(
        None, description="Token contract address (None for native)"
    )
    balance: Decimal = Field(..., description="Token balance in human-readable units")
    balance_raw: str = Field(..., description="Raw balance in smallest units")
    decimals: int = Field(..., description="Token decimals")
    chain: str = Field(..., description="Chain ID (ethereum, bsc, etc.)")
    usd_value: Optional[Decimal] = Field(None, description="USD value if available")
    logo_url: Optional[str] = Field(None, description="Token logo URL")

    class Config:
        json_encoders = {Decimal: str}


class WalletBalanceRequest(BaseModel):
    """Request to fetch wallet balances from blockchain."""

    address: str = Field(..., description="Wallet address to query")
    chain: str = Field(..., description="Chain ID (ethereum, bsc, polygon, etc.)")
    include_tokens: bool = Field(
        default=True, description="Include ERC-20/token balances"
    )
    token_list: Optional[list[str]] = Field(
        None, description="Specific token contracts to query (None = common tokens)"
    )


class WalletBalanceResponse(BaseModel):
    """Response containing wallet balances from blockchain state."""

    success: bool = Field(..., description="Whether query succeeded")

    # Wallet info
    address: str = Field(..., description="Wallet address queried")
    chain: str = Field(..., description="Chain queried")
    chain_id: int = Field(..., description="EVM chain ID")

    # Native balance
    native_balance: TokenBalance = Field(..., description="Native token balance")

    # Token balances
    token_balances: list[TokenBalance] = Field(
        default_factory=list, description="ERC-20/token balances"
    )

    # Aggregate
    total_usd_value: Optional[Decimal] = Field(
        None, description="Total USD value of all balances"
    )

    # Metadata
    block_number: Optional[int] = Field(
        None, description="Block number at query time"
    )
    timestamp: Optional[str] = Field(
        None, description="Query timestamp (ISO 8601)"
    )

    # Error handling
    error: Optional[str] = Field(None, description="Error message if failed")

    class Config:
        json_encoders = {Decimal: str}


class MultiChainBalanceRequest(BaseModel):
    """Request to fetch balances across multiple chains."""

    address: str = Field(..., description="Wallet address to query")
    chains: list[str] = Field(
        default_factory=lambda: ["ethereum", "bsc", "polygon"],
        description="Chains to query",
    )
    include_tokens: bool = Field(default=True, description="Include token balances")


class MultiChainBalanceResponse(BaseModel):
    """Response containing balances across multiple chains."""

    success: bool = Field(..., description="Whether query succeeded")
    address: str = Field(..., description="Wallet address queried")

    # Per-chain balances
    chain_balances: list[WalletBalanceResponse] = Field(
        default_factory=list, description="Balances per chain"
    )

    # Aggregate across all chains
    total_usd_value: Optional[Decimal] = Field(
        None, description="Total USD value across all chains"
    )

    # Partial failures
    failed_chains: list[str] = Field(
        default_factory=list, description="Chains that failed to query"
    )

    class Config:
        json_encoders = {Decimal: str}
