#!/usr/bin/env python3
"""Database Backup Utility.

Creates timestamped backups of the SQLite database.
Supports automatic rotation to keep only recent backups.

Usage:
    python scripts/backup.py [--keep N]

Options:
    --keep N    Keep only N most recent backups (default: 10)
    --restore FILE  Restore from backup file
"""

import argparse
import shutil
import os
from datetime import datetime
from pathlib import Path


# Default paths
DB_PATH = Path("data/swaperex.db")
BACKUP_DIR = Path("data/backups")


def ensure_backup_dir():
    """Ensure backup directory exists."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def create_backup() -> Path:
    """Create a timestamped backup of the database.

    Returns:
        Path to the backup file
    """
    ensure_backup_dir()

    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}")
        return None

    # Create timestamped filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"swaperex_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_name

    # Copy database file
    shutil.copy2(DB_PATH, backup_path)
    print(f"Created backup: {backup_path}")

    # Also copy WAL and SHM files if they exist (SQLite journal files)
    for ext in ["-wal", "-shm"]:
        wal_path = Path(str(DB_PATH) + ext)
        if wal_path.exists():
            shutil.copy2(wal_path, backup_path.with_suffix(f".db{ext}"))

    return backup_path


def rotate_backups(keep: int = 10):
    """Remove old backups, keeping only the most recent N.

    Args:
        keep: Number of backups to keep
    """
    ensure_backup_dir()

    # Get all backup files
    backups = sorted(
        BACKUP_DIR.glob("swaperex_*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )

    # Remove old backups
    for old_backup in backups[keep:]:
        print(f"Removing old backup: {old_backup.name}")
        old_backup.unlink()

        # Also remove WAL/SHM files
        for ext in ["-wal", "-shm"]:
            wal_path = old_backup.with_suffix(f".db{ext}")
            if wal_path.exists():
                wal_path.unlink()


def list_backups():
    """List all available backups."""
    ensure_backup_dir()

    backups = sorted(
        BACKUP_DIR.glob("swaperex_*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )

    if not backups:
        print("No backups found.")
        return

    print(f"Available backups ({len(backups)} total):")
    print("-" * 60)

    for backup in backups:
        size = backup.stat().st_size / 1024 / 1024  # MB
        mtime = datetime.fromtimestamp(backup.stat().st_mtime)
        print(f"  {backup.name}  {size:.2f} MB  {mtime.strftime('%Y-%m-%d %H:%M:%S')}")


def restore_backup(backup_file: str):
    """Restore database from a backup file.

    Args:
        backup_file: Name or path of backup file
    """
    # Handle both full path and just filename
    backup_path = Path(backup_file)
    if not backup_path.exists():
        backup_path = BACKUP_DIR / backup_file

    if not backup_path.exists():
        print(f"Backup not found: {backup_file}")
        return False

    # Create a backup of current database before restoring
    if DB_PATH.exists():
        pre_restore_backup = create_backup()
        if pre_restore_backup:
            print(f"Created pre-restore backup: {pre_restore_backup.name}")

    # Restore the backup
    shutil.copy2(backup_path, DB_PATH)
    print(f"Restored database from: {backup_path.name}")

    # Also restore WAL/SHM files if they exist
    for ext in ["-wal", "-shm"]:
        wal_backup = backup_path.with_suffix(f".db{ext}")
        if wal_backup.exists():
            shutil.copy2(wal_backup, Path(str(DB_PATH) + ext))

    return True


def backup_before_migration():
    """Create a backup specifically before running migrations.

    Returns:
        Path to the backup file
    """
    ensure_backup_dir()

    if not DB_PATH.exists():
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"pre_migration_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_name

    shutil.copy2(DB_PATH, backup_path)
    print(f"Created pre-migration backup: {backup_path}")

    return backup_path


def main():
    parser = argparse.ArgumentParser(description="Database Backup Utility")
    parser.add_argument("--keep", type=int, default=10,
                       help="Keep only N most recent backups")
    parser.add_argument("--restore", type=str,
                       help="Restore from backup file")
    parser.add_argument("--list", action="store_true",
                       help="List available backups")
    parser.add_argument("--pre-migration", action="store_true",
                       help="Create pre-migration backup")

    args = parser.parse_args()

    if args.list:
        list_backups()
    elif args.restore:
        restore_backup(args.restore)
    elif args.pre_migration:
        backup_before_migration()
    else:
        # Default: create backup and rotate
        create_backup()
        rotate_backups(args.keep)
        print(f"Keeping {args.keep} most recent backups")


if __name__ == "__main__":
    main()
