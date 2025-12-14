#!/usr/bin/env python3
"""Add tx_hash column to swaps table."""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import text
from swaperex.ledger.database import get_engine, close_db


async def main():
    """Add tx_hash column to swaps table if it doesn't exist."""
    engine = get_engine()

    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'swaps' AND column_name = 'tx_hash'
            """)
        )
        exists = result.fetchone()

        if exists:
            print("Column tx_hash already exists in swaps table")
        else:
            print("Adding tx_hash column to swaps table...")
            await conn.execute(
                text("""
                    ALTER TABLE swaps
                    ADD COLUMN tx_hash VARCHAR(255) NULL
                """)
            )
            # Add index
            await conn.execute(
                text("""
                    CREATE INDEX ix_swaps_tx_hash ON swaps (tx_hash)
                """)
            )
            print("Column tx_hash added successfully!")

    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
