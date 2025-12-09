"""Abstract routing interface for swap providers."""

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Quote:
    """A swap quote from a routing provider."""

    provider: str  # e.g., "THORChain", "Internal Reserve"
    from_asset: str
    to_asset: str
    from_amount: Decimal
    to_amount: Decimal
    fee_asset: str
    fee_amount: Decimal
    slippage_percent: Decimal
    estimated_time_seconds: int
    route_details: Optional[dict] = field(default_factory=dict)
    is_simulated: bool = False
    timestamp: float = field(default_factory=time.time)  # When quote was created
    ttl_seconds: int = 60  # Quote validity period (1 minute default)

    @property
    def effective_rate(self) -> Decimal:
        """Get effective exchange rate including fees."""
        if self.from_amount == 0:
            return Decimal("0")
        return self.to_amount / self.from_amount

    @property
    def total_fee_usd(self) -> Optional[Decimal]:
        """Get total fee in USD (if available in route_details)."""
        return self.route_details.get("fee_usd") if self.route_details else None

    @property
    def is_expired(self) -> bool:
        """Check if quote has expired."""
        return time.time() > (self.timestamp + self.ttl_seconds)

    @property
    def seconds_until_expiry(self) -> float:
        """Get seconds until quote expires (negative if expired)."""
        return (self.timestamp + self.ttl_seconds) - time.time()


@dataclass
class SwapRoute:
    """A selected swap route with execution details."""

    quote: Quote
    expiry_seconds: int = 60
    memo: Optional[str] = None
    destination_address: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "provider": self.quote.provider,
            "from_asset": self.quote.from_asset,
            "to_asset": self.quote.to_asset,
            "from_amount": str(self.quote.from_amount),
            "to_amount": str(self.quote.to_amount),
            "fee_asset": self.quote.fee_asset,
            "fee_amount": str(self.quote.fee_amount),
            "slippage_percent": str(self.quote.slippage_percent),
            "estimated_time_seconds": self.quote.estimated_time_seconds,
            "expiry_seconds": self.expiry_seconds,
            "is_simulated": self.quote.is_simulated,
        }


class RouteProvider(ABC):
    """Abstract base class for routing providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name identifier."""
        pass

    @property
    @abstractmethod
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        pass

    @abstractmethod
    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """
        Get a swap quote.

        Args:
            from_asset: Source asset symbol (e.g., "BTC")
            to_asset: Destination asset symbol (e.g., "ETH")
            amount: Amount of from_asset to swap
            slippage_tolerance: Maximum acceptable slippage (0.01 = 1%)

        Returns:
            Quote if swap is possible, None otherwise
        """
        pass

    @abstractmethod
    async def execute_swap(self, route: SwapRoute) -> dict:
        """
        Execute a swap based on the selected route.

        Args:
            route: The swap route to execute

        Returns:
            Execution result with tx_hash or error details
        """
        pass

    def supports_pair(self, from_asset: str, to_asset: str) -> bool:
        """Check if this provider supports the asset pair."""
        assets = self.supported_assets
        return from_asset.upper() in assets and to_asset.upper() in assets


class RouteAggregator:
    """Aggregates quotes from multiple providers to find the best route."""

    def __init__(self, providers: Optional[list[RouteProvider]] = None):
        self.providers: list[RouteProvider] = providers or []

    def add_provider(self, provider: RouteProvider) -> None:
        """Add a routing provider."""
        self.providers.append(provider)

    async def get_best_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """
        Get the best quote across all providers.

        Returns the quote with the highest to_amount (best rate).
        """
        logger.info(f"Finding best quote: {amount} {from_asset} -> {to_asset}")
        quotes = await self.get_all_quotes(from_asset, to_asset, amount, slippage_tolerance)

        if not quotes:
            logger.warning(f"No quotes found for {amount} {from_asset} -> {to_asset}")
            return None

        # Sort by to_amount descending (best rate first)
        best = max(quotes, key=lambda q: q.to_amount)
        logger.info(
            f"Selected best quote: {best.provider} - {best.to_amount} {best.to_asset} "
            f"(effective rate: {best.effective_rate:.6f}, expires in {best.seconds_until_expiry:.0f}s)"
        )
        return best

    async def get_all_quotes(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> list[Quote]:
        """Get quotes from all providers that support the pair."""
        quotes = []
        errors = []

        logger.debug(
            f"Getting quotes for {amount} {from_asset} -> {to_asset} "
            f"(slippage: {slippage_tolerance * 100}%)"
        )

        for provider in self.providers:
            if provider.supports_pair(from_asset, to_asset):
                try:
                    logger.debug(f"Requesting quote from {provider.name}...")
                    quote = await provider.get_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )
                    if quote:
                        logger.info(
                            f"Quote from {provider.name}: {quote.from_amount} {quote.from_asset} -> "
                            f"{quote.to_amount} {quote.to_asset} (rate: {quote.effective_rate:.6f})"
                        )
                        quotes.append(quote)
                    else:
                        logger.debug(f"{provider.name} returned no quote for {from_asset}->{to_asset}")
                except Exception as e:
                    error_msg = f"{provider.name} quote failed: {type(e).__name__}: {e}"
                    logger.warning(error_msg)
                    errors.append(error_msg)
                    continue

        # Log summary
        if quotes:
            best = max(quotes, key=lambda q: q.to_amount)
            logger.info(
                f"Got {len(quotes)} quote(s) for {from_asset}->{to_asset}. "
                f"Best: {best.provider} ({best.to_amount} {best.to_asset})"
            )
        elif errors:
            logger.error(
                f"No quotes available for {from_asset}->{to_asset}. "
                f"Errors: {'; '.join(errors)}"
            )
        else:
            logger.warning(f"No providers support {from_asset}->{to_asset} pair")

        return quotes
