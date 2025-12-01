#!/usr/bin/env python3
"""Database migration script - creates all tables."""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from swaperex.ledger.database import init_db, close_db
from swaperex.config import get_settings


async def main():
    """Run database migrations."""
    settings = get_settings()

    print(f"Database URL: {settings.database_url}")
    print("Creating database tables...")

    try:
        await init_db()
        print("Database tables created successfully!")
    except Exception as e:
        print(f"Error creating tables: {e}")
        raise
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
