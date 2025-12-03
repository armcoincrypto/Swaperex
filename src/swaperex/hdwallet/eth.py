"""ETH HD Wallet implementation using BIP44.

Derivation path: m/44'/60'/0'/0/index
Address format: 0x... (checksum encoded)

Works for ETH, BSC, Polygon, and other EVM-compatible chains.
Only the xpub is used - no private keys.
"""

import hashlib
from typing import Optional

from swaperex.hdwallet.base import AddressInfo, HDWalletProvider

# Try to import required libraries
try:
    from eth_utils import to_checksum_address

    HAS_ETH_LIBS = True
except ImportError:
    HAS_ETH_LIBS = False

try:
    from bip_utils import (
        Bip44, Bip44Coins, Bip44Changes,
        Bip32Secp256k1, Bip32KeyNetVersions,
        EthAddrEncoder,
    )

    HAS_BIP_UTILS = True
except ImportError:
    HAS_BIP_UTILS = False


class ETHHDWallet(HDWalletProvider):
    """Ethereum HD Wallet using BIP44.

    Generates 0x... checksum addresses from an xpub.
    Compatible with ETH, BSC, Polygon, Arbitrum, etc.

    Example:
        wallet = ETHHDWallet(xpub="xpub...")
        addr = wallet.derive_address(index=0)
        # AddressInfo(address="0x...", ...)
    """

    def __init__(self, xpub: str, testnet: bool = False, chain: str = "ETH"):
        """Initialize ETH HD wallet.

        Args:
            xpub: Extended public key
            testnet: Use testnet if True
            chain: Chain identifier (ETH, BSC, POLYGON, etc.)
        """
        self._xpub = xpub
        self._testnet = testnet
        self._chain = chain.upper()
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate the xpub format and initialize BIP32 context."""
        if not self._xpub:
            return

        valid_prefixes = ["xpub", "tpub"]
        if not any(self._xpub.startswith(p) for p in valid_prefixes):
            raise ValueError(
                f"Invalid xpub prefix. Expected one of {valid_prefixes}"
            )

        if HAS_BIP_UTILS:
            try:
                # Use raw BIP32 derivation for flexibility
                # xpub uses standard BIP32 network version
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e',  # xpub
                    b'\x04\x88\xad\xe4'   # xprv (not used)
                )
                self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid ETH xpub: {e}")

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
        return self._chain

    @property
    def coin_type(self) -> int:
        return 60  # ETH coin type for all EVM chains

    @property
    def purpose(self) -> int:
        return 44  # BIP44 for ETH

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive an ETH address at the given index.

        Args:
            index: Child index (0, 1, 2, ...)
            change: Usually 0 for ETH (no change addresses typically used)

        Returns:
            AddressInfo with checksum address
        """
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        else:
            return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using raw BIP32 and ETH address encoding."""
        # Derive child key: change/index
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")

        # Get uncompressed public key (ETH uses uncompressed)
        pubkey = child.PublicKey().RawUncompressed().ToBytes()

        # Encode as ETH address (uses keccak256 of pubkey[1:])
        address = EthAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="eth_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate deterministic simulated address."""
        seed = f"{self._xpub}:{self._chain}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        # ETH addresses are 20 bytes (40 hex chars) with 0x prefix
        address_hex = hash_bytes[:20].hex()

        if HAS_ETH_LIBS:
            # Use proper checksum encoding
            address = to_checksum_address(f"0x{address_hex}")
        else:
            # Simple simulation without checksum
            address = f"0x{address_hex}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="eth_address_simulated",
        )


class BSCHDWallet(ETHHDWallet):
    """Binance Smart Chain HD Wallet.

    Uses same derivation as ETH (EVM-compatible).
    """

    def __init__(self, xpub: str, testnet: bool = False):
        super().__init__(xpub, testnet, chain="BSC")

    @property
    def coin_type(self) -> int:
        return 60  # Same as ETH


class TRXHDWallet(HDWalletProvider):
    """TRON HD Wallet using SLIP-44.

    Derivation path: m/44'/195'/0'/0/index
    Address format: T... (base58check)
    """

    def __init__(self, xpub: str, testnet: bool = False):
        self._xpub = xpub
        self._testnet = testnet
        self._bip32_ctx: Optional[object] = None

        if xpub:
            self._validate_xpub()

    def _validate_xpub(self) -> None:
        """Validate TRX xpub and initialize BIP32 context."""
        if not self._xpub:
            return

        valid_prefixes = ["xpub", "tpub"]
        if not any(self._xpub.startswith(p) for p in valid_prefixes):
            raise ValueError("Invalid TRX xpub prefix")

        if HAS_BIP_UTILS:
            try:
                # Use raw BIP32 derivation
                key_net_ver = Bip32KeyNetVersions(
                    b'\x04\x88\xb2\x1e',  # xpub
                    b'\x04\x88\xad\xe4'   # xprv (not used)
                )
                self._bip32_ctx = Bip32Secp256k1.FromExtendedKey(
                    self._xpub, key_net_ver
                )
            except Exception as e:
                raise ValueError(f"Invalid TRX xpub: {e}")

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
        return "TRX"

    @property
    def coin_type(self) -> int:
        return 195  # SLIP-44 for TRON

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive TRX address."""
        if HAS_BIP_UTILS and self._bip32_ctx:
            return self._derive_with_bip32(index, change)
        else:
            return self._derive_simulated(index, change)

    def _derive_with_bip32(self, index: int, change: int) -> AddressInfo:
        """Derive address using raw BIP32 and TRX address encoding."""
        from bip_utils import TrxAddrEncoder

        # Derive child key: change/index
        child = self._bip32_ctx.DerivePath(f"{change}/{index}")

        # Get uncompressed public key (TRX uses same as ETH)
        pubkey = child.PublicKey().RawUncompressed().ToBytes()

        # Encode as TRX address (base58check with 0x41 prefix)
        address = TrxAddrEncoder.EncodeKey(pubkey)

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="trx_address",
        )

    def _derive_simulated(self, index: int, change: int) -> AddressInfo:
        """Generate deterministic simulated address."""
        seed = f"{self._xpub}:{change}:{index}"
        hash_bytes = hashlib.sha256(seed.encode()).digest()

        # TRX addresses start with T and are base58 encoded
        address_hex = hash_bytes[:20].hex()
        address = f"T{address_hex[:33].upper()}"

        return AddressInfo(
            address=address,
            asset=self.asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="trx_address_simulated",
        )
