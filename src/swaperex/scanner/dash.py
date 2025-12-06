"""DASH deposit scanner using BlockCypher and Insight APIs."""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositScanner, TransactionInfo

logger = logging.getLogger(__name__)


class DashScanner(DepositScanner):
    """DASH deposit scanner using multiple API providers.

    Uses BlockCypher as primary, Insight API as fallback.
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize DASH scanner.

        Args:
            api_key: Optional BlockCypher API key for higher rate limits
        """
        super().__init__("DASH")
        self.api_key = api_key

        # API endpoints
        self.blockcypher_url = "https://api.blockcypher.com/v1/dash/main"
        self.insight_url = "https://insight.dash.org/insight-api"

        self._current_height: Optional[int] = None

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 2
    ) -> list[TransactionInfo]:
        """Get transactions for a DASH address.

        Args:
            address: DASH address to check
            min_confirmations: Minimum confirmation count

        Returns:
            List of incoming transactions
        """
        transactions = []

        # Try BlockCypher first
        try:
            transactions = await self._get_blockcypher_txs(address, min_confirmations)
            if transactions:
                return transactions
        except Exception as e:
            logger.warning(f"BlockCypher failed for {address}: {e}")

        # Fallback to Insight API
        try:
            transactions = await self._get_insight_txs(address, min_confirmations)
        except Exception as e:
            logger.warning(f"Insight API failed for {address}: {e}")

        return transactions

    async def _get_blockcypher_txs(
        self, address: str, min_confirmations: int
    ) -> list[TransactionInfo]:
        """Get transactions from BlockCypher API."""
        url = f"{self.blockcypher_url}/addrs/{address}"
        params = {}
        if self.api_key:
            params["token"] = self.api_key

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        current_height = await self.get_current_block_height()
        transactions = []

        # Process confirmed transactions
        for tx_ref in data.get("txrefs", []):
            # Only incoming transactions (positive value)
            if tx_ref.get("tx_output_n", -1) >= 0:
                tx_height = tx_ref.get("block_height", 0)
                confirmations = current_height - tx_height + 1 if tx_height else 0

                if confirmations >= min_confirmations:
                    # Convert satoshis to DASH
                    amount = Decimal(tx_ref.get("value", 0)) / Decimal("100000000")

                    tx_info = TransactionInfo(
                        txid=tx_ref.get("tx_hash", ""),
                        asset="DASH",
                        to_address=address,
                        amount=amount,
                        confirmations=confirmations,
                        block_height=tx_height,
                    )
                    transactions.append(tx_info)

        # Also check unconfirmed
        for tx_ref in data.get("unconfirmed_txrefs", []):
            if tx_ref.get("tx_output_n", -1) >= 0:
                amount = Decimal(tx_ref.get("value", 0)) / Decimal("100000000")
                tx_info = TransactionInfo(
                    txid=tx_ref.get("tx_hash", ""),
                    asset="DASH",
                    to_address=address,
                    amount=amount,
                    confirmations=0,
                    block_height=None,
                )
                # Include if min_confirmations is 0
                if min_confirmations == 0:
                    transactions.append(tx_info)

        return transactions

    async def _get_insight_txs(
        self, address: str, min_confirmations: int
    ) -> list[TransactionInfo]:
        """Get transactions from Dash Insight API."""
        url = f"{self.insight_url}/addr/{address}"

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

        transactions = []
        tx_ids = data.get("transactions", [])

        # Limit to recent transactions
        for txid in tx_ids[:20]:
            try:
                tx_info = await self._get_insight_tx(txid, address)
                if tx_info and tx_info.confirmations >= min_confirmations:
                    transactions.append(tx_info)
            except Exception as e:
                logger.debug(f"Error getting tx {txid}: {e}")

        return transactions

    async def _get_insight_tx(
        self, txid: str, address: str
    ) -> Optional[TransactionInfo]:
        """Get single transaction from Insight API."""
        url = f"{self.insight_url}/tx/{txid}"

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

        # Find output to our address
        total_received = Decimal(0)
        for vout in data.get("vout", []):
            addresses = vout.get("scriptPubKey", {}).get("addresses", [])
            if address in addresses:
                total_received += Decimal(str(vout.get("value", 0)))

        if total_received > 0:
            return TransactionInfo(
                txid=txid,
                asset="DASH",
                to_address=address,
                amount=total_received,
                confirmations=data.get("confirmations", 0),
                block_height=data.get("blockheight"),
            )

        return None

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific transaction by ID."""
        # Try Insight API
        try:
            url = f"{self.insight_url}/tx/{txid}"
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

            # Get first output address
            to_address = ""
            amount = Decimal(0)
            for vout in data.get("vout", []):
                addresses = vout.get("scriptPubKey", {}).get("addresses", [])
                if addresses:
                    to_address = addresses[0]
                    amount = Decimal(str(vout.get("value", 0)))
                    break

            return TransactionInfo(
                txid=txid,
                asset="DASH",
                to_address=to_address,
                amount=amount,
                confirmations=data.get("confirmations", 0),
                block_height=data.get("blockheight"),
            )
        except Exception as e:
            logger.error(f"Error getting transaction {txid}: {e}")
            return None

    async def get_current_block_height(self) -> int:
        """Get current DASH blockchain height."""
        if self._current_height:
            return self._current_height

        # Try BlockCypher
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(self.blockcypher_url)
                response.raise_for_status()
                data = response.json()
                self._current_height = data.get("height", 0)
                return self._current_height
        except Exception:
            pass

        # Fallback to Insight
        try:
            url = f"{self.insight_url}/status"
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                self._current_height = data.get("info", {}).get("blocks", 0)
                return self._current_height
        except Exception:
            pass

        return 0
