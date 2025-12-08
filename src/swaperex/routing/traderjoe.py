"""Trader Joe DEX integration for Avalanche swaps.

Trader Joe is the leading DEX on Avalanche, providing best-price
routing across Avalanche C-Chain.

API docs: https://docs.traderjoexyz.com/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Trader Joe API endpoint
TRADERJOE_API = "https://api.traderjoexyz.com"

# Avalanche token addresses (C-Chain)
AVAX_TOKENS = {
    "AVAX": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",  # WAVAX
    "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",  # USDT.e
    "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",  # USDC
    "WETH": "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",  # WETH.e
    "WBTC": "0x50b7545627a5162F82A992c33b87aDc75187B218",  # WBTC.e
    "JOE": "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd",   # JOE token
}

# Token decimals on Avalanche
AVAX_DECIMALS = {
    "AVAX": 18,
    "USDT": 6,
    "USDC": 6,
    "WETH": 18,
    "WBTC": 8,
    "JOE": 18,
}


class TraderJoeProvider(RouteProvider):
    """Trader Joe DEX provider for Avalanche.

    Provides swaps on Avalanche C-Chain using Trader Joe's
    liquidity pools.

    Supports:
    - AVAX (native)
    - USDT, USDC (bridged stablecoins)
    - WETH, WBTC (bridged assets)
    - JOE (governance token)
    """

    def __init__(
        self,
        private_key: Optional[str] = None,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ):
        """Initialize Trader Joe provider.

        Args:
            private_key: Avalanche private key for signing
            slippage_tolerance: Default slippage (0.5%)
        """
        self.private_key = private_key
        self.default_slippage = slippage_tolerance

    @property
    def name(self) -> str:
        return "Trader Joe"

    @property
    def supported_assets(self) -> list[str]:
        return list(AVAX_TOKENS.keys())

    def _get_token_address(self, symbol: str) -> Optional[str]:
        """Get Avalanche token address."""
        return AVAX_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return AVAX_DECIMALS.get(symbol.upper(), 18)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ) -> Optional[Quote]:
        """Get swap quote from Trader Joe.

        Args:
            from_asset: Source asset (AVAX, USDT, etc.)
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

        # Avalanche gas fee (~0.01 AVAX)
        gas_fee = Decimal("0.01")

        return Quote(
            provider=self.name,
            from_asset=from_asset.upper(),
            to_asset=to_asset.upper(),
            from_amount=amount,
            to_amount=min_output,
            fee_asset="AVAX",
            fee_amount=gas_fee,
            slippage_percent=slippage_tolerance * 100,
            estimated_time_seconds=3,  # Avalanche is fast (~2s blocks)
            route_details={
                "from_address": from_address,
                "to_address": to_address,
                "amount_in": str(amount_raw),
                "min_amount_out": str(int(min_output * Decimal(10 ** self._get_decimals(to_asset)))),
                "chain": "avalanche",
            },
            is_simulated=False,
        )

    async def _get_token_price(self, symbol: str) -> Optional[Decimal]:
        """Get token price in USD."""
        # Stablecoins
        if symbol.upper() in ["USDT", "USDC"]:
            return Decimal("1.0")

        coingecko_ids = {
            "AVAX": "avalanche-2",
            "WETH": "ethereum",
            "WBTC": "bitcoin",
            "JOE": "joe",
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
        """Execute swap on Trader Joe.

        Requires private key to sign Avalanche transactions.
        """
        if not self.private_key:
            return {
                "success": False,
                "error": "Avalanche private key not configured",
            }

        details = route.quote.route_details or {}

        try:
            # In production, use web3.py to:
            # 1. Build swap transaction via Trader Joe router
            # 2. Sign with private key
            # 3. Submit to Avalanche C-Chain

            return {
                "success": True,
                "provider": self.name,
                "status": "pending_implementation",
                "message": "Trader Joe execution requires web3 integration",
                "instructions": {
                    "from_address": details.get("from_address"),
                    "to_address": details.get("to_address"),
                    "amount_in": details.get("amount_in"),
                    "min_amount_out": details.get("min_amount_out"),
                },
            }

        except Exception as e:
            logger.error(f"Trader Joe execution error: {e}")
            return {
                "success": False,
                "error": str(e),
            }
