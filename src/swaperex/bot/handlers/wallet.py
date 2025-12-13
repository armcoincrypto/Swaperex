"""Wallet and balance handlers."""

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from swaperex.bot.keyboards import back_keyboard, deposit_chain_keyboard, deposit_asset_keyboard
from swaperex.config import get_settings
from swaperex.hdwallet import get_hd_wallet
from swaperex.ledger.database import get_db
from swaperex.ledger.models import DepositStatus, SwapStatus
from swaperex.ledger.repository import LedgerRepository

router = Router()


class DepositStates(StatesGroup):
    """FSM states for deposit flow."""

    selecting_chain = State()
    selecting_asset = State()


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
async def cmd_deposit(message: Message, state: FSMContext) -> None:
    """Show deposit options with chain selection."""
    await state.clear()
    await state.set_state(DepositStates.selecting_chain)

    text = """📥 Deposit Dashboard

Select your network to deposit:

🟠 Bitcoin Network
   BTC, LTC, DASH

🔵 Ethereum Network
   ETH, USDT, USDC, DAI, LINK, UNI, AAVE

🟡 BNB Chain
   BNB, BUSD, CAKE

🔴 Tron Network
   TRX, USDT (TRC-20)

🟣 Solana
   SOL

🌐 Other Networks
   AVAX, MATIC, ATOM, DOGE, XRP"""

    await message.answer(text, reply_markup=deposit_chain_keyboard())


@router.callback_query(DepositStates.selecting_chain, F.data.startswith("deposit_chain:"))
async def handle_deposit_chain(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle deposit chain selection."""
    if not callback.data:
        return

    chain = callback.data.split(":")[1]
    await state.update_data(chain=chain)
    await state.set_state(DepositStates.selecting_asset)

    # Chain display names
    chain_names = {
        "bitcoin": "🟠 Bitcoin Network",
        "ethereum": "🔵 Ethereum Network",
        "bnb": "🟡 BNB Chain",
        "tron": "🔴 Tron Network",
        "solana": "🟣 Solana",
        "other": "🌐 Other Networks",
    }

    chain_name = chain_names.get(chain, chain.title())

    text = f"""📥 Deposit on {chain_name}

Select the coin you want to deposit:"""

    await callback.message.edit_text(text, reply_markup=deposit_asset_keyboard(chain))
    await callback.answer()


@router.callback_query(F.data.startswith("deposit:"))
async def handle_deposit_asset(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle deposit asset selection.

    Uses HD wallet for address derivation when configured,
    otherwise falls back to simulated addresses.
    """
    if not callback.data or not callback.from_user:
        return

    asset = callback.data.split(":")[1]
    data = await state.get_data()
    chain = data.get("chain")
    settings = get_settings()

    # Get HD wallet for this asset
    hd_wallet = get_hd_wallet(asset)

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            first_name=callback.from_user.first_name,
        )
        user_id = user.id  # Store before potential rollback

        # Check if we have an existing address for this asset
        existing_addr = await repo.get_deposit_address(user_id, asset)

        # Ignore old simulated addresses (start with sim: or tsim:)
        if existing_addr and (existing_addr.address.startswith("sim:") or existing_addr.address.startswith("tsim:")):
            existing_addr = None

        # For ERC-20/BEP-20 tokens, also check if user has parent chain address
        parent_chain = None
        if asset in ["USDT", "USDC", "USDT-ERC20", "DAI", "LINK", "UNI", "AAVE"]:
            parent_chain = "ETH"
        elif asset in ["BUSD", "CAKE"]:
            parent_chain = "BNB"
        elif asset == "USDT-TRC20":
            parent_chain = "TRX"

        if not existing_addr and parent_chain:
            existing_addr = await repo.get_deposit_address(user_id, parent_chain)
            # Also ignore simulated parent chain addresses
            if existing_addr and (existing_addr.address.startswith("sim:") or existing_addr.address.startswith("tsim:")):
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
                    user_id=user_id,
                    asset=asset,
                    address=address,
                    derivation_path=derivation_path,
                    derivation_index=index,
                )
            except Exception:
                # Address may already exist - rollback and continue
                await session.rollback()
                # Just use the derived address, don't try to query after rollback
                import logging
                logging.getLogger(__name__).warning(
                    f"Deposit address already exists for user {user_id}, asset {asset}"
                )

    # Determine network info for tokens
    network_info = ""
    if asset == "USDT":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "USDC":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "USDT-TRC20":
        network_info = " (TRC-20 on Tron)"
    elif asset == "DAI":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "LINK":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "UNI":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "AAVE":
        network_info = " (ERC-20 on Ethereum)"
    elif asset == "BUSD":
        network_info = " (BEP-20 on BNB Chain)"
    elif asset == "CAKE":
        network_info = " (BEP-20 on BNB Chain)"
    elif asset == "MATIC":
        network_info = " (Polygon Network)"
    elif asset == "AVAX":
        network_info = " (Avalanche C-Chain)"
    elif asset == "ATOM":
        network_info = " (Cosmos Hub)"
    elif asset == "DOGE":
        network_info = " (Dogecoin Network)"
    elif asset == "XRP":
        network_info = " (XRP Ledger)"

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

    # Show appropriate mode indicator based on address format
    is_simulated = address.startswith("sim:") or address.startswith("tsim:")
    if is_simulated:
        lines.extend(["", "(Simulated address - no xpub/seed configured)"])
    elif hd_wallet.testnet:
        lines.extend(["", "(Testnet mode)"])

    text = "\n".join(lines)
    await callback.message.edit_text(text, reply_markup=back_keyboard("deposit_back"))
    await callback.answer()


@router.callback_query(F.data == "deposit_back")
async def handle_deposit_back(callback: CallbackQuery, state: FSMContext) -> None:
    """Go back to deposit chain selection."""
    await state.set_state(DepositStates.selecting_chain)

    text = """📥 Deposit Dashboard

Select your network to deposit:

🟠 Bitcoin Network
   BTC, LTC, DASH

🔵 Ethereum Network
   ETH, USDT, USDC, DAI, LINK, UNI, AAVE

🟡 BNB Chain
   BNB, BUSD, CAKE

🔴 Tron Network
   TRX, USDT (TRC-20)

🟣 Solana
   SOL

🌐 Other Networks
   AVAX, MATIC, ATOM, DOGE, XRP"""

    await callback.message.edit_text(text, reply_markup=deposit_chain_keyboard())
    await callback.answer()


@router.callback_query(F.data == "cancel")
async def handle_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle cancel button."""
    await state.clear()
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


