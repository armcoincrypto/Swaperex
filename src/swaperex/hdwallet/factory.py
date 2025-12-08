"""HD Wallet factory for creating wallet instances from seed phrase.

Supports Trust Wallet seed phrase to derive addresses for all 8 chains:
- BTC, LTC: THORChain
- ETH: Uniswap
- SOL: Jupiter
- BNB: PancakeSwap
- ATOM: Osmosis
- AVAX: Trader Joe
- MATIC: QuickSwap
"""

import os
from typing import Optional

from swaperex.config import get_settings
from swaperex.hdwallet.base import HDWalletProvider, SimulatedHDWallet, AddressInfo


# Cache for wallet instances
_wallet_cache: dict[str, HDWalletProvider] = {}


def get_supported_assets() -> list[str]:
    """Get list of supported HD wallet assets."""
    return ["BTC", "LTC", "ETH", "SOL", "BNB", "ATOM", "AVAX", "MATIC",
            "USDT", "USDT-ERC20", "USDC", "USDC-ERC20",
            "USDT-BEP20", "USDC-BEP20", "USDT-SPL", "USDC-SPL",
            "USDT-AVAX", "USDC-AVAX", "USDT-MATIC", "USDC-MATIC"]


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


class SeedPhraseWallet(HDWalletProvider):
    """HD Wallet that derives addresses from seed phrase."""

    def __init__(self, seed_phrase: str, asset_symbol: str, testnet: bool = False):
        self.seed_phrase = seed_phrase
        self._asset = asset_symbol.upper()
        self._testnet = testnet
        self._xpub = f"seed:{asset_symbol}"  # Marker that we're using seed

    def _validate_xpub(self) -> None:
        """No xpub validation needed for seed phrase wallet."""
        pass

    @property
    def xpub(self) -> str:
        return self._xpub

    @xpub.setter
    def xpub(self, value: str) -> None:
        self._xpub = value

    @property
    def testnet(self) -> bool:
        return self._testnet

    @testnet.setter
    def testnet(self, value: bool) -> None:
        self._testnet = value

    @property
    def asset(self) -> str:
        return self._asset

    @property
    def coin_type(self) -> int:
        """BIP44 coin type."""
        coin_types = {
            "BTC": 0, "LTC": 2, "ETH": 60, "BNB": 60, "BSC": 60,
            "AVAX": 60, "MATIC": 60, "SOL": 501, "ATOM": 118,
        }
        base_asset = self._get_base_asset()
        return coin_types.get(base_asset, 60)

    @property
    def purpose(self) -> int:
        """BIP44/84 purpose."""
        if self._asset in ["BTC", "LTC"]:
            return 84  # Native SegWit
        return 44  # Standard

    def _get_base_asset(self) -> str:
        """Get base asset for stablecoins."""
        asset = self._asset
        if asset in ["USDT", "USDC", "USDT-ERC20", "USDC-ERC20"]:
            return "ETH"
        if asset in ["USDT-BEP20", "USDC-BEP20", "BNB", "BSC"]:
            return "ETH"
        if asset in ["USDT-SPL", "USDC-SPL"]:
            return "SOL"
        if asset in ["USDT-AVAX", "USDC-AVAX", "AVAX"]:
            return "ETH"
        if asset in ["USDT-MATIC", "USDC-MATIC", "MATIC", "POLYGON"]:
            return "ETH"
        return asset

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive address at index from seed phrase."""
        try:
            address = self._derive_from_seed(index)
            return AddressInfo(
                address=address,
                asset=self._asset,
                derivation_path=self.get_derivation_path(index, change),
                index=index,
                change=change,
                script_type="seed",
            )
        except Exception as e:
            # Fallback to simulated if derivation fails
            prefix = "sim" if not self._testnet else "tsim"
            address = f"{prefix}:{self._asset.lower()}:{change}:{index:06d}"
            return AddressInfo(
                address=address,
                asset=self._asset,
                derivation_path=self.get_derivation_path(index, change),
                index=index,
                change=change,
                script_type="simulated_fallback",
            )

    def _derive_from_seed(self, index: int) -> str:
        """Derive address using bip_utils."""
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip84, Bip44Coins, Bip84Coins,
            Bip44Changes, Bip39MnemonicValidator,
        )

        # Validate mnemonic
        if not Bip39MnemonicValidator(self.seed_phrase).IsValid():
            raise ValueError("Invalid seed phrase")

        # Generate seed
        seed = Bip39SeedGenerator(self.seed_phrase).Generate()

        base_asset = self._get_base_asset()

        # BTC - BIP84 Native SegWit
        if base_asset == "BTC":
            bip84 = Bip84.FromSeed(seed, Bip84Coins.BITCOIN)
            account = bip84.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
            address = account.AddressIndex(index).PublicKey().ToAddress()
            return address

        # LTC - BIP84 Native SegWit
        if base_asset == "LTC":
            bip84 = Bip84.FromSeed(seed, Bip84Coins.LITECOIN)
            account = bip84.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
            address = account.AddressIndex(index).PublicKey().ToAddress()
            return address

        # ETH and EVM chains (ETH, BNB, AVAX, MATIC)
        if base_asset == "ETH":
            bip44 = Bip44.FromSeed(seed, Bip44Coins.ETHEREUM)
            account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
            address = account.AddressIndex(index).PublicKey().ToAddress()
            return address

        # SOL
        if base_asset == "SOL":
            bip44 = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
            # Solana uses different derivation - m/44'/501'/index'/0'
            address = bip44.Purpose().Coin().Account(index).PublicKey().ToAddress()
            return address

        # ATOM
        if base_asset == "ATOM":
            bip44 = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
            account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
            address = account.AddressIndex(index).PublicKey().ToAddress()
            return address

        raise ValueError(f"Unsupported asset: {self._asset}")


def get_hd_wallet(asset: str) -> HDWalletProvider:
    """Get HD wallet instance for an asset."""
    asset_upper = asset.upper()

    # Check cache
    if asset_upper in _wallet_cache:
        return _wallet_cache[asset_upper]

    settings = get_settings()
    testnet = not settings.is_production

    # Try seed phrase first
    seed_phrase = settings.wallet_seed_phrase
    if seed_phrase and len(seed_phrase.split()) >= 12:
        wallet = SeedPhraseWallet(seed_phrase, asset_upper, testnet=testnet)
        _wallet_cache[asset_upper] = wallet
        return wallet

    # Fall back to xpub from environment
    xpub = _get_xpub_for_asset(asset_upper)
    if xpub:
        wallet = _create_xpub_wallet(asset_upper, xpub, testnet)
        _wallet_cache[asset_upper] = wallet
        return wallet

    # No wallet configured - use simulated
    wallet = SimulatedHDWallet(asset_upper, testnet=testnet)
    _wallet_cache[asset_upper] = wallet
    return wallet


def _get_xpub_for_asset(asset: str) -> Optional[str]:
    """Get xpub for a specific asset from environment."""
    xpub = os.environ.get(f"XPUB_{asset.upper()}")
    if xpub:
        return xpub

    # Try generic xpub for chain families
    if asset in ["USDT", "USDT-ERC20", "USDC", "USDC-ERC20"]:
        return os.environ.get("XPUB_ETH")

    if asset in ["BNB", "BSC", "USDT-BEP20", "USDC-BEP20"]:
        return os.environ.get("XPUB_BSC") or os.environ.get("XPUB_ETH")

    if asset in ["USDT-SPL", "USDC-SPL"]:
        return os.environ.get("XPUB_SOL")

    if asset in ["AVAX", "USDT-AVAX", "USDC-AVAX"]:
        return os.environ.get("XPUB_AVAX") or os.environ.get("XPUB_ETH")

    if asset in ["MATIC", "POLYGON", "USDT-MATIC", "USDC-MATIC"]:
        return os.environ.get("XPUB_MATIC") or os.environ.get("XPUB_ETH")

    return None


def _create_xpub_wallet(asset: str, xpub: str, testnet: bool) -> HDWalletProvider:
    """Create wallet from xpub."""
    from swaperex.hdwallet.btc import BTCHDWallet, LTCHDWallet
    from swaperex.hdwallet.eth import (
        ETHHDWallet, BSCHDWallet, SOLHDWallet, AVAXHDWallet, MATICHDWallet,
    )
    from swaperex.hdwallet.chains import ATOMHDWallet

    wallet_map = {
        "BTC": BTCHDWallet,
        "LTC": LTCHDWallet,
        "ETH": ETHHDWallet,
        "BNB": BSCHDWallet,
        "BSC": BSCHDWallet,
        "SOL": SOLHDWallet,
        "ATOM": ATOMHDWallet,
        "AVAX": AVAXHDWallet,
        "MATIC": MATICHDWallet,
    }

    # Get base asset for stablecoins
    base_asset = asset
    if asset in ["USDT", "USDC", "USDT-ERC20", "USDC-ERC20"]:
        base_asset = "ETH"
    elif asset in ["USDT-BEP20", "USDC-BEP20"]:
        base_asset = "BSC"
    elif asset in ["USDT-SPL", "USDC-SPL"]:
        base_asset = "SOL"
    elif asset in ["USDT-AVAX", "USDC-AVAX"]:
        base_asset = "AVAX"
    elif asset in ["USDT-MATIC", "USDC-MATIC", "POLYGON"]:
        base_asset = "MATIC"

    wallet_class = wallet_map.get(base_asset)
    if wallet_class:
        return wallet_class(xpub=xpub, testnet=testnet)

    return SimulatedHDWallet(asset, testnet=testnet)


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
        "has_seed": isinstance(wallet, SeedPhraseWallet),
    }
