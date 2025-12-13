"""HD Wallet factory for creating wallet instances.

This module provides a factory function to create HD wallet instances
based on asset type and configuration.

Supports:
- Individual xpub configuration (XPUB_BTC, XPUB_ETH, etc.)
- Seed phrase configuration (SEED_PHRASE) for deriving all xpubs
"""

from typing import Optional
import os
import logging

# Load .env file into os.environ for seed phrase access
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, rely on system environment

from swaperex.config import get_settings
from swaperex.hdwallet.base import HDWalletProvider, SimulatedHDWallet
from swaperex.hdwallet.btc import BTCHDWallet, DASHHDWallet, LTCHDWallet
from swaperex.hdwallet.eth import BSCHDWallet, ETHHDWallet, SOLHDWallet, TRXHDWallet

logger = logging.getLogger(__name__)

# Asset to wallet class mapping
WALLET_CLASSES: dict[str, type[HDWalletProvider]] = {
    # Bitcoin family
    "BTC": BTCHDWallet,
    "LTC": LTCHDWallet,
    "DASH": DASHHDWallet,
    # Ethereum family (EVM compatible - all use same address)
    "ETH": ETHHDWallet,
    "BSC": BSCHDWallet,
    "BNB": BSCHDWallet,  # Alias for BSC
    "MATIC": ETHHDWallet,  # Polygon uses ETH address
    "AVAX": ETHHDWallet,  # Avalanche C-Chain uses ETH address
    # ERC-20 tokens (use ETH address)
    "USDT": ETHHDWallet,
    "USDT-ERC20": ETHHDWallet,
    "USDC": ETHHDWallet,
    "DAI": ETHHDWallet,
    "LINK": ETHHDWallet,
    "UNI": ETHHDWallet,
    "AAVE": ETHHDWallet,
    # BEP-20 tokens (use BSC/ETH address)
    "BUSD": BSCHDWallet,
    "CAKE": BSCHDWallet,
    # Tron family
    "TRX": TRXHDWallet,
    "USDT-TRC20": TRXHDWallet,
    # Solana
    "SOL": SOLHDWallet,
    # Other chains (simulated for now)
    "ATOM": None,  # Cosmos - needs specific implementation
    "DOGE": None,  # Dogecoin - needs specific implementation
    "XRP": None,   # XRP Ledger - needs specific implementation
}

# Cache for wallet instances
_wallet_cache: dict[str, HDWalletProvider] = {}

# Cache for xpubs derived from seed phrase
_xpub_cache: dict[str, str] = {}


def get_supported_assets() -> list[str]:
    """Get list of supported HD wallet assets."""
    return list(WALLET_CLASSES.keys())


def derive_xpub_from_seed(seed_phrase: str, coin_type: int, purpose: int = 44) -> Optional[str]:
    """Derive xpub from seed phrase for a specific coin.

    Args:
        seed_phrase: BIP39 mnemonic seed phrase
        coin_type: BIP44 coin type (0=BTC, 60=ETH, 2=LTC, etc.)
        purpose: BIP purpose (44, 84, etc.)

    Returns:
        Extended public key (xpub) or None if derivation fails
    """
    try:
        from bip_utils import (
            Bip39SeedGenerator,
            Bip32Secp256k1,
        )

        # Generate seed from mnemonic
        seed = Bip39SeedGenerator(seed_phrase).Generate()

        # Use BIP32 directly for derivation (compatible with bip_utils 2.x)
        bip32_ctx = Bip32Secp256k1.FromSeed(seed)

        # Derive path: m/purpose'/coin_type'/0'
        path = f"{purpose}'/{coin_type}'/0'"
        account_ctx = bip32_ctx.DerivePath(path)

        # Get extended public key (bip_utils 2.x uses ToExtended, not ToExtendedKey)
        return account_ctx.PublicKey().ToExtended()

    except ImportError:
        logger.warning("bip_utils not installed, cannot derive xpub from seed")
        return None
    except Exception as e:
        logger.error(f"Failed to derive xpub from seed: {e}")
        return None


def get_xpub_from_seed_for_asset(asset: str) -> Optional[str]:
    """Get xpub for an asset by deriving from seed phrase.

    Args:
        asset: Asset symbol (BTC, ETH, etc.)

    Returns:
        Extended public key or None
    """
    # Support multiple env variable names for seed phrase
    seed_phrase = (
        os.environ.get("SEED_PHRASE") or
        os.environ.get("WALLET_SEED_PHRASE") or
        os.environ.get("MNEMONIC")
    )
    if not seed_phrase:
        return None

    asset_upper = asset.upper()

    # Check cache first
    if asset_upper in _xpub_cache:
        return _xpub_cache[asset_upper]

    # Map assets to coin types and purposes
    coin_configs = {
        "BTC": (0, 84),   # BIP84 native SegWit
        "LTC": (2, 84),   # BIP84 native SegWit
        "DASH": (5, 44),  # BIP44
        "ETH": (60, 44),  # BIP44 (also used for BSC, MATIC, AVAX, all ERC-20)
        "BSC": (60, 44),  # Same as ETH
        "BNB": (60, 44),  # Same as ETH
        "MATIC": (60, 44),
        "AVAX": (60, 44),
        "TRX": (195, 44),
        "SOL": (501, 44),
        # ERC-20 tokens use ETH
        "USDT": (60, 44),
        "USDC": (60, 44),
        "DAI": (60, 44),
        "LINK": (60, 44),
        "UNI": (60, 44),
        "AAVE": (60, 44),
        "BUSD": (60, 44),
        "CAKE": (60, 44),
        # TRC-20 tokens use TRX
        "USDT-TRC20": (195, 44),
    }

    config = coin_configs.get(asset_upper)
    if not config:
        return None

    coin_type, purpose = config
    xpub = derive_xpub_from_seed(seed_phrase, coin_type, purpose)

    if xpub:
        _xpub_cache[asset_upper] = xpub
        logger.info(f"Derived xpub for {asset_upper} from seed phrase")

    return xpub


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
    3. Derive from seed phrase (SEED_PHRASE env var)
    """
    asset_upper = asset.upper()

    # Try to load from database first
    xpub = _load_xpub_from_db(asset_upper)
    if xpub:
        return xpub

    # Fall back to environment variables
    xpub = os.environ.get(f"XPUB_{asset_upper}")
    if xpub:
        return xpub

    # Try generic xpub for chain families
    if asset_upper in ["USDT", "USDT-ERC20", "USDC", "DAI", "LINK", "UNI", "AAVE"]:
        xpub = _load_xpub_from_db("ETH") or os.environ.get("XPUB_ETH")
        if xpub:
            return xpub
    if asset_upper in ["USDT-TRC20"]:
        xpub = _load_xpub_from_db("TRX") or os.environ.get("XPUB_TRX")
        if xpub:
            return xpub
    if asset_upper in ["BNB", "BSC", "BUSD", "CAKE"]:
        xpub = _load_xpub_from_db("BSC") or _load_xpub_from_db("ETH") or os.environ.get("XPUB_BSC") or os.environ.get("XPUB_ETH")
        if xpub:
            return xpub
    if asset_upper in ["MATIC", "AVAX"]:
        xpub = _load_xpub_from_db("ETH") or os.environ.get("XPUB_ETH")
        if xpub:
            return xpub

    # Try to derive from seed phrase as last resort
    xpub = get_xpub_from_seed_for_asset(asset_upper)
    if xpub:
        return xpub

    return None


def _load_xpub_from_db(asset: str) -> Optional[str]:
    """Load and decrypt xpub from database.

    Uses synchronous database access for compatibility with factory pattern.
    """
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

        # Run async function
        try:
            loop = asyncio.get_running_loop()
            # If we're already in an async context, create a task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, fetch_xpub())
                return future.result(timeout=5)
        except RuntimeError:
            # No running loop, safe to use asyncio.run
            return asyncio.run(fetch_xpub())

    except Exception:
        # If anything fails, return None and fall back to env vars
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
