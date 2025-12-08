"""Internal reserve swap provider.

Uses an internal liquidity reserve with CoinGecko pricing.
The operator maintains reserves of various assets and acts as market maker.

Supports:
- DASH <-> USDT (any variant)
- USDT-BEP20 <-> USDT-TRC20 (bridging between chains)
- Other reserve pairs as configured
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
    "DASH": "dash",
    # All USDT variants are treated as 1:1
    "USDT": "tether",
    "USDT-TRC20": "tether",
    "USDT-ERC20": "tether",
    "USDT-BEP20": "tether",
    "USDT-SPL": "tether",
}

# USDT variants (all equivalent in value)
USDT_VARIANTS = {"USDT", "USDT-TRC20", "USDT-ERC20", "USDT-BEP20", "USDT-SPL"}


class InternalReserveProvider(RouteProvider):
    """Internal reserve provider for instant swaps.

    The operator maintains reserves of various assets.
    Swaps are executed instantly using CoinGecko pricing + spread.

    Supported swap types:
    1. DASH <-> USDT (any variant) - Uses market price + spread
    2. USDT variant <-> USDT variant - 1:1 bridge with small fee

    This enables:
    - DASH swaps without external DEX liquidity
    - Cross-chain USDT bridging (e.g., BEP20 to TRC20 for cheap withdrawals)
    """

    def __init__(
        self,
        spread_percent: Decimal = Decimal("1.0"),
        bridge_fee_percent: Decimal = Decimal("0.1"),  # 0.1% for USDT bridging
        min_reserve_dash: Decimal = Decimal("1.0"),
        min_reserve_usdt: Decimal = Decimal("100.0"),
    ):
        """Initialize internal reserve provider.

        Args:
            spread_percent: Spread for DASH swaps (1.0 = 1%)
            bridge_fee_percent: Fee for USDT bridging (0.1 = 0.1%)
            min_reserve_dash: Minimum DASH reserve to maintain
            min_reserve_usdt: Minimum USDT reserve to maintain
        """
        self.spread_percent = spread_percent
        self.bridge_fee_percent = bridge_fee_percent
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

    def _normalize_usdt(self, asset: str) -> str:
        """Normalize USDT variant to base USDT."""
        if asset.upper() in USDT_VARIANTS or asset.upper().startswith("USDT"):
            return "USDT"
        return asset.upper()

    def _is_usdt(self, asset: str) -> bool:
        """Check if asset is a USDT variant."""
        return asset.upper() in USDT_VARIANTS or asset.upper().startswith("USDT")

    def supports_pair(self, from_asset: str, to_asset: str) -> bool:
        """Check if this provider supports the trading pair."""
        from_upper = from_asset.upper()
        to_upper = to_asset.upper()

        # Case 1: USDT bridging (any USDT variant to any other)
        if self._is_usdt(from_upper) and self._is_usdt(to_upper):
            return from_upper != to_upper  # Must be different variants

        # Case 2: DASH <-> USDT swaps
        if "DASH" in (from_upper, to_upper):
            other = to_upper if from_upper == "DASH" else from_upper
            return self._is_usdt(other)

        return False

    async def get_price_usd(self, asset: str) -> Optional[Decimal]:
        """Get current USD price from CoinGecko."""
        import time

        normalized = self._normalize_usdt(asset)

        # All USDT variants are $1
        if normalized == "USDT":
            return Decimal("1.0")

        coingecko_id = INTERNAL_RESERVE_ASSETS.get(normalized)
        if not coingecko_id:
            return None

        # Cache for 60 seconds
        now = time.time()
        if now - self._cache_timestamp < 60 and normalized in self._price_cache:
            return self._price_cache[normalized]

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
                        self._price_cache[normalized] = price_decimal
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
        """Get swap quote.

        Handles two types of swaps:
        1. USDT bridging (e.g., BEP20 -> TRC20): 1:1 with small fee
        2. DASH <-> USDT: CoinGecko price + spread
        """
        if not self.supports_pair(from_asset, to_asset):
            return None

        from_upper = from_asset.upper()
        to_upper = to_asset.upper()

        # Case 1: USDT bridging (cross-chain)
        if self._is_usdt(from_upper) and self._is_usdt(to_upper):
            return await self._get_bridge_quote(from_upper, to_upper, amount)

        # Case 2: DASH <-> USDT swap
        return await self._get_swap_quote(from_upper, to_upper, amount)

    async def _get_bridge_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
    ) -> Optional[Quote]:
        """Get quote for USDT bridging (cross-chain)."""
        # 1:1 bridge with small fee
        fee_amount = amount * (self.bridge_fee_percent / Decimal("100"))
        to_amount = amount - fee_amount

        return Quote(
            provider=self.name,
            from_asset=from_asset,
            to_asset=to_asset,
            from_amount=amount,
            to_amount=to_amount,
            fee_asset=from_asset,
            fee_amount=fee_amount,
            slippage_percent=Decimal("0"),
            estimated_time_seconds=30,  # Instant internal swap
            route_details={
                "type": "usdt_bridge",
                "from_chain": self._get_chain(from_asset),
                "to_chain": self._get_chain(to_asset),
                "fee_percent": str(self.bridge_fee_percent),
                "note": "Cross-chain USDT bridge via internal reserve",
            },
            is_simulated=False,
        )

    async def _get_swap_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
    ) -> Optional[Quote]:
        """Get quote for DASH <-> USDT swap."""
        # Get DASH price in USD
        dash_price = await self.get_price_usd("DASH")
        if not dash_price:
            logger.warning("Could not get DASH price from CoinGecko")
            return None

        # Normalize USDT variant
        from_normalized = self._normalize_usdt(from_asset)
        to_normalized = self._normalize_usdt(to_asset)

        # Calculate conversion
        if from_normalized == "DASH":
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
            from_asset=from_asset,
            to_asset=to_asset,
            from_amount=amount,
            to_amount=to_amount,
            fee_asset=from_asset,
            fee_amount=fee_amount,
            slippage_percent=Decimal("0"),  # No slippage, fixed price
            estimated_time_seconds=60,
            route_details={
                "type": "dash_swap",
                "dash_price_usd": str(dash_price),
                "spread_percent": str(self.spread_percent),
                "note": "Swap from operator's internal reserve",
            },
            is_simulated=False,
        )

    def _get_chain(self, asset: str) -> str:
        """Get chain name from USDT variant."""
        chain_map = {
            "USDT": "multi",
            "USDT-TRC20": "TRON",
            "USDT-ERC20": "Ethereum",
            "USDT-BEP20": "BSC",
            "USDT-SPL": "Solana",
        }
        return chain_map.get(asset.upper(), "unknown")

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap from internal reserve.

        The actual fund movement is handled by the ledger system.
        This validates and returns success.
        """
        details = route.quote.route_details or {}
        swap_type = details.get("type", "unknown")

        if swap_type == "usdt_bridge":
            return {
                "success": True,
                "provider": self.name,
                "type": "usdt_bridge",
                "from_amount": str(route.quote.from_amount),
                "from_asset": route.quote.from_asset,
                "from_chain": details.get("from_chain"),
                "to_amount": str(route.quote.to_amount),
                "to_asset": route.quote.to_asset,
                "to_chain": details.get("to_chain"),
                "fee_percent": details.get("fee_percent"),
                "instructions": {
                    "action": "USDT bridge executed instantly",
                    "note": f"Converted {route.quote.from_asset} to {route.quote.to_asset}",
                },
            }

        return {
            "success": True,
            "provider": self.name,
            "type": "dash_swap",
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
        dash_reserve = Decimal(os.environ.get("DASH_RESERVE_BALANCE", "10.0"))

        # Check USDT reserves on each chain
        usdt_reserves = {
            "TRC20": Decimal(os.environ.get("USDT_TRC20_RESERVE", "500.0")),
            "ERC20": Decimal(os.environ.get("USDT_ERC20_RESERVE", "100.0")),
            "BEP20": Decimal(os.environ.get("USDT_BEP20_RESERVE", "500.0")),
            "SPL": Decimal(os.environ.get("USDT_SPL_RESERVE", "100.0")),
        }

        total_usdt = sum(usdt_reserves.values())

        return {
            "DASH": {
                "balance": str(dash_reserve),
                "min_required": str(self.min_reserve_dash),
                "healthy": dash_reserve >= self.min_reserve_dash,
            },
            "USDT": {
                "total": str(total_usdt),
                "by_chain": {k: str(v) for k, v in usdt_reserves.items()},
                "min_required": str(self.min_reserve_usdt),
                "healthy": total_usdt >= self.min_reserve_usdt,
            },
        }
