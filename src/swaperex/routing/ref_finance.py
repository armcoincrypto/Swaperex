"""Ref Finance DEX integration for NEAR.

Uses Ref Finance API for swaps on NEAR network.
API docs: https://guide.ref.finance/developers-1/api
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Ref Finance API endpoints
REF_INDEXER_API = "https://indexer.ref.finance"
REF_API = "https://api.ref.finance"

# Token contract IDs on NEAR mainnet
NEAR_TOKENS = {
    "NEAR": "wrap.near",  # Wrapped NEAR
    "USDT": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",  # USDT.e
    "USDC": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",  # USDC
    "USDC.E": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
    "WETH": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",  # Wrapped ETH
    "AURORA": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
    "REF": "token.v2.ref-finance.near",  # REF token
    "STNEAR": "meta-pool.near",  # Staked NEAR
}

# Token decimals
TOKEN_DECIMALS = {
    "NEAR": 24,
    "USDT": 6,
    "USDC": 6,
    "USDC.E": 6,
    "WETH": 18,
    "AURORA": 18,
    "REF": 18,
    "STNEAR": 24,
}


class RefFinanceProvider(RouteProvider):
    """Ref Finance DEX provider for NEAR.

    Ref Finance is the leading AMM DEX on NEAR Protocol.
    """

    def __init__(self):
        """Initialize Ref Finance provider."""
        self.base_url = REF_INDEXER_API

    @property
    def name(self) -> str:
        return "Ref Finance"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        return list(NEAR_TOKENS.keys())

    def _get_token_id(self, symbol: str) -> Optional[str]:
        """Get token contract ID by symbol."""
        return NEAR_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return TOKEN_DECIMALS.get(symbol.upper(), 24)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from Ref Finance.

        Args:
            from_asset: Source token symbol
            to_asset: Destination token symbol
            amount: Amount in human-readable units
            slippage_tolerance: Max slippage (0.01 = 1%)

        Returns:
            Quote with best available rate
        """
        from_token = self._get_token_id(from_asset)
        to_token = self._get_token_id(to_asset)

        if not from_token or not to_token:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to smallest units (yoctoNEAR for NEAR)
        from_decimals = self._get_decimals(from_asset)
        amount_yocto = int(amount * (10 ** from_decimals))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get swap estimate from Ref Finance
                response = await client.get(
                    f"{self.base_url}/get-token-price",
                    params={
                        "token_id": from_token,
                    },
                )

                from_price = None
                if response.status_code == 200:
                    data = response.json()
                    from_price = Decimal(str(data.get("price", "0")))

                # Get destination token price
                response2 = await client.get(
                    f"{self.base_url}/get-token-price",
                    params={
                        "token_id": to_token,
                    },
                )

                to_price = None
                if response2.status_code == 200:
                    data = response2.json()
                    to_price = Decimal(str(data.get("price", "0")))

                if not from_price or not to_price or from_price <= 0 or to_price <= 0:
                    return await self._get_pool_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )

                # Calculate output with 0.3% fee
                usd_value = amount * from_price
                fee_percent = Decimal("0.003")
                to_amount = (usd_value * (1 - fee_percent)) / to_price

                # Estimate fee in NEAR (~0.01 NEAR per tx)
                estimated_fee_near = Decimal("0.01")

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="NEAR",
                    fee_amount=estimated_fee_near,
                    slippage_percent=slippage_tolerance * 100,
                    estimated_time_seconds=2,  # NEAR is very fast
                    route_details={
                        "chain": "near",
                        "from_token": from_token,
                        "to_token": to_token,
                        "from_price_usd": str(from_price),
                        "to_price_usd": str(to_price),
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"Ref Finance quote error: {e}")
            return await self._get_pool_quote(
                from_asset, to_asset, amount, slippage_tolerance
            )

    async def _get_pool_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal,
    ) -> Optional[Quote]:
        """Get quote using pool data as fallback."""
        try:
            from_token = self._get_token_id(from_asset)
            to_token = self._get_token_id(to_asset)

            async with httpx.AsyncClient(timeout=15.0) as client:
                # Get pools
                response = await client.get(
                    f"{self.base_url}/list-pools",
                )

                if response.status_code != 200:
                    return None

                pools = response.json()

                # Find matching pool
                for pool in pools:
                    token_ids = pool.get("token_account_ids", [])

                    if from_token in token_ids and to_token in token_ids:
                        # Get pool amounts
                        amounts = pool.get("amounts", [])
                        if len(amounts) >= 2:
                            from_idx = token_ids.index(from_token)
                            to_idx = token_ids.index(to_token)

                            from_reserve = Decimal(amounts[from_idx])
                            to_reserve = Decimal(amounts[to_idx])

                            if from_reserve > 0 and to_reserve > 0:
                                # AMM calculation with fee
                                from_decimals = self._get_decimals(from_asset)
                                to_decimals = self._get_decimals(to_asset)

                                amount_in = amount * Decimal(10 ** from_decimals)
                                fee = 1 - Decimal(pool.get("total_fee", 30)) / Decimal(10000)

                                amount_out = (amount_in * fee * to_reserve) / (from_reserve + amount_in * fee)
                                to_amount = amount_out / Decimal(10 ** to_decimals)

                                return Quote(
                                    provider=self.name,
                                    from_asset=from_asset.upper(),
                                    to_asset=to_asset.upper(),
                                    from_amount=amount,
                                    to_amount=to_amount,
                                    fee_asset="NEAR",
                                    fee_amount=Decimal("0.01"),
                                    slippage_percent=slippage_tolerance * 100,
                                    estimated_time_seconds=2,
                                    route_details={
                                        "chain": "near",
                                        "pool_id": pool.get("id"),
                                        "method": "pool_calculation",
                                    },
                                    is_simulated=False,
                                )

        except Exception as e:
            logger.error(f"Ref Finance pool quote error: {e}")

        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via Ref Finance.

        Returns swap transaction data for signing.
        """
        details = route.quote.route_details or {}

        return {
            "success": True,
            "provider": self.name,
            "instructions": {
                "action": "Execute swap on Ref Finance",
                "from_token": details.get("from_token"),
                "to_token": details.get("to_token"),
                "amount": str(route.quote.from_amount),
                "min_output": str(route.quote.to_amount * Decimal("0.99")),
                "pool_id": details.get("pool_id"),
            },
            "from_amount": str(route.quote.from_amount),
            "expected_to_amount": str(route.quote.to_amount),
        }


def create_ref_finance_provider() -> RefFinanceProvider:
    """Create a Ref Finance provider instance."""
    return RefFinanceProvider()
