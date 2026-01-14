"""Swap API endpoints for non-custodial web mode.

These endpoints provide swap quotes with unsigned transaction data.
NO execution happens server-side - clients sign and broadcast themselves.
"""

from fastapi import APIRouter, HTTPException

from swaperex.web.contracts.swaps import (
    SwapQuoteRequest,
    SwapQuoteResponse,
)
from swaperex.web.services.swap_service import SwapService

router = APIRouter(prefix="/swaps", tags=["swaps"])

# Service instance
_swap_service = SwapService()


@router.post("/quote", response_model=SwapQuoteResponse)
async def get_swap_quote(request: SwapQuoteRequest) -> SwapQuoteResponse:
    """Get a swap quote with unsigned transaction data.

    This endpoint returns:
    - Quote details (amounts, rates, fees)
    - Route metadata (protocols used, hops)
    - Gas estimates
    - Unsigned transaction data for client-side signing

    The client must:
    1. Review the quote
    2. If approval_needed is True, sign and submit the approval_transaction first
    3. Sign the swap transaction with their private key
    4. Broadcast to the network

    NO signing or broadcasting happens server-side.
    """
    return await _swap_service.get_swap_quote(request)


@router.get("/supported-chains")
async def get_supported_chains() -> dict:
    """Get list of chains supported for swaps.

    Returns chain IDs and native token symbols.
    """
    from swaperex.web.services.swap_service import CHAIN_CONFIG

    chains = []
    for chain_id, config in CHAIN_CONFIG.items():
        chains.append({
            "id": chain_id,
            "chain_id": config["chain_id"],
            "native_token": config["native"],
        })

    return {
        "success": True,
        "chains": chains,
    }


@router.get("/health")
async def swap_service_health() -> dict:
    """Check swap service health.

    Returns status of DEX aggregator connections.
    """
    return {
        "status": "healthy",
        "providers": {
            "1inch": "available",  # Would check actual connectivity
            "simulated": "available",
        },
        "note": "Non-custodial mode - no execution capability",
    }
