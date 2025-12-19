"""Quote service for fetching swap quotes.

This service queries DEX aggregators for quotes but does NOT execute swaps.
Swap execution requires client-side signing in non-custodial mode.
"""

import logging
from decimal import Decimal
from typing import Optional

from swaperex.web.contracts.quotes import (
    QuoteRequest,
    QuoteResponse,
    MultiQuoteRequest,
    MultiQuoteResponse,
)

logger = logging.getLogger(__name__)


class QuoteService:
    """Service for fetching swap quotes from various providers.

    This is a READ-ONLY service that does not execute any transactions.
    """

    def __init__(self):
        """Initialize quote service."""
        # Import only the routing module (quotes only, no execution)
        from swaperex.routing.dry_run import DryRunRouter
        self._dry_run_router = DryRunRouter()

    async def get_quote(self, request: QuoteRequest) -> QuoteResponse:
        """Get a swap quote.

        Args:
            request: Quote request parameters

        Returns:
            QuoteResponse with quote details
        """
        try:
            quote = await self._dry_run_router.get_quote(
                from_asset=request.from_asset,
                to_asset=request.to_asset,
                amount=request.amount,
            )

            if quote is None:
                return QuoteResponse(
                    success=False,
                    from_asset=request.from_asset,
                    to_asset=request.to_asset,
                    from_amount=request.amount,
                    error=f"No quote available for {request.from_asset}/{request.to_asset}",
                )

            return QuoteResponse(
                success=True,
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                rate=quote.to_amount / quote.from_amount if quote.from_amount else None,
                provider=quote.provider,
                fee_amount=quote.fee_amount,
                fee_asset=quote.fee_asset,
            )

        except Exception as e:
            logger.error(f"Failed to get quote: {e}")
            return QuoteResponse(
                success=False,
                from_asset=request.from_asset,
                to_asset=request.to_asset,
                from_amount=request.amount,
                error=str(e),
            )

    async def get_multi_quote(self, request: MultiQuoteRequest) -> MultiQuoteResponse:
        """Get quotes from multiple providers.

        Args:
            request: Multi-quote request parameters

        Returns:
            MultiQuoteResponse with all available quotes
        """
        # For now, just get from dry run router
        # In production, would query 1inch, THORChain, etc.
        single_request = QuoteRequest(
            from_asset=request.from_asset,
            to_asset=request.to_asset,
            amount=request.amount,
        )

        quote = await self.get_quote(single_request)

        return MultiQuoteResponse(
            success=quote.success,
            from_asset=request.from_asset,
            to_asset=request.to_asset,
            from_amount=request.amount,
            quotes=[quote] if quote.success else [],
            best_quote=quote if quote.success else None,
            error=quote.error,
        )

    def get_supported_pairs(self) -> list[tuple[str, str]]:
        """Get list of supported trading pairs.

        Returns:
            List of (from_asset, to_asset) tuples
        """
        # In production, would aggregate from all providers
        from swaperex.routing.dry_run import SIMULATED_PRICES
        assets = list(SIMULATED_PRICES.keys())

        # Generate pairs (all assets can swap to all other assets in simulation)
        pairs = []
        for from_asset in assets[:20]:  # Limit for demo
            for to_asset in assets[:20]:
                if from_asset != to_asset:
                    pairs.append((from_asset, to_asset))

        return pairs
