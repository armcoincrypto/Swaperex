"""Blockstream.info API scanner for BTC/LTC.

Free API for Bitcoin blockchain queries.
Docs: https://github.com/Blockstream/esplora/blob/master/API.md
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositScanner, TransactionInfo

logger = logging.getLogger(__name__)


class BlockstreamScanner(DepositScanner):
    """Bitcoin deposit scanner using Blockstream.info API.

    This is a free API with no authentication required.
    Rate limits: ~10 requests/second
    """

    # API endpoints
    MAINNET_URL = "https://blockstream.info/api"
    TESTNET_URL = "https://blockstream.info/testnet/api"

    def __init__(self, testnet: bool = False):
        """Initialize Blockstream scanner.

        Args:
            testnet: Use testnet API if True
        """
        super().__init__("BTC")
        self.testnet = testnet
        self.base_url = self.TESTNET_URL if testnet else self.MAINNET_URL
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get transactions for a BTC address.

        Args:
            address: BTC address (bc1q..., 1..., 3..., etc.)
            min_confirmations: Minimum confirmation count

        Returns:
            List of incoming transactions
        """
        client = await self._get_client()
        transactions = []

        try:
            # Get address transactions
            url = f"{self.base_url}/address/{address}/txs"
            response = await client.get(url)
            response.raise_for_status()
            txs = response.json()

            # Get current block height for confirmation calculation
            current_height = await self.get_current_block_height()

            for tx in txs:
                tx_info = self._parse_transaction(tx, address, current_height)
                if tx_info and tx_info.confirmations >= min_confirmations:
                    transactions.append(tx_info)

        except httpx.HTTPError as e:
            logger.error(f"Blockstream API error for {address}: {e}")
        except Exception as e:
            logger.error(f"Error parsing transactions for {address}: {e}")

        return transactions

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific BTC transaction.

        Args:
            txid: Transaction hash

        Returns:
            Transaction info or None
        """
        client = await self._get_client()

        try:
            url = f"{self.base_url}/tx/{txid}"
            response = await client.get(url)
            response.raise_for_status()
            tx = response.json()

            current_height = await self.get_current_block_height()

            # Find the first output address (simplified)
            for vout in tx.get("vout", []):
                if vout.get("scriptpubkey_address"):
                    return self._parse_transaction(
                        tx, vout["scriptpubkey_address"], current_height
                    )

            return None

        except httpx.HTTPError as e:
            logger.error(f"Blockstream API error for tx {txid}: {e}")
            return None

    async def get_current_block_height(self) -> int:
        """Get current Bitcoin block height."""
        client = await self._get_client()

        try:
            url = f"{self.base_url}/blocks/tip/height"
            response = await client.get(url)
            response.raise_for_status()
            return int(response.text)
        except Exception as e:
            logger.error(f"Error getting block height: {e}")
            return 0

    def _parse_transaction(
        self, tx: dict, address: str, current_height: int
    ) -> Optional[TransactionInfo]:
        """Parse a Blockstream API transaction response.

        Args:
            tx: Raw transaction data from API
            address: The address we're interested in
            current_height: Current blockchain height

        Returns:
            TransactionInfo or None if not relevant
        """
        txid = tx.get("txid")
        if not txid:
            return None

        # Calculate confirmations
        block_height = tx.get("status", {}).get("block_height")
        if block_height:
            confirmations = current_height - block_height + 1
        else:
            confirmations = 0

        # Sum outputs to our address
        total_received = Decimal("0")
        for vout in tx.get("vout", []):
            if vout.get("scriptpubkey_address") == address:
                # Amount is in satoshis
                satoshis = vout.get("value", 0)
                total_received += Decimal(str(satoshis)) / Decimal("100000000")

        if total_received <= 0:
            return None

        # Get sender address (first input)
        from_address = None
        vin = tx.get("vin", [])
        if vin and vin[0].get("prevout"):
            from_address = vin[0]["prevout"].get("scriptpubkey_address")

        return TransactionInfo(
            txid=txid,
            asset="BTC",
            to_address=address,
            amount=total_received,
            confirmations=confirmations,
            block_height=block_height,
            from_address=from_address,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


class LTCBlockstreamScanner(BlockstreamScanner):
    """Litecoin scanner (uses different API but same structure)."""

    # LTC doesn't have official Blockstream API, would use different endpoint
    # This is a placeholder for future LTC scanner implementation

    def __init__(self, testnet: bool = False):
        super().__init__(testnet)
        self.asset = "LTC"
        # Would need different API endpoint for LTC
        # e.g., blockcypher.com or similar

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """LTC scanning not yet implemented."""
        logger.warning("LTC scanning not yet implemented, returning empty list")
        return []
