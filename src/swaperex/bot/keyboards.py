"""Telegram keyboard builders."""

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Create main menu keyboard."""
    keyboard = [
        [KeyboardButton(text="💰 Wallet"), KeyboardButton(text="💱 Swap")],
        [KeyboardButton(text="📥 Deposit"), KeyboardButton(text="📤 Withdraw")],
        [KeyboardButton(text="📊 History"), KeyboardButton(text="⚙️ Settings")],
    ]
    return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True)


def asset_selection_keyboard(assets: list[str], callback_prefix: str) -> InlineKeyboardMarkup:
    """Create asset selection inline keyboard."""
    buttons = []
    row = []

    for i, asset in enumerate(assets):
        row.append(InlineKeyboardButton(text=asset, callback_data=f"{callback_prefix}:{asset}"))
        if len(row) == 3:
            buttons.append(row)
            row = []

    if row:
        buttons.append(row)

    buttons.append([InlineKeyboardButton(text="❌ Cancel", callback_data="cancel")])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def confirm_swap_keyboard(swap_id: str) -> InlineKeyboardMarkup:
    """Create swap confirmation keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Confirm", callback_data=f"confirm_swap:{swap_id}"),
                InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_swap"),
            ]
        ]
    )


def back_keyboard(callback_data: str = "back") -> InlineKeyboardMarkup:
    """Create a simple back button keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="⬅️ Back", callback_data=callback_data)]]
    )


def deposit_chain_keyboard() -> InlineKeyboardMarkup:
    """Create deposit chain selection keyboard.

    Deposit Dashboard with chain-specific options:
    - Bitcoin Network: BTC, LTC, DASH
    - Ethereum Network: ETH, USDT, USDC, DAI, LINK, UNI
    - BNB Chain: BNB, BUSD, CAKE
    - Tron Network: TRX, USDT-TRC20
    - Solana: SOL
    - Other Networks: AVAX, MATIC, ATOM, DOGE, XRP
    """
    buttons = [
        [InlineKeyboardButton(
            text="🟠 Bitcoin Network",
            callback_data="deposit_chain:bitcoin"
        )],
        [InlineKeyboardButton(
            text="🔵 Ethereum Network",
            callback_data="deposit_chain:ethereum"
        )],
        [InlineKeyboardButton(
            text="🟡 BNB Chain",
            callback_data="deposit_chain:bnb"
        )],
        [InlineKeyboardButton(
            text="🔴 Tron Network",
            callback_data="deposit_chain:tron"
        )],
        [InlineKeyboardButton(
            text="🟣 Solana",
            callback_data="deposit_chain:solana"
        )],
        [InlineKeyboardButton(
            text="🌐 Other Networks",
            callback_data="deposit_chain:other"
        )],
        [InlineKeyboardButton(text="❌ Cancel", callback_data="cancel")],
    ]

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def deposit_asset_keyboard(chain: str = None) -> InlineKeyboardMarkup:
    """Create deposit asset selection keyboard.

    Args:
        chain: Optional chain filter for assets.

    Organized by chain (20+ coins total):
    - bitcoin: BTC, LTC, DASH
    - ethereum: ETH, USDT, USDC, DAI, LINK, UNI, AAVE
    - bnb: BNB, BUSD, CAKE
    - tron: TRX, USDT-TRC20
    - solana: SOL
    - other: AVAX, MATIC, ATOM, DOGE, XRP
    """
    # Chain-specific asset lists
    chain_assets = {
        # Bitcoin Network
        "bitcoin": ["BTC", "LTC", "DASH"],
        # Ethereum Network (ERC-20)
        "ethereum": ["ETH", "USDT", "USDC", "DAI", "LINK", "UNI", "AAVE"],
        # BNB Chain (BEP-20)
        "bnb": ["BNB", "BUSD", "CAKE"],
        # Tron Network (TRC-20)
        "tron": ["TRX", "USDT-TRC20"],
        # Solana
        "solana": ["SOL"],
        # Other Networks
        "other": ["AVAX", "MATIC", "ATOM", "DOGE", "XRP"],
    }

    if chain and chain.lower() in chain_assets:
        assets = chain_assets[chain.lower()]
    else:
        # Default: show major coins
        assets = [
            "BTC", "ETH", "LTC",
            "DASH", "TRX", "BNB",
            "USDT", "USDC",
            "USDT-TRC20",
        ]
    return asset_selection_keyboard(assets, "deposit")


def withdraw_asset_keyboard() -> InlineKeyboardMarkup:
    """Create withdrawal asset selection keyboard."""
    assets = [
        "BTC", "ETH", "LTC",          # Major coins
        "DASH", "TRX", "BSC",         # Alt coins
        "USDT-ERC20", "USDC",         # ERC-20 tokens
        "USDT-TRC20",                 # TRC-20 token
    ]
    return asset_selection_keyboard(assets, "withdraw")


def confirm_withdraw_keyboard(withdraw_id: str) -> InlineKeyboardMarkup:
    """Create withdrawal confirmation keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Confirm", callback_data=f"confirm_withdraw:{withdraw_id}"),
                InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_withdraw"),
            ]
        ]
    )


def swap_from_keyboard(chain: str = None) -> InlineKeyboardMarkup:
    """Create swap 'from' asset selection keyboard.

    Args:
        chain: Optional DEX/chain filter. If provided, shows only assets
               supported by that chain.

    Supported chains:
        - pancakeswap: BNB Chain tokens (USDT, USDC, BUSD, CAKE, XRP, DOGE...)
        - uniswap: Ethereum tokens (USDT, USDC, DAI, LINK, UNI, AAVE...)
        - thorchain: Cross-chain (BTC, ETH, BNB, ATOM, LTC, DASH...)
        - jupiter: Solana tokens (SOL, USDT, USDC...)
        - osmosis: Cosmos ecosystem (ATOM, OSMO, USDC...)
    """
    # Chain-specific asset lists
    chain_assets = {
        # BNB Chain - PancakeSwap
        "pancakeswap": ["BNB", "USDT", "USDC", "BUSD", "CAKE", "XRP", "DOGE", "ETH"],
        # Ethereum - Uniswap V3
        "uniswap": ["ETH", "USDT", "USDC", "DAI", "LINK", "UNI", "AAVE", "MATIC"],
        # Cross-Chain - THORChain
        "thorchain": ["BTC", "ETH", "BNB", "ATOM", "LTC", "DASH", "AVAX", "RUNE"],
        # Solana - Jupiter
        "jupiter": ["SOL", "USDT", "USDC", "RAY", "SRM"],
        # Cosmos - Osmosis
        "osmosis": ["ATOM", "OSMO", "USDC", "JUNO", "STARS"],
    }

    if chain and chain.lower() in chain_assets:
        assets = chain_assets[chain.lower()]
    else:
        # Default: show all major supported assets
        assets = [
            "BTC", "ETH", "BNB",          # Major coins
            "LTC", "DASH", "TRX",         # Alt coins
            "SOL", "ATOM", "AVAX",        # Layer 1s
            "USDT", "USDC",               # Stablecoins
        ]
    return asset_selection_keyboard(assets, "swap_from")


def swap_to_keyboard(exclude_asset: str, chain: str = None) -> InlineKeyboardMarkup:
    """Create swap 'to' asset selection keyboard.

    Args:
        exclude_asset: Asset to exclude (the 'from' asset)
        chain: Optional DEX/chain filter for available assets
    """
    # Chain-specific asset lists (same as swap_from_keyboard)
    chain_assets = {
        # BNB Chain - PancakeSwap
        "pancakeswap": ["BNB", "USDT", "USDC", "BUSD", "CAKE", "XRP", "DOGE", "ETH"],
        # Ethereum - Uniswap V3
        "uniswap": ["ETH", "USDT", "USDC", "DAI", "LINK", "UNI", "AAVE", "MATIC"],
        # Cross-Chain - THORChain
        "thorchain": ["BTC", "ETH", "BNB", "ATOM", "LTC", "DASH", "AVAX", "RUNE"],
        # Solana - Jupiter
        "jupiter": ["SOL", "USDT", "USDC", "RAY", "SRM"],
        # Cosmos - Osmosis
        "osmosis": ["ATOM", "OSMO", "USDC", "JUNO", "STARS"],
    }

    if chain and chain.lower() in chain_assets:
        all_assets = chain_assets[chain.lower()]
    else:
        all_assets = [
            "BTC", "ETH", "BNB",
            "LTC", "DASH", "TRX",
            "SOL", "ATOM", "AVAX",
            "USDT", "USDC",
        ]
    assets = [a for a in all_assets if a != exclude_asset]
    return asset_selection_keyboard(assets, "swap_to")


def quote_comparison_keyboard(quotes: list[dict]) -> InlineKeyboardMarkup:
    """Create keyboard for comparing quotes from different providers."""
    buttons = []

    for i, quote in enumerate(quotes):
        provider = quote.get("provider", "unknown")
        to_amount = quote.get("to_amount", "?")
        fee = quote.get("fee_amount", "?")

        text = f"{provider}: {to_amount} (fee: ${fee})"
        buttons.append([InlineKeyboardButton(text=text, callback_data=f"select_quote:{i}")])

    buttons.append([InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_swap")])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def swap_chain_keyboard() -> InlineKeyboardMarkup:
    """Create swap chain/DEX selection keyboard.

    Swap Dashboard with chain-specific DEXes:
    - BNB Chain: PancakeSwap
    - Ethereum: Uniswap V3
    - Cross-Chain: THORChain
    - Solana: Jupiter
    - Cosmos: Osmosis
    """
    buttons = [
        [InlineKeyboardButton(
            text="🟡 BNB Chain - PancakeSwap",
            callback_data="swap_chain:pancakeswap"
        )],
        [InlineKeyboardButton(
            text="🔵 Ethereum - Uniswap V3",
            callback_data="swap_chain:uniswap"
        )],
        [InlineKeyboardButton(
            text="🔗 Cross-Chain - THORChain",
            callback_data="swap_chain:thorchain"
        )],
        [InlineKeyboardButton(
            text="🟣 Solana - Jupiter",
            callback_data="swap_chain:jupiter"
        )],
        [InlineKeyboardButton(
            text="⚛️ Cosmos - Osmosis",
            callback_data="swap_chain:osmosis"
        )],
        [InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_swap")],
    ]

    return InlineKeyboardMarkup(inline_keyboard=buttons)
