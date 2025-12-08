"""Hyperliquid DEX integration for HYPE swaps.

Hyperliquid is a high-performance Layer 1 with native perpetuals and spot DEX.
Built for speed with sub-second finality and EVM compatibility.

API docs: https://hyperliquid.gitbook.io/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Hyperliquid API endpoints
HYPERLIQUID_API = "https://api.hyperliquid.xyz"
HYPERLIQUID_INFO_API = "https://api.hyperliquid.xyz/info"


class HyperliquidProvider(RouteProvider):
    """Hyperliquid DEX provider for HYPE swaps.

    Supports:
    - HYPE (native token)
    - USDC (bridged)
    - Various spot pairs
    """

    def __init__(
        self,
        private_key: Optional[str] = None,
        slippage_tolerance: Decimal = Decimal("0.5"),
    ):
        """Initialize Hyperliquid provider.

        Args:
            private_key: Private key for signing (optional for quotes)
            slippage_tolerance: Default slippage tolerance (0.5%)
        """
        self.private_key = private_key
        self.default_slippage = slippage_tolerance

    @property
    def name(self) -> str:
        return "Hyperliquid"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported assets on Hyperliquid."""
        return ["HYPE"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ) -> Optional[Quote]:
        """Get swap quote from Hyperliquid.

        Args:
            from_asset: Source asset (HYPE, USDC)
            to_asset: Destination asset
            amount: Amount to swap
            slippage_tolerance: Max slippage (0.005 = 0.5%)
        """
        from_upper = from_asset.upper()
        to_upper = to_asset.upper()

        # Check if assets are supported
        if from_upper not in self.supported_assets:
            logger.debug(f"Asset not supported by Hyperliquid: {from_asset}")
            return None

        if to_upper not in self.supported_assets:
            logger.debug(f"Asset not supported by Hyperliquid: {to_asset}")
            return None

        # Same asset swap not needed
        if from_upper == to_upper:
            return None

        try:
            # Get HYPE price
            hype_price = await self._get_hype_price()
            if not hype_price:
                logger.warning("Could not fetch HYPE price")
                # Use placeholder price for quote
                hype_price = Decimal("20.0")

            # Calculate swap
            if from_upper == "HYPE" and to_upper == "USDC":
                # HYPE -> USDC
                to_amount = amount * hype_price * (1 - slippage_tolerance)
            elif from_upper == "USDC" and to_upper == "HYPE":
                # USDC -> HYPE
                to_amount = (amount / hype_price) * (1 - slippage_tolerance)
            else:
                return None

            # Hyperliquid has very low fees
            fee_amount = Decimal("0.001")  # ~0.1% taker fee

            return Quote(
                provider=self.name,
                from_asset=from_upper,
                to_asset=to_upper,
                from_amount=amount,
                to_amount=to_amount,
                fee_asset=from_upper,
                fee_amount=fee_amount,
                slippage_percent=slippage_tolerance * 100,
                estimated_time_seconds=1,  # Sub-second finality
                route_details={
                    "dex": "Hyperliquid",
                    "chain": "Hyperliquid L1",
                    "market": f"{from_upper}/{to_upper}",
                },
                is_simulated=True,  # Using estimated price
            )

        except Exception as e:
            logger.error(f"Hyperliquid quote error: {e}")
            return None

    async def _get_hype_price(self) -> Optional[Decimal]:
        """Get HYPE price in USD."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try CoinGecko
                response = await client.get(
                    "https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": "hyperliquid", "vs_currencies": "usd"},
                )

                if response.status_code == 200:
                    data = response.json()
                    price = data.get("hyperliquid", {}).get("usd")
                    if price:
                        return Decimal(str(price))

        except Exception as e:
            logger.debug(f"HYPE price fetch error: {e}")

        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap on Hyperliquid.

        Requires private key for signing Hyperliquid transactions.
        """
        if not self.private_key:
            return {
                "success": False,
                "error": "Private key not configured for Hyperliquid",
                "provider": self.name,
            }

        return {
            "success": False,
            "error": "Hyperliquid execution requires SDK integration",
            "provider": self.name,
            "instructions": {
                "api": HYPERLIQUID_API,
                "market": route.quote.route_details.get("market") if route.quote.route_details else None,
            },
        }
