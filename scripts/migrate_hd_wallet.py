#!/usr/bin/env python3
"""Migration script to add HD wallet columns to deposit_addresses table.

Run this script to update an existing database with the new HD wallet fields.

Usage:
    python scripts/migrate_hd_wallet.py
"""

import sqlite3
import sys
from pathlib import Path

# Default database path
DB_PATH = Path("data/swaperex.db")


def migrate(db_path: Path):
    """Add HD wallet columns to deposit_addresses table."""
    print(f"Migrating database: {db_path}")

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        print("Creating tables will happen automatically on first run.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check current columns
    cursor.execute("PRAGMA table_info(deposit_addresses)")
    columns = {row[1] for row in cursor.fetchall()}
    print(f"Current columns: {columns}")

    # Add missing columns
    migrations = [
        ("derivation_path", "VARCHAR(100)"),
        ("derivation_index", "INTEGER"),
        ("change", "INTEGER DEFAULT 0"),
        ("status", "VARCHAR(20) DEFAULT 'active'"),
    ]

    for col_name, col_type in migrations:
        if col_name not in columns:
            print(f"Adding column: {col_name} {col_type}")
            try:
                cursor.execute(
                    f"ALTER TABLE deposit_addresses ADD COLUMN {col_name} {col_type}"
                )
                print(f"  ✓ Added {col_name}")
            except sqlite3.OperationalError as e:
                print(f"  ✗ Error adding {col_name}: {e}")
        else:
            print(f"  - Column {col_name} already exists")

    # Create hd_wallet_state table if not exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hd_wallet_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset VARCHAR(20) NOT NULL UNIQUE,
            last_index INTEGER DEFAULT 0,
            change INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✓ hd_wallet_state table ready")

    # Create index if not exists
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_hd_wallet_state_asset
        ON hd_wallet_state (asset)
    """)
    print("✓ Index created")

    conn.commit()
    conn.close()

    print("\nMigration complete!")


if __name__ == "__main__":
    # Allow custom path as argument
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1])
    else:
        db_path = DB_PATH

    migrate(db_path)
