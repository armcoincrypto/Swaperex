"""Base interface for deposit scanners.

Deposit scanners monitor blockchain addresses for incoming transactions
and trigger webhooks when deposits are detected.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class TransactionInfo:
    """Information about a detected transaction."""

    txid: str
    asset: str
    to_address: str
    amount: Decimal
    confirmations: int
    block_height: Optional[int] = None
    block_time: Optional[datetime] = None
    from_address: Optional[str] = None

    @property
    def is_confirmed(self) -> bool:
        """Check if transaction has minimum confirmations."""
        # Different assets may require different confirmation counts
        min_confirmations = {
            "BTC": 2,
            "LTC": 6,
            "ETH": 12,
            "BSC": 15,
            "TRX": 20,
        }
        required = min_confirmations.get(self.asset.upper(), 6)
        return self.confirmations >= required


class DepositScanner(ABC):
    """Abstract base class for blockchain deposit scanners.

    Implementations monitor specific blockchains for incoming deposits
    to tracked addresses.
    """

    def __init__(self, asset: str):
        """Initialize scanner for a specific asset.

        Args:
            asset: Asset symbol (BTC, ETH, etc.)
        """
        self.asset = asset.upper()
        self._running = False
        self._processed_txids: set[str] = set()
        self._on_deposit_callback: Optional[Callable] = None

    @abstractmethod
    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get transactions for an address.

        Args:
            address: Blockchain address to check
            min_confirmations: Minimum confirmation count

        Returns:
            List of transactions to this address
        """
        pass

    @abstractmethod
    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific transaction by ID.

        Args:
            txid: Transaction hash/ID

        Returns:
            Transaction info or None if not found
        """
        pass

    @abstractmethod
    async def get_current_block_height(self) -> int:
        """Get the current blockchain height."""
        pass

    def set_deposit_callback(self, callback: Callable) -> None:
        """Set callback function for detected deposits.

        Callback signature: async def callback(tx: TransactionInfo) -> None
        """
        self._on_deposit_callback = callback

    async def scan_address(self, address: str) -> list[TransactionInfo]:
        """Scan an address for new deposits.

        Args:
            address: Address to scan

        Returns:
            List of new (unprocessed) transactions
        """
        transactions = await self.get_address_transactions(address)
        new_txs = []

        for tx in transactions:
            if tx.txid not in self._processed_txids:
                new_txs.append(tx)
                self._processed_txids.add(tx.txid)

                if self._on_deposit_callback:
                    try:
                        await self._on_deposit_callback(tx)
                    except Exception as e:
                        logger.error(f"Deposit callback error for {tx.txid}: {e}")

        return new_txs

    async def scan_addresses(self, addresses: list[str]) -> list[TransactionInfo]:
        """Scan multiple addresses for new deposits.

        Args:
            addresses: List of addresses to scan

        Returns:
            List of all new transactions found
        """
        all_txs = []
        for address in addresses:
            try:
                txs = await self.scan_address(address)
                all_txs.extend(txs)
            except Exception as e:
                logger.error(f"Error scanning {address}: {e}")
        return all_txs

    async def run(
        self,
        get_addresses_fn: Callable,
        interval_seconds: int = 60,
    ) -> None:
        """Run continuous scanning loop.

        Args:
            get_addresses_fn: Async function that returns list of addresses to scan
            interval_seconds: Seconds between scan cycles
        """
        self._running = True
        logger.info(f"Starting {self.asset} deposit scanner (interval: {interval_seconds}s)")

        while self._running:
            try:
                addresses = await get_addresses_fn()
                if addresses:
                    new_txs = await self.scan_addresses(addresses)
                    if new_txs:
                        logger.info(f"Found {len(new_txs)} new {self.asset} deposits")
            except Exception as e:
                logger.error(f"Scanner error: {e}")

            await asyncio.sleep(interval_seconds)

    def stop(self) -> None:
        """Stop the scanning loop."""
        self._running = False
        logger.info(f"Stopping {self.asset} deposit scanner")

    def mark_processed(self, txid: str) -> None:
        """Mark a transaction as processed (idempotent)."""
        self._processed_txids.add(txid)

    def is_processed(self, txid: str) -> bool:
        """Check if a transaction has been processed."""
        return txid in self._processed_txids


class SimulatedScanner(DepositScanner):
    """Simulated scanner for testing (no real blockchain queries)."""

    def __init__(self, asset: str):
        super().__init__(asset)
        self._simulated_txs: list[TransactionInfo] = []
        self._block_height = 800000

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Return simulated transactions for testing."""
        return [
            tx for tx in self._simulated_txs
            if tx.to_address == address and tx.confirmations >= min_confirmations
        ]

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a simulated transaction."""
        for tx in self._simulated_txs:
            if tx.txid == txid:
                return tx
        return None

    async def get_current_block_height(self) -> int:
        """Return simulated block height."""
        return self._block_height

    def add_simulated_deposit(
        self,
        address: str,
        amount: Decimal,
        txid: Optional[str] = None,
        confirmations: int = 6,
    ) -> TransactionInfo:
        """Add a simulated deposit for testing."""
        import secrets

        tx = TransactionInfo(
            txid=txid or f"sim_tx_{secrets.token_hex(16)}",
            asset=self.asset,
            to_address=address,
            amount=amount,
            confirmations=confirmations,
            block_height=self._block_height,
        )
        self._simulated_txs.append(tx)
        return tx
