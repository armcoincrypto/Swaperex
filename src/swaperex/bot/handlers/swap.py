"""Swap handlers with hybrid swap engine.

Uses:
1. mm2 (P2P atomic) - primary, cheapest
2. THORChain - fallback for UTXO chains (BTC/LTC/DASH)
3. DEX - fallback for smart contract chains (ETH/BSC/TRX)
"""

import json
import os
from decimal import Decimal, InvalidOperation

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

from swaperex.bot.keyboards import swap_from_keyboard, swap_to_keyboard, confirm_swap_keyboard
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository
from swaperex.swap_engine.router import SwapRouter, SwapConfig, SwapRoute
from swaperex.swap_engine.thor_adapter import THORChainSwapAdapter
from swaperex.routing.dry_run import create_default_aggregator

router = Router()

# UTXO chains that use THORChain
UTXO_CHAINS = {"BTC", "LTC", "DASH", "DOGE", "BCH"}

# Minimum USD for THORChain (to avoid losing money to fees)
MIN_THOR_USD = Decimal("50")

# Approximate USD prices (for minimum checks)
PRICES_USD = {
    "BTC": Decimal("42000"),
    "ETH": Decimal("2200"),
    "LTC": Decimal("95"),
    "DASH": Decimal("45"),
    "DOGE": Decimal("0.15"),
    "TRX": Decimal("0.10"),
    "USDT": Decimal("1"),
    "USDC": Decimal("1"),
    "RUNE": Decimal("5"),
}


def get_usd_value(asset: str, amount: Decimal) -> Decimal:
    """Get approximate USD value of amount."""
    price = PRICES_USD.get(asset.upper(), Decimal("1"))
    return amount * price


class SwapStates(StatesGroup):
    """FSM states for swap flow."""

    selecting_from = State()
    selecting_to = State()
    entering_amount = State()
    confirming = State()
    executing = State()


def get_swap_router() -> SwapRouter:
    """Get configured swap router with adapters."""
    from swaperex.swap_engine.mm2_adapter import MM2Adapter

    config = SwapConfig(
        mm2_enabled=True,   # Always try mm2 first
        mm2_wait_ms=180000, # 3 minutes wait for counterparty
        thor_enabled=True,
        dex_enabled=False,  # TODO: Enable when DEX adapter ready
        min_swap_usd=MIN_THOR_USD,
    )

    swap_router = SwapRouter(config=config)
    swap_router.mm2 = MM2Adapter()  # Primary: mm2 P2P
    swap_router.thor = THORChainSwapAdapter()  # Fallback for UTXO

    return swap_router


@router.message(Command("swap"))
@router.message(F.text == "💱 Swap")
async def cmd_swap(message: Message, state: FSMContext) -> None:
    """Start swap flow."""
    await state.clear()
    await state.set_state(SwapStates.selecting_from)

    text = """💱 Swap Coins

Select the coin you want to swap FROM:

Routes available:
• THORChain (BTC/LTC/DASH) - min $50
• DEX (ETH/BSC/TRX) - coming soon
• mm2 P2P - coming soon"""

    await message.answer(text, reply_markup=swap_from_keyboard())


@router.callback_query(SwapStates.selecting_from, F.data.startswith("swap_from:"))
async def handle_swap_from(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle 'from' asset selection."""
    if not callback.data:
        return

    from_asset = callback.data.split(":")[1]
    await state.update_data(from_asset=from_asset)
    await state.set_state(SwapStates.selecting_to)

    # Show route info
    if from_asset.upper() in UTXO_CHAINS:
        route_info = f"Route: THORChain (min ${MIN_THOR_USD})"
    else:
        route_info = "Route: DEX (coming soon)"

    text = f"""Swap FROM: {from_asset}
{route_info}

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

    # Show minimum for THORChain
    min_info = ""
    if from_asset.upper() in UTXO_CHAINS:
        price = PRICES_USD.get(from_asset.upper(), Decimal("1"))
        min_amount = MIN_THOR_USD / price
        min_info = f"\n⚠️ Minimum: {min_amount:.6f} {from_asset} (~${MIN_THOR_USD})"

    text = f"""Swap {from_asset} → {to_asset}
{min_info}

Enter the amount of {from_asset} you want to swap:"""

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
                f"❌ Insufficient balance.\n\n"
                f"You have: {available:.8f} {from_asset}\n"
                f"Requested: {amount:.8f} {from_asset}\n\n"
                f"Use /deposit to add funds."
            )
            return

    # Calculate USD value for minimum checks
    usd_value = get_usd_value(from_asset, amount)

    # Get quotes using hybrid strategy:
    # 1. Always try mm2 first (P2P atomic swap - cheapest)
    # 2. If no mm2 liquidity: UTXO → THORChain, EVM → DEX
    quotes_data = []

    await message.answer("🔄 Checking swap routes...")

    # Step 1: Try mm2 (always first - no fees!)
    from swaperex.swap_engine.mm2_adapter import MM2Adapter
    mm2 = MM2Adapter()

    try:
        if await mm2.is_available():
            mm2_quote = await mm2.get_quote(from_asset, to_asset, amount)
            if mm2_quote:
                quotes_data.append({
                    "provider": "mm2 (P2P Atomic)",
                    "route": "mm2",
                    "to_amount": str(mm2_quote.to_amount),
                    "fee_usd": "0",  # mm2 has no platform fees!
                    "fee_asset": to_asset,
                    "slippage_percent": "0",
                    "estimated_time": 60,  # ~1 minute for atomic swap
                    "mm2_order_id": mm2_quote.mm2_order_id,
                    "real": True,
                    "warning": None,
                })
                await message.answer("✅ mm2 liquidity found! Best rate available.")
        else:
            await message.answer("ℹ️ mm2 not running, checking fallback routes...")
    except Exception as e:
        await message.answer(f"ℹ️ mm2 check: {e}")

    # Step 2: If no mm2, check fallback based on chain type
    if not quotes_data:
        if from_asset.upper() in UTXO_CHAINS:
            # UTXO chains → THORChain
            if usd_value < MIN_THOR_USD:
                await message.answer(
                    f"⚠️ Amount too small for THORChain\n\n"
                    f"Your amount: ${usd_value:.2f}\n"
                    f"Minimum: ${MIN_THOR_USD}\n\n"
                    f"THORChain fees would eat your swap.\n"
                    f"Using simulated swap for testing."
                )
            else:
                # Get real THORChain quote
                try:
                    thor = THORChainSwapAdapter()
                    quote = await thor.get_quote(from_asset, to_asset, amount)

                    if quote:
                        quotes_data.append({
                            "provider": "THORChain",
                            "route": "thorchain",
                            "to_amount": str(quote.to_amount),
                            "fee_usd": str(quote.fee_usd),
                            "fee_asset": to_asset,
                            "slippage_percent": str(quote.slippage_pct),
                            "estimated_time": quote.estimated_time_seconds,
                            "vault_address": quote.thor_vault_address,
                            "memo": quote.thor_memo,
                            "real": True,
                            "warning": quote.extra.get("warning"),
                        })
                except Exception as e:
                    await message.answer(f"⚠️ THORChain error: {e}")

        else:
            # EVM chains → DEX (Uniswap/PancakeSwap via 1inch)
            await message.answer(
                f"ℹ️ DEX swap for {from_asset} coming soon!\n"
                f"Will use: Uniswap (ETH), PancakeSwap (BSC), SunSwap (TRX)"
            )

    # Step 3: Fallback to simulated for testing
    if not quotes_data:
        aggregator = create_default_aggregator()
        sim_quotes = await aggregator.get_all_quotes(from_asset, to_asset, amount)

        for q in sim_quotes:
            quotes_data.append({
                "provider": f"{q.provider} (simulated)",
                "route": "simulated",
                "to_amount": str(q.to_amount),
                "fee_usd": str(q.fee_amount),
                "fee_asset": q.fee_asset,
                "slippage_percent": str(q.slippage_percent),
                "estimated_time": q.estimated_time_seconds,
                "real": False,
            })

    if not quotes_data:
        await message.answer(
            f"❌ No routes available for {from_asset} → {to_asset}.\n"
            "Try a different pair."
        )
        await state.clear()
        return

    # Sort by best rate
    quotes_data.sort(key=lambda q: Decimal(q["to_amount"]), reverse=True)

    # Store for confirmation
    await state.update_data(
        amount=str(amount),
        usd_value=str(usd_value),
        quotes=quotes_data,
        selected_quote_index=0,
    )
    await state.set_state(SwapStates.confirming)

    # Build quote display
    best = quotes_data[0]
    is_real = best.get("real", False)

    lines = [
        f"💱 Swap Quote\n",
        f"{'🟢 REAL' if is_real else '🟡 SIMULATED'} swap\n",
        f"\n{amount} {from_asset} → {best['to_amount']} {to_asset}\n",
        f"Route: {best['provider']}",
        f"Fee: ${best['fee_usd']}",
        f"Slippage: {best['slippage_percent']}%",
        f"Time: ~{best['estimated_time']}s",
    ]

    if best.get("warning"):
        lines.append(f"\n⚠️ {best['warning']}")

    if is_real:
        lines.append(f"\n\n✅ This will execute a REAL swap on THORChain!")
    else:
        lines.append(f"\n\n🧪 This is a SIMULATED swap (testing only)")

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
        await callback.message.edit_text("❌ Quote expired. Please start again with /swap")
        await state.clear()
        await callback.answer()
        return

    selected_quote = quotes[0]  # Best quote
    is_real = selected_quote.get("real", False)

    await callback.message.edit_text("⏳ Executing swap...")
    await callback.answer()

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
                route=selected_quote.get("route", "simulated"),
                fee_asset=selected_quote.get("fee_asset", "USD"),
                fee_amount=Decimal(selected_quote.get("fee_usd", "0")),
                route_details=json.dumps(selected_quote),
            )

            route = selected_quote.get("route", "simulated")

            if route == "mm2" and is_real:
                # Execute mm2 atomic swap
                text = await execute_mm2_swap(
                    swap_id=swap.id,
                    from_asset=from_asset,
                    to_asset=to_asset,
                    amount=amount,
                    expected_out=Decimal(selected_quote["to_amount"]),
                    callback=callback,
                    repo=repo,
                )
            elif route == "thorchain" and is_real and selected_quote.get("vault_address"):
                # Execute real THORChain swap
                text = await execute_thorchain_swap(
                    swap_id=swap.id,
                    from_asset=from_asset,
                    to_asset=to_asset,
                    amount=amount,
                    vault_address=selected_quote["vault_address"],
                    memo=selected_quote["memo"],
                    expected_out=Decimal(selected_quote["to_amount"]),
                    repo=repo,
                )
            else:
                # Simulated swap - complete immediately
                completed_swap = await repo.complete_swap(
                    swap.id,
                    actual_to_amount=Decimal(selected_quote["to_amount"]),
                )

                text = (
                    f"✅ Swap Completed!\n\n"
                    f"{amount} {from_asset} → {completed_swap.to_amount:.8f} {to_asset}\n\n"
                    f"Route: {selected_quote['provider']}\n"
                    f"Fee: ${selected_quote['fee_usd']}\n\n"
                    f"🧪 (Simulated swap - PoC)\n\n"
                    f"Use /wallet to check your balance."
                )

        except ValueError as e:
            text = f"❌ Swap Failed\n\n{str(e)}"

    await callback.message.edit_text(text)
    await state.clear()


async def execute_mm2_swap(
    swap_id: int,
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    expected_out: Decimal,
    callback: CallbackQuery,
    repo: LedgerRepository,
) -> str:
    """Execute mm2 P2P atomic swap.

    1. Create taker order
    2. Wait up to 3 minutes for match
    3. If matched, execute atomic swap
    4. If no match, return failure (caller will fallback)
    """
    import asyncio
    from swaperex.swap_engine.mm2_adapter import MM2Adapter

    mm2 = MM2Adapter()

    # Step 1: Create order
    await callback.message.edit_text(
        f"🔄 mm2 Swap: Creating order...\n\n"
        f"{amount} {from_asset} → {to_asset}\n"
        f"Waiting for P2P counterparty..."
    )

    order = await mm2.create_order(from_asset, to_asset, amount)

    if not order:
        return (
            f"❌ mm2 Swap Failed\n\n"
            f"Could not create order.\n"
            f"Try again or wait for THORChain fallback."
        )

    order_id = order.get("order_id")

    # Step 2: Wait for match (up to 3 minutes)
    wait_seconds = 180
    poll_interval = 5

    for elapsed in range(0, wait_seconds, poll_interval):
        remaining = wait_seconds - elapsed

        await callback.message.edit_text(
            f"🔄 mm2 Swap: Waiting for counterparty...\n\n"
            f"{amount} {from_asset} → {to_asset}\n\n"
            f"⏱️ Time remaining: {remaining}s\n"
            f"Order ID: {order_id[:16]}..."
        )

        status = await mm2.check_order_status(order_id)

        if status.get("matched"):
            # Step 3: Execute the swap
            await callback.message.edit_text(
                f"✅ mm2: Counterparty found!\n\n"
                f"Executing atomic swap..."
            )

            result = await mm2.execute_swap(order_id)

            if result.get("success"):
                return (
                    f"✅ mm2 Swap Completed!\n\n"
                    f"{amount} {from_asset} → {result.get('to_amount', expected_out)} {to_asset}\n\n"
                    f"Route: mm2 (P2P Atomic)\n"
                    f"Fee: $0 (no fees!)\n\n"
                    f"Maker TX: {result.get('maker_txid', 'N/A')[:16]}...\n"
                    f"Taker TX: {result.get('taker_txid', 'N/A')[:16]}...\n\n"
                    f"Use /wallet to check your balance."
                )
            else:
                return (
                    f"❌ mm2 Swap Failed\n\n"
                    f"Error: {result.get('error', 'Unknown error')}\n"
                    f"Your funds are safe (atomic swap)."
                )

        if status.get("failed"):
            await mm2.cancel_order(order_id)
            return (
                f"❌ mm2 Order Failed\n\n"
                f"Error: {status.get('error', 'Order cancelled')}"
            )

        await asyncio.sleep(poll_interval)

    # Timeout - cancel order
    await mm2.cancel_order(order_id)

    return (
        f"⏱️ mm2 Timeout\n\n"
        f"No counterparty found in 3 minutes.\n"
        f"Falling back to THORChain/DEX..."
    )


async def execute_thorchain_swap(
    swap_id: int,
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    vault_address: str,
    memo: str,
    expected_out: Decimal,
    repo: LedgerRepository,
) -> str:
    """Execute real THORChain swap.

    1. Send funds to THORChain vault with memo
    2. Wait for outbound transaction
    3. Credit user's balance
    """
    from swaperex.swap_engine.thor_adapter import THORChainSwapAdapter

    thor = THORChainSwapAdapter()

    # Step 1: Send inbound to vault
    inbound_result = await thor.send_inbound(
        from_asset=from_asset,
        amount=amount,
        vault_address=vault_address,
        memo=memo,
    )

    if not inbound_result.get("success"):
        # Refund user's locked balance
        return (
            f"❌ THORChain Swap Failed\n\n"
            f"Error: {inbound_result.get('error', 'Failed to send to vault')}\n\n"
            f"Your funds have NOT been sent."
        )

    inbound_txid = inbound_result.get("txid")

    # Step 2: Wait for outbound (this can take 5-15 minutes)
    return (
        f"⏳ THORChain Swap In Progress\n\n"
        f"Inbound TX: {inbound_txid[:16]}...\n\n"
        f"Waiting for THORChain to process...\n"
        f"This can take 5-15 minutes.\n\n"
        f"You will receive ~{expected_out:.8f} {to_asset}\n\n"
        f"Monitor at: https://thorchain.net/tx/{inbound_txid}"
    )


@router.callback_query(F.data == "cancel_swap")
async def handle_cancel_swap(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel swap flow."""
    await state.clear()
    await callback.message.edit_text("Swap cancelled.")
    await callback.answer()


@router.callback_query(SwapStates.selecting_from, F.data == "cancel")
@router.callback_query(SwapStates.selecting_to, F.data == "cancel")
async def handle_cancel_selection(callback: CallbackQuery, state: FSMContext) -> None:
    """Cancel during selection."""
    await state.clear()
    await callback.message.edit_text("Swap cancelled.")
    await callback.answer()
