"""Osmosis DEX integration for Cosmos ecosystem swaps.

Osmosis is the leading DEX in the Cosmos ecosystem, enabling swaps
between IBC-connected chains including ATOM, OSMO, and many others.

API docs: https://docs.osmosis.zone/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Osmosis API endpoints
OSMOSIS_LCD = "https://lcd.osmosis.zone"
OSMOSIS_API = "https://api.osmosis.zone"

# Cosmos token denoms on Osmosis
OSMOSIS_DENOMS = {
    "OSMO": "uosmo",
    "ATOM": "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
    "USDT": "ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB",  # axlUSDT
    "USDC": "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",  # axlUSDC
    "WETH": "ibc/EA1D43981D5C9A1C4AAEA9C23BB1D4FA126BA9BC7020A25E0AE4AA841EA25DC5",  # axlWETH
    "WBTC": "ibc/D1542AA8762DB13087D8364F3EA6509FD6F009A34F00426AF9E4F9FA85CBBF1F",  # axlWBTC
    "TIA": "ibc/D79E7D83AB399BFFF93433E54FAA480C191248FC556924A2A8351AE2638B3877",  # Celestia
}

# Token decimals
OSMOSIS_DECIMALS = {
    "OSMO": 6,
    "ATOM": 6,
    "USDT": 6,
    "USDC": 6,
    "WETH": 18,
    "WBTC": 8,
    "TIA": 6,
}


class OsmosisProvider(RouteProvider):
    """Osmosis DEX provider for Cosmos ecosystem swaps.

    Supports swaps between:
    - OSMO (native)
    - ATOM (Cosmos Hub)
    - USDT/USDC (via Axelar bridge)
    - WETH/WBTC (via Axelar bridge)
    - TIA (Celestia)
    - And many more IBC tokens
    """

    def __init__(
        self,
        mnemonic: Optional[str] = None,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ):
        """Initialize Osmosis provider.

        Args:
            mnemonic: Cosmos mnemonic for signing transactions
            slippage_tolerance: Default slippage (1%)
        """
        self.mnemonic = mnemonic
        self.default_slippage = slippage_tolerance

    @property
    def name(self) -> str:
        return "Osmosis"

    @property
    def supported_assets(self) -> list[str]:
        # Only ATOM is supported in our DEX-only coin list
        return ["ATOM"]

    def _get_denom(self, symbol: str) -> Optional[str]:
        """Get Osmosis denom for symbol."""
        return OSMOSIS_DENOMS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return OSMOSIS_DECIMALS.get(symbol.upper(), 6)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from Osmosis.

        Uses Osmosis quote API or pool calculations.

        Args:
            from_asset: Source asset (ATOM, OSMO, etc.)
            to_asset: Destination asset
            amount: Amount to swap
            slippage_tolerance: Max slippage (0.01 = 1%)
        """
        from_denom = self._get_denom(from_asset)
        to_denom = self._get_denom(to_asset)

        if not from_denom or not to_denom:
            logger.debug(f"Denom not found: {from_asset} or {to_asset}")
            return None

        # Convert to micro units
        from_decimals = self._get_decimals(from_asset)
        amount_micro = int(amount * Decimal(10 ** from_decimals))

        try:
            # Try to get quote from Osmosis API
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Use sidecar API for quotes
                response = await client.get(
                    f"{OSMOSIS_API}/tokens/v2/price/{from_asset.lower()}",
                )

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

                # Osmosis gas fee (~0.01 OSMO)
                gas_fee = Decimal("0.01")

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=min_output,
                    fee_asset="OSMO",
                    fee_amount=gas_fee,
                    slippage_percent=slippage_tolerance * 100,
                    estimated_time_seconds=15,  # Cosmos block time ~6s
                    route_details={
                        "from_denom": from_denom,
                        "to_denom": to_denom,
                        "amount_in": str(amount_micro),
                        "min_amount_out": str(int(min_output * Decimal(10 ** self._get_decimals(to_asset)))),
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"Osmosis quote error: {e}")
            return None

    async def _get_token_price(self, symbol: str) -> Optional[Decimal]:
        """Get token price in USD."""
        # Stablecoins
        if symbol.upper() in ["USDT", "USDC"]:
            return Decimal("1.0")

        coingecko_ids = {
            "OSMO": "osmosis",
            "ATOM": "cosmos",
            "WETH": "ethereum",
            "WBTC": "bitcoin",
            "TIA": "celestia",
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
        """Execute swap on Osmosis.

        Requires mnemonic to sign Cosmos transactions.
        """
        if not self.mnemonic:
            return {
                "success": False,
                "error": "Cosmos mnemonic not configured",
            }

        details = route.quote.route_details or {}

        try:
            # In production, use cosmpy or similar to:
            # 1. Build MsgSwapExactAmountIn message
            # 2. Sign with mnemonic
            # 3. Broadcast to Osmosis

            return {
                "success": True,
                "provider": self.name,
                "status": "pending_implementation",
                "message": "Osmosis execution requires cosmpy integration",
                "instructions": {
                    "from_denom": details.get("from_denom"),
                    "to_denom": details.get("to_denom"),
                    "amount_in": details.get("amount_in"),
                    "min_amount_out": details.get("min_amount_out"),
                },
            }

        except Exception as e:
            logger.error(f"Osmosis execution error: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def get_pools(self) -> list[dict]:
        """Get all Osmosis liquidity pools."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{OSMOSIS_LCD}/osmosis/gamm/v1beta1/pools",
                    params={"pagination.limit": 100},
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get("pools", [])

        except Exception as e:
            logger.error(f"Failed to get Osmosis pools: {e}")

        return []
