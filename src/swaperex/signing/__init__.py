"""Transaction signing services.

Provides secure signing implementations:
- LocalSigner: For development/hot wallet (private key in memory)
- KMSSigner: AWS KMS-backed signing
- HSMSigner: Hardware Security Module interface
"""

from swaperex.signing.base import (
    SignatureResult,
    SignerBackend,
    SigningRequest,
)
from swaperex.signing.factory import get_signer
from swaperex.signing.local import LocalSigner

__all__ = [
    "SignatureResult",
    "SignerBackend",
    "SigningRequest",
    "LocalSigner",
    "get_signer",
]
