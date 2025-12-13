"""Cosmos ecosystem HD Wallet implementations.

Covers: ATOM, OSMO, INJ, TIA, JUNO, SCRT

Cosmos chains use:
- Ed25519 or secp256k1 for key derivation
- Bech32 address encoding with chain-specific prefixes
"""

import hashlib
from typing import Optional

from swaperex.hdwallet.base import AddressInfo, HDWalletProvider

# Try to import bip_utils
try:
    from bip_utils import (
        Bip32KeyNetVersions,
        Bip32Secp256k1,
        Bip32Slip10Secp256k1,
        Bech32Encoder,
        CoinsNames,
    )

    HAS_BIP_UTILS = True
except ImportError:
    HAS_BIP_UTILS = False


class CosmosBaseWallet(HDWalletProvider):
    """Base class for Cosmos ecosystem wallets.

    Most Cosmos chains use secp256k1 with bech32 address encoding.
    """

    ASSET_NAME: str = "ATOM"
    COIN_TYPE: int = 118  # Standard Cosmos coin type
    BECH32_PREFIX: str = "cosmos"

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate xpub and initialize BIP32 context."""
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid {self.ASSET_NAME} xpub: {e}")

    @property
    def xpub(self) -> str:
        return self._xpub

    @xpub.setter
    def xpub(self, value: str) -> None:
        self._xpub = value
        self._bip32_ctx = None
        if value:
            self._validate_xpub()

    @property
    def testnet(self) -> bool:
        return self._testnet

    @testnet.setter
    def testnet(self, value: bool) -> None:
        self._testnet = value

    @property
    def asset(self) -> str:
        return self.ASSET_NAME

    @property
    def coin_type(self) -> int:
        return self.COIN_TYPE

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive Cosmos address."""
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using BIP32 and bech32 encoding."""
        from bip_utils import AtomAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # Cosmos uses RIPEMD160(SHA256(pubkey)) for address
        sha256_hash = hashlib.sha256(pubkey).digest()
        ripemd160 = hashlib.new('ripemd160', sha256_hash).digest()

        # Encode with bech32
        address = Bech32Encoder.Encode(self.BECH32_PREFIX, ripemd160)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="cosmos_bech32",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate simulated Cosmos address."""
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        # Simulated bech32-like format
        address = f"{self.BECH32_PREFIX}1{hash_bytes[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="cosmos_simulated",
        )


class ATOMHDWallet(CosmosBaseWallet):
    """Cosmos Hub (ATOM) HD Wallet.

    Coin type: 118
    Address format: bech32 with 'cosmos' prefix
    """
    ASSET_NAME = "ATOM"
    COIN_TYPE = 118
    BECH32_PREFIX = "cosmos"


class OSMOHDWallet(CosmosBaseWallet):
    """Osmosis (OSMO) HD Wallet.

    Coin type: 118
    Address format: bech32 with 'osmo' prefix
    """
    ASSET_NAME = "OSMO"
    COIN_TYPE = 118
    BECH32_PREFIX = "osmo"


class INJHDWallet(CosmosBaseWallet):
    """Injective (INJ) HD Wallet.

    Coin type: 60 (EVM-compatible) or 118
    Address format: bech32 with 'inj' prefix
    """
    ASSET_NAME = "INJ"
    COIN_TYPE = 60  # INJ uses EVM coin type
    BECH32_PREFIX = "inj"


class TIAHDWallet(CosmosBaseWallet):
    """Celestia (TIA) HD Wallet.

    Coin type: 118
    Address format: bech32 with 'celestia' prefix
    """
    ASSET_NAME = "TIA"
    COIN_TYPE = 118
    BECH32_PREFIX = "celestia"


class JUNOHDWallet(CosmosBaseWallet):
    """Juno (JUNO) HD Wallet.

    Coin type: 118
    Address format: bech32 with 'juno' prefix
    """
    ASSET_NAME = "JUNO"
    COIN_TYPE = 118
    BECH32_PREFIX = "juno"


class SCRTHDWallet(CosmosBaseWallet):
    """Secret Network (SCRT) HD Wallet.

    Coin type: 529
    Address format: bech32 with 'secret' prefix
    """
    ASSET_NAME = "SCRT"
    COIN_TYPE = 529
    BECH32_PREFIX = "secret"
