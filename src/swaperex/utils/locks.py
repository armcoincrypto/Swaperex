"""Concurrency control utilities for user balance operations.

Provides per-user locking to prevent race conditions in swap and withdrawal operations.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

logger = logging.getLogger(__name__)

# Global lock registry: user_id -> asyncio.Lock
_user_locks: dict[int, asyncio.Lock] = {}
_registry_lock = asyncio.Lock()


async def get_user_lock(user_id: int) -> asyncio.Lock:
    """Get or create a lock for a specific user.

    Args:
        user_id: Internal user ID (not telegram_id)

    Returns:
        asyncio.Lock for the user
    """
    async with _registry_lock:
        if user_id not in _user_locks:
            _user_locks[user_id] = asyncio.Lock()
        return _user_locks[user_id]


class UserBalanceLock:
    """Context manager for acquiring exclusive access to a user's balance.

    Use this to wrap operations that need to read and modify a user's balance
    atomically, such as swaps and withdrawals.

    Example:
        async with UserBalanceLock(user_id):
            # Check balance
            balance = await repo.get_balance(user_id, asset)
            # Perform operation
            await repo.create_swap(...)
    """

    def __init__(
        self,
        user_id: int,
        timeout: Optional[float] = 30.0,
        operation: str = "balance_operation",
    ):
        """Initialize the lock.

        Args:
            user_id: Internal user ID
            timeout: Maximum time to wait for lock (None = wait forever)
            operation: Description of the operation for logging
        """
        self.user_id = user_id
        self.timeout = timeout
        self.operation = operation
        self._lock: Optional[asyncio.Lock] = None
        self._acquired = False

    async def __aenter__(self) -> "UserBalanceLock":
        """Acquire the lock."""
        self._lock = await get_user_lock(self.user_id)

        try:
            if self.timeout:
                # Try to acquire with timeout
                self._acquired = await asyncio.wait_for(
                    self._lock.acquire(),
                    timeout=self.timeout,
                )
            else:
                await self._lock.acquire()
                self._acquired = True

            if self._acquired:
                logger.debug(f"Lock acquired for user {self.user_id}: {self.operation}")
            return self

        except asyncio.TimeoutError:
            logger.warning(
                f"Lock timeout for user {self.user_id} after {self.timeout}s: {self.operation}"
            )
            raise LockTimeoutError(
                f"Could not acquire lock for user {self.user_id} within {self.timeout}s"
            )

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Release the lock."""
        if self._acquired and self._lock:
            self._lock.release()
            logger.debug(f"Lock released for user {self.user_id}: {self.operation}")
        return False


class LockTimeoutError(Exception):
    """Raised when a lock cannot be acquired within the timeout period."""

    pass


@asynccontextmanager
async def user_balance_lock(
    user_id: int,
    timeout: Optional[float] = 30.0,
    operation: str = "balance_operation",
):
    """Functional context manager for user balance locking.

    Args:
        user_id: Internal user ID
        timeout: Maximum time to wait for lock
        operation: Description for logging

    Yields:
        Nothing - just provides the lock context

    Example:
        async with user_balance_lock(user_id, operation="swap"):
            # Atomic balance operations here
            pass
    """
    lock = await get_user_lock(user_id)

    try:
        if timeout:
            acquired = await asyncio.wait_for(lock.acquire(), timeout=timeout)
            if not acquired:
                raise LockTimeoutError(f"Could not acquire lock for user {user_id}")
        else:
            await lock.acquire()

        logger.debug(f"Lock acquired for user {user_id}: {operation}")
        yield

    except asyncio.TimeoutError:
        logger.warning(f"Lock timeout for user {user_id}: {operation}")
        raise LockTimeoutError(
            f"Could not acquire lock for user {user_id} within {timeout}s"
        )

    finally:
        if lock.locked():
            lock.release()
            logger.debug(f"Lock released for user {user_id}: {operation}")


def clear_user_locks() -> None:
    """Clear all user locks (useful for testing)."""
    _user_locks.clear()
