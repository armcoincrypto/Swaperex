"""1inch DEX aggregator integration.

Uses 1inch Fusion API for swaps on Ethereum and other EVM chains.
API docs: https://portal.1inch.dev/documentation/apis/swap/introduction
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# 1inch API endpoints
ONEINCH_API_V6 = "https://api.1inch.dev/swap/v6.0"

# Chain IDs
CHAIN_IDS = {
    "ethereum": 1,
    "bsc": 56,
    "polygon": 137,
    "arbitrum": 42161,
    "optimism": 10,
    "avalanche": 43114,
    "gnosis": 100,
    "fantom": 250,
    "base": 8453,
}

# Token addresses by chain (mainnet)
# These are the most common tokens used for swaps
TOKEN_ADDRESSES = {
    "ethereum": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",  # Native ETH
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "DAI": "0x6B175474E89094C44Da98b954EescdeCB5BE3830",
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    },
    "bsc": {
        "BNB": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WBNB": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "BUSD": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    },
    "polygon": {
        "MATIC": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WMATIC": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "USDC": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    },
}


class OneInchProvider(RouteProvider):
    """1inch DEX aggregator provider.

    Supports swaps on Ethereum and other EVM chains using 1inch's
    aggregation protocol.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        chain: str = "ethereum",
    ):
        """Initialize 1inch provider.

        Args:
            api_key: 1inch API key (required for production)
            chain: Chain to use (ethereum, bsc, polygon, etc.)
        """
        self.api_key = api_key
        self.chain = chain.lower()
        self.chain_id = CHAIN_IDS.get(self.chain, 1)
        self.base_url = f"{ONEINCH_API_V6}/{self.chain_id}"

        # Get token addresses for this chain
        self._token_addresses = TOKEN_ADDRESSES.get(self.chain, {})

    @property
    def name(self) -> str:
        return f"1inch ({self.chain})"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols on this chain."""
        return list(self._token_addresses.keys())

    def _get_token_address(self, symbol: str) -> Optional[str]:
        """Get token contract address by symbol."""
        return self._token_addresses.get(symbol.upper())

    def _get_headers(self) -> dict:
        """Get API headers with authorization."""
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
        """Get swap quote from 1inch.

        Args:
            from_asset: Source token symbol
            to_asset: Destination token symbol
            amount: Amount in human-readable units (e.g., 1.5 ETH)
            slippage_tolerance: Max slippage (0.01 = 1%)

        Returns:
            Quote with best available rate
        """
        from_address = self._get_token_address(from_asset)
        to_address = self._get_token_address(to_asset)

        if not from_address or not to_address:
            logger.debug(f"Token not found: {from_asset} or {to_asset}")
            return None

        # Convert to smallest units (assuming 18 decimals for most tokens)
        decimals = 18
        if from_asset.upper() in ("USDT", "USDC"):
            decimals = 6
        amount_wei = int(amount * (10 ** decimals))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get quote from 1inch API
                response = await client.get(
                    f"{self.base_url}/quote",
                    headers=self._get_headers(),
                    params={
                        "src": from_address,
                        "dst": to_address,
                        "amount": str(amount_wei),
                    },
                )

                if response.status_code != 200:
                    logger.warning(f"1inch API error: {response.status_code} - {response.text}")
                    return None

                data = response.json()

                # Parse response
                to_amount_wei = int(data.get("toAmount", "0"))

                # Convert to human-readable
                to_decimals = 18
                if to_asset.upper() in ("USDT", "USDC"):
                    to_decimals = 6
                to_amount = Decimal(to_amount_wei) / Decimal(10 ** to_decimals)

                # Estimate gas cost in native token
                gas = int(data.get("gas", "200000"))
                gas_price = await self._get_gas_price()
                gas_cost_wei = gas * gas_price
                gas_cost_eth = Decimal(gas_cost_wei) / Decimal(10 ** 18)

                return Quote(
                    provider=self.name,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=to_amount,
                    fee_asset="ETH" if self.chain == "ethereum" else self.chain.upper(),
                    fee_amount=gas_cost_eth,
                    slippage_percent=slippage_tolerance * 100,
                    estimated_time_seconds=30,  # ~2 blocks on Ethereum
                    route_details={
                        "chain": self.chain,
                        "chain_id": self.chain_id,
                        "protocols": data.get("protocols", []),
                        "gas": gas,
                    },
                    is_simulated=False,
                )

        except Exception as e:
            logger.error(f"1inch quote error: {e}")
            return None

    async def _get_gas_price(self) -> int:
        """Get current gas price in wei."""
        # Use a public RPC for gas price
        rpc_urls = {
            "ethereum": "https://eth.llamarpc.com",
            "bsc": "https://bsc-dataseed.binance.org/",
            "polygon": "https://polygon-rpc.com/",
        }
        rpc_url = rpc_urls.get(self.chain, rpc_urls["ethereum"])

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    rpc_url,
                    json={
                        "jsonrpc": "2.0",
                        "method": "eth_gasPrice",
                        "params": [],
                        "id": 1,
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    return int(data.get("result", "0x0"), 16)

        except Exception:
            pass

        # Fallback: 30 gwei
        return 30 * 10**9

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute swap via 1inch.

        Note: This returns the transaction data that needs to be
        signed and broadcast by the user's wallet.
        """
        from_address = self._get_token_address(route.quote.from_asset)
        to_address = self._get_token_address(route.quote.to_asset)

        if not from_address or not to_address:
            return {"success": False, "error": "Token not found"}

        # Convert amount
        decimals = 18
        if route.quote.from_asset.upper() in ("USDT", "USDC"):
            decimals = 6
        amount_wei = int(route.quote.from_amount * (10 ** decimals))

        # Calculate minimum return with slippage
        slippage = route.quote.slippage_percent / 100
        min_return = route.quote.to_amount * (1 - slippage)
        to_decimals = 18
        if route.quote.to_asset.upper() in ("USDT", "USDC"):
            to_decimals = 6
        min_return_wei = int(min_return * (10 ** to_decimals))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/swap",
                    headers=self._get_headers(),
                    params={
                        "src": from_address,
                        "dst": to_address,
                        "amount": str(amount_wei),
                        "from": route.destination_address,
                        "slippage": str(route.quote.slippage_percent),
                        "disableEstimate": "true",
                    },
                )

                if response.status_code != 200:
                    return {
                        "success": False,
                        "error": f"1inch API error: {response.status_code}",
                    }

                data = response.json()

                return {
                    "success": True,
                    "tx_data": data.get("tx", {}),
                    "provider": self.name,
                    "from_amount": str(route.quote.from_amount),
                    "expected_to_amount": str(route.quote.to_amount),
                }

        except Exception as e:
            return {"success": False, "error": str(e)}


def create_oneinch_provider(
    api_key: Optional[str] = None,
    chain: str = "ethereum",
) -> OneInchProvider:
    """Create a 1inch provider instance."""
    return OneInchProvider(api_key=api_key, chain=chain)
