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
        # Check if column exists using SQLite PRAGMA (works for both SQLite and PostgreSQL approach)
        try:
            # Try SQLite way first
            result = await conn.execute(text("PRAGMA table_info(swaps)"))
            columns = [row[1] for row in result.fetchall()]
            exists = "tx_hash" in columns
        except Exception:
            # Fall back to PostgreSQL way
            result = await conn.execute(
                text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'swaps' AND column_name = 'tx_hash'
                """)
            )
            exists = result.fetchone() is not None

        if exists:
            print("Column tx_hash already exists in swaps table")
        else:
            print("Adding tx_hash column to swaps table...")
            await conn.execute(
                text("ALTER TABLE swaps ADD COLUMN tx_hash VARCHAR(255)")
            )
            # Add index (SQLite compatible)
            try:
                await conn.execute(
                    text("CREATE INDEX ix_swaps_tx_hash ON swaps (tx_hash)")
                )
            except Exception:
                pass  # Index might already exist
            print("Column tx_hash added successfully!")

    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
