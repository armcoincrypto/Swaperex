"""BTC HD Wallet implementation using BIP84 (Native SegWit).

Derivation path: m/84'/0'/0'/change/index
Address format: bech32 (bc1q...)

This implementation uses the bip_utils library for cryptographic derivation.
Only the xpub (extended public key) is used - no private keys.
"""

import hashlib
from typing import Optional

from swaperex.hdwallet.base import AddressInfo, HDWalletProvider

# Try to import bip_utils, fall back to simulation if not available
try:
    from bip_utils import (
        Bip32KeyNetVersions,
        Bip32Secp256k1,
        Bip44Changes,
        Bip84,
        Bip84Coins,
        P2WPKHAddrEncoder,
    )

    HAS_BIP_UTILS = True
except ImportError:
    HAS_BIP_UTILS = False

# Network version bytes for different xpub formats
VPUB_NET_VER = Bip32KeyNetVersions(b'\x04\x5f\x1c\xf6', b'\x04\x5f\x18\xbc') if HAS_BIP_UTILS else None  # BIP84 testnet
ZPUB_NET_VER = Bip32KeyNetVersions(b'\x04\xb2\x47\x46', b'\x04\xb2\x43\x0c') if HAS_BIP_UTILS else None  # BIP84 mainnet


class BTCHDWallet(HDWalletProvider):
    """Bitcoin HD Wallet using BIP84 (Native SegWit).

    Generates bc1q... addresses from an xpub/zpub.

    Example:
        wallet = BTCHDWallet(xpub="zpub...")
        addr = wallet.derive_address(index=0)
        # AddressInfo(address="bc1q...", ...)
    """

    def __init__(self, xpub: str, testnet: bool = False):
        """Initialize BTC HD wallet.

        Args:
            xpub: Extended public key (zpub for mainnet, vpub for testnet)
            testnet: Use testnet if True
        """
        self._xpub = xpub
        self._testnet = testnet
        self._bip84_ctx: Optional[object] = None
        self._bip32_ctx: Optional[object] = None
        self._use_bip32: bool = False

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate the xpub format."""
        if not self._xpub:
            return

        # Check prefix for BIP84
        valid_prefixes = ["zpub", "vpub", "xpub", "tpub"]
        if not any(self._xpub.startswith(p) for p in valid_prefixes):
            raise ValueError(
                f"Invalid xpub prefix. Expected one of {valid_prefixes}, "
                f"got: {self._xpub[:4]}"
            )

        if HAS_BIP_UTILS:
            try:
                # Use raw BIP32 parsing with correct network versions for vpub/zpub
                if self._xpub.startswith("vpub"):
                    self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(self._xpub, VPUB_NET_VER)
                    self._use_bip32 = True
                elif self._xpub.startswith("zpub"):
                    self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(self._xpub, ZPUB_NET_VER)
                    self._use_bip32 = True
                else:
                    # Try standard BIP84 parsing for xpub/tpub
                    self._use_bip32 = False
                    if self._testnet:
                        self._bip84_ctx = Bip84.FromExtendedKey(
                            self._xpub, Bip84Coins.BITCOIN_TESTNET
                        )
                    else:
                        self._bip84_ctx = Bip84.FromExtendedKey(
                            self._xpub, Bip84Coins.BITCOIN
                        )
            except Exception as e:
                raise ValueError(f"Invalid BTC xpub: {e}")

    @property
    def xpub(self) -> str:
        return self._xpub

    @xpub.setter
    def xpub(self, value: str) -> None:
        self._xpub = value
        self._bip84_ctx = None
        self._bip32_ctx = None
        self._use_bip32 = False
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
        return "BTC"

    @property
    def coin_type(self) -> int:
        return 0 if not self._testnet else 1

    @property
    def purpose(self) -> int:
        return 84  # BIP84 for native SegWit

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive a BTC address at the given index.

        Args:
            index: Child index (0, 1, 2, ...)
            change: 0 for receiving, 1 for change

        Returns:
            AddressInfo with bech32 address
        """
        if HAS_BIP_UTILS:
            if self._use_bip32 and self._bip32_ctx:
                return self._derive_with_bip32(index, change)
            elif self._bip84_ctx:
                return self._derive_with_bip_utils(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using raw BIP32 for vpub/zpub keys."""
        # Derive change/index path
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # Generate bech32 address
        hrp = "tb" if self._testnet else "bc"
        address = P2WPKHAddrEncoder.EncodeKey(pubkey, hrp=hrp)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2wpkh",
        )

    def _derive_with_bip_utils(self, index: int, change: int) -> AddressInfo:
        """Derive address using bip_utils library."""
        # Navigate to change level
        if change == 0:
            change_ctx = self._bip84_ctx.Change(Bip44Changes.CHAIN_EXT)
        else:
            change_ctx = self._bip84_ctx.Change(Bip44Changes.CHAIN_INT)

        # Derive address at index
        addr_ctx = change_ctx.AddressIndex(index)
        address = addr_ctx.PublicKey().ToAddress()

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2wpkh",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate deterministic simulated address when bip_utils not available."""
        # Create deterministic but fake address
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        # Simulate bech32 format
        if self._testnet:
            prefix = "tb1q"
        else:
            prefix = "bc1q"

        # Use first 20 bytes for witness program (simulated)
        witness_hex = hash_bytes[:20].hex()
        address = f"{prefix}{witness_hex[:38]}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2wpkh_simulated",
        )


class LTCHDWallet(HDWalletProvider):
    """Litecoin HD Wallet using BIP84 (Native SegWit).

    Similar to BTC but with different coin type and address prefix.
    Generates ltc1q... addresses.
    """

    # LTC BIP84 network version bytes
    # Ltub = 019da462 (testnet), Mtub = 01b26ef6 (mainnet)
    LTUB_NET_VER = Bip32KeyNetVersions(b'\x01\x9d\xa4\x62', b'\x01\x9d\x9c\xfe') if HAS_BIP_UTILS else None
    MTUB_NET_VER = Bip32KeyNetVersions(b'\x01\xb2\x6e\xf6', b'\x01\xb2\x67\x92') if HAS_BIP_UTILS else None

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate LTC xpub and initialize BIP32 context."""
        if not self._xpub:
            return

        valid_prefixes = ["Ltub", "Mtub", "xpub", "tpub", "zpub"]
        if not any(self._xpub.startswith(p) for p in valid_prefixes):
            raise ValueError("Invalid LTC xpub prefix")

        if HAS_BIP_UTILS:
            try:
                # Parse with appropriate network version
                if self._xpub.startswith("Ltub"):
                    self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                        self._xpub, self.LTUB_NET_VER
                    )
                elif self._xpub.startswith("Mtub"):
                    self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                        self._xpub, self.MTUB_NET_VER
                    )
                else:
                    # Standard xpub format
                    key_net_ver = Bip32KeyNetVersions(
                        b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                    )
                    self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                        self._xpub, key_net_ver
                    )
            except Exception as e:
                raise ValueError(f"Invalid LTC xpub: {e}")

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
        return "LTC"

    @property
    def coin_type(self) -> int:
        return 2

    @property
    def purpose(self) -> int:
        return 84

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive LTC address."""
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using raw BIP32."""
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # LTC uses ltc1 for mainnet, tltc1 for testnet (bech32)
        hrp = "tltc" if self._testnet else "ltc"
        address = P2WPKHAddrEncoder.EncodeKey(pubkey, hrp=hrp)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2wpkh",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate deterministic simulated address."""
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        prefix = "tltc1q" if self._testnet else "ltc1q"
        witness_hex = hash_bytes[:20].hex()
        address = f"{prefix}{witness_hex[:38]}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2wpkh_simulated",
        )
