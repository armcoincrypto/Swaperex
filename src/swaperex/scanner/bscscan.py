"""BSC (BNB) scanner using BSC JSON-RPC.

Uses BSC RPC endpoints directly instead of deprecated BscScan API.
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositScanner, TransactionInfo

logger = logging.getLogger(__name__)

# BSC RPC endpoints
BSC_RPC_MAINNET = "https://bsc-dataseed.binance.org"
BSC_RPC_TESTNET = "https://data-seed-prebsc-1-s1.binance.org:8545"

# BscScan API (fallback)
BSCSCAN_MAINNET = "https://api.bscscan.com/api"
BSCSCAN_TESTNET = "https://api-testnet.bscscan.com/api"


class BscScanScanner(DepositScanner):
    """BNB deposit scanner using BSC RPC and BscScan API.

    Primary: Uses BSC RPC for balance checking
    Fallback: Uses BscScan API for transaction history
    """

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        """Initialize BSC scanner.

        Args:
            testnet: Use testnet if True
            api_key: BscScan API key
        """
        super().__init__("BNB")
        self.testnet = testnet
        self.api_key = api_key or "YourApiKeyToken"
        self.rpc_url = BSC_RPC_TESTNET if testnet else BSC_RPC_MAINNET
        self.api_url = BSCSCAN_TESTNET if testnet else BSCSCAN_MAINNET
        self._last_balances: dict[str, Decimal] = {}

    async def get_balance(self, address: str) -> Decimal:
        """Get BNB balance using RPC."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "jsonrpc": "2.0",
                    "method": "eth_getBalance",
                    "params": [address, "latest"],
                    "id": 1
                }
                response = await client.post(self.rpc_url, json=payload)

                if response.status_code == 200:
                    data = response.json()
                    balance_wei = int(data.get("result", "0x0"), 16)
                    return Decimal(balance_wei) / Decimal("1000000000000000000")
        except Exception as e:
            logger.error(f"Error getting BNB balance: {e}")

        return Decimal("0")

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get BNB transactions for an address.

        Uses balance comparison to detect deposits, then fetches tx details from BscScan.
        """
        transactions = []

        try:
            # Get current balance via RPC
            current_balance = await self.get_balance(address)
            previous_balance = self._last_balances.get(address, Decimal("0"))

            # If balance increased, there might be a new deposit
            if current_balance > previous_balance:
                deposit_amount = current_balance - previous_balance
                logger.info(f"Balance change detected: {previous_balance} -> {current_balance} ({deposit_amount} BNB)")

                # Try to get transaction details from BscScan
                tx_info = await self._get_latest_incoming_tx(address, min_confirmations)

                if tx_info:
                    transactions.append(tx_info)
                elif deposit_amount > Decimal("0.0001"):  # Minimum threshold
                    # Create synthetic transaction if we can't get details
                    # This ensures deposits are credited even if BscScan is unavailable
                    current_block = await self.get_current_block_height()
                    tx_info = TransactionInfo(
                        txid=f"rpc-detected-{address}-{current_block}",
                        asset="BNB",
                        to_address=address,
                        amount=deposit_amount,
                        confirmations=min_confirmations,
                        block_height=current_block,
                        from_address="unknown",
                    )
                    transactions.append(tx_info)

            # Update stored balance
            self._last_balances[address] = current_balance

        except Exception as e:
            logger.error(f"Error scanning BSC address {address}: {e}")

        return transactions

    async def _get_latest_incoming_tx(
        self, address: str, min_confirmations: int
    ) -> Optional[TransactionInfo]:
        """Get latest incoming transaction from BscScan API."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "module": "account",
                    "action": "txlist",
                    "address": address,
                    "startblock": 0,
                    "endblock": 99999999,
                    "page": 1,
                    "offset": 10,
                    "sort": "desc",
                    "apikey": self.api_key,
                }

                response = await client.get(self.api_url, params=params)

                if response.status_code != 200:
                    logger.warning(f"BscScan API error: {response.status_code}")
                    return None

                data = response.json()

                # Check for V1 deprecation error
                if data.get("status") != "1":
                    result = data.get("result", "")
                    if "deprecated" in str(result).lower():
                        logger.debug("BscScan V1 API deprecated, using RPC-only mode")
                    return None

                current_block = await self.get_current_block_height()

                for tx in data.get("result", []):
                    # Only incoming transactions
                    if tx.get("to", "").lower() != address.lower():
                        continue

                    # Skip failed transactions
                    if tx.get("isError") == "1":
                        continue

                    txid = tx.get("hash", "")
                    block_number = int(tx.get("blockNumber", 0))
                    value_wei = tx.get("value", "0")
                    from_address = tx.get("from", "")

                    amount = Decimal(value_wei) / Decimal("1000000000000000000")

                    # Skip zero-value transactions
                    if amount == 0:
                        continue

                    confirmations = max(0, current_block - block_number)

                    if confirmations >= min_confirmations:
                        return TransactionInfo(
                            txid=txid,
                            asset="BNB",
                            to_address=address,
                            amount=amount,
                            confirmations=confirmations,
                            block_height=block_number,
                            from_address=from_address,
                        )

        except Exception as e:
            logger.debug(f"Error fetching from BscScan: {e}")

        return None

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific BSC transaction."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "jsonrpc": "2.0",
                    "method": "eth_getTransactionByHash",
                    "params": [txid],
                    "id": 1
                }
                response = await client.post(self.rpc_url, json=payload)

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
                    asset="BNB",
                    to_address=result.get("to", ""),
                    amount=Decimal(value_wei) / Decimal("1000000000000000000"),
                    confirmations=max(0, current_block - block_number),
                    block_height=block_number,
                    from_address=result.get("from", ""),
                )

        except Exception as e:
            logger.error(f"Error fetching BSC transaction {txid}: {e}")

        return None

    async def get_current_block_height(self) -> int:
        """Get current BSC block height via RPC."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "jsonrpc": "2.0",
                    "method": "eth_blockNumber",
                    "params": [],
                    "id": 1
                }
                response = await client.post(self.rpc_url, json=payload)

                if response.status_code == 200:
                    data = response.json()
                    return int(data.get("result", "0x0"), 16)

        except Exception as e:
            logger.error(f"Error fetching BSC block height: {e}")

        return 0
