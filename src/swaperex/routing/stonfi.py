"""STON.fi DEX integration for TON.

Uses STON.fi API for swaps on TON network.
API docs: https://docs.ston.fi/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# STON.fi API endpoints
STONFI_API = "https://api.ston.fi/v1"
STONFI_DEX_API = "https://api.ston.fi"

# Jetton addresses on TON mainnet
TON_TOKENS = {
    "TON": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",  # Native TON
    "USDT": "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",  # Tether USD
    "USDC": "EQC61IQRl0_la95t27xhIpjxZt32vl1QQVF2UgTNuvD18W-4",  # Circle USD
    "STON": "EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO",  # STON token
    "GEMSTON": "EQBGO9XO6k0E8v8oH2Yp1t-B0rMfGAXbmCY3H6OQLVYBW7N7",
}

# Token decimals
TOKEN_DECIMALS = {
    "TON": 9,
    "USDT": 6,
    "USDC": 6,
    "STON": 9,
    "GEMSTON": 9,
}


class StonfiProvider(RouteProvider):
    """STON.fi DEX provider for TON.

    STON.fi is the leading AMM DEX on TON blockchain.
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize STON.fi provider.

        Args:
            api_key: Optional API key for higher rate limits
        """
        self.api_key = api_key
        self.base_url = STONFI_API

    @property
    def name(self) -> str:
        return "STON.fi"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        return list(TON_TOKENS.keys())

    def _get_token_address(self, symbol: str) -> Optional[str]:
        """Get jetton address by symbol."""
        return TON_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return TOKEN_DECIMALS.get(symbol.upper(), 9)

    def _get_headers(self) -> dict:
        """Get API headers."""
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from STON.fi.

        Args:
            from_asset: Source token symbol
            to_asset: Destination token symbol
            amount: Amount in human-readable units
            slippage_tolerance: Max slippage (0.01 = 1%)

        Returns:
            Quote with best available rate
        """
        from_address = self._get_token_address(from_asset)
        to_address = self._get_token_address(to_asset)

        if not from_address or not to_address:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to smallest units (nanotons)
        from_decimals = self._get_decimals(from_asset)
        amount_nano = int(amount * (10 ** from_decimals))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get swap simulation from STON.fi
                response = await client.post(
                    f"{self.base_url}/swap/simulate",
                    headers=self._get_headers(),
                    json={
                        "offer_address": from_address,
                        "ask_address": to_address,
                        "units": str(amount_nano),
                        "slippage_tolerance": str(slippage_tolerance),
                    },
                )

                if response.status_code != 200:
                    logger.warning(f"STON.fi API error: {response.status_code}")
                    return await self._get_fallback_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )

                data = response.json()

                if not data.get("success", False):
                    return await self._get_fallback_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )

                result = data.get("result", {})

                # Parse output amount
                ask_units = int(result.get("ask_units", "0"))
                to_decimals = self._get_decimals(to_asset)
                to_amount = Decimal(ask_units) / Decimal(10 ** to_decimals)

                # Get fee info
                fee_units = int(result.get("fee_units", "0"))
                fee_amount = Decimal(fee_units) / Decimal(10 ** 9)  # Fee in TON

                # Price impact
                price_impact = Decimal(result.get("price_impact", "0"))

                # Pool info
                pool_address = result.get("pool_address", "")

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="TON",
                    fee_amount=fee_amount if fee_amount > 0 else Decimal("0.1"),
                    slippage_percent=abs(price_impact) * 100,
                    estimated_time_seconds=5,  # TON is fast
                    route_details={
                        "chain": "ton",
                        "pool_address": pool_address,
                        "price_impact": str(price_impact),
                        "offer_address": from_address,
                        "ask_address": to_address,
                        "min_ask_units": result.get("min_ask_units"),
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"STON.fi quote error: {e}")
            return await self._get_fallback_quote(
                from_asset, to_asset, amount, slippage_tolerance
            )

    async def _get_fallback_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal,
    ) -> Optional[Quote]:
        """Fallback quote using pool data when simulation fails."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Get pools list
                response = await client.get(
                    f"{self.base_url}/pools",
                    headers=self._get_headers(),
                )

                if response.status_code != 200:
                    return None

                data = response.json()
                pools = data.get("pool_list", [])

                from_address = self._get_token_address(from_asset)
                to_address = self._get_token_address(to_asset)

                # Find matching pool
                for pool in pools:
                    token0 = pool.get("token0_address", "")
                    token1 = pool.get("token1_address", "")

                    if (token0 == from_address and token1 == to_address) or \
                       (token1 == from_address and token0 == to_address):
                        # Calculate output based on reserves
                        reserve0 = Decimal(pool.get("reserve0", "0"))
                        reserve1 = Decimal(pool.get("reserve1", "0"))

                        if reserve0 > 0 and reserve1 > 0:
                            # AMM formula with 0.3% fee
                            from_decimals = self._get_decimals(from_asset)
                            to_decimals = self._get_decimals(to_asset)

                            amount_in = amount * Decimal(10 ** from_decimals)

                            if token0 == from_address:
                                amount_out = (amount_in * Decimal("0.997") * reserve1) / (reserve0 + amount_in * Decimal("0.997"))
                            else:
                                amount_out = (amount_in * Decimal("0.997") * reserve0) / (reserve1 + amount_in * Decimal("0.997"))

                            to_amount = amount_out / Decimal(10 ** to_decimals)

                            return Quote(
                                provider=self.name,
                                from_asset=from_asset.upper(),
                                to_asset=to_asset.upper(),
                                from_amount=amount,
                                to_amount=to_amount,
                                fee_asset="TON",
                                fee_amount=Decimal("0.15"),
                                slippage_percent=slippage_tolerance * 100,
                                estimated_time_seconds=5,
                                route_details={
                                    "chain": "ton",
                                    "pool_address": pool.get("address"),
                                    "method": "pool_calculation",
                                },
                                is_simulated=False,
                            )

        except Exception as e:
            logger.error(f"STON.fi fallback quote error: {e}")

        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via STON.fi.

        Returns swap transaction data for signing.
        """
        details = route.quote.route_details or {}

        return {
            "success": True,
            "provider": self.name,
            "instructions": {
                "action": "Execute swap on STON.fi",
                "offer_address": details.get("offer_address"),
                "ask_address": details.get("ask_address"),
                "amount": str(route.quote.from_amount),
                "min_ask_units": details.get("min_ask_units"),
                "pool_address": details.get("pool_address"),
            },
            "from_amount": str(route.quote.from_amount),
            "expected_to_amount": str(route.quote.to_amount),
        }


def create_stonfi_provider(api_key: Optional[str] = None) -> StonfiProvider:
    """Create a STON.fi provider instance."""
    return StonfiProvider(api_key=api_key)
