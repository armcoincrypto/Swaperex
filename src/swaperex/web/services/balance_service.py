"""Balance service for non-custodial web mode.

In WEB_NON_CUSTODIAL mode, this service fetches balances from blockchain state
using RPC calls or indexer APIs. It does NOT use the internal ledger.

SECURITY: This service:
- Only queries public blockchain data
- Never accesses private keys
- Never signs transactions
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.balances import (
    TokenBalance,
    WalletBalanceRequest,
    WalletBalanceResponse,
    MultiChainBalanceRequest,
    MultiChainBalanceResponse,
)
from swaperex.web.services.chain_service import SUPPORTED_CHAINS

logger = logging.getLogger(__name__)


# Common token contracts per chain
TOKEN_CONTRACTS = {
    "ethereum": {
        "USDT": {
            "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            "decimals": 6,
            "name": "Tether USD",
        },
        "USDC": {
            "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "decimals": 6,
            "name": "USD Coin",
        },
        "DAI": {
            "address": "0x6B175474E89094C44Da98b954EesADAC5F3Ce2b7",
            "decimals": 18,
            "name": "Dai Stablecoin",
        },
        "WETH": {
            "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "decimals": 18,
            "name": "Wrapped Ether",
        },
        "LINK": {
            "address": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
            "decimals": 18,
            "name": "Chainlink Token",
        },
    },
    "bsc": {
        "USDT": {
            "address": "0x55d398326f99059fF775485246999027B3197955",
            "decimals": 18,
            "name": "Tether USD",
        },
        "BUSD": {
            "address": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
            "decimals": 18,
            "name": "Binance USD",
        },
        "USDC": {
            "address": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
            "decimals": 18,
            "name": "USD Coin",
        },
        "WBNB": {
            "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
            "decimals": 18,
            "name": "Wrapped BNB",
        },
    },
    "polygon": {
        "USDT": {
            "address": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
            "decimals": 6,
            "name": "Tether USD",
        },
        "USDC": {
            "address": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            "decimals": 6,
            "name": "USD Coin",
        },
        "WMATIC": {
            "address": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
            "decimals": 18,
            "name": "Wrapped MATIC",
        },
        "DAI": {
            "address": "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
            "decimals": 18,
            "name": "Dai Stablecoin",
        },
    },
}

# ERC-20 balanceOf function selector
BALANCE_OF_SELECTOR = "0x70a08231"


class BalanceService:
    """Service for fetching wallet balances from blockchain state.

    This service is used ONLY in WEB_NON_CUSTODIAL mode.
    In TELEGRAM_CUSTODIAL mode, balances come from the internal ledger.
    """

    def _check_mode(self) -> None:
        """Log if called in wrong mode."""
        settings = get_settings()
        if settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL:
            logger.warning(
                "BalanceService (web) called in TELEGRAM_CUSTODIAL mode. "
                "Consider using ledger balances instead for consistency."
            )

    async def get_wallet_balance(
        self,
        request: WalletBalanceRequest,
    ) -> WalletBalanceResponse:
        """Get wallet balances from blockchain state.

        In production, this would make RPC calls to fetch:
        - Native balance via eth_getBalance
        - Token balances via ERC-20 balanceOf calls

        For this implementation, we simulate the responses.
        """
        self._check_mode()

        logger.info(
            "Fetching blockchain balances for %s on %s",
            request.address,
            request.chain,
        )

        try:
            chain_info = SUPPORTED_CHAINS.get(request.chain.lower())
            if not chain_info:
                return WalletBalanceResponse(
                    success=False,
                    address=request.address,
                    chain=request.chain,
                    chain_id=0,
                    native_balance=TokenBalance(
                        symbol="UNKNOWN",
                        balance=Decimal("0"),
                        balance_raw="0",
                        decimals=18,
                        chain=request.chain,
                    ),
                    error=f"Unsupported chain: {request.chain}",
                )

            # Fetch native balance (simulated for demo)
            native_balance = await self._fetch_native_balance(
                request.address, request.chain, chain_info
            )

            # Fetch token balances if requested
            token_balances = []
            if request.include_tokens:
                token_balances = await self._fetch_token_balances(
                    request.address,
                    request.chain,
                    request.token_list,
                )

            # Calculate total USD value
            total_usd = native_balance.usd_value or Decimal("0")
            for token in token_balances:
                if token.usd_value:
                    total_usd += token.usd_value

            return WalletBalanceResponse(
                success=True,
                address=request.address,
                chain=request.chain,
                chain_id=chain_info.chain_id,
                native_balance=native_balance,
                token_balances=token_balances,
                total_usd_value=total_usd if total_usd > 0 else None,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

        except Exception as e:
            logger.error(f"Failed to fetch balances: {e}")
            return WalletBalanceResponse(
                success=False,
                address=request.address,
                chain=request.chain,
                chain_id=0,
                native_balance=TokenBalance(
                    symbol="UNKNOWN",
                    balance=Decimal("0"),
                    balance_raw="0",
                    decimals=18,
                    chain=request.chain,
                ),
                error=str(e),
            )

    async def get_multi_chain_balance(
        self,
        request: MultiChainBalanceRequest,
    ) -> MultiChainBalanceResponse:
        """Get wallet balances across multiple chains."""
        self._check_mode()

        chain_balances = []
        failed_chains = []
        total_usd = Decimal("0")

        for chain in request.chains:
            try:
                balance_request = WalletBalanceRequest(
                    address=request.address,
                    chain=chain,
                    include_tokens=request.include_tokens,
                )
                response = await self.get_wallet_balance(balance_request)

                if response.success:
                    chain_balances.append(response)
                    if response.total_usd_value:
                        total_usd += response.total_usd_value
                else:
                    failed_chains.append(chain)

            except Exception as e:
                logger.error(f"Failed to fetch {chain} balances: {e}")
                failed_chains.append(chain)

        return MultiChainBalanceResponse(
            success=len(chain_balances) > 0,
            address=request.address,
            chain_balances=chain_balances,
            total_usd_value=total_usd if total_usd > 0 else None,
            failed_chains=failed_chains,
        )

    async def _fetch_native_balance(
        self,
        address: str,
        chain: str,
        chain_info,
    ) -> TokenBalance:
        """Fetch native token balance from blockchain.

        In production:
        - Make eth_getBalance RPC call
        - Convert from wei to human-readable
        - Fetch USD price from price feed
        """
        # Simulated balance for demo
        # In production, this would be: await rpc_client.eth_getBalance(address)
        simulated_balances = {
            "ethereum": Decimal("1.5"),  # 1.5 ETH
            "bsc": Decimal("10.0"),  # 10 BNB
            "polygon": Decimal("500.0"),  # 500 MATIC
            "arbitrum": Decimal("0.8"),  # 0.8 ETH
            "optimism": Decimal("0.5"),  # 0.5 ETH
            "avalanche": Decimal("25.0"),  # 25 AVAX
        }

        simulated_prices = {
            "ETH": Decimal("3500"),
            "BNB": Decimal("600"),
            "MATIC": Decimal("1.2"),
            "AVAX": Decimal("40"),
        }

        balance = simulated_balances.get(chain.lower(), Decimal("0"))
        symbol = chain_info.native_asset
        decimals = 18

        balance_raw = str(int(balance * Decimal(10**decimals)))
        usd_price = simulated_prices.get(symbol, Decimal("0"))
        usd_value = balance * usd_price if usd_price else None

        return TokenBalance(
            symbol=symbol,
            name=f"{symbol} (Native)",
            balance=balance,
            balance_raw=balance_raw,
            decimals=decimals,
            chain=chain,
            usd_value=usd_value,
        )

    async def _fetch_token_balances(
        self,
        address: str,
        chain: str,
        token_list: Optional[list[str]] = None,
    ) -> list[TokenBalance]:
        """Fetch ERC-20 token balances from blockchain.

        In production:
        - Make multicall for balanceOf on each token
        - Or use an indexer API (Alchemy, Moralis, etc.)
        """
        chain_tokens = TOKEN_CONTRACTS.get(chain.lower(), {})
        balances = []

        # Simulated token balances
        simulated_token_balances = {
            "USDT": Decimal("1000"),
            "USDC": Decimal("500"),
            "DAI": Decimal("250"),
            "BUSD": Decimal("750"),
            "WETH": Decimal("0.5"),
            "WBNB": Decimal("2.0"),
            "LINK": Decimal("50"),
        }

        tokens_to_query = token_list if token_list else list(chain_tokens.keys())

        for symbol in tokens_to_query:
            if symbol not in chain_tokens:
                continue

            token_info = chain_tokens[symbol]
            balance = simulated_token_balances.get(symbol, Decimal("0"))

            if balance > 0:
                balance_raw = str(int(balance * Decimal(10**token_info["decimals"])))

                # Stablecoins = $1
                usd_value = balance if symbol in ("USDT", "USDC", "DAI", "BUSD") else None

                balances.append(
                    TokenBalance(
                        symbol=symbol,
                        name=token_info["name"],
                        contract_address=token_info["address"],
                        balance=balance,
                        balance_raw=balance_raw,
                        decimals=token_info["decimals"],
                        chain=chain,
                        usd_value=usd_value,
                    )
                )

        return balances

    async def fetch_balance_from_rpc(
        self,
        rpc_url: str,
        address: str,
    ) -> Optional[Decimal]:
        """Fetch native balance from an RPC endpoint.

        This is a real implementation that can be used when
        production RPC endpoints are configured.
        """
        import aiohttp

        try:
            payload = {
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": [address, "latest"],
                "id": 1,
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    rpc_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if "result" in data:
                            balance_wei = int(data["result"], 16)
                            return Decimal(balance_wei) / Decimal(10**18)

            return None

        except Exception as e:
            logger.error(f"RPC balance fetch failed: {e}")
            return None

    async def fetch_token_balance_from_rpc(
        self,
        rpc_url: str,
        wallet_address: str,
        token_address: str,
        decimals: int = 18,
    ) -> Optional[Decimal]:
        """Fetch ERC-20 token balance from RPC.

        Calls balanceOf(address) on the token contract.
        """
        import aiohttp

        try:
            # Encode balanceOf call
            address_padded = wallet_address.lower().replace("0x", "").zfill(64)
            data = f"{BALANCE_OF_SELECTOR}{address_padded}"

            payload = {
                "jsonrpc": "2.0",
                "method": "eth_call",
                "params": [
                    {"to": token_address, "data": data},
                    "latest",
                ],
                "id": 1,
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    rpc_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        if "result" in result:
                            balance_raw = int(result["result"], 16)
                            return Decimal(balance_raw) / Decimal(10**decimals)

            return None

        except Exception as e:
            logger.error(f"Token balance fetch failed: {e}")
            return None
