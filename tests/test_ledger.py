"""Tests for the ledger module."""

from decimal import Decimal

import pytest

from swaperex.ledger.models import DepositStatus, SwapStatus
from swaperex.ledger.repository import LedgerRepository


class TestUserOperations:
    """Tests for user operations."""

    @pytest.mark.asyncio
    async def test_create_user(self, ledger_repo: LedgerRepository, db_session):
        """Test user creation."""
        user = await ledger_repo.get_or_create_user(
            telegram_id=123456789,
            username="testuser",
            first_name="Test",
        )
        await db_session.commit()

        assert user.id is not None
        assert user.telegram_id == 123456789
        assert user.username == "testuser"
        assert user.first_name == "Test"

    @pytest.mark.asyncio
    async def test_get_existing_user(self, ledger_repo: LedgerRepository, db_session):
        """Test retrieving existing user."""
        # Create user
        user1 = await ledger_repo.get_or_create_user(telegram_id=111111)
        await db_session.commit()

        # Get same user
        user2 = await ledger_repo.get_or_create_user(telegram_id=111111)

        assert user1.id == user2.id


class TestBalanceOperations:
    """Tests for balance operations."""

    @pytest.mark.asyncio
    async def test_credit_balance(self, ledger_repo: LedgerRepository, db_session):
        """Test crediting balance."""
        user = await ledger_repo.get_or_create_user(telegram_id=222222)
        await db_session.flush()

        balance = await ledger_repo.credit_balance(user.id, "BTC", Decimal("1.5"))
        await db_session.commit()

        assert balance.amount == Decimal("1.5")
        assert balance.asset == "BTC"

    @pytest.mark.asyncio
    async def test_debit_balance(self, ledger_repo: LedgerRepository, db_session):
        """Test debiting balance."""
        user = await ledger_repo.get_or_create_user(telegram_id=333333)
        await db_session.flush()

        # Credit first
        await ledger_repo.credit_balance(user.id, "ETH", Decimal("2.0"))
        await db_session.flush()

        # Debit
        balance = await ledger_repo.debit_balance(user.id, "ETH", Decimal("0.5"))
        await db_session.commit()

        assert balance.amount == Decimal("1.5")

    @pytest.mark.asyncio
    async def test_insufficient_balance(self, ledger_repo: LedgerRepository, db_session):
        """Test debit with insufficient balance raises error."""
        user = await ledger_repo.get_or_create_user(telegram_id=444444)
        await db_session.flush()

        await ledger_repo.credit_balance(user.id, "BTC", Decimal("0.1"))
        await db_session.flush()

        with pytest.raises(ValueError, match="Insufficient balance"):
            await ledger_repo.debit_balance(user.id, "BTC", Decimal("1.0"))

    @pytest.mark.asyncio
    async def test_lock_unlock_balance(self, ledger_repo: LedgerRepository, db_session):
        """Test locking and unlocking balance."""
        user = await ledger_repo.get_or_create_user(telegram_id=555555)
        await db_session.flush()

        await ledger_repo.credit_balance(user.id, "USDT", Decimal("100"))
        await db_session.flush()

        # Lock some
        balance = await ledger_repo.lock_balance(user.id, "USDT", Decimal("30"))
        assert balance.locked_amount == Decimal("30")
        assert balance.available == Decimal("70")

        # Unlock
        balance = await ledger_repo.unlock_balance(user.id, "USDT", Decimal("30"))
        await db_session.commit()
        assert balance.locked_amount == Decimal("0")
        assert balance.available == Decimal("100")


class TestDepositOperations:
    """Tests for deposit operations."""

    @pytest.mark.asyncio
    async def test_create_deposit_address(self, ledger_repo: LedgerRepository, db_session):
        """Test creating unique deposit address."""
        user = await ledger_repo.get_or_create_user(telegram_id=666666)
        await db_session.flush()

        addr = await ledger_repo.get_or_create_deposit_address(user.id, "BTC")
        await db_session.commit()

        assert addr.address is not None
        assert addr.asset == "BTC"
        assert len(addr.address) > 10

    @pytest.mark.asyncio
    async def test_deposit_address_is_unique_per_asset(
        self, ledger_repo: LedgerRepository, db_session
    ):
        """Test different assets get different addresses."""
        user = await ledger_repo.get_or_create_user(telegram_id=777777)
        await db_session.flush()

        btc_addr = await ledger_repo.get_or_create_deposit_address(user.id, "BTC")
        eth_addr = await ledger_repo.get_or_create_deposit_address(user.id, "ETH")
        await db_session.commit()

        assert btc_addr.address != eth_addr.address

    @pytest.mark.asyncio
    async def test_confirm_deposit_credits_balance(
        self, ledger_repo: LedgerRepository, db_session
    ):
        """Test confirming deposit credits user balance."""
        user = await ledger_repo.get_or_create_user(telegram_id=888888)
        await db_session.flush()

        addr = await ledger_repo.get_or_create_deposit_address(user.id, "BTC")
        await db_session.flush()

        deposit = await ledger_repo.create_deposit(
            user_id=user.id,
            asset="BTC",
            amount=Decimal("0.5"),
            to_address=addr.address,
            tx_hash="abc123",
        )
        await db_session.flush()

        # Confirm deposit
        await ledger_repo.confirm_deposit(deposit.id)
        await db_session.commit()

        # Check balance
        balance = await ledger_repo.get_balance(user.id, "BTC")
        assert balance.amount == Decimal("0.5")


class TestSwapOperations:
    """Tests for swap operations."""

    @pytest.mark.asyncio
    async def test_create_swap_locks_balance(self, ledger_repo: LedgerRepository, db_session):
        """Test creating swap locks the from_amount."""
        user = await ledger_repo.get_or_create_user(telegram_id=999999)
        await db_session.flush()

        await ledger_repo.credit_balance(user.id, "ETH", Decimal("2.0"))
        await db_session.flush()

        swap = await ledger_repo.create_swap(
            user_id=user.id,
            from_asset="ETH",
            to_asset="BTC",
            from_amount=Decimal("1.0"),
            expected_to_amount=Decimal("0.05"),
            route="dry_run",
            fee_asset="USD",
            fee_amount=Decimal("0.50"),
        )
        await db_session.commit()

        balance = await ledger_repo.get_balance(user.id, "ETH")
        assert balance.locked_amount == Decimal("1.0")
        assert balance.available == Decimal("1.0")
        assert swap.status == SwapStatus.PENDING

    @pytest.mark.asyncio
    async def test_complete_swap(self, ledger_repo: LedgerRepository, db_session):
        """Test completing swap updates balances correctly."""
        user = await ledger_repo.get_or_create_user(telegram_id=1010101)
        await db_session.flush()

        await ledger_repo.credit_balance(user.id, "USDT", Decimal("100"))
        await db_session.flush()

        swap = await ledger_repo.create_swap(
            user_id=user.id,
            from_asset="USDT",
            to_asset="ETH",
            from_amount=Decimal("50"),
            expected_to_amount=Decimal("0.015"),
            route="dry_run",
            fee_asset="USD",
            fee_amount=Decimal("0.25"),
        )
        await db_session.flush()

        # Complete swap
        completed = await ledger_repo.complete_swap(swap.id, Decimal("0.014"))
        await db_session.commit()

        assert completed.status == SwapStatus.COMPLETED
        assert completed.to_amount == Decimal("0.014")

        # Check balances
        usdt_balance = await ledger_repo.get_balance(user.id, "USDT")
        eth_balance = await ledger_repo.get_balance(user.id, "ETH")

        assert usdt_balance.amount == Decimal("50")  # 100 - 50
        assert eth_balance.amount == Decimal("0.014")

    @pytest.mark.asyncio
    async def test_fail_swap_unlocks_balance(self, ledger_repo: LedgerRepository, db_session):
        """Test failing swap unlocks the balance."""
        user = await ledger_repo.get_or_create_user(telegram_id=1111111)
        await db_session.flush()

        await ledger_repo.credit_balance(user.id, "BTC", Decimal("1.0"))
        await db_session.flush()

        swap = await ledger_repo.create_swap(
            user_id=user.id,
            from_asset="BTC",
            to_asset="ETH",
            from_amount=Decimal("0.5"),
            expected_to_amount=Decimal("8.0"),
            route="dry_run",
            fee_asset="USD",
            fee_amount=Decimal("1.00"),
        )
        await db_session.flush()

        # Fail swap
        failed = await ledger_repo.fail_swap(swap.id, "Simulated failure")
        await db_session.commit()

        assert failed.status == SwapStatus.FAILED

        # Balance should be unlocked
        balance = await ledger_repo.get_balance(user.id, "BTC")
        assert balance.locked_amount == Decimal("0")
        assert balance.available == Decimal("1.0")
