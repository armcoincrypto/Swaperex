"""HD Wallet factory for creating wallet instances.

This module provides a factory function to create HD wallet instances
based on asset type and configuration.
"""

from typing import Optional

from swaperex.config import get_settings
from swaperex.hdwallet.base import HDWalletProvider, SimulatedHDWallet
from swaperex.hdwallet.btc import BTCHDWallet, LTCHDWallet
from swaperex.hdwallet.eth import BSCHDWallet, ETHHDWallet, TRXHDWallet

# Asset to wallet class mapping
WALLET_CLASSES: dict[str, type[HDWalletProvider]] = {
    "BTC": BTCHDWallet,
    "LTC": LTCHDWallet,
    "ETH": ETHHDWallet,
    "BSC": BSCHDWallet,
    "BNB": BSCHDWallet,  # Alias for BSC
    "TRX": TRXHDWallet,
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
    """Get xpub from settings for a specific asset.

    Xpubs are stored in environment variables as:
    - XPUB_BTC=zpub...
    - XPUB_ETH=xpub...
    - etc.
    """
    import os

    # Try asset-specific xpub first
    xpub = os.environ.get(f"XPUB_{asset.upper()}")
    if xpub:
        return xpub

    # Try generic xpub for chain families
    if asset in ["USDT-ERC20", "USDC"]:
        return os.environ.get("XPUB_ETH")
    if asset in ["USDT-TRC20"]:
        return os.environ.get("XPUB_TRX")
    if asset in ["BNB", "BSC"]:
        return os.environ.get("XPUB_BSC") or os.environ.get("XPUB_ETH")

    return None


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
