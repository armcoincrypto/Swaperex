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


def bech32_encode(prefix: str, data: bytes) -> str:
    """Encode data as bech32 address with given prefix.

    Args:
        prefix: Human-readable prefix (e.g., 'osmo', 'cosmos')
        data: 20-byte address data (RIPEMD160 hash)

    Returns:
        Bech32 encoded address string
    """
    if HAS_BIP_UTILS:
        return Bech32Encoder.Encode(prefix, data)

    # Fallback bech32 implementation
    # Based on BIP-173 reference implementation
    CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

    def polymod(values: list[int]) -> int:
        """Internal function for bech32 checksum."""
        generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
        chk = 1
        for value in values:
            top = chk >> 25
            chk = (chk & 0x1ffffff) << 5 ^ value
            for i in range(5):
                chk ^= generator[i] if ((top >> i) & 1) else 0
        return chk

    def hrp_expand(hrp: str) -> list[int]:
        """Expand human-readable part for checksum."""
        return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

    def create_checksum(hrp: str, data: list[int]) -> list[int]:
        """Create bech32 checksum."""
        values = hrp_expand(hrp) + data
        polymod_val = polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
        return [(polymod_val >> 5 * (5 - i)) & 31 for i in range(6)]

    def convertbits(data: bytes, frombits: int, tobits: int, pad: bool = True) -> list[int]:
        """Convert between bit sizes."""
        acc = 0
        bits = 0
        ret = []
        maxv = (1 << tobits) - 1
        max_acc = (1 << (frombits + tobits - 1)) - 1
        for value in data:
            acc = ((acc << frombits) | value) & max_acc
            bits += frombits
            while bits >= tobits:
                bits -= tobits
                ret.append((acc >> bits) & maxv)
        if pad:
            if bits:
                ret.append((acc << (tobits - bits)) & maxv)
        elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
            return []
        return ret

    # Convert 8-bit data to 5-bit groups
    data_5bit = convertbits(data, 8, 5)
    checksum = create_checksum(prefix, data_5bit)
    combined = data_5bit + checksum

    return prefix + "1" + "".join([CHARSET[d] for d in combined])


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
