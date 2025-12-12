"""Wallet and balance handlers."""

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from swaperex.bot.keyboards import back_keyboard, deposit_asset_keyboard
from swaperex.config import get_settings
from swaperex.hdwallet import get_hd_wallet
from swaperex.ledger.database import get_db
from swaperex.ledger.models import DepositStatus, SwapStatus
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
        text = """💰 Your Wallet

No balances yet.

Use /deposit to add funds!"""
    else:
        lines = ["💰 Your Wallet\n"]
        total_usd = 0  # Placeholder for future USD valuation
        for bal in balances:
            available = bal.available
            locked = bal.locked_amount
            line = f"  {bal.asset}: {available:.8f}"
            if locked > 0:
                line += f" (🔒 {locked:.8f})"
            lines.append(line)

        lines.append("\n💡 Use /deposit to add funds")
        text = "\n".join(lines)

    await message.answer(text)


@router.message(Command("deposit"))
@router.message(F.text == "📥 Deposit")
async def cmd_deposit(message: Message) -> None:
    """Show deposit options."""
    text = """Deposit Crypto

Select the asset you want to deposit:"""

    await message.answer(text, reply_markup=deposit_asset_keyboard())


@router.callback_query(F.data.startswith("deposit:"))
async def handle_deposit_asset(callback: CallbackQuery) -> None:
    """Handle deposit asset selection.

    Uses HD wallet for address derivation when configured,
    otherwise falls back to simulated addresses.
    """
    if not callback.data or not callback.from_user:
        return

    asset = callback.data.split(":")[1]
    settings = get_settings()

    # Get HD wallet for this asset (to check if simulated)
    hd_wallet = get_hd_wallet(asset)
    is_simulated = not hd_wallet.xpub or hd_wallet.xpub.startswith("sim_")

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            first_name=callback.from_user.first_name,
        )

        # Check if we have an existing address for this asset
        existing_addr = await repo.get_deposit_address(user.id, asset)

        # Ignore old simulated addresses
        if existing_addr and existing_addr.address.startswith("sim:"):
            existing_addr = None

        # For ERC-20 tokens, also check if user has an ETH address (same address)
        parent_chain = None
        if asset in ["USDT", "USDC", "USDT-ERC20"]:
            parent_chain = "ETH"
        elif asset == "USDT-TRC20":
            parent_chain = "TRX"

        if not existing_addr and parent_chain:
            existing_addr = await repo.get_deposit_address(user.id, parent_chain)
            # Also ignore simulated parent chain addresses
            if existing_addr and existing_addr.address.startswith("sim:"):
                existing_addr = None

        if existing_addr:
            address = existing_addr.address
            derivation_path = existing_addr.derivation_path
        else:
            # Get next available index
            index = await repo.get_next_hd_index(asset)

            # Derive address from HD wallet
            addr_info = hd_wallet.derive_address(index)
            address = addr_info.address
            derivation_path = addr_info.derivation_path

            # Store in database with derivation info
            try:
                await repo.create_deposit_address(
                    user_id=user.id,
                    asset=asset,
                    address=address,
                    derivation_path=derivation_path,
                    derivation_index=index,
                )
            except Exception as e:
                # Address may already exist for another asset (same chain)
                # Rollback and try to get existing address record
                await session.rollback()

                # Try to find existing address record
                existing = await repo.get_deposit_address_record(address)
                if existing:
                    address = existing.address
                    derivation_path = existing.derivation_path
                else:
                    # Log the error and use the derived address anyway
                    import logging
                    logging.getLogger(__name__).warning(
                        f"Failed to save deposit address for user {user.id}, asset {asset}: {e}"
                    )

    # Determine network info for tokens
    network_info = ""
    if asset == "USDT":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "USDC":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "USDT-TRC20":
        network_info = " (TRC-20 on Tron)"

    # Build message
    lines = [
        f"Deposit {asset}{network_info}",
        "",
        f"Send {asset} to this address:",
        "",
        address,
    ]

    lines.extend([
        "",
        "Important:",
        f"- Only send {asset} to this address",
        "- Minimum confirmations: varies by asset",
        "- Deposits are credited automatically",
    ])

    # Show appropriate mode indicator
    if is_simulated:
        lines.extend(["", "(Simulated address - no xpub configured)"])
    elif hd_wallet.testnet:
        lines.extend(["", "(Testnet mode)"])

    text = "\n".join(lines)
    await callback.message.edit_text(text, reply_markup=back_keyboard("deposit_back"))
    await callback.answer()


@router.callback_query(F.data == "deposit_back")
async def handle_deposit_back(callback: CallbackQuery) -> None:
    """Go back to deposit asset selection."""
    text = """Deposit Crypto

Select the asset you want to deposit:"""

    await callback.message.edit_text(text, reply_markup=deposit_asset_keyboard())
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
        withdrawals = await repo.get_user_withdrawals(user.id, limit=5)

    lines = ["📜 Transaction History\n"]

    if deposits:
        lines.append("📥 Recent Deposits:")
        for d in deposits:
            status_emoji = "✅" if d.status == DepositStatus.CONFIRMED else "⏳"
            lines.append(f"  {status_emoji} {d.amount:.8f} {d.asset}")

    if swaps:
        lines.append("\n💱 Recent Swaps:")
        for s in swaps:
            status_emoji = "✅" if s.status == SwapStatus.COMPLETED else ("❌" if s.status == SwapStatus.FAILED else "⏳")
            lines.append(
                f"  {status_emoji} {s.from_amount:.8f} {s.from_asset} → {s.to_amount or s.expected_to_amount:.8f} {s.to_asset}"
            )

    if withdrawals:
        lines.append("\n📤 Recent Withdrawals:")
        for w in withdrawals:
            from swaperex.ledger.models import WithdrawalStatus
            if w.status == WithdrawalStatus.COMPLETED:
                status_emoji = "✅"
            elif w.status == WithdrawalStatus.FAILED:
                status_emoji = "❌"
            elif w.status == WithdrawalStatus.CANCELLED:
                status_emoji = "🚫"
            else:
                status_emoji = "⏳"
            lines.append(f"  {status_emoji} {w.amount:.8f} {w.asset}")

    if not deposits and not swaps and not withdrawals:
        lines.append("No transactions yet.")

    await message.answer("\n".join(lines))


