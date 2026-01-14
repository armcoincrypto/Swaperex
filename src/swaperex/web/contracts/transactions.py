"""Transaction contracts for non-custodial operations.

These contracts define unsigned transactions that clients sign locally.
NO signing or broadcasting happens server-side in web mode.
"""

from decimal import Decimal
from typing import Optional, Any

from pydantic import BaseModel, Field


class UnsignedTransaction(BaseModel):
    """An unsigned transaction for client-side signing.

    The client is responsible for:
    1. Signing this transaction with their private key
    2. Broadcasting the signed transaction to the network
    """

    chain: str = Field(..., description="Chain identifier (ethereum, bsc, etc.)")
    chain_id: int = Field(..., description="EVM chain ID")
    to: str = Field(..., description="Destination address (contract or recipient)")
    value: str = Field(default="0", description="Value in wei (hex or decimal string)")
    data: str = Field(default="0x", description="Transaction data (hex encoded)")
    gas_limit: Optional[str] = Field(None, description="Gas limit (hex or decimal)")
    gas_price: Optional[str] = Field(None, description="Gas price in wei")
    max_fee_per_gas: Optional[str] = Field(None, description="EIP-1559 max fee")
    max_priority_fee_per_gas: Optional[str] = Field(None, description="EIP-1559 priority fee")
    nonce: Optional[int] = Field(None, description="Transaction nonce (client should set)")

    # Additional context for client
    description: Optional[str] = Field(None, description="Human-readable description")
    warnings: list[str] = Field(default_factory=list, description="Any warnings")


class TransactionRequest(BaseModel):
    """Request to prepare an unsigned transaction."""

    action: str = Field(
        ...,
        description="Action type: swap, approve, transfer"
    )
    chain: str = Field(..., description="Target chain")
    from_address: str = Field(..., description="Sender address (for gas estimation)")

    # For swaps
    from_asset: Optional[str] = Field(None, description="Source asset for swaps")
    to_asset: Optional[str] = Field(None, description="Destination asset for swaps")
    amount: Optional[Decimal] = Field(None, description="Amount to swap/transfer")
    slippage: Optional[Decimal] = Field(default=Decimal("0.5"), description="Slippage %")

    # For transfers
    to_address: Optional[str] = Field(None, description="Recipient for transfers")

    # For approvals
    spender: Optional[str] = Field(None, description="Spender address for approvals")
    token: Optional[str] = Field(None, description="Token address for approvals")


class TransactionStatusResponse(BaseModel):
    """Response for checking transaction status."""

    tx_hash: str = Field(..., description="Transaction hash")
    chain: str = Field(..., description="Chain identifier")
    status: str = Field(
        ...,
        description="Status: pending, confirmed, failed"
    )
    confirmations: int = Field(default=0, description="Number of confirmations")
    block_number: Optional[int] = Field(None, description="Block number if confirmed")
    gas_used: Optional[str] = Field(None, description="Gas used")
    error: Optional[str] = Field(None, description="Error message if failed")
    explorer_url: Optional[str] = Field(None, description="Link to explorer")
