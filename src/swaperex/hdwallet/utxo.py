"""UTXO-based HD Wallet implementations.

Covers Bitcoin-family chains: BCH, DOGE, ZEC, DGB, RVN, BTG, NMC, VIA, SYS, KMD, XEC, MONA, FIO.

Each chain uses P2PKH (legacy) addresses with different:
- Coin types (BIP44)
- Address version bytes (prefix character)
- Network parameters
"""

import hashlib
from typing import Optional

from swaperex.hdwallet.base import AddressInfo, HDWalletProvider

# Try to import bip_utils
try:
    from bip_utils import (
        Bip32KeyNetVersions,
        Bip32Secp256k1,
        P2PKHAddrEncoder,
        P2SHAddrEncoder,
    )

    HAS_BIP_UTILS = True
except ImportError:
    HAS_BIP_UTILS = False


class UTXOBaseWallet(HDWalletProvider):
    """Base class for UTXO-based wallets using P2PKH addresses."""

    # Override in subclasses
    ASSET_NAME: str = "UTXO"
    COIN_TYPE: int = 0
    MAINNET_VERSION: bytes = b'\x00'
    TESTNET_VERSION: bytes = b'\x6f'
    MAINNET_PREFIX: str = "1"
    TESTNET_PREFIX: str = "m"

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

        valid_prefixes = ["xpub", "tpub"]
        if not any(self._xpub.startswith(p) for p in valid_prefixes):
            raise ValueError(f"Invalid {self.ASSET_NAME} xpub prefix")

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
        """Derive address at given index."""
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using raw BIP32."""
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        net_ver = self.TESTNET_VERSION if self._testnet else self.MAINNET_VERSION
        address = P2PKHAddrEncoder.EncodeKey(pubkey, net_ver=net_ver)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2pkh",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate deterministic simulated address."""
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        prefix = self.TESTNET_PREFIX if self._testnet else self.MAINNET_PREFIX
        address_hex = hash_bytes[:20].hex()
        address = f"{prefix}{address_hex[:33]}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2pkh_simulated",
        )


class BCHHDWallet(UTXOBaseWallet):
    """Bitcoin Cash HD Wallet.

    Coin type: 145
    Address format: P2PKH (starts with 'q' in CashAddr, '1' in legacy)
    """
    ASSET_NAME = "BCH"
    COIN_TYPE = 145
    MAINNET_VERSION = b'\x00'  # Same as BTC legacy
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "1"
    TESTNET_PREFIX = "m"


class DOGEHDWallet(UTXOBaseWallet):
    """Dogecoin HD Wallet.

    Coin type: 3
    Address format: P2PKH (starts with 'D')
    """
    ASSET_NAME = "DOGE"
    COIN_TYPE = 3
    MAINNET_VERSION = b'\x1e'  # 30 decimal -> 'D' prefix
    TESTNET_VERSION = b'\x71'  # 113 decimal -> 'n' prefix
    MAINNET_PREFIX = "D"
    TESTNET_PREFIX = "n"


class ZECHDWallet(UTXOBaseWallet):
    """Zcash HD Wallet (transparent addresses only).

    Coin type: 133
    Address format: t-address (starts with 't1' or 't3')
    """
    ASSET_NAME = "ZEC"
    COIN_TYPE = 133
    MAINNET_VERSION = b'\x1c\xb8'  # t1 prefix (2 bytes)
    TESTNET_VERSION = b'\x1d\x25'  # tm prefix
    MAINNET_PREFIX = "t1"
    TESTNET_PREFIX = "tm"

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive ZEC address (uses 2-byte version)."""
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # ZEC uses 2-byte version prefix
        net_ver = self.TESTNET_VERSION if self._testnet else self.MAINNET_VERSION
        address = P2PKHAddrEncoder.EncodeKey(pubkey, net_ver=net_ver)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="p2pkh",
        )


class DGBHDWallet(UTXOBaseWallet):
    """DigiByte HD Wallet.

    Coin type: 20
    Address format: P2PKH (starts with 'D')
    """
    ASSET_NAME = "DGB"
    COIN_TYPE = 20
    MAINNET_VERSION = b'\x1e'  # Same as DOGE, 'D' prefix
    TESTNET_VERSION = b'\x7e'
    MAINNET_PREFIX = "D"
    TESTNET_PREFIX = "d"


class RVNHDWallet(UTXOBaseWallet):
    """Ravencoin HD Wallet.

    Coin type: 175
    Address format: P2PKH (starts with 'R')
    """
    ASSET_NAME = "RVN"
    COIN_TYPE = 175
    MAINNET_VERSION = b'\x3c'  # 60 decimal -> 'R' prefix
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "R"
    TESTNET_PREFIX = "m"


class BTGHDWallet(UTXOBaseWallet):
    """Bitcoin Gold HD Wallet.

    Coin type: 156
    Address format: P2PKH (starts with 'G')
    """
    ASSET_NAME = "BTG"
    COIN_TYPE = 156
    MAINNET_VERSION = b'\x26'  # 38 decimal -> 'G' prefix
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "G"
    TESTNET_PREFIX = "m"


class NMCHDWallet(UTXOBaseWallet):
    """Namecoin HD Wallet.

    Coin type: 7
    Address format: P2PKH (starts with 'N' or 'M')
    """
    ASSET_NAME = "NMC"
    COIN_TYPE = 7
    MAINNET_VERSION = b'\x34'  # 52 decimal -> 'N' or 'M' prefix
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "N"
    TESTNET_PREFIX = "m"


class VIAHDWallet(UTXOBaseWallet):
    """Viacoin HD Wallet.

    Coin type: 14
    Address format: P2PKH (starts with 'V')
    """
    ASSET_NAME = "VIA"
    COIN_TYPE = 14
    MAINNET_VERSION = b'\x47'  # 71 decimal -> 'V' prefix
    TESTNET_VERSION = b'\x7f'
    MAINNET_PREFIX = "V"
    TESTNET_PREFIX = "t"


class SYSHDWallet(UTXOBaseWallet):
    """Syscoin HD Wallet.

    Coin type: 57
    Address format: P2PKH (starts with 'S')
    """
    ASSET_NAME = "SYS"
    COIN_TYPE = 57
    MAINNET_VERSION = b'\x3f'  # 63 decimal -> 'S' prefix
    TESTNET_VERSION = b'\x41'
    MAINNET_PREFIX = "S"
    TESTNET_PREFIX = "T"


class KMDHDWallet(UTXOBaseWallet):
    """Komodo HD Wallet.

    Coin type: 141
    Address format: P2PKH (starts with 'R')
    """
    ASSET_NAME = "KMD"
    COIN_TYPE = 141
    MAINNET_VERSION = b'\x3c'  # Same as RVN, 'R' prefix
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "R"
    TESTNET_PREFIX = "m"


class XECHDWallet(UTXOBaseWallet):
    """eCash (XEC) HD Wallet.

    Coin type: 145 (same as BCH, fork)
    Address format: CashAddr or legacy
    """
    ASSET_NAME = "XEC"
    COIN_TYPE = 145
    MAINNET_VERSION = b'\x00'
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "1"
    TESTNET_PREFIX = "m"


class MONAHDWallet(UTXOBaseWallet):
    """Monacoin HD Wallet.

    Coin type: 22
    Address format: P2PKH (starts with 'M')
    """
    ASSET_NAME = "MONA"
    COIN_TYPE = 22
    MAINNET_VERSION = b'\x32'  # 50 decimal -> 'M' prefix
    TESTNET_VERSION = b'\x6f'
    MAINNET_PREFIX = "M"
    TESTNET_PREFIX = "m"


class FIOHDWallet(HDWalletProvider):
    """FIO Protocol HD Wallet.

    Coin type: 235
    Address format: FIO public key format (FIO...)

    FIO uses a different key format than standard UTXO chains.
    """
    ASSET_NAME = "FIO"
    COIN_TYPE = 235

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate FIO xpub."""
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
                raise ValueError(f"Invalid FIO xpub: {e}")

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
        return "FIO"

    @property
    def coin_type(self) -> int:
        return 235

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive FIO address (public key format)."""
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive FIO public key."""
        import base58

        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # FIO uses FIO + base58 encoded pubkey with checksum
        # Simplified: FIO + base58(pubkey)
        address = "FIO" + base58.b58encode(pubkey).decode()[:50]

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="fio_pubkey",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate simulated FIO address."""
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        address = f"FIO{hash_bytes[:25].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="fio_pubkey_simulated",
        )
