"""Swap handlers with quote comparison."""

import json
from decimal import Decimal, InvalidOperation

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

from swaperex.bot.keyboards import (
    swap_chain_keyboard,
    swap_from_keyboard,
    swap_to_keyboard,
    confirm_swap_keyboard,
)
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.routing.dry_run import create_chain_aggregator

router = Router()


class SwapStates(StatesGroup):
    """FSM states for swap flow."""

    selecting_chain = State()
    selecting_from = State()
    selecting_to = State()
    entering_amount = State()
    confirming = State()


@router.message(Command("swap"))
@router.message(F.text == "💱 Swap")
async def cmd_swap(message: Message, state: FSMContext) -> None:
    """Start swap flow with chain/DEX selection."""
    await state.clear()
    await state.set_state(SwapStates.selecting_chain)

    text = """💱 Swap Dashboard

Select your chain to trade:

🟡 BNB Chain - PancakeSwap
   USDT, USDC, BUSD, CAKE, XRP, DOGE...

🔵 Ethereum - Uniswap V3
   USDT, USDC, DAI, LINK, UNI, AAVE...

🔗 Cross-Chain - THORChain
   BTC ↔ ETH ↔ BNB ↔ ATOM

🟣 Solana - Jupiter
   SOL, USDT, USDC, RAY, JUP, BONK...

⚛️ Cosmos - Osmosis
   ATOM, OSMO, INJ, TIA, JUNO...

💜 Polygon - QuickSwap
   MATIC, USDT, USDC, AAVE, LINK...

🔺 Avalanche - TraderJoe
   AVAX, USDT, USDC, GMX, JOE...

🔴 Tron - SunSwap
   TRX, USDT, USDC, BTT, SUN...

💎 TON - STON.fi
   TON ↔ USDT ↔ USDC

🌐 NEAR - Ref Finance
   NEAR ↔ USDT ↔ USDC"""

    await message.answer(text, reply_markup=swap_chain_keyboard())


@router.callback_query(SwapStates.selecting_chain, F.data.startswith("swap_chain:"))
async def handle_chain_selection(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle chain/DEX selection."""
    if not callback.data:
        return

    chain = callback.data.split(":")[1]
    await state.update_data(chain=chain)
    await state.set_state(SwapStates.selecting_from)

    # Chain display names
    chain_names = {
        "pancakeswap": "🟡 PancakeSwap (BNB Chain)",
        "uniswap": "🔵 Uniswap V3 (Ethereum)",
        "thorchain": "🔗 THORChain (Cross-Chain)",
        "jupiter": "🟣 Jupiter (Solana)",
        "osmosis": "⚛️ Osmosis (Cosmos)",
        "quickswap": "💜 QuickSwap (Polygon)",
        "traderjoe": "🔺 TraderJoe (Avalanche)",
        "sunswap": "🔴 SunSwap (Tron)",
        "stonfi": "💎 STON.fi (TON)",
        "ref_finance": "🌐 Ref Finance (NEAR)",
    }

    chain_name = chain_names.get(chain, chain.title())

    text = f"""💱 Swap on {chain_name}

Select the coin you want to swap FROM:"""

    await callback.message.edit_text(text, reply_markup=swap_from_keyboard(chain))
    await callback.answer()


@router.callback_query(SwapStates.selecting_from, F.data.startswith("swap_from:"))
async def handle_swap_from(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle 'from' asset selection."""
    if not callback.data:
        return

    from_asset = callback.data.split(":")[1]
    data = await state.get_data()
    chain = data.get("chain")

    await state.update_data(from_asset=from_asset)
    await state.set_state(SwapStates.selecting_to)

    text = f"""💱 Swap FROM: {from_asset}

Now select the coin you want to swap TO:"""

    await callback.message.edit_text(text, reply_markup=swap_to_keyboard(from_asset, chain))
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

    text = f"""Swap {from_asset} -> {to_asset}

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
    chain = data.get("chain", "")

    # Check balance
    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(telegram_id=message.from_user.id)
        balance = await repo.get_balance(user.id, from_asset)

        available = balance.available if balance else Decimal("0")

        if available < amount:
            await message.answer(
                f"Insufficient balance. You have {available:.8f} {from_asset} available.\n\n"
                f"Use /deposit to add funds."
            )
            return

    # Get quotes from chain-specific providers
    aggregator = create_chain_aggregator(chain)
    quotes = await aggregator.get_all_quotes(from_asset, to_asset, amount)

    if not quotes:
        await message.answer(
            f"No routes available for {from_asset} -> {to_asset}.\n"
            "Try a different pair."
        )
        await state.clear()
        return

    # Sort by best rate (highest to_amount)
    quotes.sort(key=lambda q: q.to_amount, reverse=True)
    best_quote = quotes[0]

    # Store quotes for confirmation
    await state.update_data(
        amount=str(amount),
        quotes=[
            {
                "provider": q.provider,
                "to_amount": str(q.to_amount),
                "fee_amount": str(q.fee_amount),
                "fee_asset": q.fee_asset,
                "slippage_percent": str(q.slippage_percent),
                "estimated_time": q.estimated_time_seconds,
            }
            for q in quotes
        ],
        selected_quote_index=0,
    )
    await state.set_state(SwapStates.confirming)

    # Build quote comparison text
    lines = [
        f"Swap Quote: {amount} {from_asset} -> {to_asset}\n",
        "Available Routes:\n",
    ]

    for i, q in enumerate(quotes):
        best_marker = "[BEST] " if i == 0 else "       "
        lines.append(
            f"{best_marker}{q.provider}\n"
            f"   Receive: {q.to_amount:.8f} {to_asset}\n"
            f"   Fee: ${q.fee_amount:.2f}\n"
            f"   Slippage: {q.slippage_percent:.2f}%\n"
            f"   Time: ~{q.estimated_time_seconds}s\n"
        )

    lines.append("\nBest rate selected automatically.")
    lines.append("(Simulated quote - PoC)")

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
    quotes = data.get("quotes", [])

    if not quotes:
        await callback.message.edit_text("Quote expired. Please start again with /swap")
        await state.clear()
        await callback.answer()
        return

    selected_quote = quotes[0]  # Best quote

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
                expected_to_amount=Decimal(selected_quote["to_amount"]),
                route=selected_quote["provider"],
                fee_asset=selected_quote["fee_asset"],
                fee_amount=Decimal(selected_quote["fee_amount"]),
                route_details=json.dumps(selected_quote),
            )

            # In PoC, immediately complete the swap
            completed_swap = await repo.complete_swap(
                swap.id,
                actual_to_amount=Decimal(selected_quote["to_amount"]),
            )

            text = (
                f"Swap Completed!\n\n"
                f"{amount} {from_asset} -> {completed_swap.to_amount:.8f} {to_asset}\n\n"
                f"Route: {selected_quote['provider']}\n"
                f"Fee: ${selected_quote['fee_amount']}\n\n"
                f"(Simulated swap - PoC)\n\n"
                f"Use /wallet to check your balance."
            )

        except ValueError as e:
            text = f"Swap Failed\n\n{str(e)}"

    await callback.message.edit_text(text)
    await state.clear()
    await callback.answer()


@router.callback_query(F.data == "cancel_swap")
async def handle_cancel_swap(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel swap flow."""
    await state.clear()
    await callback.message.edit_text("Swap cancelled.")
    await callback.answer()


@router.callback_query(SwapStates.selecting_chain, F.data == "cancel")
@router.callback_query(SwapStates.selecting_from, F.data == "cancel")
@router.callback_query(SwapStates.selecting_to, F.data == "cancel")
async def handle_cancel_selection(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel during selection."""
    await state.clear()
    await callback.message.edit_text("Swap cancelled.")
    await callback.answer()
