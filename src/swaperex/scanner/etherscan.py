"""Etherscan scanner for ETH and ERC20 tokens.

Uses Etherscan API (free tier: 5 calls/sec).
API Docs: https://docs.etherscan.io/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositScanner, TransactionInfo

logger = logging.getLogger(__name__)

# Etherscan API endpoints
ETHERSCAN_MAINNET = "https://api.etherscan.io/api"
ETHERSCAN_SEPOLIA = "https://api-sepolia.etherscan.io/api"  # Testnet

# USDT-ERC20 contract addresses
USDT_CONTRACT_MAINNET = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
USDT_CONTRACT_SEPOLIA = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"  # Test token

# USDC contract addresses
USDC_CONTRACT_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"


class EtherscanScanner(DepositScanner):
    """ETH deposit scanner using Etherscan API.

    Monitors ETH transfers to tracked addresses.
    Free tier: 5 calls/second, 100,000 calls/day.
    """

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        """Initialize Etherscan scanner.

        Args:
            testnet: Use Sepolia testnet if True
            api_key: Etherscan API key (free registration required for higher limits)
        """
        super().__init__("ETH")
        self.testnet = testnet
        self.api_key = api_key or "YourApiKeyToken"  # Default (limited)
        self.base_url = ETHERSCAN_SEPOLIA if testnet else ETHERSCAN_MAINNET

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get ETH transactions for an address.

        Args:
            address: ETH address (0x... format)
            min_confirmations: Minimum confirmations required

        Returns:
            List of incoming ETH transactions
        """
        transactions = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "module": "account",
                    "action": "txlist",
                    "address": address,
                    "startblock": 0,
                    "endblock": 99999999,
                    "page": 1,
                    "offset": 50,
                    "sort": "desc",
                    "apikey": self.api_key,
                }

                response = await client.get(self.base_url, params=params)

                if response.status_code != 200:
                    logger.warning(f"Etherscan API error: {response.status_code}")
                    return []

                data = response.json()

                if data.get("status") != "1":
                    # No transactions or error
                    return []

                current_block = await self.get_current_block_height()

                for tx in data.get("result", []):
                    # Only incoming transactions
                    if tx.get("to", "").lower() != address.lower():
                        continue

                    tx_info = self._parse_transaction(tx, address, current_block)
                    if tx_info and tx_info.confirmations >= min_confirmations:
                        transactions.append(tx_info)

        except Exception as e:
            logger.error(f"Error fetching ETH transactions: {e}")

        return transactions

    def _parse_transaction(
        self, tx: dict, to_address: str, current_block: int
    ) -> Optional[TransactionInfo]:
        """Parse Etherscan transaction response."""
        try:
            txid = tx.get("hash", "")
            block_number = int(tx.get("blockNumber", 0))
            value_wei = tx.get("value", "0")
            from_address = tx.get("from", "")

            # Convert from Wei (1 ETH = 10^18 Wei)
            amount = Decimal(value_wei) / Decimal("1000000000000000000")

            # Skip zero-value transactions (contract calls)
            if amount == 0:
                return None

            # Calculate confirmations
            confirmations = max(0, current_block - block_number)

            return TransactionInfo(
                txid=txid,
                asset="ETH",
                to_address=to_address,
                amount=amount,
                confirmations=confirmations,
                block_height=block_number,
                from_address=from_address,
            )

        except Exception as e:
            logger.debug(f"Error parsing ETH transaction: {e}")
            return None

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific ETH transaction."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "module": "proxy",
                    "action": "eth_getTransactionByHash",
                    "txhash": txid,
                    "apikey": self.api_key,
                }

                response = await client.get(self.base_url, params=params)

                if response.status_code != 200:
                    return None

                data = response.json()
                result = data.get("result")

                if not result:
                    return None

                current_block = await self.get_current_block_height()
                block_number = int(result.get("blockNumber", "0x0"), 16)
                value_wei = int(result.get("value", "0x0"), 16)

                return TransactionInfo(
                    txid=txid,
                    asset="ETH",
                    to_address=result.get("to", ""),
                    amount=Decimal(value_wei) / Decimal("1000000000000000000"),
                    confirmations=max(0, current_block - block_number),
                    block_height=block_number,
                    from_address=result.get("from", ""),
                )

        except Exception as e:
            logger.error(f"Error fetching ETH transaction {txid}: {e}")
            return None

    async def get_current_block_height(self) -> int:
        """Get current ETH block height."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "module": "proxy",
                    "action": "eth_blockNumber",
                    "apikey": self.api_key,
                }

                response = await client.get(self.base_url, params=params)

                if response.status_code == 200:
                    data = response.json()
                    return int(data.get("result", "0x0"), 16)

        except Exception as e:
            logger.error(f"Error fetching ETH block height: {e}")

        return 0


class ERC20Scanner(DepositScanner):
    """ERC20 token scanner (USDT, USDC, etc.)."""

    def __init__(
        self,
        token_contract: str,
        token_symbol: str = "USDT",
        token_decimals: int = 6,
        testnet: bool = False,
        api_key: Optional[str] = None,
    ):
        """Initialize ERC20 scanner.

        Args:
            token_contract: ERC20 contract address
            token_symbol: Token symbol (USDT, USDC)
            token_decimals: Token decimals (6 for USDT/USDC)
            testnet: Use testnet if True
            api_key: Etherscan API key
        """
        super().__init__(token_symbol)
        self.token_contract = token_contract
        self.token_decimals = token_decimals
        self.testnet = testnet
        self.api_key = api_key or "YourApiKeyToken"
        self.base_url = ETHERSCAN_SEPOLIA if testnet else ETHERSCAN_MAINNET

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get ERC20 token transactions for an address."""
        transactions = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "module": "account",
                    "action": "tokentx",
                    "contractaddress": self.token_contract,
                    "address": address,
                    "page": 1,
                    "offset": 50,
                    "sort": "desc",
                    "apikey": self.api_key,
                }

                response = await client.get(self.base_url, params=params)

                if response.status_code != 200:
                    logger.warning(f"Etherscan ERC20 API error: {response.status_code}")
                    return []

                data = response.json()

                if data.get("status") != "1":
                    return []

                current_block = await self.get_current_block_height()

                for tx in data.get("result", []):
                    # Only incoming transactions
                    if tx.get("to", "").lower() != address.lower():
                        continue

                    tx_info = self._parse_erc20_transaction(tx, address, current_block)
                    if tx_info and tx_info.confirmations >= min_confirmations:
                        transactions.append(tx_info)

        except Exception as e:
            logger.error(f"Error fetching ERC20 transactions: {e}")

        return transactions

    def _parse_erc20_transaction(
        self, tx: dict, to_address: str, current_block: int
    ) -> Optional[TransactionInfo]:
        """Parse ERC20 transaction response."""
        try:
            txid = tx.get("hash", "")
            block_number = int(tx.get("blockNumber", 0))
            value_raw = tx.get("value", "0")
            from_address = tx.get("from", "")

            # Convert using token decimals
            amount = Decimal(value_raw) / Decimal(10 ** self.token_decimals)

            # Calculate confirmations
            confirmations = max(0, current_block - block_number)

            return TransactionInfo(
                txid=txid,
                asset=self.asset,
                to_address=to_address,
                amount=amount,
                confirmations=confirmations,
                block_height=block_number,
                from_address=from_address,
            )

        except Exception as e:
            logger.debug(f"Error parsing ERC20 transaction: {e}")
            return None

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific ERC20 transaction."""
        # ERC20 token transfers need to be queried from logs
        # For simplicity, return None - batch queries handle most cases
        return None

    async def get_current_block_height(self) -> int:
        """Get current ETH block height."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "module": "proxy",
                    "action": "eth_blockNumber",
                    "apikey": self.api_key,
                }

                response = await client.get(self.base_url, params=params)

                if response.status_code == 200:
                    data = response.json()
                    return int(data.get("result", "0x0"), 16)

        except Exception as e:
            logger.error(f"Error fetching ETH block height: {e}")

        return 0


def get_usdt_erc20_scanner(testnet: bool = False, api_key: Optional[str] = None) -> ERC20Scanner:
    """Get USDT-ERC20 scanner with correct contract address."""
    contract = USDT_CONTRACT_SEPOLIA if testnet else USDT_CONTRACT_MAINNET
    return ERC20Scanner(
        token_contract=contract,
        token_symbol="USDT-ERC20",
        token_decimals=6,
        testnet=testnet,
        api_key=api_key,
    )


def get_usdc_scanner(testnet: bool = False, api_key: Optional[str] = None) -> ERC20Scanner:
    """Get USDC scanner with correct contract address."""
    return ERC20Scanner(
        token_contract=USDC_CONTRACT_MAINNET,
        token_symbol="USDC",
        token_decimals=6,
        testnet=testnet,
        api_key=api_key,
    )
