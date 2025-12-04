#!/usr/bin/env python3
"""Quick script to credit user balance directly."""

import asyncio
import sys
from decimal import Decimal

# Add src to path
sys.path.insert(0, "src")

from swaperex.ledger.database import init_db, get_db
from swaperex.ledger.repository import LedgerRepository


async def credit_balance(telegram_id: int, asset: str, amount: str):
    """Credit balance to a user."""
    await init_db()

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get or create user
        user = await repo.get_or_create_user(telegram_id=telegram_id)
        print(f"User: {user.id} (telegram_id: {telegram_id})")

        # Credit balance directly
        balance = await repo.update_balance(
            user_id=user.id,
            asset=asset.upper(),
            delta=Decimal(amount)
        )

        print(f"✅ Credited {amount} {asset.upper()}")
        print(f"New balance: {balance.amount} {asset.upper()}")


if __name__ == "__main__":
    # Default: credit 0.06 DASH to user 667100147
    telegram_id = int(sys.argv[1]) if len(sys.argv) > 1 else 667100147
    asset = sys.argv[2] if len(sys.argv) > 2 else "DASH"
    amount = sys.argv[3] if len(sys.argv) > 3 else "0.06"

    print(f"Crediting {amount} {asset} to telegram_id {telegram_id}...")
    asyncio.run(credit_balance(telegram_id, asset, amount))
