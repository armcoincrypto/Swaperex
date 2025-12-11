"""Wallet and balance handlers."""

import logging
from decimal import Decimal

import httpx
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from swaperex.bot.keyboards import back_keyboard, deposit_asset_keyboard
from swaperex.config import get_settings
from swaperex.hdwallet import get_hd_wallet
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository

router = Router()
logger = logging.getLogger(__name__)


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
        text = """Your Wallet

No balances yet.

Use /deposit to add funds!"""
    else:
        lines = ["Your Wallet\n"]
        for bal in balances:
            available = bal.available
            locked = bal.locked_amount
            line = f"{bal.asset}: {available:.8f}"
            if locked > 0:
                line += f" (locked: {locked:.8f})"
            lines.append(line)

        text = "\n".join(lines)

    await message.answer(text)


async def get_evm_balance(address: str, rpc_url: str) -> Decimal:
    """Get native token balance from EVM chain via RPC."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            payload = {
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": [address, "latest"],
                "id": 1
            }
            response = await client.post(rpc_url, json=payload)
            if response.status_code == 200:
                data = response.json()
                balance_wei = int(data.get("result", "0x0"), 16)
                return Decimal(balance_wei) / Decimal("1000000000000000000")
    except Exception as e:
        logger.error(f"Error getting balance from {rpc_url}: {e}")
    return Decimal("0")


async def get_erc20_balance(address: str, token_contract: str, rpc_url: str, decimals: int = 18) -> Decimal:
    """Get ERC20 token balance from EVM chain via RPC."""
    try:
        # balanceOf(address) function signature
        data = f"0x70a08231000000000000000000000000{address[2:].lower()}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            payload = {
                "jsonrpc": "2.0",
                "method": "eth_call",
                "params": [{"to": token_contract, "data": data}, "latest"],
                "id": 1
            }
            response = await client.post(rpc_url, json=payload)
            if response.status_code == 200:
                result = response.json()
                balance_raw = int(result.get("result", "0x0"), 16)
                return Decimal(balance_raw) / Decimal(10 ** decimals)
    except Exception as e:
        logger.error(f"Error getting ERC20 balance: {e}")
    return Decimal("0")


@router.message(Command("sync"))
@router.message(F.text == "🔄 Sync")
async def cmd_sync(message: Message) -> None:
    """Sync wallet balances from blockchain."""
    if not message.from_user:
        return

    await message.answer("🔄 Syncing balances from blockchain...")

    # RPC endpoints
    BSC_RPC = "https://bsc-dataseed.binance.org"
    ETH_RPC = "https://eth.llamarpc.com"

    # Token contracts
    TOKENS = {
        "BNB": {
            "USDT": ("0x55d398326f99059fF775485246999027B3197955", 18),  # USDT-BEP20
            "USDC": ("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18),  # USDC-BEP20
            "DOGE": ("0xbA2aE424d960c26247Dd6c32edC70B295c744C43", 8),   # DOGE-BEP20
        },
        "ETH": {
            "USDT": ("0xdAC17F958D2ee523a2206206994597C13D831ec7", 6),   # USDT-ERC20
            "USDC": ("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6),   # USDC-ERC20
        }
    }

    synced = []
    errors = []

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

        # Get all deposit addresses for user
        addresses = await repo.get_user_deposit_addresses(user.id)

        for addr in addresses:
            address = addr.address
            asset = addr.asset

            try:
                # Determine which chain to query
                if asset in ["ETH", "USDT-ERC20", "USDC-ERC20"]:
                    rpc_url = ETH_RPC
                    if asset == "ETH":
                        on_chain = await get_evm_balance(address, rpc_url)
                    elif asset == "USDT-ERC20":
                        contract, decimals = TOKENS["ETH"]["USDT"]
                        on_chain = await get_erc20_balance(address, contract, rpc_url, decimals)
                    elif asset == "USDC-ERC20":
                        contract, decimals = TOKENS["ETH"]["USDC"]
                        on_chain = await get_erc20_balance(address, contract, rpc_url, decimals)
                    else:
                        continue

                elif asset in ["BNB", "BSC", "USDT-BEP20", "USDC-BEP20", "DOGE"]:
                    rpc_url = BSC_RPC
                    if asset in ["BNB", "BSC"]:
                        on_chain = await get_evm_balance(address, rpc_url)
                        asset = "BNB"  # Normalize
                    elif asset == "DOGE":
                        contract, decimals = TOKENS["BNB"]["DOGE"]
                        on_chain = await get_erc20_balance(address, contract, rpc_url, decimals)
                    else:
                        continue
                else:
                    # Skip non-EVM assets for now
                    continue

                # Get current database balance
                db_balance = await repo.get_balance(user.id, asset)
                current = db_balance.amount if db_balance else Decimal("0")

                # Update if different
                if on_chain != current:
                    await repo.set_balance(user.id, asset, on_chain)
                    synced.append(f"{asset}: {current:.8f} → {on_chain:.8f}")
                else:
                    synced.append(f"{asset}: {on_chain:.8f} (no change)")

            except Exception as e:
                errors.append(f"{asset}: {str(e)}")
                logger.error(f"Sync error for {asset}: {e}")

    # Build response
    lines = ["✅ Sync Complete\n"]

    if synced:
        lines.append("Balances:")
        lines.extend(synced)

    if errors:
        lines.append("\n⚠️ Errors:")
        lines.extend(errors)

    if not synced and not errors:
        lines.append("No deposit addresses found. Use /deposit first.")

    await message.answer("\n".join(lines))


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

        # Ignore old simulated addresses (both sim: and tsim: prefixes)
        if existing_addr and (existing_addr.address.startswith("sim:") or existing_addr.address.startswith("tsim:")):
            existing_addr = None

        # For EVM chains and tokens, check if user has an existing ETH address (same address)
        # All EVM chains (ETH, BSC, AVAX, MATIC) share the same address
        parent_chain = None
        evm_assets = ["USDT", "USDC", "USDT-ERC20", "BNB", "BSC", "USDT-BEP20", "USDC-BEP20",
                      "AVAX", "USDT-AVAX", "USDC-AVAX", "MATIC", "POLYGON", "USDT-MATIC", "USDC-MATIC"]
        if asset in evm_assets:
            parent_chain = "ETH"
        elif asset == "USDT-TRC20":
            parent_chain = "TRX"

        if not existing_addr and parent_chain:
            existing_addr = await repo.get_deposit_address(user.id, parent_chain)
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
                    user_id=user.id,
                    asset=asset,
                    address=address,
                    derivation_path=derivation_path,
                    derivation_index=index,
                )
            except Exception:
                # Address may already exist for another asset (same chain)
                # Rollback to allow session to continue
                await session.rollback()

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

    lines = ["Transaction History\n"]

    if deposits:
        lines.append("Recent Deposits:")
        for d in deposits:
            status_emoji = "✅" if d.status == "confirmed" else "⏳"
            lines.append(f"{status_emoji} {d.amount:.8f} {d.asset}")

    if swaps:
        lines.append("\nRecent Swaps:")
        for s in swaps:
            status_emoji = "✅" if s.status == "completed" else ("❌" if s.status == "failed" else "⏳")
            lines.append(
                f"{status_emoji} {s.from_amount:.8f} {s.from_asset} -> {s.to_amount or s.expected_to_amount:.8f} {s.to_asset}"
            )

    if not deposits and not swaps:
        lines.append("No transactions yet.")

    await message.answer("\n".join(lines))


