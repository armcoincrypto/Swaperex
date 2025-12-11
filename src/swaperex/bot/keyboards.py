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


def deposit_asset_keyboard() -> InlineKeyboardMarkup:
    """Create deposit asset selection keyboard.

    DEX-supported coins only:
    - BTC, LTC: THORChain
    - ETH, LINK: Uniswap
    - SOL: Jupiter
    - BNB: PancakeSwap
    - ATOM: Osmosis
    - ADA: Minswap
    - HYPE: Hyperliquid native DEX
    """
    assets = ["BTC", "LTC", "ETH", "SOL", "BNB", "ATOM", "ADA", "LINK", "HYPE", "USDT-ERC20", "USDC-ERC20"]
    return asset_selection_keyboard(assets, "deposit")


def withdraw_asset_keyboard() -> InlineKeyboardMarkup:
    """Create withdrawal asset selection keyboard.

    Same DEX-supported coins as deposit.
    """
    assets = ["BTC", "LTC", "ETH", "SOL", "BNB", "ATOM", "ADA", "LINK", "HYPE", "USDT-ERC20", "USDC-ERC20"]
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


def swap_chain_keyboard() -> InlineKeyboardMarkup:
    """Create chain selection keyboard for swap dashboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🟡 BNB Chain", callback_data="swap_chain:BNB"),
                InlineKeyboardButton(text="🔵 Ethereum", callback_data="swap_chain:ETH"),
            ],
            [
                InlineKeyboardButton(text="🔗 Cross-Chain (THORChain)", callback_data="swap_chain:THOR"),
            ],
            [
                InlineKeyboardButton(text="🟣 Solana", callback_data="swap_chain:SOL"),
                InlineKeyboardButton(text="⚛️ Cosmos", callback_data="swap_chain:ATOM"),
            ],
            [InlineKeyboardButton(text="❌ Cancel", callback_data="cancel")],
        ]
    )


# Chain-specific tokens
BSC_TOKENS = ["BNB", "USDT", "USDC", "BUSD", "DAI", "CAKE", "XRP", "DOGE", "ADA", "DOT", "MATIC", "ETH", "BTCB"]
ETH_TOKENS = ["ETH", "USDT", "USDC", "DAI", "LINK", "UNI", "WBTC", "AAVE", "SHIB", "PEPE"]
SOL_TOKENS = ["SOL", "USDT", "USDC"]
ATOM_TOKENS = ["ATOM", "OSMO", "USDC"]
THOR_ASSETS = ["BTC", "LTC", "ETH", "BNB", "ATOM", "USDT-ERC20", "USDC-ERC20"]


def swap_from_keyboard(chain: str = None) -> InlineKeyboardMarkup:
    """Create swap 'from' asset selection keyboard.

    If chain is specified, show chain-specific tokens.
    Otherwise show all supported assets.
    """
    if chain == "BNB":
        assets = BSC_TOKENS
    elif chain == "ETH":
        assets = ETH_TOKENS
    elif chain == "SOL":
        assets = SOL_TOKENS
    elif chain == "ATOM":
        assets = ATOM_TOKENS
    elif chain == "THOR":
        assets = THOR_ASSETS
    else:
        # Legacy: show all
        assets = ["BTC", "LTC", "ETH", "SOL", "BNB", "ATOM", "ADA", "LINK", "HYPE", "USDT-ERC20", "USDC-ERC20"]

    return asset_selection_keyboard(assets, "swap_from")


def swap_to_keyboard(exclude_asset: str, chain: str = None) -> InlineKeyboardMarkup:
    """Create swap 'to' asset selection keyboard.

    If chain is specified, show chain-specific tokens (excluding from asset).
    For THORChain, show cross-chain destination options.
    """
    if chain == "BNB":
        all_assets = BSC_TOKENS
    elif chain == "ETH":
        all_assets = ETH_TOKENS
    elif chain == "SOL":
        all_assets = SOL_TOKENS
    elif chain == "ATOM":
        all_assets = ATOM_TOKENS
    elif chain == "THOR":
        # Cross-chain: can swap to any supported chain
        all_assets = ["BTC", "LTC", "ETH", "BNB", "ATOM", "SOL", "USDT-ERC20", "USDC-ERC20"]
    else:
        all_assets = ["BTC", "LTC", "ETH", "SOL", "BNB", "ATOM", "ADA", "LINK", "HYPE", "USDT-ERC20", "USDC-ERC20"]

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
