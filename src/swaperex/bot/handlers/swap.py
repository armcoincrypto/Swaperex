"""Swap handlers with quote comparison and execution.

DEX routing:
- THORChain: Cross-chain swaps (BTC, LTC)
- Uniswap: Ethereum swaps (ETH, LINK, USDT-ERC20, USDC-ERC20)
- PancakeSwap: BSC swaps (BNB)
- Jupiter: Solana swaps (SOL)
- Osmosis: Cosmos swaps (ATOM)
- Minswap: Cardano swaps (ADA)
- Hyperliquid: HYPE swaps
"""

import json
import logging
from decimal import Decimal, InvalidOperation

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

from swaperex.bot.keyboards import swap_from_keyboard, swap_to_keyboard, confirm_swap_keyboard
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.swap.executor import get_swap_executor, SwapResult
from swaperex.routing.base import Quote
from swaperex.hdwallet.factory import get_hd_wallet

logger = logging.getLogger(__name__)
router = Router()


class SwapStates(StatesGroup):
    """FSM states for swap flow."""

    selecting_from = State()
    selecting_to = State()
    entering_amount = State()
    confirming = State()


def _quote_to_dict(q: Quote) -> dict:
    """Convert Quote to serializable dict."""
    return {
        "provider": q.provider,
        "from_asset": q.from_asset,
        "to_asset": q.to_asset,
        "from_amount": str(q.from_amount),
        "to_amount": str(q.to_amount),
        "fee_amount": str(q.fee_amount),
        "fee_asset": q.fee_asset,
        "slippage_percent": str(q.slippage_percent),
        "estimated_time": q.estimated_time_seconds,
        "is_simulated": q.is_simulated,
        "route_details": q.route_details,
    }


def _dict_to_quote(d: dict) -> Quote:
    """Convert dict back to Quote."""
    return Quote(
        provider=d["provider"],
        from_asset=d["from_asset"],
        to_asset=d["to_asset"],
        from_amount=Decimal(d["from_amount"]),
        to_amount=Decimal(d["to_amount"]),
        fee_amount=Decimal(d["fee_amount"]),
        fee_asset=d["fee_asset"],
        slippage_percent=Decimal(d["slippage_percent"]),
        estimated_time_seconds=d["estimated_time"],
        is_simulated=d["is_simulated"],
        route_details=d.get("route_details", {}),
    )


@router.message(Command("swap"))
@router.message(F.text == "💱 Swap")
async def cmd_swap(message: Message, state: FSMContext) -> None:
    """Start swap flow."""
    await state.clear()
    await state.set_state(SwapStates.selecting_from)

    text = """💱 Swap Coins

Select the coin you want to swap FROM:

Supported DEX routes:
• BTC, LTC → THORChain
• ETH, LINK → Uniswap
• SOL → Jupiter
• BNB → PancakeSwap
• ATOM → Osmosis
• ADA → Minswap
• HYPE → Hyperliquid"""

    await message.answer(text, reply_markup=swap_from_keyboard())


@router.callback_query(SwapStates.selecting_from, F.data.startswith("swap_from:"))
async def handle_swap_from(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle 'from' asset selection."""
    if not callback.data:
        return

    from_asset = callback.data.split(":")[1]
    await state.update_data(from_asset=from_asset)
    await state.set_state(SwapStates.selecting_to)

    text = f"""💱 Swap FROM: {from_asset}

Now select the coin you want to swap TO:"""

    await callback.message.edit_text(text, reply_markup=swap_to_keyboard(from_asset))
    await callback.answer()


@router.callback_query(SwapStates.selecting_to, F.data.startswith("swap_to:"))
async def handle_swap_to(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle 'to' asset selection."""
    if not callback.data:
        return

    to_asset = callback.data.split(":")[1]
    data = await state.get_data()
    from_asset = data.get("from_asset")

    await state.update_data(to_asset=to_asset)
    await state.set_state(SwapStates.entering_amount)

    text = f"""💱 Swap: {from_asset} → {to_asset}

Enter the amount of {from_asset} you want to swap:

Example: 0.1"""

    await callback.message.edit_text(text)
    await callback.answer()


@router.message(SwapStates.entering_amount)
async def handle_swap_amount(message: Message, state: FSMContext) -> None:
    """Handle amount input and show quote."""
    if not message.text or not message.from_user:
        return

    try:
        amount = Decimal(message.text.strip())
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except (InvalidOperation, ValueError):
        await message.answer("Please enter a valid positive number.")
        return

    data = await state.get_data()
    from_asset = data.get("from_asset")
    to_asset = data.get("to_asset")

    # Check balance
    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(telegram_id=message.from_user.id)
        balance = await repo.get_balance(user.id, from_asset)

        available = balance.available if balance else Decimal("0")

        if available < amount:
            await message.answer(
                f"⚠️ Insufficient balance!\n\n"
                f"Available: {available:.8f} {from_asset}\n"
                f"Requested: {amount:.8f} {from_asset}\n\n"
                f"Use /deposit to add funds."
            )
            return

    # Get quotes from all providers
    await message.answer("🔍 Getting quotes from DEXes...")

    executor = get_swap_executor()
    quotes = await executor.get_all_quotes(from_asset, to_asset, amount)

    if not quotes:
        await message.answer(
            f"❌ No routes available for {from_asset} → {to_asset}\n\n"
            "This pair may not be supported. Try a different combination."
        )
        await state.clear()
        return

    # Sort by best rate (highest to_amount)
    quotes.sort(key=lambda q: q.to_amount, reverse=True)
    best_quote = quotes[0]

    # Store quotes for confirmation (serialize Quote objects)
    await state.update_data(
        amount=str(amount),
        quotes=[_quote_to_dict(q) for q in quotes],
        selected_quote_index=0,
    )
    await state.set_state(SwapStates.confirming)

    # Build quote comparison text
    lines = [
        f"💱 Swap Quote: {amount} {from_asset} → {to_asset}\n",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        "📊 Available Routes:\n",
    ]

    for i, q in enumerate(quotes[:5]):  # Show top 5 quotes
        best_marker = "🏆 BEST → " if i == 0 else "         "
        sim_marker = " (simulated)" if q.is_simulated else ""
        time_str = f"{q.estimated_time_seconds // 60}m" if q.estimated_time_seconds >= 60 else f"{q.estimated_time_seconds}s"

        lines.append(
            f"{best_marker}{q.provider}{sim_marker}\n"
            f"   💰 Receive: {q.to_amount:.8f} {to_asset}\n"
            f"   💸 Fee: {q.fee_amount:.6f} {q.fee_asset}\n"
            f"   ⏱️ ~{time_str}\n"
        )

    lines.append("━━━━━━━━━━━━━━━━━━━━━━━━")

    # Show provider-specific info
    provider = best_quote.provider
    if "THORChain" in provider:
        lines.append("⚡ THORChain cross-chain swap")
        lines.append("   Sends via native protocol")
    elif provider == "Uniswap":
        lines.append("🦄 Uniswap V3 on Ethereum")
    elif provider == "PancakeSwap":
        lines.append("🥞 PancakeSwap on BSC")
    elif provider == "Jupiter":
        lines.append("🪐 Jupiter aggregator on Solana")
    elif provider == "Osmosis":
        lines.append("🌊 Osmosis on Cosmos")
    elif provider == "Minswap":
        lines.append("🔄 Minswap on Cardano")
    elif provider == "Hyperliquid":
        lines.append("⚡ Hyperliquid L1")
    elif provider == "DryRun":
        lines.append("⚠️ Test mode - simulated swap")

    await message.answer("\n".join(lines), reply_markup=confirm_swap_keyboard("best"))


@router.callback_query(SwapStates.confirming, F.data.startswith("confirm_swap:"))
async def handle_confirm_swap(callback: CallbackQuery, state: FSMContext) -> None:
    """Execute the confirmed swap."""
    if not callback.from_user:
        return

    data = await state.get_data()
    from_asset = data.get("from_asset")
    to_asset = data.get("to_asset")
    amount = Decimal(data.get("amount", "0"))
    quotes_data = data.get("quotes", [])

    if not quotes_data:
        await callback.message.edit_text("⚠️ Quote expired. Please start again with /swap")
        await state.clear()
        await callback.answer()
        return

    selected_quote_data = quotes_data[0]  # Best quote
    quote = _dict_to_quote(selected_quote_data)

    # Get user's destination address for the output asset
    wallet = get_hd_wallet(to_asset)
    dest_address_info = wallet.derive_address(0)  # User's first address
    destination_address = dest_address_info.address

    await callback.message.edit_text("⏳ Executing swap...")

    # Execute the swap
    executor = get_swap_executor()
    result = await executor.execute_swap(
        quote=quote,
        destination_address=destination_address,
        user_id=callback.from_user.id,
    )

    # Record in ledger
    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(telegram_id=callback.from_user.id)

        try:
            # Create swap record
            swap = await repo.create_swap(
                user_id=user.id,
                from_asset=from_asset,
                to_asset=to_asset,
                from_amount=amount,
                expected_to_amount=quote.to_amount,
                route=quote.provider,
                fee_asset=quote.fee_asset,
                fee_amount=quote.fee_amount,
                route_details=json.dumps(selected_quote_data),
            )

            if result.success:
                if result.status == "completed":
                    # Instant completion (dry-run or same-chain)
                    await repo.complete_swap(
                        swap.id,
                        actual_to_amount=result.to_amount or quote.to_amount,
                    )

            # Build response message
            text = _build_swap_result_message(result, quote, destination_address)

        except ValueError as e:
            logger.error(f"Swap ledger error: {e}")
            text = f"❌ Swap Failed\n\n{str(e)}"

    await callback.message.edit_text(text)
    await state.clear()
    await callback.answer()


def _build_swap_result_message(result: SwapResult, quote: Quote, destination: str) -> str:
    """Build user-friendly swap result message."""
    lines = []

    if result.success:
        if result.status == "completed":
            # Swap completed instantly (dry-run or simulated)
            lines.extend([
                "✅ Swap Completed!\n",
                f"📤 Sent: {result.from_amount} {result.from_asset}",
                f"📥 Received: {result.to_amount:.8f} {result.to_asset}",
                f"🔄 Route: {result.provider}",
                f"💸 Fee: {quote.fee_amount:.6f} {quote.fee_asset}",
            ])

            if result.tx_hash:
                lines.append(f"🔗 TX: {result.tx_hash}")

            if "simulated" in str(result.instructions):
                lines.append("\n⚠️ Test mode - simulated swap")

            lines.append("\nUse /wallet to check your balance.")

        elif result.status == "awaiting_deposit":
            # THORChain - need to send funds to inbound address
            instr = result.instructions or {}
            lines.extend([
                "🔄 Swap Initiated!\n",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                f"📤 Send: {result.from_amount} {result.from_asset}",
                f"📥 Receive: ~{result.to_amount:.8f} {result.to_asset}",
                "━━━━━━━━━━━━━━━━━━━━━━━━\n",
                "📋 Instructions:\n",
                f"Send exactly {instr.get('amount', result.from_amount)} {result.from_asset} to:\n",
                f"`{instr.get('inbound_address', 'N/A')}`\n",
            ])

            memo = instr.get('memo')
            if memo:
                lines.extend([
                    "With memo:",
                    f"`{memo}`\n",
                ])

            lines.extend([
                "⚠️ Important:",
                "• Send exact amount",
                "• Include memo exactly as shown",
                "• Do not send from exchange",
                f"• Expires in ~5 minutes",
                f"\nOutput will be sent to:\n`{destination}`",
            ])

        elif result.status == "pending_execution":
            # EVM/Solana - auto-execution pending
            lines.extend([
                "⏳ Swap Pending\n",
                f"📤 From: {result.from_amount} {result.from_asset}",
                f"📥 To: ~{result.to_amount:.8f} {result.to_asset}",
                f"🔄 Route: {result.provider}",
                "\n⚡ Auto-execution coming soon!",
                "For now, manual execution required.",
            ])

        elif result.status == "pending":
            # THORChain auto-send - transaction sent, awaiting cross-chain completion
            instr = result.instructions or {}
            lines.extend([
                "✅ Swap Sent!\n",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                f"📤 Sent: {result.from_amount} {result.from_asset}",
                f"📥 Expected: ~{result.to_amount:.8f} {result.to_asset}",
                f"🔄 Route: {result.provider}",
                "━━━━━━━━━━━━━━━━━━━━━━━━\n",
            ])

            if result.tx_hash:
                lines.append(f"🔗 TX: `{result.tx_hash}`\n")

            # Show tracking link for THORChain
            if "THORChain" in result.provider or instr.get("type") == "thorchain_auto":
                lines.extend([
                    "📊 Track your swap:",
                    f"https://track.ninerealms.com/\n",
                ])

                est_time = instr.get("estimated_time_seconds", 600)
                if est_time:
                    mins = est_time // 60
                    lines.append(f"⏱️ Estimated time: ~{mins} minutes")

            lines.extend([
                f"\n📬 Output address:\n`{destination}`",
                "\n✨ Swap is processing! Funds will arrive automatically.",
            ])

        else:
            lines.extend([
                f"🔄 Swap Status: {result.status}",
                f"Provider: {result.provider}",
            ])

    else:
        # Swap failed
        lines.extend([
            "❌ Swap Failed\n",
            f"Error: {result.error or 'Unknown error'}",
            "\nPlease try again or contact support.",
        ])

    return "\n".join(lines)


@router.callback_query(F.data == "cancel_swap")
async def handle_cancel_swap(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel swap flow."""
    await state.clear()
    await callback.message.edit_text("❌ Swap cancelled.")
    await callback.answer()


@router.callback_query(SwapStates.selecting_from, F.data == "cancel")
@router.callback_query(SwapStates.selecting_to, F.data == "cancel")
async def handle_cancel_selection(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel during selection."""
    await state.clear()
    await callback.message.edit_text("❌ Swap cancelled.")
    await callback.answer()
