"""Base interfaces for transaction signing.

Signing flow:
1. Build unsigned transaction
2. Submit to signer with key identifier
3. Signer returns signature (not raw private key exposure)
4. Apply signature to transaction
5. Broadcast signed transaction
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class SignerType(str, Enum):
    """Type of signing backend."""
    LOCAL = "local"           # Private key in memory (hot wallet)
    KMS = "kms"               # AWS KMS
    HSM = "hsm"               # Hardware Security Module
    VAULT = "vault"           # HashiCorp Vault
    MULTI_SIG = "multi_sig"   # Multi-signature (requires multiple signers)


@dataclass
class SigningRequest:
    """Request to sign transaction data.

    Attributes:
        chain: Blockchain identifier (BTC, ETH, TRX, etc.)
        key_id: Identifier for the signing key
        message_hash: Hash of the message/transaction to sign (32 bytes hex)
        derivation_path: Optional BIP32 derivation path
        metadata: Optional metadata for audit logging
    """
    chain: str
    key_id: str
    message_hash: str  # 32-byte hash as hex string
    derivation_path: Optional[str] = None
    metadata: Optional[dict] = None


@dataclass
class SignatureResult:
    """Result of signing operation.

    Attributes:
        success: Whether signing succeeded
        signature: Signature bytes as hex string (r + s for ECDSA)
        v: Recovery parameter (for ETH/EVM chains)
        r: R component of signature (hex)
        s: S component of signature (hex)
        public_key: Public key that created the signature (for verification)
        error: Error message if signing failed
    """
    success: bool
    signature: Optional[str] = None
    v: Optional[int] = None
    r: Optional[str] = None
    s: Optional[str] = None
    public_key: Optional[str] = None
    error: Optional[str] = None


class SignerBackend(ABC):
    """Abstract base class for signing backends.

    Implementations should NEVER expose raw private keys.
    All signing operations return signatures only.
    """

    def __init__(self, signer_type: SignerType):
        self.signer_type = signer_type

    @abstractmethod
    async def sign(self, request: SigningRequest) -> SignatureResult:
        """Sign a message hash.

        Args:
            request: Signing request with message hash and key identifier

        Returns:
            SignatureResult with signature components
        """
        pass

    @abstractmethod
    async def get_public_key(self, key_id: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Get public key for a key identifier.

        Args:
            key_id: Key identifier
            derivation_path: Optional BIP32 derivation path

        Returns:
            Public key as hex string, or None if not found
        """
        pass

    @abstractmethod
    async def get_address(self, key_id: str, chain: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Get blockchain address for a key identifier.

        Args:
            key_id: Key identifier
            chain: Blockchain identifier (determines address format)
            derivation_path: Optional BIP32 derivation path

        Returns:
            Blockchain address, or None if not found
        """
        pass

    async def health_check(self) -> bool:
        """Check if the signing backend is available.

        Returns:
            True if backend is ready to sign
        """
        return True

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(type={self.signer_type.value})"


class SigningError(Exception):
    """Exception raised when signing fails."""
    pass


class KeyNotFoundError(SigningError):
    """Exception raised when signing key is not found."""
    pass


class SigningTimeoutError(SigningError):
    """Exception raised when signing operation times out."""
    pass
