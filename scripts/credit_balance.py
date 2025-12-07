#!/usr/bin/env python3
"""Credit balance to a user directly in database."""

import asyncio
import sys
from decimal import Decimal

# Add parent to path
sys.path.insert(0, "/home/user/Swaperex/src")

from dotenv import load_dotenv
load_dotenv()

from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository


async def credit_balance(telegram_id: int, asset: str, amount: float):
    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_user_by_telegram_id(telegram_id)
        
        if not user:
            print(f"User with telegram_id {telegram_id} not found")
            return
        
        balance = await repo.credit_balance(
            user_id=user.id,
            asset=asset.upper(),
            amount=Decimal(str(amount)),
        )
        
        print(f"Credited {amount} {asset.upper()} to user {telegram_id}")
        print(f"New balance: {balance.amount} {asset.upper()}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python credit_balance.py <telegram_id> <asset> <amount>")
        print("Example: python credit_balance.py 667100147 DASH 0.5")
        sys.exit(1)
    
    telegram_id = int(sys.argv[1])
    asset = sys.argv[2]
    amount = float(sys.argv[3])
    
    asyncio.run(credit_balance(telegram_id, asset, amount))
