"""Deposit scanner runner.

This script runs the deposit scanner to monitor blockchain addresses
for incoming transactions and credit user balances.

Usage:
    python -m swaperex.scanner.runner --asset BTC --interval 30

Environment variables:
    BACKEND_URL: URL of the FastAPI backend (default: http://127.0.0.1:8000)
    BTC_CONFIRMATIONS: Minimum confirmations for BTC (default: 2)
    SCANNER_INTERVAL: Seconds between scan cycles (default: 60)
"""

import argparse
import asyncio
import logging
import os

from swaperex.ledger.database import get_db, init_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.scanner import TransactionInfo, get_scanner

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class DepositScannerRunner:
    """Runner for the deposit scanner."""

    def __init__(
        self,
        asset: str,
        backend_url: str = "http://127.0.0.1:8000",
        min_confirmations: int = 2,
        interval: int = 60,
    ):
        """Initialize scanner runner.

        Args:
            asset: Asset to scan (BTC, LTC, etc.)
            backend_url: URL of the backend API
            min_confirmations: Minimum confirmations required
            interval: Seconds between scan cycles
        """
        self.asset = asset.upper()
        self.backend_url = backend_url
        self.min_confirmations = min_confirmations
        self.interval = interval
        self.scanner = get_scanner(asset)
        self._processed_txids: set[str] = set()

    async def get_addresses_to_scan(self) -> list[str]:
        """Get list of active deposit addresses from database."""
        async with get_db() as session:
            repo = LedgerRepository(session)
            addresses = await repo.get_all_active_deposit_addresses(self.asset)
            return [addr.address for addr in addresses]

    async def process_deposit(self, tx: TransactionInfo) -> bool:
        """Process a detected deposit.

        Posts to the backend webhook to credit user balance.
        """
        if tx.txid in self._processed_txids:
            logger.debug(f"Skipping already processed tx: {tx.txid}")
            return False

        if tx.confirmations < self.min_confirmations:
            logger.debug(
                f"Tx {tx.txid} has {tx.confirmations} confirmations, "
                f"need {self.min_confirmations}"
            )
            return False

        logger.info(
            f"Processing deposit: {tx.amount} {tx.asset} to {tx.to_address} "
            f"(txid: {tx.txid[:16]}...)"
        )

        # Find user by address
        async with get_db() as session:
            repo = LedgerRepository(session)
            addr_record = await repo.get_deposit_address_record(tx.to_address)

            if not addr_record:
                logger.warning(f"Address {tx.to_address} not found in database")
                return False

            user = await repo.get_user_by_deposit_address(tx.to_address)
            if not user:
                logger.warning(f"User for address {tx.to_address} not found")
                return False

            # Check if deposit already recorded
            existing = await repo.get_deposit_by_txid(tx.txid)
            if existing:
                logger.debug(f"Deposit {tx.txid} already recorded")
                self._processed_txids.add(tx.txid)
                return False

            # Create deposit and credit balance
            from swaperex.ledger.models import DepositStatus

            deposit = await repo.create_deposit(
                user_id=user.id,
                asset=tx.asset,
                amount=tx.amount,
                to_address=tx.to_address,
                tx_hash=tx.txid,
                from_address=tx.from_address,
                status=DepositStatus.PENDING,
            )

            # Confirm deposit (credits balance)
            await repo.confirm_deposit(deposit.id)

            logger.info(
                f"Deposit confirmed: {tx.amount} {tx.asset} credited to user {user.id}"
            )

        self._processed_txids.add(tx.txid)
        return True

    async def scan_once(self) -> int:
        """Run a single scan cycle.

        Returns:
            Number of new deposits processed
        """
        addresses = await self.get_addresses_to_scan()

        if not addresses:
            logger.debug(f"No {self.asset} addresses to scan")
            return 0

        logger.info(f"Scanning {len(addresses)} {self.asset} addresses...")

        processed = 0
        for address in addresses:
            try:
                txs = await self.scanner.get_address_transactions(
                    address, min_confirmations=self.min_confirmations
                )

                for tx in txs:
                    if await self.process_deposit(tx):
                        processed += 1

            except Exception as e:
                logger.error(f"Error scanning {address}: {e}")

        return processed

    async def run(self) -> None:
        """Run continuous scanning loop."""
        logger.info(
            f"Starting {self.asset} deposit scanner "
            f"(interval: {self.interval}s, min_confirmations: {self.min_confirmations})"
        )

        # Initialize database
        await init_db()

        while True:
            try:
                processed = await self.scan_once()
                if processed > 0:
                    logger.info(f"Processed {processed} new {self.asset} deposits")
            except Exception as e:
                logger.error(f"Scanner error: {e}")

            await asyncio.sleep(self.interval)


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Run deposit scanner")
    parser.add_argument(
        "--asset",
        default="BTC",
        help="Asset to scan (default: BTC)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=int(os.environ.get("SCANNER_INTERVAL", "60")),
        help="Seconds between scans (default: 60)",
    )
    parser.add_argument(
        "--confirmations",
        type=int,
        default=int(os.environ.get("BTC_CONFIRMATIONS", "2")),
        help="Minimum confirmations (default: 2)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run once and exit",
    )

    args = parser.parse_args()

    backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")

    runner = DepositScannerRunner(
        asset=args.asset,
        backend_url=backend_url,
        min_confirmations=args.confirmations,
        interval=args.interval,
    )

    if args.once:
        await init_db()
        processed = await runner.scan_once()
        print(f"Processed {processed} deposits")
    else:
        await runner.run()


if __name__ == "__main__":
    asyncio.run(main())
