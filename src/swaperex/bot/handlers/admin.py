"""Admin and debug handlers."""

from decimal import Decimal

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.routing.dry_run import DryRunRouter, create_default_aggregator

router = Router()


def is_admin(user_id: int) -> bool:
    """Check if user is an admin."""
    settings = get_settings()
    return user_id in settings.admin_ids


@router.message(Command("admin"))
async def cmd_admin(message: Message) -> None:
    """Show admin commands."""
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("You are not authorized to use admin commands.")
        return

    text = """
**Admin Commands**

/admin - Show this help
/debug - Show environment info
/dryrun <from> <to> <amount> - Test swap quote
/simulate_deposit <asset> <amount> - Add test funds
/stats - Show system stats
"""

    await message.answer(text, parse_mode="Markdown")


@router.message(Command("debug"))
async def cmd_debug(message: Message) -> None:
    """Show debug/environment info (non-secret values)."""
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("You are not authorized to use admin commands.")
        return

    settings = get_settings()
    safe_config = settings.get_safe_dict()

    lines = ["**Environment Info**\n"]
    for key, value in safe_config.items():
        lines.append(f"**{key}**: `{value}`")

    await message.answer("\n".join(lines), parse_mode="Markdown")


@router.message(Command("dryrun"))
async def cmd_dryrun(message: Message) -> None:
    """Test swap quote without executing."""
    if not message.from_user:
        return

    # Parse arguments: /dryrun BTC ETH 0.1
    args = message.text.split()[1:] if message.text else []

    if len(args) != 3:
        await message.answer(
            "Usage: /dryrun <from_asset> <to_asset> <amount>\n"
            "Example: /dryrun BTC ETH 0.1"
        )
        return

    from_asset, to_asset, amount_str = args

    try:
        amount = Decimal(amount_str)
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except Exception:
        await message.answer("Invalid amount. Please enter a positive number.")
        return

    # Get quotes from all providers
    aggregator = create_default_aggregator()
    quotes = await aggregator.get_all_quotes(from_asset, to_asset, amount)

    if not quotes:
        await message.answer(
            f"No routes available for {from_asset.upper()} → {to_asset.upper()}"
        )
        return

    # Sort by best rate
    quotes.sort(key=lambda q: q.to_amount, reverse=True)

    lines = [
        f"**Dry Run Quote: {amount} {from_asset.upper()} → {to_asset.upper()}**\n",
    ]

    for i, q in enumerate(quotes):
        best = " (BEST)" if i == 0 else ""
        lines.append(
            f"**{q.provider}**{best}\n"
            f"  Output: {q.to_amount:.8f} {to_asset.upper()}\n"
            f"  Rate: 1 {from_asset.upper()} = {q.effective_rate:.8f} {to_asset.upper()}\n"
            f"  Fee: ${q.fee_amount:.2f} {q.fee_asset}\n"
            f"  Slippage: {q.slippage_percent:.2f}%\n"
            f"  Est. Time: {q.estimated_time_seconds}s\n"
            f"  Simulated: {q.is_simulated}\n"
        )

    await message.answer("\n".join(lines), parse_mode="Markdown")


@router.message(Command("simulate_deposit"))
async def cmd_simulate_deposit(message: Message) -> None:
    """Simulate a deposit for testing."""
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("You are not authorized to use admin commands.")
        return

    settings = get_settings()
    if settings.is_production:
        await message.answer("Simulated deposits are disabled in production.")
        return

    # Parse arguments: /simulate_deposit BTC 0.5
    args = message.text.split()[1:] if message.text else []

    if len(args) != 2:
        await message.answer(
            "Usage: /simulate_deposit <asset> <amount>\n"
            "Example: /simulate_deposit BTC 0.5"
        )
        return

    asset, amount_str = args

    try:
        amount = Decimal(amount_str)
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except Exception:
        await message.answer("Invalid amount. Please enter a positive number.")
        return

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get or create user
        user = await repo.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

        # Get or create deposit address
        addr = await repo.get_or_create_deposit_address(user.id, asset)

        # Create and confirm deposit
        from swaperex.ledger.models import DepositStatus

        deposit = await repo.create_deposit(
            user_id=user.id,
            asset=asset.upper(),
            amount=amount,
            to_address=addr.address,
            tx_hash=f"sim_{user.id}_{asset}_{amount}",
            status=DepositStatus.PENDING,
        )
        await repo.confirm_deposit(deposit.id)

    await message.answer(
        f"**Simulated Deposit**\n\n"
        f"Credited: {amount} {asset.upper()}\n"
        f"Deposit ID: {deposit.id}\n\n"
        f"Use /wallet to check balance.",
        parse_mode="Markdown",
    )


@router.message(Command("stats"))
async def cmd_stats(message: Message) -> None:
    """Show system statistics."""
    if not message.from_user or not is_admin(message.from_user.id):
        await message.answer("You are not authorized to use admin commands.")
        return

    async with get_db() as session:
        from sqlalchemy import func, select
        from swaperex.ledger.models import User, Deposit, Swap, Balance

        # Count users
        user_count = await session.scalar(select(func.count(User.id)))

        # Count deposits
        deposit_count = await session.scalar(select(func.count(Deposit.id)))

        # Count swaps
        swap_count = await session.scalar(select(func.count(Swap.id)))

        # Count balances
        balance_count = await session.scalar(select(func.count(Balance.id)))

    text = f"""
**System Statistics**

**Users**: {user_count or 0}
**Deposits**: {deposit_count or 0}
**Swaps**: {swap_count or 0}
**Balance Records**: {balance_count or 0}

_PoC Mode - All data is simulated_
"""

    await message.answer(text, parse_mode="Markdown")


# Public dry-run command (available to all users)
@router.message(Command("quote"))
async def cmd_quote(message: Message) -> None:
    """Get a swap quote (public command)."""
    # Parse arguments: /quote BTC ETH 0.1
    args = message.text.split()[1:] if message.text else []

    if len(args) != 3:
        await message.answer(
            "Usage: /quote <from_asset> <to_asset> <amount>\n"
            "Example: /quote BTC ETH 0.1"
        )
        return

    from_asset, to_asset, amount_str = args

    try:
        amount = Decimal(amount_str)
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except Exception:
        await message.answer("Invalid amount. Please enter a positive number.")
        return

    # Get best quote
    aggregator = create_default_aggregator()
    best_quote = await aggregator.get_best_quote(from_asset, to_asset, amount)

    if not best_quote:
        await message.answer(
            f"No routes available for {from_asset.upper()} → {to_asset.upper()}"
        )
        return

    text = f"""
**Quote: {amount} {from_asset.upper()} → {to_asset.upper()}**

**Best Route**: {best_quote.provider}
**You Receive**: {best_quote.to_amount:.8f} {to_asset.upper()}
**Rate**: 1 {from_asset.upper()} = {best_quote.effective_rate:.8f} {to_asset.upper()}
**Fee**: ${best_quote.fee_amount:.2f}
**Est. Time**: ~{best_quote.estimated_time_seconds}s

Use /swap to execute a trade.

_Simulated quote (PoC)_
"""

    await message.answer(text, parse_mode="Markdown")
