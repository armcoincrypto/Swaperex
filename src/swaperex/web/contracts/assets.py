"""Asset and chain information contracts."""

from typing import Optional

from pydantic import BaseModel, Field


class AssetInfo(BaseModel):
    """Information about a supported asset."""

    symbol: str = Field(..., description="Asset symbol (BTC, ETH, etc.)")
    name: str = Field(..., description="Full asset name")
    chain: str = Field(..., description="Native chain (ethereum, bitcoin, etc.)")
    decimals: int = Field(..., description="Token decimals")
    contract_address: Optional[str] = Field(
        None,
        description="Contract address for tokens (None for native assets)"
    )
    logo_url: Optional[str] = Field(None, description="URL to asset logo")
    is_native: bool = Field(
        default=False,
        description="Whether this is the chain's native asset"
    )
    min_amount: Optional[str] = Field(
        None,
        description="Minimum swap/transfer amount"
    )


class AssetListResponse(BaseModel):
    """Response containing list of supported assets."""

    success: bool = True
    assets: list[AssetInfo] = Field(default_factory=list)
    total: int = Field(default=0, description="Total number of assets")


class ChainInfo(BaseModel):
    """Information about a supported blockchain."""

    id: str = Field(..., description="Chain identifier (ethereum, bsc, etc.)")
    name: str = Field(..., description="Chain display name")
    chain_id: int = Field(..., description="EVM chain ID (1 for Ethereum, etc.)")
    native_asset: str = Field(..., description="Native asset symbol")
    rpc_url: Optional[str] = Field(
        None,
        description="Public RPC URL (for client use)"
    )
    explorer_url: Optional[str] = Field(
        None,
        description="Block explorer URL"
    )
    is_testnet: bool = Field(default=False, description="Whether this is a testnet")


class ChainListResponse(BaseModel):
    """Response containing list of supported chains."""

    success: bool = True
    chains: list[ChainInfo] = Field(default_factory=list)
    total: int = Field(default=0)
