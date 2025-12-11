"""Jupiter DEX aggregator integration for Solana swaps.

Jupiter is the leading DEX aggregator on Solana, providing best-price
routing across all Solana DEXes (Raydium, Orca, Serum, etc.)

API docs: https://station.jup.ag/docs/apis/swap-api
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Jupiter API endpoint
JUPITER_API = "https://quote-api.jup.ag/v6"

# Solana token mints
SOL_TOKENS = {
    "SOL": "So11111111111111111111111111111111111111112",  # Native SOL (wrapped)
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  # USDT-SPL
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC-SPL
    "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",   # Raydium
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", # BONK meme coin
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",   # Jupiter token
}

# Token decimals on Solana
SOL_DECIMALS = {
    "SOL": 9,
    "USDT": 6,
    "USDC": 6,
    "RAY": 6,
    "BONK": 5,
    "JUP": 6,
}


class JupiterProvider(RouteProvider):
    """Jupiter DEX aggregator for Solana.

    Provides best-price routing across all Solana DEXes.
    Very low fees (~$0.001 per swap).

    Supports:
    - SOL (native)
    - USDT-SPL
    - USDC-SPL
    - RAY, BONK, JUP and many more
    """

    def __init__(
        self,
        private_key: Optional[str] = None,
        slippage_bps: int = 50,  # 0.5%
    ):
        """Initialize Jupiter provider.

        Args:
            private_key: Solana private key (base58) for signing
            slippage_bps: Slippage in basis points (50 = 0.5%)
        """
        self.private_key = private_key
        self.slippage_bps = slippage_bps
        self.api_url = JUPITER_API

    @property
    def name(self) -> str:
        return "Jupiter"

    @property
    def supported_assets(self) -> list[str]:
        return list(SOL_TOKENS.keys())

    def _get_token_mint(self, symbol: str) -> Optional[str]:
        """Get Solana token mint address."""
        return SOL_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return SOL_DECIMALS.get(symbol.upper(), 9)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ) -> Optional[Quote]:
        """Get swap quote from Jupiter.

        Jupiter provides real-time quotes with optimal routing.

        Args:
            from_asset: Source asset (SOL, USDT, etc.)
            to_asset: Destination asset
            amount: Amount to swap
            slippage_tolerance: Max slippage (0.005 = 0.5%)
        """
        input_mint = self._get_token_mint(from_asset)
        output_mint = self._get_token_mint(to_asset)

        if not input_mint or not output_mint:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to lamports/smallest unit
        decimals = self._get_decimals(from_asset)
        amount_raw = int(amount * Decimal(10 ** decimals))

        # Slippage in basis points
        slippage_bps = int(slippage_tolerance * 10000)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get quote from Jupiter API
                response = await client.get(
                    f"{self.api_url}/quote",
                    params={
                        "inputMint": input_mint,
                        "outputMint": output_mint,
                        "amount": str(amount_raw),
                        "slippageBps": slippage_bps,
                    },
                )

                if response.status_code != 200:
                    logger.warning(f"Jupiter API error: {response.status_code}")
                    # Fall back to price-based quote
                    return await self._get_price_based_quote(
                        from_asset, to_asset, amount, slippage_tolerance
                    )

                data = response.json()

                # Parse Jupiter response
                out_amount_raw = int(data.get("outAmount", "0"))
                out_decimals = self._get_decimals(to_asset)
                out_amount = Decimal(out_amount_raw) / Decimal(10 ** out_decimals)

                # Jupiter includes price impact
                price_impact_pct = Decimal(str(data.get("priceImpactPct", "0")))

                # Solana transaction fee (~0.000005 SOL)
                sol_fee = Decimal("0.000005")

                # Route info
                route_plan = data.get("routePlan", [])
                dexes_used = [step.get("swapInfo", {}).get("label", "Unknown") for step in route_plan]

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=out_amount,
                    fee_asset="SOL",
                    fee_amount=sol_fee,
                    slippage_percent=price_impact_pct,
                    estimated_time_seconds=5,  # Solana is fast
                    route_details={
                        "input_mint": input_mint,
                        "output_mint": output_mint,
                        "in_amount": str(amount_raw),
                        "out_amount": str(out_amount_raw),
                        "slippage_bps": slippage_bps,
                        "route_plan": route_plan,
                        "dexes": dexes_used,
                        "quote_response": data,  # For swap execution
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"Jupiter quote error: {e}")
            # Fall back to price-based quote
            return await self._get_price_based_quote(
                from_asset, to_asset, amount, slippage_tolerance
            )

    async def _get_price_based_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal,
    ) -> Optional[Quote]:
        """Get quote based on CoinGecko prices (fallback)."""
        from_price = await self._get_token_price(from_asset)
        to_price = await self._get_token_price(to_asset)

        if not from_price or not to_price:
            return None

        value_usd = amount * from_price
        to_amount = value_usd / to_price
        min_output = to_amount * (1 - slippage_tolerance)

        return Quote(
            provider=self.name,
            from_asset=from_asset.upper(),
            to_asset=to_asset.upper(),
            from_amount=amount,
            to_amount=min_output,
            fee_asset="SOL",
            fee_amount=Decimal("0.000005"),
            slippage_percent=slippage_tolerance * 100,
            estimated_time_seconds=5,
            route_details={
                "input_mint": self._get_token_mint(from_asset),
                "output_mint": self._get_token_mint(to_asset),
                "fallback": True,
            },
            is_simulated=True,  # Price-based, not real quote
        )

    async def _get_token_price(self, symbol: str) -> Optional[Decimal]:
        """Get token price in USD."""
        # Stablecoins
        if symbol.upper() in ["USDT", "USDC"]:
            return Decimal("1.0")

        coingecko_ids = {
            "SOL": "solana",
            "RAY": "raydium",
            "BONK": "bonk",
            "JUP": "jupiter-exchange-solana",
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
        """Execute swap on Jupiter.

        Jupiter provides a swap API that returns a serialized transaction.
        We need to sign it and submit to Solana.
        """
        if not self.private_key:
            return {
                "success": False,
                "error": "Solana private key not configured",
            }

        details = route.quote.route_details or {}
        quote_response = details.get("quote_response")

        if not quote_response:
            return {
                "success": False,
                "error": "No quote response for swap execution",
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get swap transaction from Jupiter
                swap_response = await client.post(
                    f"{self.api_url}/swap",
                    json={
                        "quoteResponse": quote_response,
                        "userPublicKey": self._get_public_key(),
                        "wrapAndUnwrapSol": True,
                    },
                )

                if swap_response.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Jupiter swap API error: {swap_response.text}",
                    }

                swap_data = swap_response.json()
                swap_transaction = swap_data.get("swapTransaction")

                # In production, sign and submit the transaction
                return {
                    "success": True,
                    "provider": self.name,
                    "status": "transaction_ready",
                    "message": "Transaction ready for signing",
                    "transaction": swap_transaction,
                    "instructions": {
                        "action": "Sign and submit to Solana",
                        "from_amount": str(route.quote.from_amount),
                        "to_amount": str(route.quote.to_amount),
                    },
                }

        except Exception as e:
            logger.error(f"Jupiter swap execution error: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    def _get_public_key(self) -> str:
        """Get Solana public key from seed phrase."""
        try:
            from swaperex.swap.signer import get_signer_factory
            signer = get_signer_factory().get_solana_signer()
            return signer.get_address(0)
        except Exception as e:
            logger.error(f"Failed to derive Solana public key: {e}")
            raise ValueError("Solana wallet not configured - check WALLET_SEED_PHRASE")
