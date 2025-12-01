"""Wallet and balance handlers."""

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery

from swaperex.bot.keyboards import deposit_asset_keyboard, back_keyboard
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository

router = Router()


@router.message(Command("wallet"))
@router.message(F.text == "💰 Wallet")
async def cmd_wallet(message: Message) -> None:
    """Show user wallet balances."""
    if not message.from_user:
        return

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )
        balances = await repo.get_all_balances(user.id)

    if not balances:
        text = """
**Your Wallet**

No balances yet.

Use /deposit to add funds!
"""
    else:
        lines = ["**Your Wallet**\n"]
        for bal in balances:
            available = bal.available
            locked = bal.locked_amount
            line = f"**{bal.asset}**: {available:.8f}"
            if locked > 0:
                line += f" (🔒 {locked:.8f} locked)"
            lines.append(line)

        text = "\n".join(lines)

    await message.answer(text, parse_mode="Markdown")


@router.message(Command("deposit"))
@router.message(F.text == "📥 Deposit")
async def cmd_deposit(message: Message) -> None:
    """Show deposit options."""
    text = """
**Deposit Crypto**

Select the asset you want to deposit:
"""

    await message.answer(
        text,
        reply_markup=deposit_asset_keyboard(),
        parse_mode="Markdown",
    )


@router.callback_query(F.data.startswith("deposit:"))
async def handle_deposit_asset(callback: CallbackQuery) -> None:
    """Handle deposit asset selection."""
    if not callback.data or not callback.from_user:
        return

    asset = callback.data.split(":")[1]

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            first_name=callback.from_user.first_name,
        )
        addr = await repo.get_or_create_deposit_address(user.id, asset)

    text = f"""
**Deposit {asset}**

Send {asset} to this address:

`{addr.address}`

Tap to copy.

**Important:**
- Only send {asset} to this address
- Minimum confirmations: varies by asset
- Deposits are credited automatically

_This is a PoC - simulated addresses only_
"""

    await callback.message.edit_text(
        text,
        reply_markup=back_keyboard("deposit_back"),
        parse_mode="Markdown",
    )
    await callback.answer()


@router.callback_query(F.data == "deposit_back")
async def handle_deposit_back(callback: CallbackQuery) -> None:
    """Go back to deposit asset selection."""
    text = """
**Deposit Crypto**

Select the asset you want to deposit:
"""

    await callback.message.edit_text(
        text,
        reply_markup=deposit_asset_keyboard(),
        parse_mode="Markdown",
    )
    await callback.answer()


@router.callback_query(F.data == "cancel")
async def handle_cancel(callback: CallbackQuery) -> None:
    """Handle cancel button."""
    await callback.message.edit_text("Operation cancelled.")
    await callback.answer()


@router.message(Command("history"))
@router.message(F.text == "📊 History")
async def cmd_history(message: Message) -> None:
    """Show transaction history."""
    if not message.from_user:
        return

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_user_by_telegram_id(message.from_user.id)

        if not user:
            await message.answer("No transaction history yet.")
            return

        deposits = await repo.get_user_deposits(user.id, limit=5)
        swaps = await repo.get_user_swaps(user.id, limit=5)

    lines = ["**Transaction History**\n"]

    if deposits:
        lines.append("**Recent Deposits:**")
        for d in deposits:
            status_emoji = "✅" if d.status == "confirmed" else "⏳"
            lines.append(f"{status_emoji} {d.amount:.8f} {d.asset}")

    if swaps:
        lines.append("\n**Recent Swaps:**")
        for s in swaps:
            status_emoji = "✅" if s.status == "completed" else ("❌" if s.status == "failed" else "⏳")
            lines.append(
                f"{status_emoji} {s.from_amount:.8f} {s.from_asset} → {s.to_amount or s.expected_to_amount:.8f} {s.to_asset}"
            )

    if not deposits and not swaps:
        lines.append("No transactions yet.")

    await message.answer("\n".join(lines), parse_mode="Markdown")


@router.message(F.text == "📤 Withdraw")
async def cmd_withdraw(message: Message) -> None:
    """Handle withdraw - not implemented in Stage 1."""
    text = """
**Withdraw**

Withdrawals will be available in Stage 2.

For now, this is a PoC with simulated balances.
"""

    await message.answer(text, parse_mode="Markdown")
