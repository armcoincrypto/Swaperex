"""Wallet and balance handlers."""

import logging
from decimal import Decimal
from typing import Optional

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

# RPC endpoints
BSC_RPC = "https://bsc-dataseed.binance.org"
ETH_RPC = "https://eth.llamarpc.com"

# Token contracts
TOKENS = {
    "BNB": {
        "USDT": ("0x55d398326f99059fF775485246999027B3197955", 18),  # USDT-BEP20
        "USDC": ("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18),  # USDC-BEP20
        "DOGE": ("0xbA2aE424d960c26247Dd6c32edC70B295c744C43", 8),   # DOGE-BEP20
        "ETH": ("0x2170Ed0880ac9A755fd29B2688956BD959F933F8", 18),   # ETH-BEP20 (Binance-Peg ETH)
    },
    "ETH": {
        "USDT": ("0xdAC17F958D2ee523a2206206994597C13D831ec7", 6),   # USDT-ERC20
        "USDC": ("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6),   # USDC-ERC20
    }
}

# Asset display names with chain info
ASSET_DISPLAY = {
    "BNB": "BNB (BSC)",
    "ETH": "ETH (ERC20)",
    "ETH-BEP20": "ETH (BEP20)",
    "USDT": "USDT (ERC20)",
    "USDT-ERC20": "USDT (ERC20)",
    "USDT-BEP20": "USDT (BEP20)",
    "USDC": "USDC (ERC20)",
    "USDC-ERC20": "USDC (ERC20)",
    "USDC-BEP20": "USDC (BEP20)",
    "DOGE": "DOGE (BEP20)",
    "SOL": "SOL (Solana)",
    "ADA": "ADA (Cardano)",
    "BTC": "BTC (Bitcoin)",
    "LTC": "LTC (Litecoin)",
    "ATOM": "ATOM (Cosmos)",
}


async def get_evm_balance(address: str, rpc_url: str) -> Decimal:
    """Get native token balance from EVM chain via RPC."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
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
        async with httpx.AsyncClient(timeout=10.0) as client:
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


async def sync_user_balances(repo: LedgerRepository, user_id: int, addresses: list) -> dict:
    """Sync balances from blockchain for a user's addresses.

    Returns dict of {asset: (old_balance, new_balance)} for changed balances.
    """
    changes = {}
    synced_assets = set()

    # Find user's EVM address (same for ETH/BNB/etc)
    evm_address = None
    for addr in addresses:
        if addr.asset in ["ETH", "BNB", "BSC"]:
            evm_address = addr.address
            break

    for addr in addresses:
        address = addr.address
        asset = addr.asset

        try:
            on_chain: Optional[Decimal] = None

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

            elif asset in ["BNB", "BSC", "USDT-BEP20", "USDC-BEP20"]:
                rpc_url = BSC_RPC
                if asset in ["BNB", "BSC"]:
                    on_chain = await get_evm_balance(address, rpc_url)
                    asset = "BNB"  # Normalize

            if on_chain is not None:
                # Get current database balance
                db_balance = await repo.get_balance(user_id, asset)
                current = db_balance.amount if db_balance else Decimal("0")

                # Update if different
                if on_chain != current:
                    await repo.set_balance(user_id, asset, on_chain)
                    changes[asset] = (current, on_chain)
                synced_assets.add(asset)

        except Exception as e:
            logger.error(f"Sync error for {asset}: {e}")

    # Also sync token balances that may have come from swaps (not deposits)
    # Use the EVM address to check for tokens like DOGE-BEP20, ETH-BEP20
    if evm_address:
        # Get all user balances to find tokens that need syncing
        all_balances = await repo.get_all_balances(user_id)
        for bal in all_balances:
            asset = bal.asset
            if asset in synced_assets:
                continue  # Already synced

            try:
                on_chain: Optional[Decimal] = None

                # Check BSC tokens
                if asset == "DOGE":
                    contract, decimals = TOKENS["BNB"]["DOGE"]
                    on_chain = await get_erc20_balance(evm_address, contract, BSC_RPC, decimals)
                elif asset == "ETH-BEP20":
                    contract, decimals = TOKENS["BNB"]["ETH"]
                    on_chain = await get_erc20_balance(evm_address, contract, BSC_RPC, decimals)
                elif asset == "USDT-BEP20":
                    contract, decimals = TOKENS["BNB"]["USDT"]
                    on_chain = await get_erc20_balance(evm_address, contract, BSC_RPC, decimals)
                elif asset == "USDC-BEP20":
                    contract, decimals = TOKENS["BNB"]["USDC"]
                    on_chain = await get_erc20_balance(evm_address, contract, BSC_RPC, decimals)

                if on_chain is not None:
                    current = bal.amount
                    if on_chain != current:
                        await repo.set_balance(user_id, asset, on_chain)
                        changes[asset] = (current, on_chain)

            except Exception as e:
                logger.error(f"Sync error for token {asset}: {e}")

        # Also check for ETH-BEP20 even if not in balances yet (from swaps)
        if "ETH-BEP20" not in synced_assets:
            try:
                contract, decimals = TOKENS["BNB"]["ETH"]
                on_chain = await get_erc20_balance(evm_address, contract, BSC_RPC, decimals)
                if on_chain > Decimal("0"):
                    db_balance = await repo.get_balance(user_id, "ETH-BEP20")
                    current = db_balance.amount if db_balance else Decimal("0")
                    if on_chain != current:
                        await repo.set_balance(user_id, "ETH-BEP20", on_chain)
                        changes["ETH-BEP20"] = (current, on_chain)
            except Exception as e:
                logger.error(f"Sync error for ETH-BEP20: {e}")

    return changes


@router.message(Command("wallet"))
@router.message(F.text == "💰 Wallet")
async def cmd_wallet(message: Message) -> None:
    """Show user wallet balances (auto-syncs from blockchain)."""
    if not message.from_user:
        return

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

        # Auto-sync balances from blockchain
        addresses = await repo.get_user_deposit_addresses(user.id)
        if addresses:
            await sync_user_balances(repo, user.id, addresses)

        # Get updated balances
        balances = await repo.get_all_balances(user.id)

    if not balances:
        text = """💰 Wallet

No balances yet.

Use /deposit to add funds!"""
    else:
        lines = ["💰 Wallet\n"]
        for bal in balances:
            available = bal.available
            locked = bal.locked_amount
            # Show chain info in display name
            display_name = ASSET_DISPLAY.get(bal.asset, bal.asset)
            line = f"{display_name}: {available:.8f}"
            if locked > 0:
                line += f" (locked: {locked:.8f})"
            lines.append(line)

        text = "\n".join(lines)

    await message.answer(text)


@router.message(Command("sync"))
@router.message(F.text == "🔄 Sync")
async def cmd_sync(message: Message) -> None:
    """Sync wallet balances from blockchain (with verbose output)."""
    if not message.from_user:
        return

    await message.answer("🔄 Syncing balances from blockchain...")

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

        # Get all deposit addresses for user
        addresses = await repo.get_user_deposit_addresses(user.id)

        if not addresses:
            await message.answer("No deposit addresses found. Use /deposit first.")
            return

        # Sync and get changes
        changes = await sync_user_balances(repo, user.id, addresses)

        # Get all balances after sync
        balances = await repo.get_all_balances(user.id)

    # Build response
    lines = ["✅ Sync Complete\n"]

    if changes:
        lines.append("Updated:")
        for asset, (old, new) in changes.items():
            display_name = ASSET_DISPLAY.get(asset, asset)
            lines.append(f"  {display_name}: {old:.8f} → {new:.8f}")

    if balances:
        lines.append("\nCurrent Balances:")
        for bal in balances:
            display_name = ASSET_DISPLAY.get(bal.asset, bal.asset)
            lines.append(f"  {display_name}: {bal.amount:.8f}")

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

    lines = ["📊 Transaction History\n"]

    if deposits:
        lines.append("Recent Deposits:")
        for d in deposits:
            status_emoji = "✅" if d.status == "confirmed" else "⏳"
            asset_display = ASSET_DISPLAY.get(d.asset, d.asset)
            lines.append(f"{status_emoji} {d.amount:.8f} {asset_display}")

    if swaps:
        lines.append("\nRecent Swaps:")
        for s in swaps:
            status_emoji = "✅" if s.status == "completed" else ("❌" if s.status == "failed" else "⏳")
            from_display = ASSET_DISPLAY.get(s.from_asset, s.from_asset)
            to_display = ASSET_DISPLAY.get(s.to_asset, s.to_asset)
            lines.append(
                f"{status_emoji} {s.from_amount:.8f} {from_display} → {s.to_amount or s.expected_to_amount:.8f} {to_display}"
            )

    if not deposits and not swaps:
        lines.append("No transactions yet.")

    await message.answer("\n".join(lines))


