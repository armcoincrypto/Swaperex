"""Withdrawal contracts for non-custodial web mode.

These contracts define withdrawal transaction templates.
Actual withdrawals are executed client-side - the backend NEVER broadcasts.
"""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class WithdrawalRequest(BaseModel):
    """Request for a withdrawal transaction template."""

    asset: str = Field(..., description="Asset to withdraw (BTC, ETH, USDT, etc.)")
    amount: Decimal = Field(..., gt=0, description="Amount to withdraw")
    destination_address: str = Field(..., description="Recipient address")
    from_address: str = Field(..., description="Source wallet address")
    chain: Optional[str] = Field(None, description="Chain (auto-detect if None)")


class WithdrawalFeeEstimate(BaseModel):
    """Fee estimate for withdrawal."""

    network_fee: Decimal = Field(..., description="Network/gas fee")
    network_fee_asset: str = Field(..., description="Fee asset (native token)")
    network_fee_usd: Optional[Decimal] = Field(None, description="Fee in USD")
    protocol_fee: Optional[Decimal] = Field(None, description="Protocol fee if any")
    protocol_fee_asset: Optional[str] = Field(None)
    total_fee: Decimal = Field(..., description="Total fee")
    total_fee_usd: Optional[Decimal] = Field(None)


class UnsignedWithdrawalTransaction(BaseModel):
    """Unsigned withdrawal transaction for client-side signing."""

    # Chain info
    chain: str = Field(..., description="Chain identifier")
    chain_id: int = Field(..., description="EVM chain ID (0 for non-EVM)")

    # Transaction fields (EVM format)
    to: str = Field(..., description="Recipient address")
    value: str = Field(..., description="Value in smallest unit (hex)")
    data: str = Field(default="0x", description="Transaction data (hex)")
    gas_limit: Optional[str] = Field(None, description="Gas limit (hex)")
    gas_price: Optional[str] = Field(None, description="Gas price (hex)")
    max_fee_per_gas: Optional[str] = Field(None, description="EIP-1559 max fee")
    max_priority_fee_per_gas: Optional[str] = Field(None, description="Priority fee")

    # For non-EVM chains (BTC, etc.)
    raw_unsigned: Optional[str] = Field(
        None, description="Raw unsigned transaction (for non-EVM)"
    )
    inputs: Optional[list[dict]] = Field(None, description="UTXO inputs (for BTC)")
    outputs: Optional[list[dict]] = Field(None, description="UTXO outputs (for BTC)")

    # Context
    description: str = Field(default="", description="Human-readable description")
    warnings: list[str] = Field(default_factory=list)


class WithdrawalResponse(BaseModel):
    """Response containing withdrawal transaction template."""

    success: bool = Field(..., description="Whether template was created")

    # Request echo
    asset: str = Field(..., description="Asset being withdrawn")
    amount: Decimal = Field(..., description="Withdrawal amount")
    destination: str = Field(..., description="Destination address")

    # Net amount
    net_amount: Optional[Decimal] = Field(
        None, description="Amount after fees"
    )

    # Fee info
    fee_estimate: Optional[WithdrawalFeeEstimate] = Field(
        None, description="Fee breakdown"
    )

    # Unsigned transaction template
    transaction: Optional[UnsignedWithdrawalTransaction] = Field(
        None, description="Unsigned transaction for client signing"
    )

    # For token withdrawals
    is_token_transfer: bool = Field(
        default=False, description="True if ERC-20/token transfer"
    )
    token_contract: Optional[str] = Field(None, description="Token contract if applicable")

    # Error handling
    error: Optional[str] = Field(None, description="Error message if failed")

    class Config:
        json_encoders = {Decimal: str}
