"""HD Wallet implementation for ATOM (Cosmos).

ATOM uses secp256k1 curve with bech32 addresses (cosmos1...).
DEX support: Osmosis
"""

import hashlib
from typing import Optional

from swaperex.hdwallet.base import AddressInfo, HDWalletProvider

# Try to import required libraries
try:
    from bip_utils import (
        Bip32Secp256k1,
        Bip32KeyNetVersions,
        AtomAddrEncoder,
    )
    HAS_BIP_UTILS = True
except ImportError:
    HAS_BIP_UTILS = False


class ATOMHDWallet(HDWalletProvider):
    """Cosmos (ATOM) HD Wallet using SLIP-44.

    Derivation path: m/44'/118'/0'/0/index
    Address format: cosmos1... (bech32)

    ATOM uses secp256k1 curve.
    DEX support: Osmosis
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate ATOM xpub and initialize BIP32 context."""
        if not self._xpub:
            return

        valid_prefixes = ["xpub", "tpub"]
        if not any(self._xpub.startswith(p) for p in valid_prefixes):
            raise ValueError("Invalid ATOM xpub prefix")

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e',  # xpub
                    b'\x04\x88\xad\xe4'   # xprv (not used)
                )
                self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid ATOM xpub: {e}")

    @property
    def xpub(self) -> str:
        return self._xpub

    @xpub.setter
    def xpub(self, value: str) -> None:
        self._xpub = value
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
        return "ATOM"

    @property
    def coin_type(self) -> int:
        return 118  # SLIP-44 for Cosmos

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive ATOM address."""
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        else:
            return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using BIP32 and ATOM address encoding."""
        # Derive child key: change/index
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")

        # Get compressed public key
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # Encode as ATOM address (cosmos1... bech32)
        address = AtomAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="atom_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate deterministic simulated address."""
        seed = f"{self._xpub}:ATOM:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        # ATOM addresses start with 'cosmos1'
        address = f"cosmos1{hash_bytes[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="atom_address_simulated",
        )
