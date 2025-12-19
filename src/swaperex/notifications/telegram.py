"""Telegram notification service.

Sends notifications to users for deposits, withdrawals, and other events.
Uses a singleton pattern to share the bot instance.
"""

import asyncio
import logging
from decimal import Decimal
from typing import Optional

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from swaperex.config import get_settings

logger = logging.getLogger(__name__)

# Singleton bot instance
_bot_instance: Optional[Bot] = None
_bot_lock = asyncio.Lock()


async def get_bot() -> Optional[Bot]:
    """Get or create the bot instance for notifications."""
    global _bot_instance

    if _bot_instance is not None:
        return _bot_instance

    async with _bot_lock:
        # Double-check after acquiring lock
        if _bot_instance is not None:
            return _bot_instance

        settings = get_settings()
        if not settings.telegram_bot_token:
            logger.warning("Telegram bot token not configured - notifications disabled")
            return None

        _bot_instance = Bot(token=settings.telegram_bot_token)
        return _bot_instance


async def close_bot() -> None:
    """Close the bot session (call on shutdown)."""
    global _bot_instance
    if _bot_instance is not None:
        await _bot_instance.session.close()
        _bot_instance = None


class TelegramNotifier:
    """Service for sending Telegram notifications to users."""

    def __init__(self, bot: Optional[Bot] = None):
        """Initialize with optional bot instance.

        If no bot provided, will use the singleton instance.
        """
        self._bot = bot

    async def _get_bot(self) -> Optional[Bot]:
        """Get the bot instance."""
        if self._bot:
            return self._bot
        return await get_bot()

    async def send_message(
        self,
        telegram_id: int,
        message: str,
        parse_mode: Optional[str] = "HTML",
    ) -> bool:
        """Send a message to a user.

        Args:
            telegram_id: User's Telegram ID
            message: Message text
            parse_mode: Optional parse mode (HTML, Markdown, etc.)

        Returns:
            True if message was sent successfully
        """
        bot = await self._get_bot()
        if not bot:
            logger.warning("Cannot send notification - bot not initialized")
            return False

        try:
            await bot.send_message(
                chat_id=telegram_id,
                text=message,
                parse_mode=parse_mode,
            )
            return True
        except TelegramForbiddenError:
            logger.warning(f"User {telegram_id} has blocked the bot")
            return False
        except TelegramBadRequest as e:
            logger.error(f"Bad request sending to {telegram_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send notification to {telegram_id}: {e}")
            return False

    async def notify_deposit_confirmed(
        self,
        telegram_id: int,
        asset: str,
        amount: Decimal,
        tx_hash: Optional[str] = None,
    ) -> bool:
        """Notify user of confirmed deposit.

        Args:
            telegram_id: User's Telegram ID
            asset: Asset symbol (BTC, ETH, etc.)
            amount: Deposit amount
            tx_hash: Transaction hash (optional)

        Returns:
            True if notification was sent
        """
        # Format amount nicely
        amount_str = f"{amount:,.8f}".rstrip("0").rstrip(".")

        message = (
            f"<b>Deposit Confirmed</b>\n\n"
            f"Amount: <code>{amount_str} {asset.upper()}</code>\n"
        )

        if tx_hash:
            # Truncate hash for display
            short_hash = f"{tx_hash[:8]}...{tx_hash[-8:]}" if len(tx_hash) > 20 else tx_hash
            message += f"TX: <code>{short_hash}</code>\n"

        message += f"\nYour balance has been updated."

        return await self.send_message(telegram_id, message)

    async def notify_deposit_pending(
        self,
        telegram_id: int,
        asset: str,
        amount: Decimal,
        confirmations: int,
        required_confirmations: int,
    ) -> bool:
        """Notify user of pending deposit.

        Args:
            telegram_id: User's Telegram ID
            asset: Asset symbol
            amount: Deposit amount
            confirmations: Current confirmations
            required_confirmations: Required confirmations

        Returns:
            True if notification was sent
        """
        amount_str = f"{amount:,.8f}".rstrip("0").rstrip(".")

        message = (
            f"<b>Deposit Detected</b>\n\n"
            f"Amount: <code>{amount_str} {asset.upper()}</code>\n"
            f"Confirmations: {confirmations}/{required_confirmations}\n\n"
            f"Waiting for confirmations..."
        )

        return await self.send_message(telegram_id, message)

    async def notify_withdrawal_complete(
        self,
        telegram_id: int,
        asset: str,
        amount: Decimal,
        fee: Decimal,
        destination: str,
        tx_hash: str,
    ) -> bool:
        """Notify user of completed withdrawal.

        Args:
            telegram_id: User's Telegram ID
            asset: Asset symbol
            amount: Withdrawal amount (before fee)
            fee: Fee amount
            destination: Destination address
            tx_hash: Transaction hash

        Returns:
            True if notification was sent
        """
        net_amount = amount - fee
        amount_str = f"{net_amount:,.8f}".rstrip("0").rstrip(".")
        fee_str = f"{fee:,.8f}".rstrip("0").rstrip(".")

        # Truncate address and hash for display
        short_addr = f"{destination[:10]}...{destination[-6:]}"
        short_hash = f"{tx_hash[:8]}...{tx_hash[-8:]}" if len(tx_hash) > 20 else tx_hash

        message = (
            f"<b>Withdrawal Complete</b>\n\n"
            f"Sent: <code>{amount_str} {asset.upper()}</code>\n"
            f"Fee: <code>{fee_str} {asset.upper()}</code>\n"
            f"To: <code>{short_addr}</code>\n"
            f"TX: <code>{short_hash}</code>"
        )

        return await self.send_message(telegram_id, message)

    async def notify_withdrawal_failed(
        self,
        telegram_id: int,
        asset: str,
        amount: Decimal,
        error: str,
        refunded: bool = True,
    ) -> bool:
        """Notify user of failed withdrawal.

        Args:
            telegram_id: User's Telegram ID
            asset: Asset symbol
            amount: Withdrawal amount
            error: Error message
            refunded: Whether funds were refunded

        Returns:
            True if notification was sent
        """
        amount_str = f"{amount:,.8f}".rstrip("0").rstrip(".")

        message = (
            f"<b>Withdrawal Failed</b>\n\n"
            f"Amount: <code>{amount_str} {asset.upper()}</code>\n"
            f"Error: {error}\n"
        )

        if refunded:
            message += "\nYour funds have been refunded to your balance."

        return await self.send_message(telegram_id, message)

    async def notify_swap_complete(
        self,
        telegram_id: int,
        from_asset: str,
        to_asset: str,
        from_amount: Decimal,
        to_amount: Decimal,
        provider: str,
    ) -> bool:
        """Notify user of completed swap.

        Args:
            telegram_id: User's Telegram ID
            from_asset: Source asset
            to_asset: Destination asset
            from_amount: Amount swapped
            to_amount: Amount received
            provider: Routing provider used

        Returns:
            True if notification was sent
        """
        from_str = f"{from_amount:,.8f}".rstrip("0").rstrip(".")
        to_str = f"{to_amount:,.8f}".rstrip("0").rstrip(".")

        message = (
            f"<b>Swap Complete</b>\n\n"
            f"Sent: <code>{from_str} {from_asset.upper()}</code>\n"
            f"Received: <code>{to_str} {to_asset.upper()}</code>\n"
            f"Provider: {provider}"
        )

        return await self.send_message(telegram_id, message)

    async def notify_swap_failed(
        self,
        telegram_id: int,
        from_asset: str,
        to_asset: str,
        from_amount: Decimal,
        error: str,
    ) -> bool:
        """Notify user of failed swap.

        Args:
            telegram_id: User's Telegram ID
            from_asset: Source asset
            to_asset: Destination asset
            from_amount: Amount that was locked
            error: Error message

        Returns:
            True if notification was sent
        """
        from_str = f"{from_amount:,.8f}".rstrip("0").rstrip(".")

        message = (
            f"<b>Swap Failed</b>\n\n"
            f"Swap: {from_str} {from_asset.upper()} -> {to_asset.upper()}\n"
            f"Error: {error}\n\n"
            f"Your funds have been unlocked."
        )

        return await self.send_message(telegram_id, message)


# Global notifier instance
_notifier: Optional[TelegramNotifier] = None


def get_notifier() -> TelegramNotifier:
    """Get the global notifier instance."""
    global _notifier
    if _notifier is None:
        _notifier = TelegramNotifier()
    return _notifier
