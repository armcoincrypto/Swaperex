"""Start and basic command handlers."""

from aiogram import Router, F
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from swaperex.bot.keyboards import main_menu_keyboard
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """Handle /start command - register user and show welcome."""
    if not message.from_user:
        return

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

    welcome_text = f"""
Welcome to Swaperex!

Your crypto wallet with the best swap rates.

**Features:**
- Deposit crypto with unique addresses
- View your balances
- Swap coins at the cheapest rates
- Track all transactions

Use the menu below or type /help for commands.
"""

    await message.answer(
        welcome_text,
        reply_markup=main_menu_keyboard(),
        parse_mode="Markdown",
    )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """Handle /help command."""
    help_text = """
**Swaperex Commands:**

/start - Start the bot
/wallet - View your balances
/deposit - Get deposit address
/swap - Swap coins
/history - Transaction history
/help - Show this help

**Menu Options:**
- Wallet: View all balances
- Swap: Exchange coins
- Deposit: Get deposit addresses
- Withdraw: Withdraw funds (coming soon)
- History: View transactions
- Settings: Bot settings
"""

    await message.answer(help_text, parse_mode="Markdown")


@router.message(F.text == "⚙️ Settings")
async def handle_settings(message: Message) -> None:
    """Handle settings menu button."""
    settings_text = """
**Settings**

Settings options coming in Stage 2:
- Default slippage tolerance
- Notification preferences
- Preferred routes

For now, all swaps use:
- Auto-route selection (cheapest)
- 1% max slippage
"""

    await message.answer(settings_text, parse_mode="Markdown")
