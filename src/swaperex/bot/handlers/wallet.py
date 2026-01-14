"""Wallet and balance handlers."""

import logging
import os
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
from swaperex.services.balance_sync import get_all_chain_balances_with_addresses

logger = logging.getLogger(__name__)

router = Router()


class DepositStates(StatesGroup):
    """FSM states for deposit flow."""

    selecting_chain = State()
    selecting_asset = State()


async def get_bsc_address() -> str:
    """Get BSC wallet address from seed phrase."""
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        raise ValueError("No seed phrase configured")

    try:
        from bip_utils import Bip39SeedGenerator, Bip32Secp256k1
        from bip_utils import EthAddrEncoder

        # Generate seed from mnemonic
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip32_ctx = Bip32Secp256k1.FromSeed(seed)

        # Standard path: m/44'/60'/0'/0/0
        path = "44'/60'/0'/0/0"
        account_ctx = bip32_ctx.DerivePath(path)

        # Get address
        pubkey = account_ctx.PublicKey().RawUncompressed().ToBytes()
        address = EthAddrEncoder.EncodeKey(pubkey)
        return address
    except Exception as e:
        raise ValueError(f"Failed to derive address: {e}")


@router.message(Command("wallet"))
@router.message(F.text == "💰 Wallet")
async def cmd_wallet(message: Message) -> None:
    """Show user wallet balances - REAL blockchain balance from all chains."""
    if not message.from_user:
        return

    await message.answer("🔄 Loading wallet from all chains...")

    # Chain display names with emojis
    chain_names = {
        "bsc": "🟡 BNB Chain",
        "ethereum": "🔵 Ethereum",
        "polygon": "💜 Polygon",
        "avalanche": "🔺 Avalanche",
        "solana": "🟣 Solana",
        "tron": "🔴 Tron",
        "cosmos": "⚛️ Cosmos",
        "ton": "💎 TON",
        "near": "🌐 NEAR",
    }

    try:
        all_chain_data = await get_all_chain_balances_with_addresses()
    except Exception as e:
        logger.error(f"Failed to get chain balances: {e}")
        await message.answer(f"❌ Wallet error: {e}")
        return

    if not all_chain_data:
        await message.answer("❌ No seed phrase configured. Set SEED_PHRASE environment variable.")
        return

    lines = ["💰 Your Wallet\n"]

    # Show EVM address if available
    evm_chains = ["bsc", "ethereum", "polygon", "avalanche"]
    for chain in evm_chains:
        if chain in all_chain_data:
            evm_address = all_chain_data[chain]["address"]
            lines.append(f"EVM: `{evm_address[:10]}...{evm_address[-8:]}`\n")
            break

    total_assets = 0

    # Display balances by chain in order
    chain_order = ["bsc", "ethereum", "polygon", "avalanche", "solana", "tron", "cosmos", "ton", "near"]

    for chain_id in chain_order:
        if chain_id in all_chain_data:
            chain_info = all_chain_data[chain_id]
            balances = chain_info.get("balances", {})
            chain_name = chain_names.get(chain_id, chain_id.title())

            if balances:
                has_balance = False
                for asset, balance in sorted(balances.items()):
                    if balance > 0:
                        if not has_balance:
                            lines.append(f"\n{chain_name}:")
                            has_balance = True
                        lines.append(f"  {asset}: {balance:.8f}")
                        total_assets += 1

    if total_assets == 0:
        lines.append("\nNo tokens found on any chain.")

    lines.append("\n💡 Use /deposit to add funds")
    text = "\n".join(lines)

    await message.answer(text, parse_mode="Markdown")


@router.message(Command("sync"))
async def cmd_sync(message: Message) -> None:
    """Alias for /wallet - show real blockchain balance."""
    await cmd_wallet(message)


@router.message(Command("addresses"))
async def cmd_addresses(message: Message) -> None:
    """Debug command - show all derived addresses for each chain."""
    if not message.from_user:
        return

    import os
    from swaperex.services.balance_sync import (
        derive_solana_address,
        derive_tron_address,
        derive_cosmos_address,
        derive_ton_address,
        derive_near_address,
    )

    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        await message.answer("❌ No seed phrase configured")
        return

    lines = ["🔑 Derived Addresses\n"]

    # EVM address
    try:
        from bip_utils import Bip39SeedGenerator, Bip32Secp256k1, EthAddrEncoder
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip32_ctx = Bip32Secp256k1.FromSeed(seed)
        account_ctx = bip32_ctx.DerivePath("44'/60'/0'/0/0")
        pubkey = account_ctx.PublicKey().RawUncompressed().ToBytes()
        evm_address = EthAddrEncoder.EncodeKey(pubkey)
        lines.append(f"🔵 EVM (BSC/ETH/Polygon/Avax):\n`{evm_address}`\n")
    except Exception as e:
        lines.append(f"❌ EVM: {e}\n")

    # Solana
    sol_addr = derive_solana_address(seed_phrase)
    if sol_addr:
        lines.append(f"🟣 Solana:\n`{sol_addr}`\n")
    else:
        lines.append("❌ Solana: derivation failed\n")

    # Tron
    trx_addr = derive_tron_address(seed_phrase)
    if trx_addr:
        lines.append(f"🔴 Tron:\n`{trx_addr}`\n")
    else:
        lines.append("❌ Tron: derivation failed\n")

    # Cosmos
    atom_addr = derive_cosmos_address(seed_phrase)
    if atom_addr:
        lines.append(f"⚛️ Cosmos:\n`{atom_addr}`\n")
    else:
        lines.append("❌ Cosmos: derivation failed\n")

    # TON
    ton_addr = derive_ton_address(seed_phrase)
    if ton_addr:
        lines.append(f"💎 TON:\n`{ton_addr}`\n")
    else:
        lines.append("⚠️ TON: not implemented yet\n")

    # NEAR
    near_addr = derive_near_address(seed_phrase)
    if near_addr:
        lines.append(f"🌐 NEAR:\n`{near_addr}`\n")
    else:
        lines.append("❌ NEAR: derivation failed\n")

    await message.answer("\n".join(lines), parse_mode="Markdown")


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

        # For tokens, check if user has parent chain address
        parent_chain = None
        # ERC-20 tokens use ETH address
        erc20_tokens = [
            "USDT", "USDT-ERC20", "USDC", "DAI", "LINK", "UNI", "AAVE",
            "WBTC", "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH",
            "GRT", "ENS", "PEPE", "SHIB", "LRC", "BAT", "ZRX", "YFI", "BAL", "OMG"
        ]
        # BEP-20 tokens use BNB address
        bep20_tokens = [
            "BUSD", "CAKE", "USDT-BEP20", "USDC-BEP20", "TUSD-BEP20", "FDUSD",
            "BTCB", "ETH-BEP20", "XRP-BEP20", "ADA-BEP20", "DOGE-BEP20",
            "DOT-BEP20", "LTC-BEP20", "SHIB-BEP20", "FLOKI", "BABYDOGE",
            "ALPACA", "XVS", "GMT", "SFP"
        ]
        # TRC-20 tokens use TRX address
        trc20_tokens = [
            "USDT-TRC20", "USDC-TRC20", "TUSD-TRC20", "USDJ", "BTT", "JST",
            "SUN", "WIN", "NFT-TRC20", "APENFT", "BTC-TRC20", "ETH-TRC20",
            "LTC-TRC20", "DOGE-TRC20", "XRP-TRC20", "ADA-TRC20", "EOS-TRC20",
            "DOT-TRC20", "FIL-TRC20"
        ]
        # SPL tokens use SOL address
        spl_tokens = [
            "USDT-SOL", "USDC-SOL", "RAY", "SRM", "ORCA", "JUP", "BONK",
            "SAMO", "PYTH", "WIF", "MNDE", "STEP", "ATLAS", "POLIS",
            "SLND", "GMT-SOL", "AUDIO-SOL", "HNT"
        ]
        # Polygon tokens use MATIC address
        polygon_tokens = [
            "USDT-POLYGON", "USDC-POLYGON", "WETH-POLYGON", "QUICK", "AAVE-POLYGON"
        ]
        # Avalanche tokens use AVAX address
        avax_tokens = [
            "USDT-AVAX", "USDC-AVAX", "JOE", "PNG", "GMX"
        ]

        if asset in erc20_tokens:
            parent_chain = "ETH"
        elif asset in bep20_tokens:
            parent_chain = "BNB"
        elif asset in trc20_tokens:
            parent_chain = "TRX"
        elif asset in spl_tokens:
            parent_chain = "SOL"
        elif asset in polygon_tokens:
            parent_chain = "MATIC"
        elif asset in avax_tokens:
            parent_chain = "AVAX"

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
    # ERC-20 tokens
    if asset in ["USDT", "USDT-ERC20", "USDC", "DAI", "LINK", "UNI", "AAVE",
                 "WBTC", "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH",
                 "GRT", "ENS", "PEPE", "SHIB", "LRC", "BAT", "ZRX", "YFI", "BAL", "OMG"]:
        network_info = " (ERC-20 on Ethereum)"
    # BEP-20 tokens
    elif asset in ["BUSD", "CAKE", "USDT-BEP20", "USDC-BEP20", "TUSD-BEP20", "FDUSD",
                   "BTCB", "ETH-BEP20", "XRP-BEP20", "ADA-BEP20", "DOGE-BEP20",
                   "DOT-BEP20", "LTC-BEP20", "SHIB-BEP20", "FLOKI", "BABYDOGE",
                   "ALPACA", "XVS", "GMT", "SFP"]:
        network_info = " (BEP-20 on BNB Chain)"
    # TRC-20 tokens
    elif asset in ["USDT-TRC20", "USDC-TRC20", "TUSD-TRC20", "USDJ", "BTT", "JST",
                   "SUN", "WIN", "NFT-TRC20", "APENFT", "BTC-TRC20", "ETH-TRC20",
                   "LTC-TRC20", "DOGE-TRC20", "XRP-TRC20", "ADA-TRC20", "EOS-TRC20",
                   "DOT-TRC20", "FIL-TRC20"]:
        network_info = " (TRC-20 on Tron)"
    # SPL tokens on Solana
    elif asset in ["USDT-SOL", "USDC-SOL", "RAY", "SRM", "ORCA", "JUP", "BONK",
                   "SAMO", "PYTH", "WIF", "MNDE", "STEP", "ATLAS", "POLIS",
                   "SLND", "GMT-SOL", "AUDIO-SOL", "HNT"]:
        network_info = " (SPL on Solana)"
    # Polygon tokens
    elif asset in ["USDT-POLYGON", "USDC-POLYGON", "WETH-POLYGON", "QUICK", "AAVE-POLYGON"]:
        network_info = " (on Polygon Network)"
    # Avalanche tokens
    elif asset in ["USDT-AVAX", "USDC-AVAX", "JOE", "PNG", "GMX"]:
        network_info = " (on Avalanche C-Chain)"
    # Native chains
    elif asset == "MATIC":
        network_info = " (Polygon Network)"
    elif asset == "AVAX":
        network_info = " (Avalanche C-Chain)"
    elif asset == "ATOM":
        network_info = " (Cosmos Hub)"
    elif asset == "XRP":
        network_info = " (XRP Ledger)"
    # Cosmos ecosystem
    elif asset == "OSMO":
        network_info = " (Osmosis)"
    elif asset == "INJ":
        network_info = " (Injective)"
    elif asset == "TIA":
        network_info = " (Celestia)"
    elif asset == "JUNO":
        network_info = " (Juno Network)"
    elif asset == "SCRT":
        network_info = " (Secret Network)"
    # Other L1 chains
    elif asset == "XLM":
        network_info = " (Stellar)"
    elif asset == "TON":
        network_info = " (TON Network)"
    elif asset == "NEAR":
        network_info = " (NEAR Protocol)"
    elif asset == "KAS":
        network_info = " (Kaspa)"
    elif asset == "ICP":
        network_info = " (Internet Computer)"
    elif asset == "ALGO":
        network_info = " (Algorand)"
    elif asset == "EGLD":
        network_info = " (MultiversX)"
    elif asset == "HBAR":
        network_info = " (Hedera)"
    elif asset == "VET":
        network_info = " (VeChain)"
    elif asset == "FTM":
        network_info = " (Fantom)"
    elif asset == "ROSE":
        network_info = " (Oasis Network)"
    # UTXO chains
    elif asset in ["BCH", "DOGE", "ZEC", "DGB", "RVN", "BTG", "NMC", "VIA",
                   "SYS", "KMD", "XEC", "MONA", "FIO"]:
        network_info = f" ({asset} Network)"

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


