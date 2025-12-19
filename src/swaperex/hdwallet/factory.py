"""HD Wallet factory for creating wallet instances.

This module provides a factory function to create HD wallet instances
based on asset type and configuration.
"""

from typing import Optional

from swaperex.config import get_settings
from swaperex.hdwallet.base import HDWalletProvider, SimulatedHDWallet
from swaperex.hdwallet.btc import BTCHDWallet, DASHHDWallet, LTCHDWallet
from swaperex.hdwallet.eth import BSCHDWallet, ETHHDWallet, SOLHDWallet, TRXHDWallet

# Asset to wallet class mapping
WALLET_CLASSES: dict[str, type[HDWalletProvider]] = {
    "BTC": BTCHDWallet,
    "LTC": LTCHDWallet,
    "ETH": ETHHDWallet,
    "BSC": BSCHDWallet,
    "BNB": BSCHDWallet,  # Alias for BSC
    "TRX": TRXHDWallet,
    "SOL": SOLHDWallet,
    "DASH": DASHHDWallet,
    "USDT": ETHHDWallet,  # Default USDT is ERC-20 (use ETH address)
    "USDT-TRC20": TRXHDWallet,
    "USDT-ERC20": ETHHDWallet,
    "USDC": ETHHDWallet,
}

# Cache for wallet instances
_wallet_cache: dict[str, HDWalletProvider] = {}


def get_supported_assets() -> list[str]:
    """Get list of supported HD wallet assets."""
    return list(WALLET_CLASSES.keys())


def get_hd_wallet(asset: str) -> HDWalletProvider:
    """Get HD wallet instance for an asset.

    Args:
        asset: Asset symbol (BTC, ETH, etc.)

    Returns:
        HDWalletProvider instance for the asset

    Raises:
        ValueError: If asset is not supported
    """
    asset_upper = asset.upper()

    # Check cache
    if asset_upper in _wallet_cache:
        return _wallet_cache[asset_upper]

    # Get wallet class
    wallet_class = WALLET_CLASSES.get(asset_upper)
    if wallet_class is None:
        # Fall back to simulated wallet for unsupported assets
        wallet = SimulatedHDWallet(asset_upper)
        _wallet_cache[asset_upper] = wallet
        return wallet

    # Get xpub from settings
    settings = get_settings()
    xpub = _get_xpub_for_asset(asset_upper, settings)
    testnet = not settings.is_production

    if not xpub:
        # No xpub configured - use simulated wallet
        wallet = SimulatedHDWallet(asset_upper, testnet=testnet)
        _wallet_cache[asset_upper] = wallet
        return wallet

    # Create real wallet
    wallet = wallet_class(xpub=xpub, testnet=testnet)
    _wallet_cache[asset_upper] = wallet
    return wallet


def _get_xpub_for_asset(asset: str, settings) -> Optional[str]:
    """Get xpub for a specific asset.

    Priority:
    1. Database (encrypted xpub_keys table)
    2. Environment variables (XPUB_BTC, etc.)
    """
    import os

    # Try to load from database first
    xpub = _load_xpub_from_db(asset.upper())
    if xpub:
        return xpub

    # Fall back to environment variables
    xpub = os.environ.get(f"XPUB_{asset.upper()}")
    if xpub:
        return xpub

    # Try generic xpub for chain families
    if asset in ["USDT", "USDT-ERC20", "USDC"]:
        return _load_xpub_from_db("ETH") or os.environ.get("XPUB_ETH")
    if asset in ["USDT-TRC20"]:
        return _load_xpub_from_db("TRX") or os.environ.get("XPUB_TRX")
    if asset in ["BNB", "BSC"]:
        return _load_xpub_from_db("BSC") or _load_xpub_from_db("ETH") or os.environ.get("XPUB_BSC") or os.environ.get("XPUB_ETH")

    return None


def _load_xpub_from_db(asset: str) -> Optional[str]:
    """Load xpub from pre-loaded environment variables.

    Note: Xpubs are loaded from the database into environment variables
    during application startup (see main.py _load_xpubs).
    This function only checks environment variables for simplicity
    and to avoid async/sync mixing issues.

    For direct database access, use load_xpub_from_db_async() instead.
    """
    import os
    return os.environ.get(f"XPUB_{asset.upper()}")


async def load_xpub_from_db_async(asset: str) -> Optional[str]:
    """Async function to load and decrypt xpub from database.

    Use this during application startup to preload xpubs.
    The sync get_hd_wallet() function uses cached environment variables.

    Args:
        asset: Asset symbol (BTC, ETH, etc.)

    Returns:
        Decrypted xpub string or None if not found
    """
    import logging
    logger = logging.getLogger(__name__)

    try:
        from swaperex.crypto import decrypt_xpub
        from swaperex.ledger.database import get_engine
        from sqlalchemy import text

        engine = get_engine()
        async with engine.connect() as conn:
            result = await conn.execute(
                text("SELECT encrypted_xpub FROM xpub_keys WHERE asset = :asset"),
                {"asset": asset.upper()}
            )
            row = result.fetchone()
            if row:
                return decrypt_xpub(row[0])
        return None

    except Exception as e:
        logger.debug(f"Failed to load xpub from DB for {asset}: {e}")
        return None


async def preload_xpubs_to_env() -> int:
    """Preload all xpubs from database into environment variables.

    This should be called during application startup before
    any wallet operations are performed.

    Returns:
        Number of xpubs loaded
    """
    import os
    import logging
    logger = logging.getLogger(__name__)

    try:
        from swaperex.crypto import decrypt_xpub
        from swaperex.ledger.database import get_engine
        from sqlalchemy import text

        engine = get_engine()
        count = 0

        async with engine.connect() as conn:
            result = await conn.execute(
                text("SELECT asset, encrypted_xpub FROM xpub_keys")
            )
            rows = result.fetchall()

            for row in rows:
                asset = row[0]
                encrypted_xpub = row[1]
                try:
                    xpub = decrypt_xpub(encrypted_xpub)
                    env_key = f"XPUB_{asset.upper()}"
                    os.environ[env_key] = xpub
                    count += 1
                    logger.debug(f"Loaded xpub for {asset}")
                except Exception as e:
                    logger.warning(f"Failed to decrypt xpub for {asset}: {e}")

        if count > 0:
            reset_wallet_cache()
            logger.info(f"Preloaded {count} xpubs from database")

        return count

    except Exception as e:
        logger.warning(f"Failed to preload xpubs: {e}")
        return 0


def reset_wallet_cache() -> None:
    """Clear wallet cache (useful for testing)."""
    _wallet_cache.clear()


def get_wallet_info(asset: str) -> dict:
    """Get information about the HD wallet for an asset.

    Returns:
        Dict with wallet info including whether it's configured
    """
    wallet = get_hd_wallet(asset)

    return {
        "asset": asset.upper(),
        "wallet_type": type(wallet).__name__,
        "is_simulated": isinstance(wallet, SimulatedHDWallet),
        "coin_type": wallet.coin_type,
        "purpose": wallet.purpose,
        "testnet": wallet.testnet,
        "has_xpub": bool(wallet.xpub) and not wallet.xpub.startswith("sim_"),
    }
