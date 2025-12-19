"""Global safety guards for execution mode enforcement.

This module provides safety mechanisms to prevent custodial operations
from being accidentally invoked in WEB_NON_CUSTODIAL mode.

CRITICAL: These guards make it IMPOSSIBLE to accidentally become custodial
in web mode. Any attempt to access restricted modules will raise an error.
"""

import logging
import sys
from functools import wraps
from typing import Callable, TypeVar, Any

from swaperex.config import get_settings, ExecutionMode

logger = logging.getLogger(__name__)

# Restricted modules that should NEVER be accessed in WEB mode
RESTRICTED_MODULES = [
    "swaperex.signing",
    "swaperex.signing.factory",
    "swaperex.signing.local",
    "swaperex.signing.kms",
    "swaperex.signing.hsm",
    "swaperex.hdwallet.btc",
    "swaperex.hdwallet.eth",
    "swaperex.hdwallet.cosmos",
    "swaperex.hdwallet.utxo",
    "swaperex.hdwallet.altchains",
    "swaperex.withdrawal.factory",
    "swaperex.services.deposit_sweeper",
]

# Counter for blocked attempts (for monitoring)
_blocked_attempts: dict[str, int] = {}


class CustodialAccessError(RuntimeError):
    """Raised when custodial functionality is accessed in web mode."""

    def __init__(self, module: str, operation: str = "access"):
        self.module = module
        self.operation = operation
        super().__init__(
            f"SECURITY VIOLATION: Attempted to {operation} restricted module '{module}' "
            f"in WEB_NON_CUSTODIAL mode. This operation is BLOCKED. "
            f"Custodial functionality is only available in TELEGRAM_CUSTODIAL mode."
        )


def log_blocked_attempt(module: str, caller: str = "") -> None:
    """Log a blocked access attempt.

    Args:
        module: The module that was attempted to be accessed
        caller: The calling context (if known)
    """
    global _blocked_attempts

    _blocked_attempts[module] = _blocked_attempts.get(module, 0) + 1

    logger.warning(
        "🚫 SECURITY BLOCK: Attempted access to '%s' in WEB_NON_CUSTODIAL mode. "
        "Attempt #%d. Caller: %s",
        module,
        _blocked_attempts[module],
        caller or "unknown",
    )


def get_blocked_attempts() -> dict[str, int]:
    """Get count of blocked attempts per module."""
    return _blocked_attempts.copy()


def require_custodial(func: Callable) -> Callable:
    """Decorator to require custodial mode for a function.

    Usage:
        @require_custodial
        def sign_transaction(...):
            ...

    Raises:
        CustodialAccessError: If called in WEB_NON_CUSTODIAL mode
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        settings = get_settings()
        if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
            module = func.__module__
            log_blocked_attempt(module, f"{func.__module__}.{func.__name__}")
            raise CustodialAccessError(module, f"call {func.__name__}")
        return func(*args, **kwargs)

    return wrapper


T = TypeVar("T")


def guard_module_import(module_name: str) -> None:
    """Check if a module import should be blocked.

    Call this at the top of sensitive modules to prevent imports in web mode.

    Args:
        module_name: The module being imported

    Raises:
        CustodialAccessError: If import should be blocked
    """
    settings = get_settings()

    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        # Check if this is a restricted module
        for restricted in RESTRICTED_MODULES:
            if module_name.startswith(restricted) or module_name == restricted:
                log_blocked_attempt(module_name, "import")
                raise CustodialAccessError(module_name, "import")


def check_custodial_access(operation: str = "This operation") -> None:
    """Check if custodial access is allowed.

    Lightweight check that can be called anywhere to enforce mode.

    Args:
        operation: Description of the operation

    Raises:
        CustodialAccessError: If in web mode
    """
    settings = get_settings()

    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        log_blocked_attempt("custodial_access", operation)
        raise CustodialAccessError("custodial_operations", operation)


def print_startup_banner() -> None:
    """Print startup banner with mode information.

    Shows warning banner if in non-custodial web mode.
    """
    settings = get_settings()

    print("\n" + "=" * 60)

    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        print("⚠️  RUNNING IN NON-CUSTODIAL WEB MODE")
        print("=" * 60)
        print("  🔒 Transaction signing: DISABLED")
        print("  🔒 Private key access: DISABLED")
        print("  🔒 Transaction broadcasting: DISABLED")
        print("  ✅ Quote generation: ENABLED")
        print("  ✅ Blockchain queries: ENABLED")
        print("  ✅ Unsigned transactions: ENABLED")
        print("-" * 60)
        print("  All signing must happen CLIENT-SIDE")
        print("  Backend is READ-ONLY + transaction builder")
        print("=" * 60)
    else:
        print("🤖 RUNNING IN TELEGRAM CUSTODIAL MODE")
        print("=" * 60)
        print("  ✅ Transaction signing: ENABLED")
        print("  ✅ Private key access: ENABLED (for signing)")
        print("  ✅ Transaction broadcasting: ENABLED")
        print("  ✅ All features: ENABLED")
        print("-" * 60)
        print("  This mode is for Telegram bot operation")
        print("=" * 60)

    print(f"  Environment: {settings.environment}")
    print(f"  Debug: {settings.debug}")
    print(f"  Dry Run: {settings.dry_run}")
    print("=" * 60 + "\n")


def validate_web_mode_imports() -> list[str]:
    """Validate that no restricted modules are imported in web mode.

    Returns:
        List of violations found (empty if clean)
    """
    settings = get_settings()

    if settings.mode != ExecutionMode.WEB_NON_CUSTODIAL:
        return []

    violations = []

    for restricted in RESTRICTED_MODULES:
        if restricted in sys.modules:
            violations.append(restricted)
            logger.error(
                "🚨 SECURITY VIOLATION: Restricted module '%s' is loaded in web mode!",
                restricted,
            )

    return violations


def setup_safety_guards() -> None:
    """Initialize safety guards.

    Should be called at application startup.
    """
    settings = get_settings()

    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        logger.info(
            "🔒 Safety guards ACTIVE: Custodial operations blocked in WEB_NON_CUSTODIAL mode"
        )

        # Check for any pre-loaded restricted modules
        violations = validate_web_mode_imports()
        if violations:
            logger.critical(
                "🚨 CRITICAL: Restricted modules already loaded: %s",
                ", ".join(violations),
            )
    else:
        logger.info(
            "✅ Running in TELEGRAM_CUSTODIAL mode: All operations available"
        )


# Safety check functions for specific operations

def can_sign_transactions() -> bool:
    """Check if transaction signing is allowed."""
    settings = get_settings()
    return settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL


def can_access_private_keys() -> bool:
    """Check if private key access is allowed."""
    settings = get_settings()
    return settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL


def can_broadcast_transactions() -> bool:
    """Check if transaction broadcasting is allowed."""
    settings = get_settings()
    return settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL


def can_derive_addresses() -> bool:
    """Check if HD address derivation is allowed."""
    settings = get_settings()
    return settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL


# Module-level initialization
def _init() -> None:
    """Module initialization."""
    pass


_init()
