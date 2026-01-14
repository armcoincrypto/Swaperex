"""Quote API endpoints."""

from fastapi import APIRouter, HTTPException

from swaperex.web.contracts.quotes import (
    QuoteRequest,
    QuoteResponse,
    MultiQuoteRequest,
    MultiQuoteResponse,
)
from swaperex.web.services.quote_service import QuoteService

router = APIRouter(prefix="/quotes", tags=["quotes"])

# Service instance
_quote_service = QuoteService()


@router.post("/", response_model=QuoteResponse)
async def get_quote(request: QuoteRequest) -> QuoteResponse:
    """Get a swap quote.

    Returns the best available quote for swapping from_asset to to_asset.
    This is a READ-ONLY operation - no transactions are executed.
    """
    return await _quote_service.get_quote(request)


@router.post("/multi", response_model=MultiQuoteResponse)
async def get_multi_quote(request: MultiQuoteRequest) -> MultiQuoteResponse:
    """Get quotes from multiple providers.

    Returns quotes from all available providers, sorted by best rate.
    """
    return await _quote_service.get_multi_quote(request)


@router.get("/pairs")
async def get_supported_pairs() -> dict:
    """Get list of supported trading pairs.

    Returns:
        List of (from_asset, to_asset) pairs that can be quoted.
    """
    pairs = _quote_service.get_supported_pairs()
    return {
        "success": True,
        "pairs": [{"from": p[0], "to": p[1]} for p in pairs[:100]],  # Limit response
        "total": len(pairs),
    }
