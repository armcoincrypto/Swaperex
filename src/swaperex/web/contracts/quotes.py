"""Quote request and response contracts."""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class QuoteRequest(BaseModel):
    """Request for a swap quote."""

    from_asset: str = Field(..., description="Source asset symbol (e.g., BTC, ETH)")
    to_asset: str = Field(..., description="Destination asset symbol")
    amount: Decimal = Field(..., gt=0, description="Amount to swap")
    slippage: Optional[Decimal] = Field(
        default=Decimal("0.5"),
        ge=0,
        le=50,
        description="Slippage tolerance in percent"
    )


class QuoteResponse(BaseModel):
    """Response containing swap quote details."""

    success: bool = Field(..., description="Whether quote was successful")
    from_asset: str = Field(..., description="Source asset")
    to_asset: str = Field(..., description="Destination asset")
    from_amount: Decimal = Field(..., description="Input amount")
    to_amount: Optional[Decimal] = Field(None, description="Expected output amount")
    rate: Optional[Decimal] = Field(None, description="Exchange rate")
    provider: Optional[str] = Field(None, description="Quote provider (1inch, thorchain, etc.)")
    fee_amount: Optional[Decimal] = Field(None, description="Fee amount")
    fee_asset: Optional[str] = Field(None, description="Fee asset")
    expires_at: Optional[int] = Field(None, description="Quote expiry timestamp")
    error: Optional[str] = Field(None, description="Error message if failed")

    class Config:
        json_encoders = {Decimal: str}


class MultiQuoteRequest(BaseModel):
    """Request for quotes from multiple providers."""

    from_asset: str = Field(..., description="Source asset symbol")
    to_asset: str = Field(..., description="Destination asset symbol")
    amount: Decimal = Field(..., gt=0, description="Amount to swap")
    providers: Optional[list[str]] = Field(
        None,
        description="Specific providers to query (None = all)"
    )


class MultiQuoteResponse(BaseModel):
    """Response containing quotes from multiple providers."""

    success: bool
    from_asset: str
    to_asset: str
    from_amount: Decimal
    quotes: list[QuoteResponse] = Field(default_factory=list)
    best_quote: Optional[QuoteResponse] = None
    error: Optional[str] = None

    class Config:
        json_encoders = {Decimal: str}
