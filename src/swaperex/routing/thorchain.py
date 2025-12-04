"""THORChain cross-chain swap integration.

THORChain enables native asset swaps across blockchains without wrapping.
API docs: https://dev.thorchain.org/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# THORChain API endpoints
THORNODE_MAINNET = "https://thornode.ninerealms.com"
THORNODE_STAGENET = "https://stagenet-thornode.ninerealms.com"
MIDGARD_MAINNET = "https://midgard.ninerealms.com/v2"
MIDGARD_STAGENET = "https://stagenet-midgard.ninerealms.com/v2"

# Asset identifiers in THORChain format
# Format: CHAIN.SYMBOL-CONTRACT (e.g., BTC.BTC, ETH.ETH, ETH.USDT-0x...)
THORCHAIN_ASSETS = {
    "BTC": "BTC.BTC",
    "ETH": "ETH.ETH",
    "LTC": "LTC.LTC",
    "BCH": "BCH.BCH",
    "DOGE": "DOGE.DOGE",
    "AVAX": "AVAX.AVAX",
    "ATOM": "GAIA.ATOM",
    "BNB": "BSC.BNB",
    "RUNE": "THOR.RUNE",
    # Tokens (mainnet contract addresses)
    "USDT-ETH": "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7",
    "USDC-ETH": "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
    "WBTC": "ETH.WBTC-0X2260FAC5E5542A773AA44FBCFEDF7C193BC2C599",
}


class THORChainProvider(RouteProvider):
    """THORChain cross-chain swap provider.

    Enables native cross-chain swaps between:
    - Bitcoin (BTC)
    - Ethereum (ETH)
    - Litecoin (LTC)
    - Bitcoin Cash (BCH)
    - Dogecoin (DOGE)
    - Avalanche (AVAX)
    - Cosmos (ATOM)
    - Binance Smart Chain (BNB)
    - THORChain (RUNE)
    Plus various ERC20 and BEP20 tokens.
    """

    def __init__(self, stagenet: bool = False):
        """Initialize THORChain provider.

        Args:
            stagenet: Use stagenet (testnet) instead of mainnet
        """
        self.stagenet = stagenet
        self.thornode_url = THORNODE_STAGENET if stagenet else THORNODE_MAINNET
        self.midgard_url = MIDGARD_STAGENET if stagenet else MIDGARD_MAINNET

    @property
    def name(self) -> str:
        suffix = " (stagenet)" if self.stagenet else ""
        return f"THORChain{suffix}"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        return list(THORCHAIN_ASSETS.keys())

    def _get_thorchain_asset(self, symbol: str) -> Optional[str]:
        """Convert symbol to THORChain asset identifier."""
        return THORCHAIN_ASSETS.get(symbol.upper())

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from THORChain.

        Args:
            from_asset: Source asset symbol (e.g., "BTC")
            to_asset: Destination asset symbol (e.g., "ETH")
            amount: Amount in human-readable units
            slippage_tolerance: Max slippage (0.01 = 1%)

        Returns:
            Quote with expected output and fees
        """
        tc_from = self._get_thorchain_asset(from_asset)
        tc_to = self._get_thorchain_asset(to_asset)

        if not tc_from or not tc_to:
            logger.debug(f"THORChain asset not found: {from_asset} or {to_asset}")
            return None

        # Convert amount to base units (satoshis, wei, etc.)
        # THORChain uses 8 decimal places for all assets
        amount_base = int(amount * Decimal("100000000"))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get quote from THORNode quote endpoint
                response = await client.get(
                    f"{self.thornode_url}/thorchain/quote/swap",
                    params={
                        "from_asset": tc_from,
                        "to_asset": tc_to,
                        "amount": str(amount_base),
                    },
                )

                if response.status_code != 200:
                    logger.warning(f"THORChain API error: {response.status_code}")
                    return None

                data = response.json()

                # Check for errors
                if "error" in data:
                    logger.warning(f"THORChain quote error: {data['error']}")
                    return None

                # Parse response
                expected_output = int(data.get("expected_amount_out", "0"))
                fees = data.get("fees", {})

                # Total fees in RUNE
                total_fees = int(fees.get("total", "0"))
                affiliate_fee = int(fees.get("affiliate", "0"))
                outbound_fee = int(fees.get("outbound", "0"))
                liquidity_fee = int(fees.get("liquidity", "0"))

                # Convert to human-readable
                to_amount = Decimal(expected_output) / Decimal("100000000")
                fee_rune = Decimal(total_fees) / Decimal("100000000")

                # Slippage from liquidity fee
                slippage_bps = int(data.get("slippage_bps", "0"))
                slippage_percent = Decimal(slippage_bps) / Decimal("100")

                # Estimated time (inbound + outbound confirmations)
                inbound_confs = data.get("inbound_confirmation_seconds", 600)
                outbound_delay = data.get("outbound_delay_seconds", 0)
                total_time = inbound_confs + outbound_delay

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="RUNE",
                    fee_amount=fee_rune,
                    slippage_percent=slippage_percent,
                    estimated_time_seconds=total_time,
                    route_details={
                        "memo": data.get("memo", ""),
                        "inbound_address": data.get("inbound_address", ""),
                        "router": data.get("router", ""),
                        "expiry": data.get("expiry", 0),
                        "warning": data.get("warning", ""),
                        "fees": {
                            "total": str(fee_rune),
                            "affiliate": str(Decimal(affiliate_fee) / Decimal("100000000")),
                            "outbound": str(Decimal(outbound_fee) / Decimal("100000000")),
                            "liquidity": str(Decimal(liquidity_fee) / Decimal("100000000")),
                        },
                        "slippage_bps": slippage_bps,
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"THORChain quote error: {e}")
            return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via THORChain.

        THORChain swaps are executed by sending funds to the
        inbound address with a specific memo. The swap is then
        processed automatically by the THORChain network.

        Returns:
            Dictionary with inbound details for the user to send funds
        """
        details = route.quote.route_details or {}

        inbound_address = details.get("inbound_address")
        memo = details.get("memo")
        router = details.get("router")
        expiry = details.get("expiry", 0)

        if not inbound_address or not memo:
            return {
                "success": False,
                "error": "Missing inbound address or memo from quote",
            }

        return {
            "success": True,
            "provider": self.name,
            "instructions": {
                "action": "Send funds to inbound address with memo",
                "inbound_address": inbound_address,
                "memo": memo,
                "router": router,
                "amount": str(route.quote.from_amount),
                "asset": route.quote.from_asset,
                "expiry_timestamp": expiry,
            },
            "expected_output": {
                "amount": str(route.quote.to_amount),
                "asset": route.quote.to_asset,
                "destination": route.destination_address,
            },
            "estimated_time_seconds": route.quote.estimated_time_seconds,
            "warning": details.get("warning", ""),
        }

    async def get_pools(self) -> list[dict]:
        """Get all active liquidity pools."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.midgard_url}/pools")

                if response.status_code == 200:
                    return response.json()

        except Exception as e:
            logger.error(f"Failed to get THORChain pools: {e}")

        return []

    async def get_inbound_addresses(self) -> list[dict]:
        """Get current inbound addresses for all chains."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.thornode_url}/thorchain/inbound_addresses"
                )

                if response.status_code == 200:
                    return response.json()

        except Exception as e:
            logger.error(f"Failed to get inbound addresses: {e}")

        return []
