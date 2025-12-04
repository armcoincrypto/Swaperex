#!/usr/bin/env python3
"""Alembic Database Migration Helper.

Safely runs Alembic migrations with automatic backup.

Usage:
    python scripts/alembic_migrate.py upgrade head    # Upgrade to latest
    python scripts/alembic_migrate.py upgrade +1      # Upgrade one version
    python scripts/alembic_migrate.py downgrade -1    # Downgrade one version
    python scripts/alembic_migrate.py history         # Show migration history
    python scripts/alembic_migrate.py current         # Show current version
    python scripts/alembic_migrate.py generate "Add new table"  # Generate new migration

Always creates a backup before upgrading.
"""

import subprocess
import sys
from pathlib import Path

# Ensure we're in the project root
PROJECT_ROOT = Path(__file__).parent.parent


def run_alembic(*args):
    """Run an alembic command."""
    cmd = ["alembic"] + list(args)
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)
    return result.returncode


def create_backup():
    """Create backup before migration."""
    # Import backup module
    sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
    from backup import backup_before_migration
    return backup_before_migration()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    args = sys.argv[2:]

    if command == "upgrade":
        # Always backup before upgrade
        print("Creating backup before migration...")
        backup_path = create_backup()
        if backup_path:
            print(f"Backup created: {backup_path}")
        else:
            print("No existing database to backup (fresh install)")

        # Run upgrade
        target = args[0] if args else "head"
        return run_alembic("upgrade", target)

    elif command == "downgrade":
        # Always backup before downgrade
        print("Creating backup before downgrade...")
        create_backup()

        target = args[0] if args else "-1"
        return run_alembic("downgrade", target)

    elif command == "history":
        return run_alembic("history", "--verbose")

    elif command == "current":
        return run_alembic("current")

    elif command == "generate":
        if not args:
            print("Usage: alembic_migrate.py generate 'Migration message'")
            sys.exit(1)

        message = " ".join(args)
        return run_alembic("revision", "--autogenerate", "-m", message)

    elif command == "heads":
        return run_alembic("heads")

    elif command == "stamp":
        # Stamp the database with a specific revision without running migrations
        target = args[0] if args else "head"
        return run_alembic("stamp", target)

    else:
        # Pass through to alembic
        return run_alembic(command, *args)


if __name__ == "__main__":
    sys.exit(main() or 0)
