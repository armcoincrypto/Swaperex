"""Chain and asset information API endpoints."""

from fastapi import APIRouter, HTTPException

from swaperex.web.contracts.assets import (
    ChainInfo,
    ChainListResponse,
    AssetListResponse,
)
from swaperex.web.services.chain_service import ChainService

router = APIRouter(prefix="/chains", tags=["chains"])

# Service instance
_chain_service = ChainService()


@router.get("/", response_model=ChainListResponse)
async def get_chains() -> ChainListResponse:
    """Get list of supported blockchains.

    Returns metadata about all supported chains including
    chain IDs, native assets, and explorer URLs.
    """
    return _chain_service.get_supported_chains()


@router.get("/{chain_id}", response_model=ChainInfo)
async def get_chain(chain_id: str) -> ChainInfo:
    """Get information about a specific chain.

    Args:
        chain_id: Chain identifier (ethereum, bsc, polygon, etc.)

    Returns:
        Chain metadata
    """
    chain = _chain_service.get_chain(chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail=f"Chain not found: {chain_id}")
    return chain


@router.get("/assets/", response_model=AssetListResponse)
async def get_assets() -> AssetListResponse:
    """Get list of supported assets.

    Returns metadata about all supported tokens and native assets.
    """
    return _chain_service.get_supported_assets()
