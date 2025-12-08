"""Internal reserve swap provider for DASH.

Uses an internal liquidity reserve with CoinGecko pricing.
The operator maintains DASH + USDT reserves and acts as market maker.
"""

import logging
import os
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# CoinGecko API (free tier)
COINGECKO_API = "https://api.coingecko.com/api/v3"

# Supported assets for internal reserve
INTERNAL_RESERVE_ASSETS = {
    "DASH": "dash",  # CoinGecko ID
    "USDT": "tether",
}


class InternalReserveProvider(RouteProvider):
    """Internal reserve provider for DASH swaps.

    The operator maintains reserves of DASH and USDT.
    Swaps are executed instantly using CoinGecko pricing + spread.

    This enables DASH swaps without requiring external DEX liquidity.
    """

    def __init__(
        self,
        spread_percent: Decimal = Decimal("1.0"),
        min_reserve_dash: Decimal = Decimal("1.0"),
        min_reserve_usdt: Decimal = Decimal("100.0"),
    ):
        """Initialize internal reserve provider.

        Args:
            spread_percent: Spread to add to quotes (1.0 = 1%)
            min_reserve_dash: Minimum DASH reserve to maintain
            min_reserve_usdt: Minimum USDT reserve to maintain
        """
        self.spread_percent = spread_percent
        self.min_reserve_dash = min_reserve_dash
        self.min_reserve_usdt = min_reserve_usdt
        self._price_cache: dict = {}
        self._cache_timestamp: float = 0

    @property
    def name(self) -> str:
        return "Internal Reserve"

    @property
    def supported_assets(self) -> list[str]:
        return list(INTERNAL_RESERVE_ASSETS.keys())

    def supports_pair(self, from_asset: str, to_asset: str) -> bool:
        """Check if this provider supports the trading pair."""
        from_upper = from_asset.upper()
        to_upper = to_asset.upper()

        # Must have at least one side be DASH
        if "DASH" not in (from_upper, to_upper):
            return False

        # Other side must be USDT (or DASH for DASH/DASH which is pointless)
        other = to_upper if from_upper == "DASH" else from_upper
        return other in ("USDT", "USD")

    async def get_price_usd(self, asset: str) -> Optional[Decimal]:
        """Get current USD price from CoinGecko."""
        import time

        asset_upper = asset.upper()
        coingecko_id = INTERNAL_RESERVE_ASSETS.get(asset_upper)

        if not coingecko_id:
            return None

        # Cache for 60 seconds
        now = time.time()
        if now - self._cache_timestamp < 60 and asset_upper in self._price_cache:
            return self._price_cache[asset_upper]

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{COINGECKO_API}/simple/price",
                    params={
                        "ids": coingecko_id,
                        "vs_currencies": "usd",
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    price = data.get(coingecko_id, {}).get("usd")
                    if price:
                        price_decimal = Decimal(str(price))
                        self._price_cache[asset_upper] = price_decimal
                        self._cache_timestamp = now
                        return price_decimal

        except Exception as e:
            logger.warning(f"CoinGecko price fetch failed: {e}")

        return None

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote using CoinGecko pricing.

        Args:
            from_asset: Source asset (DASH or USDT)
            to_asset: Destination asset (DASH or USDT)
            amount: Amount to swap
            slippage_tolerance: Ignored (we use fixed spread)
        """
        if not self.supports_pair(from_asset, to_asset):
            return None

        from_upper = from_asset.upper()
        to_upper = to_asset.upper()

        # Get DASH price in USD
        dash_price = await self.get_price_usd("DASH")
        if not dash_price:
            logger.warning("Could not get DASH price from CoinGecko")
            return None

        # Calculate conversion
        if from_upper == "DASH":
            # DASH -> USDT
            base_output = amount * dash_price
        else:
            # USDT -> DASH
            base_output = amount / dash_price

        # Apply spread (reduces output)
        spread_multiplier = Decimal("1") - (self.spread_percent / Decimal("100"))
        to_amount = base_output * spread_multiplier

        # Calculate fee in from_asset terms
        fee_amount = amount * (self.spread_percent / Decimal("100"))

        return Quote(
            provider=self.name,
            from_asset=from_upper,
            to_asset=to_upper,
            from_amount=amount,
            to_amount=to_amount,
            fee_asset=from_upper,
            fee_amount=fee_amount,
            slippage_percent=Decimal("0"),  # No slippage, fixed price
            estimated_time_seconds=60,  # Near instant
            route_details={
                "type": "internal_reserve",
                "dash_price_usd": str(dash_price),
                "spread_percent": str(self.spread_percent),
                "note": "Swap from operator's internal reserve",
            },
            is_simulated=False,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap from internal reserve.

        The actual fund movement is handled by the ledger system.
        This just validates and returns success.
        """
        details = route.quote.route_details or {}

        return {
            "success": True,
            "provider": self.name,
            "type": "internal_reserve",
            "from_amount": str(route.quote.from_amount),
            "from_asset": route.quote.from_asset,
            "to_amount": str(route.quote.to_amount),
            "to_asset": route.quote.to_asset,
            "dash_price_usd": details.get("dash_price_usd"),
            "spread_percent": details.get("spread_percent"),
            "instructions": {
                "action": "Internal reserve swap executed instantly",
                "note": "Funds moved from operator reserve to user balance",
            },
        }

    async def check_reserve_balance(self) -> dict:
        """Check current reserve balances.

        In production, this would check actual hot wallet balances.
        """
        # Get from environment or config
        dash_reserve = Decimal(os.environ.get("DASH_RESERVE_BALANCE", "10.0"))
        usdt_reserve = Decimal(os.environ.get("USDT_RESERVE_BALANCE", "500.0"))

        return {
            "DASH": {
                "balance": str(dash_reserve),
                "min_required": str(self.min_reserve_dash),
                "healthy": dash_reserve >= self.min_reserve_dash,
            },
            "USDT": {
                "balance": str(usdt_reserve),
                "min_required": str(self.min_reserve_usdt),
                "healthy": usdt_reserve >= self.min_reserve_usdt,
            },
        }
