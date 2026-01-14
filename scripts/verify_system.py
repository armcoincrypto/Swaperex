#!/usr/bin/env python3
"""Quick verification script to test all system components."""

import asyncio
import sys
from decimal import Decimal

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
CHECK = "✓"
CROSS = "✗"
WARN = "⚠"


def print_status(name: str, success: bool, message: str = ""):
    """Print status with color."""
    if success:
        print(f"  {GREEN}{CHECK}{RESET} {name}" + (f" - {message}" if message else ""))
    else:
        print(f"  {RED}{CROSS}{RESET} {name}" + (f" - {message}" if message else ""))


def print_warning(name: str, message: str = ""):
    """Print warning."""
    print(f"  {YELLOW}{WARN}{RESET} {name}" + (f" - {message}" if message else ""))


async def test_database():
    """Test database connection and operations."""
    print("\n📦 Testing Database...")

    try:
        from swaperex.ledger.database import get_engine, init_db, close_db
        from swaperex.ledger.models import Base

        # Initialize database
        await init_db()
        print_status("Database initialized", True)

        # Test connection
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        print_status("Database connection", True)

        await close_db()
        return True
    except Exception as e:
        print_status("Database", False, str(e))
        return False


async def test_ledger_operations():
    """Test ledger repository operations."""
    print("\n💰 Testing Ledger Operations...")

    try:
        from swaperex.ledger.database import get_engine, get_session_factory, close_db
        from swaperex.ledger.models import Base
        from swaperex.ledger.repository import LedgerRepository

        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = get_session_factory()
        async with session_factory() as session:
            repo = LedgerRepository(session)

            # Create test user
            user = await repo.get_or_create_user(
                telegram_id=999999999,
                username="test_user"
            )
            print_status("Create user", True, f"ID: {user.id}")

            # Credit balance
            await repo.credit_balance(user.id, "BTC", Decimal("1.5"))
            balance = await repo.get_balance(user.id, "BTC")
            print_status("Credit balance", True, f"BTC: {balance.amount}")

            # Lock balance
            await repo.lock_balance(user.id, "BTC", Decimal("0.5"))
            balance = await repo.get_balance(user.id, "BTC")
            print_status("Lock balance", True, f"Locked: {balance.locked_amount}")

            await session.rollback()  # Don't persist test data

        await close_db()
        return True
    except Exception as e:
        print_status("Ledger operations", False, str(e))
        return False


async def test_locks():
    """Test concurrency locks."""
    print("\n🔒 Testing Concurrency Locks...")

    try:
        from swaperex.utils.locks import (
            UserBalanceLock, get_user_lock, clear_user_locks
        )

        clear_user_locks()

        # Test lock creation
        lock = await get_user_lock(1)
        print_status("Create user lock", True)

        # Test lock acquisition
        async with UserBalanceLock(1, timeout=5.0, operation="test"):
            print_status("Acquire lock", True)

        print_status("Release lock", True)

        clear_user_locks()
        return True
    except Exception as e:
        print_status("Locks", False, str(e))
        return False


async def test_notifications():
    """Test notification system."""
    print("\n🔔 Testing Notifications...")

    try:
        from swaperex.notifications.telegram import TelegramNotifier
        from unittest.mock import AsyncMock

        # Create notifier with mock bot
        mock_bot = AsyncMock()
        mock_bot.send_message = AsyncMock(return_value=True)

        notifier = TelegramNotifier(bot=mock_bot)

        # Test deposit notification
        result = await notifier.notify_deposit_confirmed(
            telegram_id=123456789,
            asset="BTC",
            amount=Decimal("0.5"),
        )
        print_status("Deposit notification format", result)

        # Test swap notification
        result = await notifier.notify_swap_complete(
            telegram_id=123456789,
            from_asset="ETH",
            to_asset="USDT",
            from_amount=Decimal("1.0"),
            to_amount=Decimal("3500.0"),
            provider="test",
        )
        print_status("Swap notification format", result)

        return True
    except Exception as e:
        print_status("Notifications", False, str(e))
        return False


def test_hd_wallet():
    """Test HD wallet factory."""
    print("\n🔑 Testing HD Wallet...")

    try:
        from swaperex.hdwallet.factory import get_supported_assets, WALLET_CLASSES
        from swaperex.hdwallet.base import SimulatedHDWallet

        # Test supported assets
        assets = get_supported_assets()
        print_status("Supported assets", len(assets) > 50, f"{len(assets)} assets")

        # Test wallet classes mapping
        assert WALLET_CLASSES["BTC"].__name__ == "BTCHDWallet"
        assert WALLET_CLASSES["ETH"].__name__ == "ETHHDWallet"
        print_status("Wallet class mapping", True)

        # Test simulated wallet
        wallet = SimulatedHDWallet("TEST", testnet=False)
        addr1 = wallet.derive_address(0)
        addr2 = wallet.derive_address(1)
        print_status("Address derivation", addr1.address != addr2.address)

        return True
    except Exception as e:
        print_status("HD Wallet", False, str(e))
        return False


async def test_routing():
    """Test swap routing."""
    print("\n🔄 Testing Routing...")

    try:
        from swaperex.routing.dry_run import DryRunRouter

        router = DryRunRouter()

        # Test quote
        quote = await router.get_quote(
            from_asset="BTC",
            to_asset="ETH",
            amount=Decimal("1.0"),
        )
        print_status("Get quote BTC→ETH", quote is not None, f"Rate: {quote.to_amount:.4f} ETH")

        # Test another pair
        quote = await router.get_quote(
            from_asset="ETH",
            to_asset="USDT",
            amount=Decimal("1.0"),
        )
        print_status("Get quote ETH→USDT", quote is not None, f"Rate: {quote.to_amount:.2f} USDT")

        return True
    except Exception as e:
        print_status("Routing", False, str(e))
        return False


def test_config():
    """Test configuration."""
    print("\n⚙️ Testing Configuration...")

    try:
        from swaperex.config import get_settings

        settings = get_settings()

        print_status("Load settings", True)
        print_status("Database URL", bool(settings.database_url),
                    settings.database_url[:30] + "..." if len(settings.database_url) > 30 else settings.database_url)

        if settings.telegram_bot_token:
            print_status("Telegram token", True, "[CONFIGURED]")
        else:
            print_warning("Telegram token", "Not configured")

        return True
    except Exception as e:
        print_status("Configuration", False, str(e))
        return False


def test_imports():
    """Test all critical imports."""
    print("\n📚 Testing Critical Imports...")

    modules = [
        ("swaperex.main", "Main application"),
        ("swaperex.bot.bot", "Telegram bot"),
        ("swaperex.api.app", "FastAPI application"),
        ("swaperex.ledger.models", "Database models"),
        ("swaperex.ledger.repository", "Ledger repository"),
        ("swaperex.routing.base", "Routing base"),
        ("swaperex.notifications.telegram", "Notifications"),
        ("swaperex.utils.locks", "Concurrency locks"),
        ("swaperex.hdwallet.factory", "HD Wallet factory"),
    ]

    all_ok = True
    for module, name in modules:
        try:
            __import__(module)
            print_status(name, True)
        except Exception as e:
            print_status(name, False, str(e)[:50])
            all_ok = False

    return all_ok


async def main():
    """Run all verification tests."""
    print("=" * 60)
    print("     SWAPEREX SYSTEM VERIFICATION")
    print("=" * 60)

    results = {}

    # Run tests
    results["imports"] = test_imports()
    results["config"] = test_config()
    results["database"] = await test_database()
    results["ledger"] = await test_ledger_operations()
    results["locks"] = await test_locks()
    results["notifications"] = await test_notifications()
    results["hd_wallet"] = test_hd_wallet()
    results["routing"] = await test_routing()

    # Summary
    print("\n" + "=" * 60)
    print("     SUMMARY")
    print("=" * 60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, success in results.items():
        status = f"{GREEN}{CHECK}{RESET}" if success else f"{RED}{CROSS}{RESET}"
        print(f"  {status} {name.replace('_', ' ').title()}")

    print()
    if passed == total:
        print(f"  {GREEN}All {total} checks passed!{RESET}")
        return 0
    else:
        print(f"  {YELLOW}{passed}/{total} checks passed{RESET}")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
