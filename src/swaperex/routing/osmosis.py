"""Osmosis DEX integration for Cosmos ecosystem.

Uses Osmosis API for swaps on Osmosis chain and IBC tokens.
API docs: https://docs.osmosis.zone/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Osmosis API endpoints
OSMOSIS_API = "https://api.osmosis.zone"
OSMOSIS_LCD = "https://lcd.osmosis.zone"
OSMOSIS_IMPERATOR = "https://api-osmosis.imperator.co"

# Cosmos denoms on Osmosis
COSMOS_TOKENS = {
    "OSMO": "uosmo",
    "ATOM": "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
    "USDC": "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",  # Noble USDC
    "USDC.AXL": "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",
    "JUNO": "ibc/46B44899322F3CD854D2D46DEEF881958467CDD4B3B10086DA49296BBED94BED",
    "INJ": "ibc/64BA6E31FE887D66C6F8F31C7B1A80C7CA179239677B4088BB55F5EA07DBE273",
    "TIA": "ibc/D79E7D83AB399BFFF93433E54FAA480C191248FC556924A2A8351AE2638B3877",
    "SCRT": "ibc/0954E1C28EB7AF5B72D24F3BC2B47BBB2FDF91BDDFD57B74B99E133AED40972A",
    "STARS": "ibc/987C17B11ABC2B20019178ACE62929FE9840202CE79498E29FE8E5CB02B7C0A4",
    "AKT": "ibc/1480B8FD20AD5FCAE81EA87584D269547DD4D436843C1D20F15E00EB64743EF4",
}

# Token decimals (most Cosmos tokens use 6)
TOKEN_DECIMALS = {
    "OSMO": 6,
    "ATOM": 6,
    "USDC": 6,
    "USDC.AXL": 6,
    "JUNO": 6,
    "INJ": 18,
    "TIA": 6,
    "SCRT": 6,
    "STARS": 6,
    "AKT": 6,
}


class OsmosisProvider(RouteProvider):
    """Osmosis DEX provider for Cosmos ecosystem.

    Osmosis is the leading DEX on Cosmos with support for
    IBC tokens from various Cosmos chains.
    """

    def __init__(self):
        """Initialize Osmosis provider."""
        self.base_url = OSMOSIS_API
        self.imperator_url = OSMOSIS_IMPERATOR

    @property
    def name(self) -> str:
        return "Osmosis"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        return list(COSMOS_TOKENS.keys())

    def _get_denom(self, symbol: str) -> Optional[str]:
        """Get token denom by symbol."""
        return COSMOS_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return TOKEN_DECIMALS.get(symbol.upper(), 6)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from Osmosis.

        Args:
            from_asset: Source token symbol
            to_asset: Destination token symbol
            amount: Amount in human-readable units
            slippage_tolerance: Max slippage (0.01 = 1%)

        Returns:
            Quote with expected output
        """
        from_denom = self._get_denom(from_asset)
        to_denom = self._get_denom(to_asset)

        if not from_denom or not to_denom:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to smallest units
        from_decimals = self._get_decimals(from_asset)
        amount_micro = int(amount * (10 ** from_decimals))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get quote from Osmosis swap router
                response = await client.get(
                    f"{self.imperator_url}/tokens/v2/price/{from_denom}",
                )

                from_price = None
                if response.status_code == 200:
                    data = response.json()
                    from_price = Decimal(str(data.get("price", "0")))

                # Get to price
                response2 = await client.get(
                    f"{self.imperator_url}/tokens/v2/price/{to_denom}",
                )

                to_price = None
                if response2.status_code == 200:
                    data = response2.json()
                    to_price = Decimal(str(data.get("price", "0")))

                if not from_price or not to_price or from_price <= 0 or to_price <= 0:
                    return await self._get_pool_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )

                # Calculate output with 0.2% swap fee
                usd_value = amount * from_price
                fee_percent = Decimal("0.002")
                to_amount = (usd_value * (1 - fee_percent)) / to_price

                # Estimate fee in OSMO
                estimated_fee_osmo = Decimal("0.01")

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="OSMO",
                    fee_amount=estimated_fee_osmo,
                    slippage_percent=slippage_tolerance * 100,
                    estimated_time_seconds=10,  # IBC can take longer
                    route_details={
                        "chain": "osmosis",
                        "from_denom": from_denom,
                        "to_denom": to_denom,
                        "from_price_usd": str(from_price),
                        "to_price_usd": str(to_price),
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"Osmosis quote error: {e}")
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
        """Fallback quote using pool data."""
        try:
            from_denom = self._get_denom(from_asset)
            to_denom = self._get_denom(to_asset)

            async with httpx.AsyncClient(timeout=15.0) as client:
                # Get pools
                response = await client.get(
                    f"{self.imperator_url}/pools/v2/all",
                    params={"low_liquidity": "false"},
                )

                if response.status_code != 200:
                    return None

                pools = response.json()

                # Find matching pool
                for pool in pools:
                    pool_assets = pool.get("pool_assets", [])
                    denoms = [a.get("denom") for a in pool_assets]

                    if from_denom in denoms and to_denom in denoms:
                        # Found matching pool
                        liquidity = Decimal(str(pool.get("liquidity", 0)))

                        if liquidity > 1000:  # Minimum liquidity check
                            # Get swap fee
                            swap_fee = Decimal(str(pool.get("swap_fees", 0.002)))

                            # Estimate output based on pool composition
                            from_decimals = self._get_decimals(from_asset)
                            to_decimals = self._get_decimals(to_asset)

                            # Simplified AMM calculation
                            from_weight = Decimal("0.5")
                            to_weight = Decimal("0.5")

                            for asset in pool_assets:
                                if asset.get("denom") == from_denom:
                                    from_weight = Decimal(str(asset.get("weight_or_scaling", 0.5)))
                                elif asset.get("denom") == to_denom:
                                    to_weight = Decimal(str(asset.get("weight_or_scaling", 0.5)))

                            # Simple price ratio
                            to_amount = amount * (1 - swap_fee) * (to_weight / from_weight)

                            return Quote(
                                provider=self.name,
                                from_asset=from_asset.upper(),
                                to_asset=to_asset.upper(),
                                from_amount=amount,
                                to_amount=to_amount,
                                fee_asset="OSMO",
                                fee_amount=Decimal("0.01"),
                                slippage_percent=slippage_tolerance * 100,
                                estimated_time_seconds=10,
                                route_details={
                                    "chain": "osmosis",
                                    "pool_id": pool.get("pool_id"),
                                    "method": "pool_calculation",
                                },
                                is_simulated=False,
                            )

        except Exception as e:
            logger.error(f"Osmosis pool quote error: {e}")

        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via Osmosis.

        Returns swap transaction data for signing with Keplr.
        """
        details = route.quote.route_details or {}

        return {
            "success": True,
            "provider": self.name,
            "instructions": {
                "action": "Execute swap on Osmosis",
                "from_denom": details.get("from_denom"),
                "to_denom": details.get("to_denom"),
                "amount": str(route.quote.from_amount),
                "min_output": str(route.quote.to_amount * Decimal("0.99")),
                "pool_id": details.get("pool_id"),
            },
            "from_amount": str(route.quote.from_amount),
            "expected_to_amount": str(route.quote.to_amount),
        }

    async def get_pools(self) -> list[dict]:
        """Get all active liquidity pools."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.imperator_url}/pools/v2/all",
                )

                if response.status_code == 200:
                    return response.json()

        except Exception as e:
            logger.error(f"Failed to get Osmosis pools: {e}")

        return []


def create_osmosis_provider() -> OsmosisProvider:
    """Create an Osmosis provider instance."""
    return OsmosisProvider()
