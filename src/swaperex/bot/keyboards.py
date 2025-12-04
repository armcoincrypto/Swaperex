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
    """Create deposit asset selection keyboard."""
    assets = ["BTC", "ETH", "LTC", "TRX", "SOL", "USDT", "USDC"]
    return asset_selection_keyboard(assets, "deposit")


def withdraw_asset_keyboard() -> InlineKeyboardMarkup:
    """Create withdrawal asset selection keyboard."""
    assets = ["BTC", "ETH", "USDT-ERC20", "USDT-TRC20", "TRX"]
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


def swap_from_keyboard() -> InlineKeyboardMarkup:
    """Create swap 'from' asset selection keyboard."""
    assets = ["BTC", "ETH", "USDT", "USDC", "SOL", "ATOM", "RUNE"]
    return asset_selection_keyboard(assets, "swap_from")


def swap_to_keyboard(exclude_asset: str) -> InlineKeyboardMarkup:
    """Create swap 'to' asset selection keyboard."""
    all_assets = ["BTC", "ETH", "USDT", "USDC", "SOL", "ATOM", "RUNE"]
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
