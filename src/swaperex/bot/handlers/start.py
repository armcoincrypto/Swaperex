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

    first_name = message.from_user.first_name or "there"
    welcome_text = f"""Welcome to Swaperex, {first_name}!

Your secure crypto wallet with multi-route swap aggregation.

Features:
  Deposit crypto with HD wallet addresses
  View your balances across multiple chains
  Swap coins at the best available rates
  Withdraw to external wallets
  Track all your transactions

Supported Coins:
BTC, ETH, LTC, DASH, TRX, BSC, SOL
USDT (ERC-20 & TRC-20), USDC

Use the menu below or type /help for commands."""

    await message.answer(welcome_text, reply_markup=main_menu_keyboard())


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """Handle /help command."""
    help_text = """Swaperex Bot Commands

Wallet Commands:
  /wallet   - View all your balances
  /deposit  - Get deposit addresses
  /withdraw - Withdraw to external wallet

Trading Commands:
  /swap     - Swap between cryptocurrencies
  /quote    - Get a quick swap quote
              Usage: /quote BTC ETH 0.1

History & Info:
  /history  - View transaction history
  /help     - Show this help message
  /start    - Restart the bot

Menu Buttons:
   Wallet   - View balances
   Swap     - Exchange coins
   Deposit  - Get deposit address
   Withdraw - Send crypto out
   History  - Transaction log
   Settings - Configure preferences

Need help? Contact support."""

    await message.answer(help_text)


@router.message(F.text == "⚙️ Settings")
async def handle_settings(message: Message) -> None:
    """Handle settings menu button."""
    settings_text = """Settings

Current Configuration:
  Swap Mode: Auto-route (best rate)
  Max Slippage: 1%
  Notifications: Enabled

Coming Soon:
  Custom slippage tolerance
  Preferred swap routes
  Notification preferences
  Two-factor authentication

For support, contact the admin."""

    await message.answer(settings_text)
