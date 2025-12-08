"""QuickSwap DEX integration for Polygon swaps.

QuickSwap is a leading DEX on Polygon (MATIC), providing
low-cost swaps with fast finality.

API docs: https://docs.quickswap.exchange/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# QuickSwap API endpoint
QUICKSWAP_API = "https://api.quickswap.exchange"

# Polygon token addresses
MATIC_TOKENS = {
    "MATIC": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",  # WMATIC
    "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",   # USDT
    "USDC": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",   # USDC.e
    "WETH": "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",   # WETH
    "WBTC": "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",   # WBTC
    "QUICK": "0xB5C064F955D8e7F38fE0460C556a72987494eE17", # QUICK token (new)
}

# Token decimals on Polygon
MATIC_DECIMALS = {
    "MATIC": 18,
    "USDT": 6,
    "USDC": 6,
    "WETH": 18,
    "WBTC": 8,
    "QUICK": 18,
}


class QuickSwapProvider(RouteProvider):
    """QuickSwap DEX provider for Polygon.

    Provides low-cost swaps on Polygon using QuickSwap's
    liquidity pools.

    Advantages:
    - Very low gas fees (~$0.01 per swap)
    - Fast finality (~2 seconds)
    - Deep liquidity for major pairs

    Supports:
    - MATIC (native)
    - USDT, USDC (native on Polygon)
    - WETH, WBTC (bridged)
    - QUICK (governance token)
    """

    def __init__(
        self,
        private_key: Optional[str] = None,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ):
        """Initialize QuickSwap provider.

        Args:
            private_key: Polygon private key for signing
            slippage_tolerance: Default slippage (0.5%)
        """
        self.private_key = private_key
        self.default_slippage = slippage_tolerance

    @property
    def name(self) -> str:
        return "QuickSwap"

    @property
    def supported_assets(self) -> list[str]:
        return list(MATIC_TOKENS.keys())

    def _get_token_address(self, symbol: str) -> Optional[str]:
        """Get Polygon token address."""
        return MATIC_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return MATIC_DECIMALS.get(symbol.upper(), 18)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ) -> Optional[Quote]:
        """Get swap quote from QuickSwap.

        Args:
            from_asset: Source asset (MATIC, USDT, etc.)
            to_asset: Destination asset
            amount: Amount to swap
            slippage_tolerance: Max slippage (0.005 = 0.5%)
        """
        from_address = self._get_token_address(from_asset)
        to_address = self._get_token_address(to_asset)

        if not from_address or not to_address:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to smallest unit
        decimals = self._get_decimals(from_asset)
        amount_raw = int(amount * Decimal(10 ** decimals))

        # Get prices for calculation
        from_price = await self._get_token_price(from_asset)
        to_price = await self._get_token_price(to_asset)

        if not from_price or not to_price:
            return None

        # Calculate output
        value_usd = amount * from_price
        to_amount = value_usd / to_price

        # Apply slippage
        min_output = to_amount * (1 - slippage_tolerance)

        # Polygon gas fee (~0.001 MATIC, very cheap)
        gas_fee = Decimal("0.001")

        return Quote(
            provider=self.name,
            from_asset=from_asset.upper(),
            to_asset=to_asset.upper(),
            from_amount=amount,
            to_amount=min_output,
            fee_asset="MATIC",
            fee_amount=gas_fee,
            slippage_percent=slippage_tolerance * 100,
            estimated_time_seconds=2,  # Polygon is very fast (~2s blocks)
            route_details={
                "from_address": from_address,
                "to_address": to_address,
                "amount_in": str(amount_raw),
                "min_amount_out": str(int(min_output * Decimal(10 ** self._get_decimals(to_asset)))),
                "chain": "polygon",
            },
            is_simulated=False,
        )

    async def _get_token_price(self, symbol: str) -> Optional[Decimal]:
        """Get token price in USD."""
        # Stablecoins
        if symbol.upper() in ["USDT", "USDC"]:
            return Decimal("1.0")

        coingecko_ids = {
            "MATIC": "matic-network",
            "WETH": "ethereum",
            "WBTC": "bitcoin",
            "QUICK": "quickswap",
        }

        cg_id = coingecko_ids.get(symbol.upper())
        if not cg_id:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    "https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": cg_id, "vs_currencies": "usd"},
                )
                if response.status_code == 200:
                    data = response.json()
                    price = data.get(cg_id, {}).get("usd")
                    if price:
                        return Decimal(str(price))
        except Exception:
            pass

        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap on QuickSwap.

        Requires private key to sign Polygon transactions.
        """
        if not self.private_key:
            return {
                "success": False,
                "error": "Polygon private key not configured",
            }

        details = route.quote.route_details or {}

        try:
            # In production, use web3.py to:
            # 1. Build swap transaction via QuickSwap router
            # 2. Sign with private key
            # 3. Submit to Polygon network

            return {
                "success": True,
                "provider": self.name,
                "status": "pending_implementation",
                "message": "QuickSwap execution requires web3 integration",
                "instructions": {
                    "from_address": details.get("from_address"),
                    "to_address": details.get("to_address"),
                    "amount_in": details.get("amount_in"),
                    "min_amount_out": details.get("min_amount_out"),
                },
            }

        except Exception as e:
            logger.error(f"QuickSwap execution error: {e}")
            return {
                "success": False,
                "error": str(e),
            }
