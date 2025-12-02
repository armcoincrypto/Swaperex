"""Withdrawal handlers with fee estimation."""

import secrets
from decimal import Decimal, InvalidOperation

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

from swaperex.bot.keyboards import withdraw_asset_keyboard, confirm_withdraw_keyboard
from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.withdrawal.factory import get_withdrawal_handler, get_supported_withdrawal_assets

router = Router()


class WithdrawStates(StatesGroup):
    """FSM states for withdrawal flow."""

    selecting_asset = State()
    entering_address = State()
    entering_amount = State()
    confirming = State()


@router.message(Command("withdraw"))
@router.message(F.text == "📤 Withdraw")
async def cmd_withdraw(message: Message, state: FSMContext) -> None:
    """Start withdrawal flow."""
    await state.clear()
    await state.set_state(WithdrawStates.selecting_asset)

    text = """Withdraw Crypto

Select the asset you want to withdraw:"""

    await message.answer(text, reply_markup=withdraw_asset_keyboard())


@router.callback_query(WithdrawStates.selecting_asset, F.data.startswith("withdraw:"))
async def handle_withdraw_asset(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle asset selection for withdrawal."""
    if not callback.data or not callback.from_user:
        return

    asset = callback.data.split(":")[1]

    # Check if user has balance
    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(telegram_id=callback.from_user.id)
        balance = await repo.get_balance(user.id, asset)

        available = balance.available if balance else Decimal("0")

        if available <= 0:
            await callback.message.edit_text(
                f"Insufficient {asset} balance.\n\n"
                f"You have {available:.8f} {asset} available.\n\n"
                f"Use /deposit to add funds."
            )
            await state.clear()
            await callback.answer()
            return

    await state.update_data(asset=asset, available=str(available))
    await state.set_state(WithdrawStates.entering_address)

    # Get address format hint based on asset
    if asset == "BTC":
        hint = "Example: bc1q... or 1A1zP1..."
    elif asset in ("ETH", "USDT-ERC20", "USDC"):
        hint = "Example: 0x..."
    elif asset in ("TRX", "USDT-TRC20"):
        hint = "Example: T..."
    else:
        hint = ""

    text = f"""Withdraw {asset}

Available: {available:.8f} {asset}

Enter the destination address:

{hint}"""

    await callback.message.edit_text(text)
    await callback.answer()


@router.message(WithdrawStates.entering_address)
async def handle_withdraw_address(message: Message, state: FSMContext) -> None:
    """Handle destination address input."""
    if not message.text:
        return

    address = message.text.strip()
    data = await state.get_data()
    asset = data.get("asset")
    available = data.get("available", "0")

    # Validate address format
    handler = get_withdrawal_handler(asset)
    if handler:
        is_valid = await handler.validate_address(address)
        if not is_valid:
            await message.answer(
                f"Invalid {asset} address format.\n\n"
                "Please enter a valid address:"
            )
            return

    await state.update_data(destination=address)
    await state.set_state(WithdrawStates.entering_amount)

    text = f"""Withdraw {asset}

Destination: {address[:10]}...{address[-6:]}

Available: {available} {asset}

Enter the amount to withdraw:

Example: 0.1
Or type 'max' for full balance"""

    await message.answer(text)


@router.message(WithdrawStates.entering_amount)
async def handle_withdraw_amount(message: Message, state: FSMContext) -> None:
    """Handle amount input and show fee estimate."""
    if not message.text or not message.from_user:
        return

    data = await state.get_data()
    asset = data.get("asset")
    destination = data.get("destination")
    available = Decimal(data.get("available", "0"))

    # Parse amount
    amount_text = message.text.strip().lower()
    if amount_text == "max":
        amount = available
    else:
        try:
            amount = Decimal(amount_text)
            if amount <= 0:
                raise ValueError("Amount must be positive")
        except (InvalidOperation, ValueError):
            await message.answer("Please enter a valid positive number or 'max'.")
            return

    if amount > available:
        await message.answer(
            f"Insufficient balance.\n\n"
            f"You have {available:.8f} {asset} available.\n"
            f"You tried to withdraw {amount:.8f} {asset}."
        )
        return

    # Get fee estimate
    handler = get_withdrawal_handler(asset)
    if handler:
        fee_estimate = await handler.estimate_fee(amount, destination)
        network_fee = fee_estimate.network_fee
        total_fee = fee_estimate.total_fee
        fee_asset = fee_estimate.fee_asset
        estimated_time = fee_estimate.estimated_time
    else:
        network_fee = Decimal("0.0001")
        total_fee = network_fee
        fee_asset = asset
        estimated_time = "~10 minutes"

    # Check if user can cover fees (for same-asset fees)
    if fee_asset == asset:
        total_needed = amount + total_fee
        if total_needed > available:
            max_sendable = available - total_fee
            if max_sendable <= 0:
                await message.answer(
                    f"Insufficient balance to cover network fees.\n\n"
                    f"Network fee: {total_fee:.8f} {fee_asset}\n"
                    f"Your balance: {available:.8f} {asset}"
                )
                return
            await message.answer(
                f"Amount too high after fees.\n\n"
                f"Network fee: {total_fee:.8f} {fee_asset}\n"
                f"Maximum you can send: {max_sendable:.8f} {asset}\n\n"
                f"Enter a lower amount or type 'max':"
            )
            return

    # Generate withdrawal ID for confirmation
    withdraw_id = secrets.token_hex(8)

    await state.update_data(
        amount=str(amount),
        network_fee=str(network_fee),
        total_fee=str(total_fee),
        fee_asset=fee_asset,
        estimated_time=estimated_time,
        withdraw_id=withdraw_id,
    )
    await state.set_state(WithdrawStates.confirming)

    # Calculate receive amount
    if fee_asset == asset:
        receive_amount = amount
        deducted = amount + total_fee
    else:
        receive_amount = amount
        deducted = amount

    settings = get_settings()
    poc_note = "\n(Simulated - PoC mode)" if settings.dry_run else ""

    text = f"""Confirm Withdrawal

Asset: {asset}
Amount: {amount:.8f} {asset}
Destination: {destination[:10]}...{destination[-6:]}

Network Fee: {network_fee:.8f} {fee_asset}
Estimated Time: {estimated_time}

Recipient receives: {receive_amount:.8f} {asset}
Deducted from balance: {deducted:.8f} {asset}
{poc_note}

Confirm this withdrawal?"""

    await message.answer(text, reply_markup=confirm_withdraw_keyboard(withdraw_id))


@router.callback_query(WithdrawStates.confirming, F.data.startswith("confirm_withdraw:"))
async def handle_confirm_withdraw(callback: CallbackQuery, state: FSMContext) -> None:
    """Execute the confirmed withdrawal."""
    if not callback.from_user or not callback.data:
        return

    # Verify withdraw_id matches
    withdraw_id = callback.data.split(":")[1]
    data = await state.get_data()

    if data.get("withdraw_id") != withdraw_id:
        await callback.message.edit_text("Withdrawal expired. Please start again with /withdraw")
        await state.clear()
        await callback.answer()
        return

    asset = data.get("asset")
    destination = data.get("destination")
    amount = Decimal(data.get("amount", "0"))
    total_fee = Decimal(data.get("total_fee", "0"))
    fee_asset = data.get("fee_asset")

    settings = get_settings()

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(telegram_id=callback.from_user.id)

        # Deduct from balance
        deduct_amount = amount
        if fee_asset == asset:
            deduct_amount = amount + total_fee

        try:
            # In PoC mode, we simulate the withdrawal
            if settings.dry_run:
                # Deduct balance
                await repo.update_balance(user.id, asset, -deduct_amount)
                txid = f"sim_{secrets.token_hex(32)}"

                text = f"""Withdrawal Submitted!

Asset: {asset}
Amount: {amount:.8f}
To: {destination[:10]}...{destination[-6:]}

TXID: {txid[:20]}...

Status: Pending (simulated)

Use /wallet to check your balance.

(Simulated withdrawal - PoC mode)"""

            else:
                # Real withdrawal would require private key from secure storage
                # For now, still simulate but mark as not dry-run ready
                await repo.update_balance(user.id, asset, -deduct_amount)
                txid = f"pending_{secrets.token_hex(16)}"

                text = f"""Withdrawal Queued!

Asset: {asset}
Amount: {amount:.8f}
To: {destination[:10]}...{destination[-6:]}

Reference: {txid}

Status: Queued for processing

Note: Real withdrawals require HSM integration.
Balance has been deducted.

Use /wallet to check your balance."""

        except ValueError as e:
            text = f"Withdrawal Failed\n\n{str(e)}"

    await callback.message.edit_text(text)
    await state.clear()
    await callback.answer()


@router.callback_query(F.data == "cancel_withdraw")
async def handle_cancel_withdraw(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel withdrawal flow."""
    await state.clear()
    await callback.message.edit_text("Withdrawal cancelled.")
    await callback.answer()


@router.callback_query(WithdrawStates.selecting_asset, F.data == "cancel")
async def handle_cancel_selection(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel during selection."""
    await state.clear()
    await callback.message.edit_text("Withdrawal cancelled.")
    await callback.answer()
