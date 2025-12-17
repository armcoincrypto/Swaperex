"""SunSwap DEX integration for Tron.

Uses SunSwap/Sun.io API for swaps on Tron network.
API docs: https://sun.io/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# SunSwap API endpoints
SUNSWAP_API = "https://api.sun.io"
# SunPump/SunSwap router APIs (multiple fallbacks)
SUNSWAP_ROUTER_APIS = [
    "https://api.sunswap.com/swap/v2/router",
    "https://apilist.tronscanapi.com/api/defi/swap/route",
    "https://api.sun.io/api/v1/swap/router",
]

# TRC20 Token contract addresses on Tron mainnet
TRON_TOKENS = {
    "TRX": "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",  # Native TRX (wrapped)
    "USDT": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "USDC": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
    "BTT": "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4",
    "JST": "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9",
    "SUN": "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
    "WIN": "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
    "USDJ": "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT",
    "TUSD": "TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4",
    "NFT": "TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq",
}

# Token decimals (most TRC20 tokens use 6 or 18)
TOKEN_DECIMALS = {
    "TRX": 6,
    "USDT": 6,
    "USDC": 6,
    "BTT": 18,
    "JST": 18,
    "SUN": 18,
    "WIN": 6,
    "USDJ": 18,
    "TUSD": 18,
    "NFT": 6,
}


class SunSwapProvider(RouteProvider):
    """SunSwap DEX provider for Tron.

    SunSwap is the leading DEX on Tron network, supporting
    TRX and TRC20 token swaps.
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize SunSwap provider.

        Args:
            api_key: Optional API key for TronGrid
        """
        self.api_key = api_key
        self.base_url = SUNSWAP_API

    @property
    def name(self) -> str:
        return "SunSwap"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        return list(TRON_TOKENS.keys())

    def _get_token_address(self, symbol: str) -> Optional[str]:
        """Get token contract address by symbol."""
        return TRON_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return TOKEN_DECIMALS.get(symbol.upper(), 6)

    def _get_headers(self) -> dict:
        """Get API headers."""
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["TRON-PRO-API-KEY"] = self.api_key
        return headers

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from SunSwap.

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

        # Convert to smallest units
        from_decimals = self._get_decimals(from_asset)
        amount_sun = int(amount * (10 ** from_decimals))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Try multiple router APIs with fallback
                data = None
                for router_api in SUNSWAP_ROUTER_APIS:
                    try:
                        response = await client.post(
                            router_api,
                            headers=self._get_headers(),
                            json={
                                "tokenIn": from_address,
                                "tokenOut": to_address,
                                "amountIn": str(amount_sun),
                                "typeList": ["PSM", "CURVE", "WTRX", "SUNSWAP_V1", "SUNSWAP_V2"],
                            },
                            timeout=10.0,
                        )
                        if response.status_code == 200:
                            data = response.json()
                            if data.get("code") == 0 or data.get("success"):
                                logger.info(f"SunSwap quote from: {router_api}")
                                break
                    except Exception as e:
                        logger.debug(f"Router API {router_api} failed: {e}")
                        continue

                if not data or (data.get("code") != 0 and not data.get("success")):
                    logger.warning("All SunSwap router APIs failed")
                    return await self._get_fallback_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )

                result = data.get("data", {})
                out_amount = int(result.get("amountOut", "0"))
                to_decimals = self._get_decimals(to_asset)
                to_amount = Decimal(out_amount) / Decimal(10 ** to_decimals)

                # Get price impact
                price_impact = Decimal(result.get("priceImpact", "0"))

                # Estimate fee (energy cost ~1-5 TRX)
                estimated_fee_trx = Decimal("2.0")

                # Get route path
                route_path = result.get("route", [])

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="TRX",
                    fee_amount=estimated_fee_trx,
                    slippage_percent=abs(price_impact),
                    estimated_time_seconds=5,  # Tron is fast
                    route_details={
                        "chain": "tron",
                        "route": route_path,
                        "price_impact": str(price_impact),
                        "from_address": from_address,
                        "to_address": to_address,
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"SunSwap quote error: {e}")
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
        """Fallback quote using price API or hardcoded rates when router fails."""
        # Approximate USD prices for Tron tokens (updated periodically)
        # These are fallback values when API is unavailable
        FALLBACK_PRICES_USD = {
            "TRX": Decimal("0.25"),
            "USDT": Decimal("1.0"),
            "USDC": Decimal("1.0"),
            "SUN": Decimal("0.02"),
            "BTT": Decimal("0.0000012"),
            "JST": Decimal("0.03"),
            "WIN": Decimal("0.00012"),
            "USDJ": Decimal("1.0"),
            "TUSD": Decimal("1.0"),
            "NFT": Decimal("0.0000005"),
        }

        try:
            # Try to get prices from Sun.io price API first
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.base_url}/v1/market/tickers",
                )

                if response.status_code == 200:
                    data = response.json()
                    tickers = data.get("data", {}).get("tickers", [])

                    # Find relevant pairs
                    from_price = None
                    to_price = None

                    for ticker in tickers:
                        base = ticker.get("base_currency", "").upper()
                        quote_currency = ticker.get("quote_currency", "").upper()

                        if base == from_asset.upper() and quote_currency == "USDT":
                            from_price = Decimal(ticker.get("last_price", "0"))
                        elif base == to_asset.upper() and quote_currency == "USDT":
                            to_price = Decimal(ticker.get("last_price", "0"))
                        elif from_asset.upper() == "USDT":
                            from_price = Decimal("1")
                        elif to_asset.upper() == "USDT":
                            to_price = Decimal("1")

                    if from_price and to_price and from_price > 0 and to_price > 0:
                        # Calculate output with 0.3% fee
                        usd_value = amount * from_price
                        fee_percent = Decimal("0.003")
                        to_amount = (usd_value * (1 - fee_percent)) / to_price

                        return Quote(
                            provider=self.name,
                            from_asset=from_asset.upper(),
                            to_asset=to_asset.upper(),
                            from_amount=amount,
                            to_amount=to_amount,
                            fee_asset="TRX",
                            fee_amount=Decimal("2.0"),
                            slippage_percent=slippage_tolerance * 100,
                            estimated_time_seconds=5,
                            route_details={
                                "chain": "tron",
                                "method": "price_api",
                            },
                            is_simulated=False,
                        )

        except Exception as e:
            logger.warning(f"SunSwap price API failed, using fallback prices: {e}")

        # Use hardcoded fallback prices
        from_price = FALLBACK_PRICES_USD.get(from_asset.upper())
        to_price = FALLBACK_PRICES_USD.get(to_asset.upper())

        if from_price and to_price and from_price > 0 and to_price > 0:
            # Calculate output with 0.5% fee (slightly higher for fallback)
            usd_value = amount * from_price
            fee_percent = Decimal("0.005")
            to_amount = (usd_value * (1 - fee_percent)) / to_price

            logger.info(f"Using fallback quote: {amount} {from_asset} -> {to_amount} {to_asset}")

            return Quote(
                provider=self.name,
                from_asset=from_asset.upper(),
                to_asset=to_asset.upper(),
                from_amount=amount,
                to_amount=to_amount,
                fee_asset="TRX",
                fee_amount=Decimal("3.0"),  # Slightly higher fee estimate
                slippage_percent=Decimal("1.0"),  # 1% slippage for fallback
                estimated_time_seconds=5,
                route_details={
                    "chain": "tron",
                    "method": "fallback_calculation",
                    "warning": "Using estimated prices - actual rate may vary",
                },
                is_simulated=False,
            )

        logger.error(f"No fallback price available for {from_asset} or {to_asset}")
        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via SunSwap.

        Returns swap instructions for the user.
        """
        details = route.quote.route_details or {}

        return {
            "success": True,
            "provider": self.name,
            "instructions": {
                "action": "Execute swap on SunSwap",
                "from_token": details.get("from_address"),
                "to_token": details.get("to_address"),
                "amount": str(route.quote.from_amount),
                "min_output": str(route.quote.to_amount * Decimal("0.99")),
                "route": details.get("route", []),
            },
            "from_amount": str(route.quote.from_amount),
            "expected_to_amount": str(route.quote.to_amount),
        }


def create_sunswap_provider(api_key: Optional[str] = None) -> SunSwapProvider:
    """Create a SunSwap provider instance."""
    return SunSwapProvider(api_key=api_key)
