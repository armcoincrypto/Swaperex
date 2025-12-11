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
from swaperex.config import get_settings
from swaperex.ledger.database import close_db, init_db

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

        logger.info("Starting Swaperex...")
        logger.info(f"Environment: {self.settings.environment}")

        # Production safety checks
        self._validate_production_settings()

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
        """Run the FastAPI server with port fallback."""
        app = create_app()
        # Try multiple ports if the primary one is busy
        ports_to_try = [self.settings.api_port, 8001, 8002, 8003]

        for port in ports_to_try:
            try:
                config = uvicorn.Config(
                    app,
                    host=self.settings.api_host,
                    port=port,
                    log_level="debug" if self.settings.debug else "info",
                )
                server = uvicorn.Server(config)
                logger.info(f"Starting API server on {self.settings.api_host}:{port}")
                await server.serve()
                return  # Server started successfully
            except asyncio.CancelledError:
                logger.info("API server cancelled")
                return
            except OSError as e:
                if "address already in use" in str(e).lower() or e.errno == 98:
                    logger.warning(f"Port {port} is busy, trying next port...")
                    continue
                logger.error(f"API error: {e}")
                # Don't crash the bot for API errors
                return
            except Exception as e:
                logger.error(f"API error: {e}")
                # Don't crash the bot for API errors
                return

        logger.error("All API ports are busy, API server not started (bot will continue)")

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

    def _validate_production_settings(self):
        """Validate settings for production safety.

        Logs warnings for dangerous configurations and blocks
        certain combinations that could lead to fund loss.
        """
        is_prod = self.settings.is_production

        # Log current security configuration
        logger.info("=== Security Configuration ===")
        logger.info(f"  Environment: {self.settings.environment}")
        logger.info(f"  Debug mode: {self.settings.debug}")
        logger.info(f"  Dry-run mode: {self.settings.dry_run}")
        logger.info(f"  Wallet configured: {self.settings.has_wallet}")
        logger.info(f"  Max swap amount: ${self.settings.max_swap_amount}")
        logger.info("==============================")

        warnings = []
        errors = []

        # Check debug mode in production
        if is_prod and self.settings.debug:
            warnings.append(
                "DEBUG mode is enabled in PRODUCTION! "
                "This exposes sensitive information in logs. "
                "Set DEBUG=false for production."
            )

        # Check dry-run disabled in production without safety measures
        if is_prod and not self.settings.dry_run:
            if not self.settings.has_wallet:
                errors.append(
                    "CRITICAL: Production mode with DRY_RUN=false but no wallet configured! "
                    "Set WALLET_SEED_PHRASE or enable DRY_RUN=true."
                )
            elif self.settings.max_swap_amount > 50000:
                warnings.append(
                    f"High max swap amount (${self.settings.max_swap_amount}) in production. "
                    "Consider lowering MAX_SWAP_AMOUNT for safety."
                )

        # Check admin token in production
        if is_prod and not self.settings.admin_token:
            warnings.append(
                "No ADMIN_TOKEN configured in production! "
                "API endpoints may be unprotected."
            )

        # Check API binding in production
        if is_prod and self.settings.api_host == "0.0.0.0":
            warnings.append(
                "API bound to 0.0.0.0 in production. "
                "Consider binding to 127.0.0.1 and using a reverse proxy."
            )

        # Log warnings
        for warning in warnings:
            logger.warning(f"⚠️  {warning}")

        # Log and potentially block on errors
        for error in errors:
            logger.error(f"🚨 {error}")

        if errors:
            logger.error(
                "Critical configuration errors detected! "
                "Fix the issues above or set ENVIRONMENT=development to bypass."
            )
            if is_prod:
                raise SystemExit(
                    "Cannot start in production with critical configuration errors. "
                    "See logs above for details."
                )

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
