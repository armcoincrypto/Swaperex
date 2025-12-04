#!/usr/bin/env python3
"""Hot Wallet Reconciliation Script.

Scans blockchain for deposits and reconciles with database.
Useful after database reset or to verify balances.

Usage:
    python scripts/reconcile.py [--asset DASH] [--fix]

Options:
    --asset  Only reconcile specific asset (default: all)
    --fix    Automatically credit missing deposits
    --dry-run  Show what would be done without making changes
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
from dotenv import load_dotenv

from swaperex.ledger.database import get_db, init_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.ledger.models import AuditLogType

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# Hot wallet addresses per asset
HOT_WALLETS = {
    "DASH": os.getenv("DASH_HOT_WALLET_ADDRESS"),
    "BTC": os.getenv("BTC_HOT_WALLET_ADDRESS"),
    "LTC": os.getenv("LTC_HOT_WALLET_ADDRESS"),
    "ETH": os.getenv("ETH_HOT_WALLET_ADDRESS"),
}


async def get_dash_transactions(address: str) -> list[dict]:
    """Get all transactions for a DASH address from BlockCypher."""
    if not address:
        return []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get full address info with transactions
            response = await client.get(
                f"https://api.blockcypher.com/v1/dash/main/addrs/{address}/full"
            )

            if response.status_code != 200:
                logger.error(f"BlockCypher error: {response.status_code}")
                return []

            data = response.json()
            txs = data.get("txs", [])

            # Parse incoming transactions (deposits to our wallet)
            deposits = []
            for tx in txs:
                tx_hash = tx.get("hash")
                confirmations = tx.get("confirmations", 0)

                for i, output in enumerate(tx.get("outputs", [])):
                    addresses = output.get("addresses", [])
                    if address in addresses:
                        amount_satoshis = output.get("value", 0)
                        amount = Decimal(amount_satoshis) / Decimal("100000000")

                        deposits.append({
                            "tx_hash": tx_hash,
                            "vout": i,
                            "amount": amount,
                            "confirmations": confirmations,
                            "timestamp": tx.get("received"),
                        })

            return deposits

    except Exception as e:
        logger.error(f"Error fetching DASH transactions: {e}")
        return []


async def get_blockchain_balance(asset: str, address: str) -> Decimal:
    """Get current blockchain balance for an address."""
    if not address:
        return Decimal("0")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if asset == "DASH":
                response = await client.get(
                    f"https://api.blockcypher.com/v1/dash/main/addrs/{address}/balance"
                )
                if response.status_code == 200:
                    data = response.json()
                    balance_satoshis = data.get("balance", 0)
                    return Decimal(balance_satoshis) / Decimal("100000000")

            elif asset == "BTC":
                response = await client.get(
                    f"https://api.blockcypher.com/v1/btc/main/addrs/{address}/balance"
                )
                if response.status_code == 200:
                    data = response.json()
                    balance_satoshis = data.get("balance", 0)
                    return Decimal(balance_satoshis) / Decimal("100000000")

            elif asset == "LTC":
                response = await client.get(
                    f"https://api.blockcypher.com/v1/ltc/main/addrs/{address}/balance"
                )
                if response.status_code == 200:
                    data = response.json()
                    balance_satoshis = data.get("balance", 0)
                    return Decimal(balance_satoshis) / Decimal("100000000")

    except Exception as e:
        logger.error(f"Error fetching {asset} balance: {e}")

    return Decimal("0")


async def reconcile_asset(
    asset: str,
    address: str,
    fix: bool = False,
    dry_run: bool = False,
    user_telegram_id: int = None,
) -> dict:
    """Reconcile a single asset's hot wallet.

    Returns:
        Dict with reconciliation results
    """
    logger.info(f"Reconciling {asset} at {address}")

    result = {
        "asset": asset,
        "address": address,
        "blockchain_balance": Decimal("0"),
        "database_balance": Decimal("0"),
        "discrepancy": Decimal("0"),
        "missing_deposits": [],
        "fixed": False,
    }

    # Get blockchain balance
    blockchain_balance = await get_blockchain_balance(asset, address)
    result["blockchain_balance"] = blockchain_balance
    logger.info(f"  Blockchain balance: {blockchain_balance} {asset}")

    # Get transactions
    if asset == "DASH":
        deposits = await get_dash_transactions(address)
        logger.info(f"  Found {len(deposits)} incoming transactions")

        for dep in deposits:
            logger.info(f"    - {dep['tx_hash'][:16]}... : {dep['amount']} {asset} ({dep['confirmations']} confs)")

    # Check database
    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get or create user if telegram_id provided
        if user_telegram_id:
            user = await repo.get_or_create_user(telegram_id=user_telegram_id)

            # Get user's balance for this asset
            balance = await repo.get_balance(user.id, asset)
            db_balance = balance.amount if balance else Decimal("0")
            result["database_balance"] = db_balance
            logger.info(f"  Database balance (user {user_telegram_id}): {db_balance} {asset}")

            # Check for missing deposits (not in processed_transactions)
            if asset == "DASH" and deposits:
                for dep in deposits:
                    # Check if this tx is already processed
                    existing = await repo.get_processed_transaction(asset, dep["tx_hash"], dep["vout"])

                    if not existing and dep["confirmations"] >= 1:
                        result["missing_deposits"].append(dep)
                        logger.warning(f"  MISSING: {dep['tx_hash'][:16]}... ({dep['amount']} {asset})")

            # Calculate discrepancy
            total_missing = sum(d["amount"] for d in result["missing_deposits"])
            result["discrepancy"] = total_missing

            # Fix if requested
            if fix and not dry_run and result["missing_deposits"]:
                logger.info(f"  Fixing {len(result['missing_deposits'])} missing deposits...")

                for dep in result["missing_deposits"]:
                    # Credit the balance
                    await repo.credit_balance(
                        user_id=user.id,
                        asset=asset,
                        amount=dep["amount"],
                    )

                    # Record in processed transactions
                    await repo.record_processed_transaction(
                        chain=asset,
                        tx_hash=dep["tx_hash"],
                        tx_index=dep["vout"],
                        source="reconciliation",
                        amount=dep["amount"],
                        to_address=address,
                    )

                    # Add audit log
                    await repo.add_audit_log(
                        user_id=user.id,
                        asset=asset,
                        log_type=AuditLogType.RECONCILIATION,
                        amount=dep["amount"],
                        balance_before=db_balance,
                        balance_after=db_balance + dep["amount"],
                        description=f"Reconciliation: recovered deposit from {dep['tx_hash'][:16]}...",
                        tx_hash=dep["tx_hash"],
                    )

                    db_balance += dep["amount"]
                    logger.info(f"    Credited {dep['amount']} {asset} from {dep['tx_hash'][:16]}...")

                result["fixed"] = True

    return result


async def main():
    parser = argparse.ArgumentParser(description="Hot Wallet Reconciliation")
    parser.add_argument("--asset", type=str, help="Only reconcile specific asset")
    parser.add_argument("--fix", action="store_true", help="Automatically fix missing deposits")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    parser.add_argument("--user", type=int, default=667100147, help="Telegram user ID to reconcile")

    args = parser.parse_args()

    # Initialize database
    await init_db()

    logger.info("=" * 60)
    logger.info("HOT WALLET RECONCILIATION")
    logger.info("=" * 60)

    if args.dry_run:
        logger.info("DRY RUN MODE - No changes will be made")

    results = []

    assets_to_check = [args.asset.upper()] if args.asset else list(HOT_WALLETS.keys())

    for asset in assets_to_check:
        address = HOT_WALLETS.get(asset)
        if not address:
            logger.warning(f"No hot wallet address configured for {asset}")
            continue

        result = await reconcile_asset(
            asset=asset,
            address=address,
            fix=args.fix,
            dry_run=args.dry_run,
            user_telegram_id=args.user,
        )
        results.append(result)

    # Summary
    logger.info("=" * 60)
    logger.info("SUMMARY")
    logger.info("=" * 60)

    for r in results:
        status = "OK" if not r["missing_deposits"] else "DISCREPANCY"
        if r["fixed"]:
            status = "FIXED"

        logger.info(f"{r['asset']}: {status}")
        logger.info(f"  Blockchain: {r['blockchain_balance']}")
        logger.info(f"  Database:   {r['database_balance']}")
        if r["missing_deposits"]:
            logger.info(f"  Missing:    {len(r['missing_deposits'])} deposits ({r['discrepancy']} {r['asset']})")

    # Return summary
    return results


if __name__ == "__main__":
    asyncio.run(main())
