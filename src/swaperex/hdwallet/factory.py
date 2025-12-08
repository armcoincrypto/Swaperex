"""HD Wallet factory for creating wallet instances.

Supported coins: BTC, LTC, ETH, SOL, BNB, ATOM, AVAX, MATIC (8 coins)
Plus stablecoins: USDT, USDC on respective chains

All coins have DEX swap support:
- BTC, LTC: THORChain
- ETH: Uniswap
- SOL: Jupiter
- BNB: PancakeSwap
- ATOM: Osmosis
- AVAX: Trader Joe
- MATIC: QuickSwap
"""

from typing import Optional

from swaperex.config import get_settings
from swaperex.hdwallet.base import HDWalletProvider, SimulatedHDWallet
from swaperex.hdwallet.btc import BTCHDWallet, LTCHDWallet
from swaperex.hdwallet.eth import (
    BSCHDWallet, ETHHDWallet, SOLHDWallet,
    AVAXHDWallet, MATICHDWallet,
)
from swaperex.hdwallet.chains import ATOMHDWallet

# Asset to wallet class mapping
# Core coins: BTC, LTC, ETH, SOL, BNB, ATOM, AVAX, MATIC (all have DEX support)
WALLET_CLASSES: dict[str, type[HDWalletProvider]] = {
    # Native coins
    "BTC": BTCHDWallet,
    "LTC": LTCHDWallet,
    "ETH": ETHHDWallet,
    "SOL": SOLHDWallet,
    "BNB": BSCHDWallet,
    "BSC": BSCHDWallet,  # Alias
    "ATOM": ATOMHDWallet,
    "AVAX": AVAXHDWallet,
    "MATIC": MATICHDWallet,
    "POLYGON": MATICHDWallet,  # Alias
    # ETH stablecoins (ERC-20)
    "USDT": ETHHDWallet,
    "USDT-ERC20": ETHHDWallet,
    "USDC": ETHHDWallet,
    "USDC-ERC20": ETHHDWallet,
    # BSC stablecoins (BEP-20)
    "USDT-BEP20": BSCHDWallet,
    "USDC-BEP20": BSCHDWallet,
    # SOL stablecoins (SPL)
    "USDT-SPL": SOLHDWallet,
    "USDC-SPL": SOLHDWallet,
    # AVAX stablecoins
    "USDT-AVAX": AVAXHDWallet,
    "USDC-AVAX": AVAXHDWallet,
    # MATIC stablecoins
    "USDT-MATIC": MATICHDWallet,
    "USDC-MATIC": MATICHDWallet,
}

# Cache for wallet instances
_wallet_cache: dict[str, HDWalletProvider] = {}


def get_supported_assets() -> list[str]:
    """Get list of supported HD wallet assets."""
    return list(WALLET_CLASSES.keys())


def get_core_coins() -> list[str]:
    """Get list of core supported coins (not stablecoins)."""
    return ["BTC", "LTC", "ETH", "SOL", "BNB", "ATOM", "AVAX", "MATIC"]


def get_stablecoins() -> dict[str, list[str]]:
    """Get stablecoins by chain."""
    return {
        "ETH": ["USDT-ERC20", "USDC-ERC20"],
        "BSC": ["USDT-BEP20", "USDC-BEP20"],
        "SOL": ["USDT-SPL", "USDC-SPL"],
        "AVAX": ["USDT-AVAX", "USDC-AVAX"],
        "MATIC": ["USDT-MATIC", "USDC-MATIC"],
    }


def get_hd_wallet(asset: str) -> HDWalletProvider:
    """Get HD wallet instance for an asset."""
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
    """Get xpub for a specific asset."""
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
    # ETH-based tokens use ETH xpub
    if asset in ["USDT", "USDT-ERC20", "USDC", "USDC-ERC20"]:
        return _load_xpub_from_db("ETH") or os.environ.get("XPUB_ETH")

    # BSC-based tokens use BSC or ETH xpub (same derivation)
    if asset in ["BNB", "BSC", "USDT-BEP20", "USDC-BEP20"]:
        return (_load_xpub_from_db("BSC") or _load_xpub_from_db("ETH") or
                os.environ.get("XPUB_BSC") or os.environ.get("XPUB_ETH"))

    # SOL-based tokens use SOL xpub
    if asset in ["USDT-SPL", "USDC-SPL"]:
        return _load_xpub_from_db("SOL") or os.environ.get("XPUB_SOL")

    # AVAX-based tokens use AVAX or ETH xpub (EVM-compatible)
    if asset in ["AVAX", "USDT-AVAX", "USDC-AVAX"]:
        return (_load_xpub_from_db("AVAX") or _load_xpub_from_db("ETH") or
                os.environ.get("XPUB_AVAX") or os.environ.get("XPUB_ETH"))

    # MATIC-based tokens use MATIC or ETH xpub (EVM-compatible)
    if asset in ["MATIC", "POLYGON", "USDT-MATIC", "USDC-MATIC"]:
        return (_load_xpub_from_db("MATIC") or _load_xpub_from_db("ETH") or
                os.environ.get("XPUB_MATIC") or os.environ.get("XPUB_ETH"))

    return None


def _load_xpub_from_db(asset: str) -> Optional[str]:
    """Load and decrypt xpub from database."""
    import asyncio

    try:
        from swaperex.crypto import decrypt_xpub
        from swaperex.ledger.database import get_engine
        from sqlalchemy import text

        async def fetch_xpub():
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

        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, fetch_xpub())
                return future.result(timeout=5)
        except RuntimeError:
            return asyncio.run(fetch_xpub())

    except Exception:
        return None


def reset_wallet_cache() -> None:
    """Clear wallet cache (useful for testing)."""
    _wallet_cache.clear()


def get_wallet_info(asset: str) -> dict:
    """Get information about the HD wallet for an asset."""
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
