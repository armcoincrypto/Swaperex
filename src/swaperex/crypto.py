"""Cryptographic utilities for secure key storage.

Uses Fernet (AES-128-CBC with HMAC) for symmetric encryption.
"""

import base64
import hashlib
import logging
import os
import secrets
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import cryptography, fallback to no-op if unavailable
try:
    from cryptography.fernet import Fernet, InvalidToken
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    Fernet = None
    InvalidToken = Exception
    logger.warning("cryptography package not available - xpub encryption disabled")


def generate_master_key() -> str:
    """Generate a new master encryption key.

    Returns:
        Base64-encoded 32-byte key suitable for Fernet
    """
    if not CRYPTO_AVAILABLE:
        raise RuntimeError("cryptography package required for key generation")
    return Fernet.generate_key().decode()


def derive_key_from_password(password: str, salt: Optional[bytes] = None) -> tuple[str, bytes]:
    """Derive a Fernet key from a password using PBKDF2.

    Args:
        password: User-provided password
        salt: Optional salt (generated if not provided)

    Returns:
        Tuple of (base64-encoded key, salt)
    """
    if salt is None:
        salt = os.urandom(16)

    # PBKDF2 with SHA256, 100k iterations
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        100000,
        dklen=32,
    )

    # Fernet requires base64-encoded key
    fernet_key = base64.urlsafe_b64encode(key)
    return fernet_key.decode(), salt


class XpubEncryptor:
    """Encrypts and decrypts xpub keys using Fernet.

    Usage:
        encryptor = XpubEncryptor(master_key)
        encrypted = encryptor.encrypt("xpub...")
        decrypted = encryptor.decrypt(encrypted)
    """

    def __init__(self, master_key: str):
        """Initialize with master encryption key.

        Args:
            master_key: Base64-encoded Fernet key (32 bytes)
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography package required for encryption")
        self._fernet = Fernet(master_key.encode())

    def encrypt(self, xpub: str) -> str:
        """Encrypt an xpub key.

        Args:
            xpub: Extended public key string

        Returns:
            Base64-encoded encrypted string
        """
        return self._fernet.encrypt(xpub.encode()).decode()

    def decrypt(self, encrypted_xpub: str) -> str:
        """Decrypt an encrypted xpub.

        Args:
            encrypted_xpub: Base64-encoded encrypted string

        Returns:
            Decrypted xpub string

        Raises:
            InvalidToken: If decryption fails (wrong key or corrupted data)
        """
        return self._fernet.decrypt(encrypted_xpub.encode()).decode()

    def rotate_key(self, old_key: str, new_key: str, encrypted_xpub: str) -> str:
        """Re-encrypt an xpub with a new key.

        Args:
            old_key: Current encryption key
            new_key: New encryption key
            encrypted_xpub: Currently encrypted xpub

        Returns:
            Re-encrypted xpub with new key
        """
        old_fernet = Fernet(old_key.encode())
        new_fernet = Fernet(new_key.encode())

        decrypted = old_fernet.decrypt(encrypted_xpub.encode())
        return new_fernet.encrypt(decrypted).decode()


def get_encryptor() -> Optional[XpubEncryptor]:
    """Get encryptor instance using MASTER_KEY from settings.

    Returns:
        XpubEncryptor if MASTER_KEY is set, None otherwise
    """
    from swaperex.config import get_settings

    settings = get_settings()
    master_key = settings.master_key

    if not master_key:
        return None

    return XpubEncryptor(master_key)


def encrypt_xpub(xpub: str) -> Optional[str]:
    """Convenience function to encrypt an xpub.

    Returns None if MASTER_KEY not set.
    """
    encryptor = get_encryptor()
    if encryptor:
        return encryptor.encrypt(xpub)
    return None


def decrypt_xpub(encrypted: str) -> str:
    """Convenience function to decrypt an xpub.

    If the value is not encrypted (doesn't start with Fernet prefix 'gAAAAA'),
    returns the original value.

    Args:
        encrypted: Encrypted xpub string or plain xpub if not encrypted

    Returns:
        Decrypted xpub string, or original if not encrypted
    """
    # Fernet-encrypted values start with 'gAAAAA' (base64-encoded prefix)
    if not encrypted.startswith("gAAAAA"):
        # Not encrypted, return as-is
        return encrypted

    if not CRYPTO_AVAILABLE:
        logger.warning("Cannot decrypt xpub - cryptography package not available")
        return encrypted

    encryptor = get_encryptor()
    if encryptor:
        try:
            return encryptor.decrypt(encrypted)
        except InvalidToken:
            # Decryption failed - might be wrong key
            return encrypted
    # No MASTER_KEY set but value is encrypted - return as-is (will fail later)
    return encrypted
