"""Signer factory.

Creates the appropriate signing backend based on configuration.

SECURITY NOTE:
- In WEB_NON_CUSTODIAL mode, all signing operations are disabled
- get_signer() will raise RuntimeError if called in web mode
- This prevents accidental exposure of signing capabilities to web layer
"""

import logging
import os
from functools import lru_cache
from typing import Optional

from swaperex.config import get_settings
from swaperex.signing.base import SignerBackend, SignerType

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_signer_type() -> SignerType:
    """Determine which signer to use based on environment.

    Priority:
    1. SIGNER_BACKEND environment variable (explicit)
    2. AWS_KMS_KEY_ID present -> KMS
    3. HSM_PKCS11_LIB present -> HSM
    4. HOT_WALLET_PRIVATE_KEY present -> Local
    5. Default to Local (simulated in dev mode)

    Returns:
        SignerType enum
    """
    explicit = os.environ.get("SIGNER_BACKEND", "").lower()

    if explicit:
        if explicit == "kms":
            return SignerType.KMS
        elif explicit == "hsm":
            return SignerType.HSM
        elif explicit == "local":
            return SignerType.LOCAL
        elif explicit == "vault":
            return SignerType.VAULT

    # Auto-detect based on available credentials
    if os.environ.get("AWS_KMS_KEY_ID") or any(
        k.startswith("AWS_KMS_KEY_ID_") for k in os.environ
    ):
        return SignerType.KMS

    if os.environ.get("HSM_PKCS11_LIB"):
        return SignerType.HSM

    # Default to local
    return SignerType.LOCAL


_signer_instance: Optional[SignerBackend] = None


def get_signer() -> SignerBackend:
    """Get the configured signer instance.

    Returns singleton instance for the configured signer type.

    Returns:
        SignerBackend instance

    Raises:
        RuntimeError: If called in WEB_NON_CUSTODIAL mode
    """
    # SECURITY: Block signing in web mode
    settings = get_settings()
    settings.require_custodial_mode("Transaction signing")

    global _signer_instance

    if _signer_instance is not None:
        return _signer_instance

    signer_type = get_signer_type()
    logger.info(f"Initializing {signer_type.value} signer")

    if signer_type == SignerType.KMS:
        from swaperex.signing.kms import KMSSigner
        _signer_instance = KMSSigner()

    elif signer_type == SignerType.HSM:
        from swaperex.signing.hsm import HSMSigner
        _signer_instance = HSMSigner()

    else:  # LOCAL
        from swaperex.signing.local import LocalSigner
        _signer_instance = LocalSigner()

    return _signer_instance


def reset_signer():
    """Reset the signer instance (for testing)."""
    global _signer_instance
    _signer_instance = None
    get_signer_type.cache_clear()


async def get_signer_info() -> dict:
    """Get information about the current signer configuration.

    Returns:
        Dict with signer type, health status, and available keys
    """
    signer = get_signer()
    health = await signer.health_check()

    return {
        "type": signer.signer_type.value,
        "healthy": health,
        "class": signer.__class__.__name__,
    }
