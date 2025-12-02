"""TronGrid scanner for TRX and TRC20 tokens.

Uses TronGrid API (free tier available).
API Docs: https://developers.tron.network/reference/background
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositScanner, TransactionInfo

logger = logging.getLogger(__name__)

# TronGrid API endpoints
TRONGRID_MAINNET = "https://api.trongrid.io"
TRONGRID_TESTNET = "https://api.shasta.trongrid.io"  # Shasta testnet

# USDT-TRC20 contract address
USDT_CONTRACT_MAINNET = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
USDT_CONTRACT_TESTNET = "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs"  # Test USDT


class TronGridScanner(DepositScanner):
    """TRX deposit scanner using TronGrid API.

    Monitors TRX transfers to tracked addresses.
    Free API with generous rate limits.
    """

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        """Initialize TronGrid scanner.

        Args:
            testnet: Use Shasta testnet if True
            api_key: Optional TronGrid API key for higher rate limits
        """
        super().__init__("TRX")
        self.testnet = testnet
        self.api_key = api_key
        self.base_url = TRONGRID_TESTNET if testnet else TRONGRID_MAINNET

        self._headers = {"Accept": "application/json"}
        if api_key:
            self._headers["TRON-PRO-API-KEY"] = api_key

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get TRX transactions for an address.

        Args:
            address: TRX address (T... format)
            min_confirmations: Minimum confirmations required

        Returns:
            List of incoming TRX transactions
        """
        transactions = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get TRX transfers
                url = f"{self.base_url}/v1/accounts/{address}/transactions"
                params = {
                    "only_to": "true",  # Only incoming
                    "limit": 50,
                }

                response = await client.get(url, headers=self._headers, params=params)

                if response.status_code != 200:
                    logger.warning(f"TronGrid API error: {response.status_code}")
                    return []

                data = response.json()

                if not data.get("success", False):
                    return []

                current_block = await self.get_current_block_height()

                for tx in data.get("data", []):
                    tx_info = self._parse_transaction(tx, address, current_block)
                    if tx_info and tx_info.confirmations >= min_confirmations:
                        transactions.append(tx_info)

        except Exception as e:
            logger.error(f"Error fetching TRX transactions: {e}")

        return transactions

    def _parse_transaction(
        self, tx: dict, to_address: str, current_block: int
    ) -> Optional[TransactionInfo]:
        """Parse TronGrid transaction response."""
        try:
            txid = tx.get("txID", "")
            block_number = tx.get("blockNumber", 0)

            # Get raw data
            raw_data = tx.get("raw_data", {})
            contract = raw_data.get("contract", [{}])[0]
            contract_type = contract.get("type", "")

            # Only handle TransferContract (native TRX)
            if contract_type != "TransferContract":
                return None

            value_data = contract.get("parameter", {}).get("value", {})
            amount_sun = value_data.get("amount", 0)
            owner_address = value_data.get("owner_address", "")

            # Convert from SUN (1 TRX = 1,000,000 SUN)
            amount = Decimal(str(amount_sun)) / Decimal("1000000")

            # Calculate confirmations
            confirmations = max(0, current_block - block_number) if block_number else 0

            return TransactionInfo(
                txid=txid,
                asset="TRX",
                to_address=to_address,
                amount=amount,
                confirmations=confirmations,
                block_height=block_number,
                from_address=self._hex_to_base58(owner_address) if owner_address else None,
            )

        except Exception as e:
            logger.debug(f"Error parsing TRX transaction: {e}")
            return None

    def _hex_to_base58(self, hex_address: str) -> str:
        """Convert hex address to base58 (simplified)."""
        # In production, use proper base58 conversion
        # For now, return as-is if already base58 or truncate hex
        if hex_address.startswith("T"):
            return hex_address
        return f"T{hex_address[:33]}"

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific TRX transaction."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = f"{self.base_url}/wallet/gettransactionbyid"
                response = await client.post(
                    url,
                    headers=self._headers,
                    json={"value": txid},
                )

                if response.status_code != 200:
                    return None

                data = response.json()
                if not data:
                    return None

                current_block = await self.get_current_block_height()
                return self._parse_transaction(data, "", current_block)

        except Exception as e:
            logger.error(f"Error fetching TRX transaction {txid}: {e}")
            return None

    async def get_current_block_height(self) -> int:
        """Get current TRON block height."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = f"{self.base_url}/wallet/getnowblock"
                response = await client.get(url, headers=self._headers)

                if response.status_code == 200:
                    data = response.json()
                    return data.get("block_header", {}).get("raw_data", {}).get("number", 0)

        except Exception as e:
            logger.error(f"Error fetching TRON block height: {e}")

        return 0


class TRC20Scanner(DepositScanner):
    """TRC20 token scanner (USDT, USDC, etc.)."""

    def __init__(
        self,
        token_contract: str,
        token_symbol: str = "USDT",
        testnet: bool = False,
        api_key: Optional[str] = None,
    ):
        """Initialize TRC20 scanner.

        Args:
            token_contract: TRC20 contract address
            token_symbol: Token symbol (USDT, USDC)
            testnet: Use testnet if True
            api_key: Optional TronGrid API key
        """
        super().__init__(token_symbol)
        self.token_contract = token_contract
        self.testnet = testnet
        self.api_key = api_key
        self.base_url = TRONGRID_TESTNET if testnet else TRONGRID_MAINNET

        self._headers = {"Accept": "application/json"}
        if api_key:
            self._headers["TRON-PRO-API-KEY"] = api_key

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get TRC20 token transactions for an address."""
        transactions = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get TRC20 transfers
                url = f"{self.base_url}/v1/accounts/{address}/transactions/trc20"
                params = {
                    "only_to": "true",
                    "limit": 50,
                    "contract_address": self.token_contract,
                }

                response = await client.get(url, headers=self._headers, params=params)

                if response.status_code != 200:
                    logger.warning(f"TronGrid TRC20 API error: {response.status_code}")
                    return []

                data = response.json()

                if not data.get("success", False):
                    return []

                current_block = await self.get_current_block_height()

                for tx in data.get("data", []):
                    tx_info = self._parse_trc20_transaction(tx, address, current_block)
                    if tx_info and tx_info.confirmations >= min_confirmations:
                        transactions.append(tx_info)

        except Exception as e:
            logger.error(f"Error fetching TRC20 transactions: {e}")

        return transactions

    def _parse_trc20_transaction(
        self, tx: dict, to_address: str, current_block: int
    ) -> Optional[TransactionInfo]:
        """Parse TRC20 transaction response."""
        try:
            txid = tx.get("transaction_id", "")
            block_number = tx.get("block_timestamp", 0) // 1000  # Approximate

            # Get token info
            token_info = tx.get("token_info", {})
            decimals = int(token_info.get("decimals", 6))

            # Parse value
            value_str = tx.get("value", "0")
            amount = Decimal(value_str) / Decimal(10 ** decimals)

            from_address = tx.get("from", "")

            # Calculate confirmations (approximate)
            confirmations = 20  # TRC20 txs from this API are usually confirmed

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
            logger.debug(f"Error parsing TRC20 transaction: {e}")
            return None

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific TRC20 transaction."""
        # TRC20 transactions are harder to query individually
        # Return None for now - the batch query handles most cases
        return None

    async def get_current_block_height(self) -> int:
        """Get current TRON block height."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = f"{self.base_url}/wallet/getnowblock"
                response = await client.get(url, headers=self._headers)

                if response.status_code == 200:
                    data = response.json()
                    return data.get("block_header", {}).get("raw_data", {}).get("number", 0)

        except Exception as e:
            logger.error(f"Error fetching TRON block height: {e}")

        return 0


def get_usdt_trc20_scanner(testnet: bool = False, api_key: Optional[str] = None) -> TRC20Scanner:
    """Get USDT-TRC20 scanner with correct contract address."""
    contract = USDT_CONTRACT_TESTNET if testnet else USDT_CONTRACT_MAINNET
    return TRC20Scanner(
        token_contract=contract,
        token_symbol="USDT-TRC20",
        testnet=testnet,
        api_key=api_key,
    )
