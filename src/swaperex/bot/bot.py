"""Bot initialization and runner."""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from swaperex.bot.handlers import setup_routers
from swaperex.config import get_settings
from swaperex.ledger.database import init_db

logger = logging.getLogger(__name__)


def create_bot() -> tuple[Bot, Dispatcher]:
    """Create bot and dispatcher instances."""
    settings = get_settings()

    if not settings.telegram_bot_token:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set")

    # No default parse_mode - each handler decides
    bot = Bot(token=settings.telegram_bot_token)

    # Use memory storage for FSM (in production, use Redis)
    storage = MemoryStorage()
    dp = Dispatcher(storage=storage)

    # Register all routers
    main_router = setup_routers()
    dp.include_router(main_router)

    return bot, dp


async def run_bot() -> None:
    """Run the bot in polling mode."""
    settings = get_settings()

    # Configure logging - reduce noise from libraries
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("aiosqlite").setLevel(logging.WARNING)
    logging.getLogger("aiogram").setLevel(logging.INFO)

    logger.info("Starting Swaperex bot...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Create bot
    bot, dp = create_bot()

    try:
        # Delete webhook if any and start polling
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("Starting polling...")
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


def main() -> None:
    """Entry point for bot-only mode."""
    asyncio.run(run_bot())


if __name__ == "__main__":
    main()
