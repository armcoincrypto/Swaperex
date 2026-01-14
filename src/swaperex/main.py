"""Main entry point - runs both bot and API."""

import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from swaperex.api.app import create_app
from swaperex.bot.bot import create_bot
from swaperex.config import get_settings, ExecutionMode
from swaperex.ledger.database import close_db, init_db
from swaperex.safety import print_startup_banner, setup_safety_guards

logger = logging.getLogger(__name__)


class Application:
    """Main application that runs both bot and API."""

    def __init__(self):
        self.settings = get_settings()
        self.bot = None
        self.dp = None
        self.api_server = None
        self._shutdown_event = asyncio.Event()

    async def start(self):
        """Start all services."""
        # Configure logging
        log_level = logging.DEBUG if self.settings.debug else logging.INFO
        logging.basicConfig(
            level=log_level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )

        # Print startup banner and initialize safety guards
        print_startup_banner()
        setup_safety_guards()

        logger.info("Starting Swaperex...")
        logger.info(f"Environment: {self.settings.environment}")
        logger.info(f"Execution Mode: {self.settings.mode.value}")

        # Initialize database
        await init_db()
        logger.info("Database initialized")

        # Load xpubs from database BEFORE starting services
        await self._load_xpubs()

        # Create tasks for bot and API
        tasks = []

        # Start bot if token is configured
        if self.settings.telegram_bot_token:
            self.bot, self.dp = create_bot()
            tasks.append(asyncio.create_task(self._run_bot()))
            logger.info("Bot task created")
        else:
            logger.warning("TELEGRAM_BOT_TOKEN not set - bot disabled")

        # Start API server
        tasks.append(asyncio.create_task(self._run_api()))
        logger.info("API task created")

        # Wait for shutdown signal
        await self._shutdown_event.wait()

        # Cancel all tasks
        for task in tasks:
            task.cancel()

        # Wait for tasks to complete
        await asyncio.gather(*tasks, return_exceptions=True)

        # Cleanup
        await self._cleanup()

    async def _run_bot(self):
        """Run the Telegram bot."""
        try:
            await self.bot.delete_webhook(drop_pending_updates=True)
            logger.info("Starting bot polling...")
            await self.dp.start_polling(self.bot)
        except asyncio.CancelledError:
            logger.info("Bot polling cancelled")
        except Exception as e:
            logger.error(f"Bot error: {e}")
            raise

    async def _run_api(self):
        """Run the FastAPI server."""
        try:
            app = create_app()
            config = uvicorn.Config(
                app,
                host=self.settings.api_host,
                port=self.settings.api_port,
                log_level="debug" if self.settings.debug else "info",
            )
            server = uvicorn.Server(config)
            logger.info(f"Starting API server on {self.settings.api_host}:{self.settings.api_port}")
            await server.serve()
        except asyncio.CancelledError:
            logger.info("API server cancelled")
        except Exception as e:
            logger.error(f"API error: {e}")
            raise

    async def _load_xpubs(self):
        """Load xpubs from database into environment variables."""
        import os
        from swaperex.crypto import decrypt_xpub
        from swaperex.hdwallet.factory import reset_wallet_cache
        from swaperex.ledger.database import get_db
        from swaperex.ledger.repository import LedgerRepository

        try:
            async with get_db() as session:
                repo = LedgerRepository(session)
                xpubs = await repo.get_all_xpubs()

                for xpub_record in xpubs:
                    xpub_value = decrypt_xpub(xpub_record.encrypted_xpub)
                    env_key = f"XPUB_{xpub_record.asset.upper()}"
                    os.environ[env_key] = xpub_value
                    logger.info(f"Loaded xpub for {xpub_record.asset}")

                if xpubs:
                    reset_wallet_cache()
                    logger.info(f"Loaded {len(xpubs)} xpubs from database")
        except Exception as e:
            logger.warning(f"Failed to load xpubs: {e}")

    async def _cleanup(self):
        """Cleanup resources."""
        logger.info("Cleaning up...")

        if self.bot:
            await self.bot.session.close()

        await close_db()
        logger.info("Cleanup complete")

    def shutdown(self):
        """Signal shutdown."""
        logger.info("Shutdown requested")
        self._shutdown_event.set()


def main():
    """Main entry point."""
    app = Application()

    # Setup signal handlers
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, app.shutdown)

    try:
        loop.run_until_complete(app.start())
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        loop.close()


if __name__ == "__main__":
    main()
