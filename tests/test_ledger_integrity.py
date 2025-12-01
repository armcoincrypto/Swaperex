"""Ledger integrity tests.

These tests ensure that:
1. Balances never go negative
2. Credits and debits are consistent
3. Swaps maintain ledger consistency
4. Locked balances are handled correctly
"""

from decimal import Decimal

import pytest

from swaperex.ledger.models import SwapStatus
from swaperex.ledger.repository import LedgerRepository


@pytest.mark.asyncio
async def test_balance_cannot_go_negative(db_session):
    """Test that debit_balance raises error when insufficient funds."""
    repo = LedgerRepository(db_session)

    # Create user with zero balance
    user = await repo.get_or_create_user(
        telegram_id=12345,
        username="test_user",
    )

    # Try to debit from zero balance
    with pytest.raises(ValueError, match="Insufficient balance"):
        await repo.debit_balance(user.id, "BTC", Decimal("0.1"))


@pytest.mark.asyncio
async def test_credit_then_debit_consistent(db_session):
    """Test that credit + debit = original amount."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12346, username="test2")

    # Credit 1.5 BTC
    await repo.credit_balance(user.id, "BTC", Decimal("1.5"))
    balance = await repo.get_balance(user.id, "BTC")
    assert balance.amount == Decimal("1.5")

    # Debit 0.5 BTC
    await repo.debit_balance(user.id, "BTC", Decimal("0.5"))
    balance = await repo.get_balance(user.id, "BTC")
    assert balance.amount == Decimal("1.0")

    # Debit remaining 1.0 BTC
    await repo.debit_balance(user.id, "BTC", Decimal("1.0"))
    balance = await repo.get_balance(user.id, "BTC")
    assert balance.amount == Decimal("0")


@pytest.mark.asyncio
async def test_locked_balance_reduces_available(db_session):
    """Test that locked balance reduces available amount."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12347, username="test3")

    # Credit 2.0 ETH
    await repo.credit_balance(user.id, "ETH", Decimal("2.0"))
    balance = await repo.get_balance(user.id, "ETH")
    assert balance.amount == Decimal("2.0")
    assert balance.available == Decimal("2.0")
    assert balance.locked_amount == Decimal("0")

    # Lock 1.0 ETH
    await repo.lock_balance(user.id, "ETH", Decimal("1.0"))
    balance = await repo.get_balance(user.id, "ETH")
    assert balance.amount == Decimal("2.0")
    assert balance.available == Decimal("1.0")
    assert balance.locked_amount == Decimal("1.0")


@pytest.mark.asyncio
async def test_cannot_lock_more_than_available(db_session):
    """Test that locking more than available raises error."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12348, username="test4")

    # Credit 1.0 USDT
    await repo.credit_balance(user.id, "USDT", Decimal("1.0"))

    # Try to lock 2.0 USDT
    with pytest.raises(ValueError, match="Insufficient available balance"):
        await repo.lock_balance(user.id, "USDT", Decimal("2.0"))


@pytest.mark.asyncio
async def test_unlock_restores_available(db_session):
    """Test that unlock restores available balance."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12349, username="test5")

    # Credit and lock
    await repo.credit_balance(user.id, "BTC", Decimal("3.0"))
    await repo.lock_balance(user.id, "BTC", Decimal("2.0"))

    balance = await repo.get_balance(user.id, "BTC")
    assert balance.available == Decimal("1.0")
    assert balance.locked_amount == Decimal("2.0")

    # Unlock
    await repo.unlock_balance(user.id, "BTC", Decimal("2.0"))

    balance = await repo.get_balance(user.id, "BTC")
    assert balance.available == Decimal("3.0")
    assert balance.locked_amount == Decimal("0")


@pytest.mark.asyncio
async def test_swap_maintains_ledger_consistency(db_session):
    """Test that swap credits and debits maintain consistency."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12350, username="test6")

    # Start with 10 BTC
    await repo.credit_balance(user.id, "BTC", Decimal("10.0"))

    # Record a swap: 1 BTC -> 20 ETH
    swap = await repo.create_swap(
        user_id=user.id,
        from_asset="BTC",
        to_asset="ETH",
        from_amount=Decimal("1.0"),
        expected_to_amount=Decimal("20.0"),
        route_provider="test_router",
    )

    # Complete the swap
    await repo.complete_swap(swap.id, to_amount=Decimal("20.0"))

    # Verify balances
    btc_balance = await repo.get_balance(user.id, "BTC")
    eth_balance = await repo.get_balance(user.id, "ETH")

    assert btc_balance.amount == Decimal("9.0")  # 10 - 1
    assert eth_balance.amount == Decimal("20.0")  # 0 + 20


@pytest.mark.asyncio
async def test_failed_swap_returns_funds(db_session):
    """Test that failed swap returns locked funds."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12351, username="test7")

    # Start with 5 ETH
    await repo.credit_balance(user.id, "ETH", Decimal("5.0"))

    # Create and fail a swap
    swap = await repo.create_swap(
        user_id=user.id,
        from_asset="ETH",
        to_asset="USDT",
        from_amount=Decimal("2.0"),
        expected_to_amount=Decimal("4000.0"),
        route_provider="test_router",
    )

    # Check balance is debited but not yet credited
    eth_balance = await repo.get_balance(user.id, "ETH")
    assert eth_balance.amount == Decimal("3.0")  # 5 - 2

    # Fail the swap (should return funds)
    await repo.fail_swap(swap.id, error="Test error")

    # Verify funds are returned
    eth_balance = await repo.get_balance(user.id, "ETH")
    assert eth_balance.amount == Decimal("5.0")  # Returned

    # Verify swap status
    from sqlalchemy import select
    from swaperex.ledger.models import Swap

    result = await db_session.execute(select(Swap).where(Swap.id == swap.id))
    updated_swap = result.scalar_one()
    assert updated_swap.status == SwapStatus.FAILED


@pytest.mark.asyncio
async def test_multiple_assets_independent(db_session):
    """Test that different asset balances are independent."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12352, username="test8")

    # Credit multiple assets
    await repo.credit_balance(user.id, "BTC", Decimal("1.0"))
    await repo.credit_balance(user.id, "ETH", Decimal("10.0"))
    await repo.credit_balance(user.id, "USDT", Decimal("1000.0"))

    # Debit one asset
    await repo.debit_balance(user.id, "ETH", Decimal("5.0"))

    # Verify others are unchanged
    btc = await repo.get_balance(user.id, "BTC")
    eth = await repo.get_balance(user.id, "ETH")
    usdt = await repo.get_balance(user.id, "USDT")

    assert btc.amount == Decimal("1.0")
    assert eth.amount == Decimal("5.0")
    assert usdt.amount == Decimal("1000.0")


@pytest.mark.asyncio
async def test_deposit_credits_balance(db_session):
    """Test that confirmed deposit credits balance."""
    repo = LedgerRepository(db_session)

    user = await repo.get_or_create_user(telegram_id=12353, username="test9")

    # Create deposit address
    addr = await repo.get_or_create_deposit_address(user.id, "BTC")

    # Create deposit
    deposit = await repo.create_deposit(
        user_id=user.id,
        asset="BTC",
        amount=Decimal("0.5"),
        to_address=addr.address,
        tx_hash="test_tx_hash",
    )

    # Balance should still be 0 (unconfirmed)
    balance = await repo.get_balance(user.id, "BTC")
    assert balance is None or balance.amount == Decimal("0")

    # Confirm deposit
    await repo.confirm_deposit(deposit.id)

    # Balance should now be credited
    balance = await repo.get_balance(user.id, "BTC")
    assert balance.amount == Decimal("0.5")
