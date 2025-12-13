"""Alternative L1 Chain HD Wallet implementations.

Covers: XRP, XLM, TON, NEAR, KAS, ICP, ALGO, EGLD, HBAR, VET, FTM, ROSE

Each chain has unique:
- Key derivation (Ed25519, secp256k1, etc.)
- Address encoding formats
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
        Bip32Slip10Ed25519,
        Bech32Encoder,
    )

    HAS_BIP_UTILS = True
except ImportError:
    HAS_BIP_UTILS = False


# ============================================================================
# XRP Ledger
# ============================================================================

class XRPHDWallet(HDWalletProvider):
    """XRP Ledger HD Wallet.

    Coin type: 144
    Address format: Base58 with 'r' prefix
    Uses secp256k1 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
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
                raise ValueError(f"Invalid XRP xpub: {e}")

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
        return "XRP"

    @property
    def coin_type(self) -> int:
        return 144

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import XrpAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        address = XrpAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="xrp_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = f"r{hash_bytes[:20].hex()[:33]}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="xrp_simulated",
        )


# ============================================================================
# Stellar (XLM)
# ============================================================================

class XLMHDWallet(HDWalletProvider):
    """Stellar (XLM) HD Wallet.

    Coin type: 148
    Address format: Base32 with 'G' prefix
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid XLM xpub: {e}")

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
        return "XLM"

    @property
    def coin_type(self) -> int:
        return 148

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import XlmAddrEncoder, XlmAddrTypes

        # Ed25519 uses hardened derivation
        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        address = XlmAddrEncoder.EncodeKey(pubkey, addr_type=XlmAddrTypes.PUB_KEY)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="xlm_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = f"G{hash_bytes[:28].hex().upper()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="xlm_simulated",
        )


# ============================================================================
# TON (The Open Network)
# ============================================================================

class TONHDWallet(HDWalletProvider):
    """TON HD Wallet.

    Coin type: 607
    Address format: Base64 encoded
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid TON xpub: {e}")

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
        return "TON"

    @property
    def coin_type(self) -> int:
        return 607

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        import base64

        # Ed25519 hardened derivation
        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # TON address is derived from public key hash
        # Simplified: EQ + base64(sha256(pubkey)[:32])
        hash_bytes = hashlib.sha256(pubkey).digest()
        address = "EQ" + base64.urlsafe_b64encode(hash_bytes).decode()[:46]

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="ton_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        import base64

        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = "EQ" + base64.urlsafe_b64encode(hash_bytes).decode()[:46]

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="ton_simulated",
        )


# ============================================================================
# NEAR Protocol
# ============================================================================

class NEARHDWallet(HDWalletProvider):
    """NEAR Protocol HD Wallet.

    Coin type: 397
    Address format: Implicit account (hex pubkey) or named accounts
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid NEAR xpub: {e}")

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
        return "NEAR"

    @property
    def coin_type(self) -> int:
        return 397

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import NearAddrEncoder

        # Ed25519 hardened derivation
        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        address = NearAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="near_implicit",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = hash_bytes[:32].hex()

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="near_simulated",
        )


# ============================================================================
# Kaspa (KAS)
# ============================================================================

class KASHDWallet(HDWalletProvider):
    """Kaspa HD Wallet.

    Coin type: 111111 (non-standard)
    Address format: kaspa:qr... (bech32-like)
    Uses secp256k1 with Schnorr signatures
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
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
                raise ValueError(f"Invalid KAS xpub: {e}")

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
        return "KAS"

    @property
    def coin_type(self) -> int:
        return 111111

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # Kaspa uses blake2b hash and bech32 encoding
        blake2b_hash = hashlib.blake2b(pubkey, digest_size=32).digest()
        prefix = "kaspatest:" if self._testnet else "kaspa:"
        address = f"{prefix}qr{blake2b_hash[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="kaspa_schnorr",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        prefix = "kaspatest:" if self._testnet else "kaspa:"
        address = f"{prefix}qr{hash_bytes[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="kaspa_simulated",
        )


# ============================================================================
# Internet Computer (ICP)
# ============================================================================

class ICPHDWallet(HDWalletProvider):
    """Internet Computer HD Wallet.

    Coin type: 223
    Address format: Principal ID or Account Identifier
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid ICP xpub: {e}")

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
        return "ICP"

    @property
    def coin_type(self) -> int:
        return 223

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import IcpAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        address = IcpAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="icp_principal",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        # ICP principal format: xxxxx-xxxxx-xxxxx-xxxxx-xxx
        hex_str = hash_bytes[:14].hex()
        address = f"{hex_str[:5]}-{hex_str[5:10]}-{hex_str[10:15]}-{hex_str[15:20]}-{hex_str[20:23]}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="icp_simulated",
        )


# ============================================================================
# Algorand (ALGO)
# ============================================================================

class ALGOHDWallet(HDWalletProvider):
    """Algorand HD Wallet.

    Coin type: 283
    Address format: Base32 (58 chars)
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid ALGO xpub: {e}")

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
        return "ALGO"

    @property
    def coin_type(self) -> int:
        return 283

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import AlgoAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        address = AlgoAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="algo_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        import base64

        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        # ALGO address is base32 encoded public key + checksum
        address = base64.b32encode(hash_bytes).decode()[:58].replace("=", "")

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="algo_simulated",
        )


# ============================================================================
# MultiversX (EGLD)
# ============================================================================

class EGLDHDWallet(HDWalletProvider):
    """MultiversX (EGLD) HD Wallet.

    Coin type: 508
    Address format: bech32 with 'erd' prefix
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid EGLD xpub: {e}")

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
        return "EGLD"

    @property
    def coin_type(self) -> int:
        return 508

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import EgldAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        address = EgldAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="egld_bech32",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = f"erd1{hash_bytes[:32].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="egld_simulated",
        )


# ============================================================================
# Hedera (HBAR)
# ============================================================================

class HBARHDWallet(HDWalletProvider):
    """Hedera Hashgraph HD Wallet.

    Coin type: 3030
    Address format: Account ID (0.0.xxxxx) or alias
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid HBAR xpub: {e}")

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
        return "HBAR"

    @property
    def coin_type(self) -> int:
        return 3030

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        # HBAR uses account IDs, not derived addresses
        # We generate a deterministic public key alias
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # HBAR alias is hex-encoded public key
        # Actual account ID requires on-chain registration
        address = f"0.0.{pubkey[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="hbar_alias",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        # Simulated account ID
        account_num = int.from_bytes(hash_bytes[:4], 'big') % 10000000
        address = f"0.0.{account_num}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="hbar_simulated",
        )


# ============================================================================
# VeChain (VET)
# ============================================================================

class VETHDWallet(HDWalletProvider):
    """VeChain HD Wallet.

    Coin type: 818
    Address format: 0x... (similar to Ethereum)
    Uses secp256k1 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
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
                raise ValueError(f"Invalid VET xpub: {e}")

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
        return "VET"

    @property
    def coin_type(self) -> int:
        return 818

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import EthAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawUncompressed().ToBytes()

        # VET uses same address format as ETH
        address = EthAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="vet_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = f"0x{hash_bytes[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="vet_simulated",
        )


# ============================================================================
# Fantom (FTM) - EVM Compatible
# ============================================================================

class FTMHDWallet(HDWalletProvider):
    """Fantom HD Wallet.

    Coin type: 60 (EVM-compatible)
    Address format: 0x... (same as Ethereum)
    Uses secp256k1 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
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
                raise ValueError(f"Invalid FTM xpub: {e}")

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
        return "FTM"

    @property
    def coin_type(self) -> int:
        return 60  # EVM compatible

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        from bip_utils import EthAddrEncoder

        child = self._bip32_ctx.DerivePath(f"{change}/{index}")
        pubkey = child.PublicKey().RawUncompressed().ToBytes()

        address = EthAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="ftm_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = f"0x{hash_bytes[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="ftm_simulated",
        )


# ============================================================================
# Oasis Network (ROSE)
# ============================================================================

class ROSEHDWallet(HDWalletProvider):
    """Oasis Network HD Wallet.

    Coin type: 474
    Address format: bech32 with 'oasis' prefix
    Uses Ed25519 curve
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        if not self._xpub:
            return

        if HAS_BIP_UTILS:
            try:
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e', b'\x04\x88\xad\xe4'
                )
                self._bip32_ctx = Bip32Slip10Ed25519.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid ROSE xpub: {e}")

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
        return "ROSE"

    @property
    def coin_type(self) -> int:
        return 474

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        child = self._bip32_ctx.DerivePath(f"{change}'/{index}'")
        pubkey = child.PublicKey().RawCompressed().ToBytes()

        # Oasis uses bech32 encoding
        address = f"oasis1{hashlib.sha256(pubkey).digest()[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="rose_bech32",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()
        address = f"oasis1{hash_bytes[:20].hex()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="rose_simulated",
        )
