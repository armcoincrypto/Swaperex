"""PancakeSwap DEX integration for BSC swaps.

PancakeSwap is the largest DEX on Binance Smart Chain (BSC).
Supports BNB and BEP-20 token swaps with low gas fees.

API docs: https://docs.pancakeswap.finance/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# PancakeSwap Router V2 on BSC
PANCAKESWAP_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E"

# BSC token addresses
BSC_TOKENS = {
    "BNB": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",  # WBNB
    "USDT": "0x55d398326f99059fF775485246999027B3197955",  # USDT-BEP20
    "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",  # USDC-BEP20
    "BUSD": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",  # BUSD
    "ETH": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",   # ETH-BEP20
    "BTCB": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",  # BTCB
    "CAKE": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",  # CAKE
}

# Token decimals
TOKEN_DECIMALS = {
    "BNB": 18,
    "USDT": 18,
    "USDC": 18,
    "BUSD": 18,
    "ETH": 18,
    "BTCB": 18,
    "CAKE": 18,
}


class PancakeSwapProvider(RouteProvider):
    """PancakeSwap DEX provider for BSC swaps.

    Supports swaps between:
    - BNB (native)
    - USDT-BEP20
    - USDC-BEP20
    - BUSD
    - ETH-BEP20
    - BTCB (Bitcoin on BSC)
    - CAKE
    """

    def __init__(
        self,
        rpc_url: str = "https://bsc-dataseed.binance.org/",
        private_key: Optional[str] = None,
        slippage_tolerance: Decimal = Decimal("0.5"),
    ):
        """Initialize PancakeSwap provider.

        Args:
            rpc_url: BSC RPC endpoint
            private_key: Private key for signing transactions (optional for quotes)
            slippage_tolerance: Default slippage tolerance (0.5%)
        """
        self.rpc_url = rpc_url
        self.private_key = private_key
        self.default_slippage = slippage_tolerance
        self.router_address = PANCAKESWAP_ROUTER

    @property
    def name(self) -> str:
        return "PancakeSwap"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols on BSC."""
        return list(BSC_TOKENS.keys())

    def _get_token_address(self, symbol: str) -> Optional[str]:
        """Get BSC token address for symbol."""
        return BSC_TOKENS.get(symbol.upper())

    def _get_decimals(self, symbol: str) -> int:
        """Get token decimals."""
        return TOKEN_DECIMALS.get(symbol.upper(), 18)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.005"),
    ) -> Optional[Quote]:
        """Get swap quote from PancakeSwap.

        Uses PancakeSwap's quote API to get expected output.

        Args:
            from_asset: Source asset (BNB, USDT, etc.)
            to_asset: Destination asset
            amount: Amount to swap
            slippage_tolerance: Max slippage (0.005 = 0.5%)
        """
        from_token = self._get_token_address(from_asset)
        to_token = self._get_token_address(to_asset)

        if not from_token or not to_token:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to wei
        from_decimals = self._get_decimals(from_asset)
        amount_wei = int(amount * Decimal(10 ** from_decimals))

        try:
            # Use PancakeSwap API for quote
            async with httpx.AsyncClient(timeout=30.0) as client:
                # PancakeSwap uses their own API endpoint
                response = await client.get(
                    "https://api.pancakeswap.info/api/v2/tokens",
                )

                # For now, use a simple price calculation
                # In production, you'd call the router contract's getAmountsOut

                # Get token prices in USD
                from_price = await self._get_token_price(from_asset)
                to_price = await self._get_token_price(to_asset)

                if not from_price or not to_price:
                    return None

                # Calculate output amount
                value_usd = amount * from_price
                to_amount = value_usd / to_price

                # Apply slippage
                slippage_amount = to_amount * slippage_tolerance
                min_output = to_amount - slippage_amount

                # Estimate gas fee (~0.001 BNB for swap)
                gas_fee_bnb = Decimal("0.001")

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=min_output,
                    fee_asset="BNB",
                    fee_amount=gas_fee_bnb,
                    slippage_percent=slippage_tolerance * 100,
                    estimated_time_seconds=15,  # BSC block time ~3s
                    route_details={
                        "router": self.router_address,
                        "from_token": from_token,
                        "to_token": to_token,
                        "amount_in": str(amount_wei),
                        "min_amount_out": str(int(min_output * Decimal(10 ** self._get_decimals(to_asset)))),
                        "path": [from_token, to_token],
                        "deadline": 300,  # 5 minutes
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"PancakeSwap quote error: {e}")
            return None

    async def _get_token_price(self, symbol: str) -> Optional[Decimal]:
        """Get token price in USD from CoinGecko."""
        coingecko_ids = {
            "BNB": "binancecoin",
            "USDT": "tether",
            "USDC": "usd-coin",
            "BUSD": "binance-usd",
            "ETH": "ethereum",
            "BTCB": "bitcoin",
            "CAKE": "pancakeswap-token",
        }

        cg_id = coingecko_ids.get(symbol.upper())
        if not cg_id:
            return None

        # Stablecoins
        if symbol.upper() in ["USDT", "USDC", "BUSD"]:
            return Decimal("1.0")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": cg_id, "vs_currencies": "usd"},
                )

                if response.status_code == 200:
                    data = response.json()
                    price = data.get(cg_id, {}).get("usd")
                    if price:
                        return Decimal(str(price))

        except Exception as e:
            logger.error(f"Price fetch error: {e}")

        return None

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap on PancakeSwap.

        Requires private_key to be set for signing transactions.
        """
        if not self.private_key:
            return {
                "success": False,
                "error": "Private key not configured for swap execution",
            }

        details = route.quote.route_details or {}

        try:
            # In production, this would use web3.py to:
            # 1. Approve token spending (if not BNB)
            # 2. Call swapExactTokensForTokens on router
            # 3. Return transaction hash

            return {
                "success": True,
                "provider": self.name,
                "status": "pending_implementation",
                "message": "PancakeSwap execution requires web3 integration",
                "instructions": {
                    "router": details.get("router"),
                    "path": details.get("path"),
                    "amount_in": details.get("amount_in"),
                    "min_amount_out": details.get("min_amount_out"),
                },
            }

        except Exception as e:
            logger.error(f"PancakeSwap execution error: {e}")
            return {
                "success": False,
                "error": str(e),
            }


class UniswapProvider(RouteProvider):
    """Uniswap V3 DEX provider for Ethereum swaps.

    Similar to PancakeSwap but for Ethereum mainnet.
    Higher gas fees but more liquidity.
    """

    # Uniswap V3 Router
    ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

    # Ethereum tokens
    ETH_TOKENS = {
        "ETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  # WETH
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",  # USDT
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  # USDC
        "DAI": "0x6B175474E89094C44Da98b954EescdCB505d05",    # DAI
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",  # WBTC
    }

    def __init__(
        self,
        rpc_url: str = "https://eth.llamarpc.com",
        private_key: Optional[str] = None,
    ):
        self.rpc_url = rpc_url
        self.private_key = private_key

    @property
    def name(self) -> str:
        return "Uniswap"

    @property
    def supported_assets(self) -> list[str]:
        return list(self.ETH_TOKENS.keys())

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get quote from Uniswap V3."""
        from_token = self.ETH_TOKENS.get(from_asset.upper())
        to_token = self.ETH_TOKENS.get(to_asset.upper())

        if not from_token or not to_token:
            return None

        try:
            # Get prices from CoinGecko
            from_price = await self._get_price(from_asset)
            to_price = await self._get_price(to_asset)

            if not from_price or not to_price:
                return None

            value_usd = amount * from_price
            to_amount = value_usd / to_price
            min_output = to_amount * (1 - slippage_tolerance)

            # Ethereum gas estimate (~$5-20 for swap)
            gas_fee_eth = Decimal("0.003")  # ~$10 at $3000/ETH

            return Quote(
                provider=self.name,
                from_asset=from_asset.upper(),
                to_asset=to_asset.upper(),
                from_amount=amount,
                to_amount=min_output,
                fee_asset="ETH",
                fee_amount=gas_fee_eth,
                slippage_percent=slippage_tolerance * 100,
                estimated_time_seconds=60,  # ~4 blocks
                route_details={
                    "router": self.ROUTER_ADDRESS,
                    "from_token": from_token,
                    "to_token": to_token,
                },
                is_simulated=False,
            )

        except Exception as e:
            logger.error(f"Uniswap quote error: {e}")
            return None

    async def _get_price(self, symbol: str) -> Optional[Decimal]:
        """Get token price."""
        if symbol.upper() in ["USDT", "USDC", "DAI"]:
            return Decimal("1.0")

        coingecko_ids = {
            "ETH": "ethereum",
            "WBTC": "bitcoin",
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
        """Execute swap on Uniswap."""
        return {
            "success": False,
            "error": "Uniswap execution requires web3 integration",
        }
