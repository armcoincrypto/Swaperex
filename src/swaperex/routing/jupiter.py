"""Jupiter DEX aggregator integration for Solana.

Uses Jupiter Aggregator API for swaps on Solana.
API docs: https://station.jup.ag/docs/apis/swap-api
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Jupiter API endpoints
JUPITER_API_V6 = "https://quote-api.jup.ag/v6"
JUPITER_PRICE_API = "https://price.jup.ag/v6"

# Token mint addresses on Solana mainnet
SOLANA_TOKENS = {
    "SOL": "So11111111111111111111111111111111111111112",  # Wrapped SOL
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    "SRM": "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
    "ORCA": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    "SAMO": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "MNDE": "MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey",
    "HNT": "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    "STEP": "StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT",
}

# Token decimals
TOKEN_DECIMALS = {
    "SOL": 9,
    "USDT": 6,
    "USDC": 6,
    "RAY": 6,
    "SRM": 6,
    "ORCA": 6,
    "JUP": 6,
    "BONK": 5,
    "WIF": 6,
    "PYTH": 6,
    "SAMO": 9,
    "MNDE": 9,
    "HNT": 8,
    "STEP": 9,
}


class JupiterProvider(RouteProvider):
    """Jupiter DEX aggregator provider for Solana.

    Jupiter aggregates liquidity from Raydium, Orca, Serum, and other
    Solana DEXes to find the best swap rates.
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize Jupiter provider.

        Args:
            api_key: Optional API key for higher rate limits
        """
        self.api_key = api_key
        self.base_url = JUPITER_API_V6

    @property
    def name(self) -> str:
        return "Jupiter"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        return list(SOLANA_TOKENS.keys())

    def _get_token_mint(self, symbol: str) -> Optional[str]:
        """Get token mint address by symbol."""
        return SOLANA_TOKENS.get(symbol.upper())

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
        """Get swap quote from Jupiter.

        Args:
            from_asset: Source token symbol
            to_asset: Destination token symbol
            amount: Amount in human-readable units
            slippage_tolerance: Max slippage (0.01 = 1%)

        Returns:
            Quote with best available rate
        """
        from_mint = self._get_token_mint(from_asset)
        to_mint = self._get_token_mint(to_asset)

        if not from_mint or not to_mint:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to smallest units
        from_decimals = self._get_decimals(from_asset)
        amount_lamports = int(amount * (10 ** from_decimals))

        # Slippage in basis points
        slippage_bps = int(slippage_tolerance * 10000)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get quote from Jupiter API
                response = await client.get(
                    f"{self.base_url}/quote",
                    headers=self._get_headers(),
                    params={
                        "inputMint": from_mint,
                        "outputMint": to_mint,
                        "amount": str(amount_lamports),
                        "slippageBps": str(slippage_bps),
                        "onlyDirectRoutes": "false",
                    },
                )

                if response.status_code != 200:
                    logger.warning(f"Jupiter API error: {response.status_code} - {response.text}")
                    return None

                data = response.json()

                # Parse response
                out_amount = int(data.get("outAmount", "0"))
                to_decimals = self._get_decimals(to_asset)
                to_amount = Decimal(out_amount) / Decimal(10 ** to_decimals)

                # Get price impact as slippage
                price_impact = Decimal(data.get("priceImpactPct", "0"))
                slippage_percent = abs(price_impact) * 100

                # Estimate fee (platform fee + priority fee)
                # Jupiter charges 0 platform fee, but we estimate tx fee
                estimated_fee_sol = Decimal("0.000005")  # ~5000 lamports

                # Get route info
                route_plan = data.get("routePlan", [])
                dex_path = []
                for step in route_plan:
                    swap_info = step.get("swapInfo", {})
                    amm_key = swap_info.get("ammKey", "")
                    label = swap_info.get("label", "Unknown")
                    dex_path.append(label)

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="SOL",
                    fee_amount=estimated_fee_sol,
                    slippage_percent=slippage_percent,
                    estimated_time_seconds=1,  # Solana is very fast
                    route_details={
                        "chain": "solana",
                        "route_plan": route_plan,
                        "dex_path": dex_path,
                        "price_impact_pct": str(price_impact),
                        "input_mint": from_mint,
                        "output_mint": to_mint,
                        "quote_response": data,  # Store full response for swap
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"Jupiter quote error: {e}")
            return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via Jupiter.

        Returns swap transaction data to be signed by user's wallet.
        """
        details = route.quote.route_details or {}
        quote_response = details.get("quote_response")

        if not quote_response:
            return {"success": False, "error": "Missing quote response"}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get swap transaction from Jupiter
                response = await client.post(
                    f"{self.base_url}/swap",
                    headers=self._get_headers(),
                    json={
                        "quoteResponse": quote_response,
                        "userPublicKey": route.destination_address,
                        "wrapAndUnwrapSol": True,
                        "dynamicComputeUnitLimit": True,
                        "prioritizationFeeLamports": "auto",
                    },
                )

                if response.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Jupiter API error: {response.status_code}",
                    }

                data = response.json()

                return {
                    "success": True,
                    "swap_transaction": data.get("swapTransaction"),
                    "last_valid_block_height": data.get("lastValidBlockHeight"),
                    "provider": self.name,
                    "from_amount": str(route.quote.from_amount),
                    "expected_to_amount": str(route.quote.to_amount),
                }

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_price(self, symbol: str) -> Optional[Decimal]:
        """Get current price for a token in USD."""
        mint = self._get_token_mint(symbol)
        if not mint:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{JUPITER_PRICE_API}/price",
                    params={"ids": mint},
                )

                if response.status_code == 200:
                    data = response.json()
                    price_data = data.get("data", {}).get(mint, {})
                    price = price_data.get("price")
                    if price:
                        return Decimal(str(price))

        except Exception as e:
            logger.error(f"Jupiter price error: {e}")

        return None


def create_jupiter_provider(api_key: Optional[str] = None) -> JupiterProvider:
    """Create a Jupiter provider instance."""
    return JupiterProvider(api_key=api_key)
