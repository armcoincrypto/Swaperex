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
        "DAI": "0x6B175474E89094C44Da98b954EedcdeCB5BE3830",
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        "UNI": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        "AAVE": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        "LDO": "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
        "MKR": "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
        "COMP": "0xc00e94Cb662C3520282E6f5717214004A7f26888",
        "SNX": "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
        "CRV": "0xD533a949740bb3306d119CC777fa900bA034cd52",
        "SUSHI": "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
        "1INCH": "0x111111111117dC0aa78b770fA6A738034120C302",
        "GRT": "0xc944E90C64B2c07662A292be6244BDf05Cda44a7",
        "ENS": "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
        "PEPE": "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
        "SHIB": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
        "YFI": "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e",
        "BAL": "0xba100000625a3754423978a60c9317c58a424e3D",
        "OMG": "0xd26114cd6EE289AccF82350c8d8487fedB8A0C07",
        "LRC": "0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD",
        "BAT": "0x0D8775F648430679A709E98d2b0Cb6250d2887EF",
        "ZRX": "0xE41d2489571d322189246DaFA5ebDe1F4699F498",
    },
    "bsc": {
        "BNB": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WBNB": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "BUSD": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        "CAKE": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        "BTCB": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
        "ETH": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
        "XRP": "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
        "DOGE": "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
        "ADA": "0x3EE2200Efb3400fAbb9AacF31297cBdD1d435D47",
        "DOT": "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
        "FDUSD": "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409",
        "FLOKI": "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E",
        "BABYDOGE": "0xc748673057861a797275CD8A068AbB95A902e8de",
        "XVS": "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
        "GMT": "0x3019BF2a2eF8040C242C9a4c5c4BD4C81678b2A1",
        "SFP": "0xD41FDb03Ba84762dD66a0af1a6C8540FF1ba5dfb",
        "ALPACA": "0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F",
    },
    "polygon": {
        "MATIC": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WMATIC": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "USDC": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "WETH": "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        "QUICK": "0xB5C064F955D8e7F38fE0460C556a72987494eE17",
        "AAVE": "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
        "LINK": "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
        "UNI": "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
        "SUSHI": "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a",
        "CRV": "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
    },
    "avalanche": {
        "AVAX": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WAVAX": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
        "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
        "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        "WETH": "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
        "JOE": "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd",
        "PNG": "0x60781C2586D68229fde47564546784ab3fACA982",
        "GMX": "0x62edc0692BD897D2295872a9FFCac5425011c661",
        "LINK": "0x5947BB275c521040051D82396192181b413227A3",
        "AAVE": "0x63a72806098Bd3D9520cC43356dD78afe5D386D9",
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
