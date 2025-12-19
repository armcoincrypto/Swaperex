"""HD Wallet base interface.

This module defines the abstract interface for HD wallet providers.
Each blockchain implementation derives addresses from an xpub (extended public key)
using BIP32/BIP44/BIP84 derivation paths.

Security: Only xpub is used - private keys are NEVER stored or transmitted.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class AddressInfo:
    """Information about a derived address."""

    address: str
    asset: str
    derivation_path: str
    index: int
    change: int = 0  # 0 = receiving, 1 = change
    script_type: Optional[str] = None  # p2wpkh, p2pkh, etc.


class HDWalletProvider(ABC):
    """Abstract base class for HD wallet providers.

    Each implementation handles a specific blockchain or family of chains.
    Addresses are derived deterministically from an xpub using child indexes.

    Usage:
        wallet = BTCHDWallet(xpub="xpub...")
        addr = wallet.derive_address(index=0)
    """

    def __init__(self, xpub: str, testnet: bool = False):
        """Initialize HD wallet with extended public key.

        Args:
            xpub: Extended public key (xpub, ypub, zpub, etc.)
            testnet: Use testnet derivation if True
        """
        self.xpub = xpub
        self.testnet = testnet
        self._validate_xpub()

    @abstractmethod
    def _validate_xpub(self) -> None:
        """Validate the xpub format for this chain."""
        pass

    @property
    @abstractmethod
    def asset(self) -> str:
        """Asset symbol (BTC, ETH, etc.)."""
        pass

    @property
    @abstractmethod
    def coin_type(self) -> int:
        """BIP44 coin type number."""
        pass

    @abstractmethod
    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Derive an address at the given index.

        Args:
            index: Child index (0, 1, 2, ...)
            change: 0 for receiving addresses, 1 for change addresses

        Returns:
            AddressInfo with the derived address and metadata
        """
        pass

    def derive_receiving_address(self, index: int) -> AddressInfo:
        """Derive a receiving address (change=0)."""
        return self.derive_address(index, change=0)

    def derive_change_address(self, index: int) -> AddressInfo:
        """Derive a change address (change=1)."""
        return self.derive_address(index, change=1)

    def get_derivation_path(self, index: int, change: int = 0) -> str:
        """Get the full derivation path for an index.

        Default format: m/purpose'/coin_type'/account'/change/index
        """
        return f"m/{self.purpose}'/{self.coin_type}'/0'/{change}/{index}"

    @property
    @abstractmethod
    def purpose(self) -> int:
        """BIP purpose number (44, 49, 84, etc.)."""
        pass


class SimulatedHDWallet(HDWalletProvider):
    """Simulated HD wallet for testing (no real derivation)."""

    def __init__(self, asset_symbol: str, xpub: str = "", testnet: bool = False):
        self._asset = asset_symbol.upper()
        self._xpub = xpub or f"sim_xpub_{asset_symbol}"
        self._testnet = testnet

    def _validate_xpub(self) -> None:
        """No validation for simulated wallet."""
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
        return 0

    @property
    def purpose(self) -> int:
        return 44

    def derive_address(self, index: int, change: int = 0) -> AddressInfo:
        """Generate simulated address."""
        prefix = "sim" if not self._testnet else "tsim"
        address = f"{prefix}:{self._asset.lower()}:{change}:{index:06d}"

        return AddressInfo(
            address=address,
            asset=self._asset,
            derivation_path=self.get_derivation_path(index, change),
            index=index,
            change=change,
            script_type="simulated",
        )
