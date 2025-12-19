"""Swap quote contracts with unsigned transaction data.

These contracts extend the basic quote with execution-ready data
for client-side signing in non-custodial mode.
"""

from decimal import Decimal
from typing import Optional, Any

from pydantic import BaseModel, Field


class SwapQuoteRequest(BaseModel):
    """Request for a swap quote with transaction data."""

    from_asset: str = Field(..., description="Source asset symbol")
    to_asset: str = Field(..., description="Destination asset symbol")
    amount: Decimal = Field(..., gt=0, description="Amount to swap")
    from_address: str = Field(..., description="Sender wallet address")
    slippage: Decimal = Field(
        default=Decimal("0.5"),
        ge=0,
        le=50,
        description="Slippage tolerance in percent"
    )
    chain: Optional[str] = Field(None, description="Preferred chain (auto-detect if None)")


class GasEstimate(BaseModel):
    """Gas estimation for a transaction."""

    gas_limit: int = Field(..., description="Estimated gas limit")
    gas_price_gwei: Decimal = Field(..., description="Gas price in Gwei")
    max_fee_per_gas_gwei: Optional[Decimal] = Field(None, description="EIP-1559 max fee")
    max_priority_fee_gwei: Optional[Decimal] = Field(None, description="EIP-1559 priority fee")
    estimated_cost_native: Decimal = Field(..., description="Estimated cost in native token")
    estimated_cost_usd: Optional[Decimal] = Field(None, description="Estimated cost in USD")


class RouteStep(BaseModel):
    """A single step in a multi-hop swap route."""

    protocol: str = Field(..., description="Protocol name (uniswap, pancakeswap, etc.)")
    pool: Optional[str] = Field(None, description="Pool address")
    from_token: str = Field(..., description="Input token address")
    to_token: str = Field(..., description="Output token address")
    from_amount: Optional[str] = Field(None, description="Input amount")
    to_amount: Optional[str] = Field(None, description="Output amount")


class SwapRouteMetadata(BaseModel):
    """Metadata about the swap route."""

    provider: str = Field(..., description="Route provider (1inch, thorchain, etc.)")
    route_type: str = Field(default="single", description="Route type: single, multi-hop, cross-chain")
    steps: list[RouteStep] = Field(default_factory=list, description="Route steps")
    protocols_used: list[str] = Field(default_factory=list, description="Protocols in route")
    estimated_gas: int = Field(default=0, description="Total estimated gas")
    price_impact_percent: Optional[Decimal] = Field(None, description="Price impact")
    minimum_received: Optional[Decimal] = Field(None, description="Minimum output with slippage")


class UnsignedSwapTransaction(BaseModel):
    """Unsigned swap transaction for client-side signing."""

    chain: str = Field(..., description="Chain identifier")
    chain_id: int = Field(..., description="EVM chain ID")
    to: str = Field(..., description="Router/contract address")
    value: str = Field(default="0", description="Native token value (hex)")
    data: str = Field(..., description="Calldata (hex)")
    gas_limit: str = Field(..., description="Gas limit (hex)")

    # EIP-1559 fields (preferred)
    max_fee_per_gas: Optional[str] = Field(None, description="Max fee per gas (hex)")
    max_priority_fee_per_gas: Optional[str] = Field(None, description="Priority fee (hex)")

    # Legacy gas price (fallback)
    gas_price: Optional[str] = Field(None, description="Gas price (hex)")

    # Context
    description: str = Field(default="", description="Human-readable description")
    warnings: list[str] = Field(default_factory=list)


class SwapQuoteResponse(BaseModel):
    """Complete swap quote with unsigned transaction data."""

    success: bool = Field(..., description="Whether quote was successful")

    # Quote details
    from_asset: str = Field(..., description="Source asset")
    to_asset: str = Field(..., description="Destination asset")
    from_amount: Decimal = Field(..., description="Input amount")
    to_amount: Optional[Decimal] = Field(None, description="Expected output")
    minimum_received: Optional[Decimal] = Field(None, description="Min output with slippage")
    rate: Optional[Decimal] = Field(None, description="Exchange rate")

    # Fees
    fee_amount: Optional[Decimal] = Field(None, description="Protocol fee amount")
    fee_asset: Optional[str] = Field(None, description="Protocol fee asset")
    gas_estimate: Optional[GasEstimate] = Field(None, description="Gas estimation")

    # Route info
    route: Optional[SwapRouteMetadata] = Field(None, description="Route metadata")

    # Unsigned transaction (for client signing)
    transaction: Optional[UnsignedSwapTransaction] = Field(
        None,
        description="Unsigned transaction for client-side signing"
    )

    # Approval needed?
    approval_needed: bool = Field(default=False, description="Token approval required first")
    approval_transaction: Optional[UnsignedSwapTransaction] = Field(
        None,
        description="Approval transaction if needed"
    )

    # Quote validity
    expires_at: Optional[int] = Field(None, description="Quote expiry timestamp")
    quote_id: Optional[str] = Field(None, description="Quote ID for tracking")

    # Error handling
    error: Optional[str] = Field(None, description="Error message if failed")

    class Config:
        json_encoders = {Decimal: str}
