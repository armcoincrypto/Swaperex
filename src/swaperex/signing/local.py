"""Local signing backend.

Uses in-memory private keys for signing. Suitable for:
- Development/testing
- Hot wallet with small amounts
- Auto-withdrawals below threshold

WARNING: Private keys are stored in memory. Use KMS/HSM for production
with significant funds.
"""

import hashlib
import logging
import os
from typing import Optional

from swaperex.signing.base import (
    KeyNotFoundError,
    SignatureResult,
    SignerBackend,
    SignerType,
    SigningRequest,
)

logger = logging.getLogger(__name__)


class LocalSigner(SignerBackend):
    """Local signing backend using in-memory private keys.

    Keys are loaded from environment variables:
    - HOT_WALLET_PRIVATE_KEY_{ASSET}: Chain-specific private keys
    - HOT_WALLET_PRIVATE_KEY: Default key for all chains

    Private keys are stored encrypted using MASTER_KEY if available.
    """

    def __init__(self):
        super().__init__(SignerType.LOCAL)
        self._keys: dict[str, bytes] = {}
        self._load_keys()

    def _load_keys(self):
        """Load private keys from environment."""
        from swaperex.crypto import decrypt_xpub

        # Load chain-specific keys
        for key, value in os.environ.items():
            if key.startswith("HOT_WALLET_PRIVATE_KEY_"):
                chain = key.replace("HOT_WALLET_PRIVATE_KEY_", "")
                # Decrypt if encrypted
                decrypted = decrypt_xpub(value)
                if decrypted:
                    self._keys[chain.upper()] = bytes.fromhex(decrypted.replace("0x", ""))
                    logger.info(f"Loaded hot wallet key for {chain}")

        # Load default key
        default_key = os.environ.get("HOT_WALLET_PRIVATE_KEY")
        if default_key:
            decrypted = decrypt_xpub(default_key)
            if decrypted:
                self._keys["DEFAULT"] = bytes.fromhex(decrypted.replace("0x", ""))
                logger.info("Loaded default hot wallet key")

    def _get_key(self, key_id: str, chain: str) -> bytes:
        """Get private key for signing.

        Args:
            key_id: Key identifier (can be asset name or 'default')
            chain: Blockchain identifier

        Returns:
            Private key bytes

        Raises:
            KeyNotFoundError: If key not found
        """
        # Try chain-specific key first
        if chain.upper() in self._keys:
            return self._keys[chain.upper()]

        # Fall back to key_id if it matches
        if key_id.upper() in self._keys:
            return self._keys[key_id.upper()]

        # Fall back to default
        if "DEFAULT" in self._keys:
            return self._keys["DEFAULT"]

        raise KeyNotFoundError(f"No signing key found for {chain}")

    async def sign(self, request: SigningRequest) -> SignatureResult:
        """Sign a message hash using local private key."""
        try:
            private_key = self._get_key(request.key_id, request.chain)
            message_hash = bytes.fromhex(request.message_hash.replace("0x", ""))

            # Chain-specific signing
            if request.chain.upper() in ("ETH", "BSC", "POLYGON", "ARBITRUM"):
                return await self._sign_eth(private_key, message_hash)
            elif request.chain.upper() == "BTC":
                return await self._sign_btc(private_key, message_hash)
            elif request.chain.upper() == "TRX":
                return await self._sign_trx(private_key, message_hash)
            else:
                # Default to secp256k1 ECDSA
                return await self._sign_secp256k1(private_key, message_hash)

        except KeyNotFoundError as e:
            return SignatureResult(success=False, error=str(e))
        except Exception as e:
            logger.error(f"Local signing failed: {e}")
            return SignatureResult(success=False, error=str(e))

    async def _sign_eth(self, private_key: bytes, message_hash: bytes) -> SignatureResult:
        """Sign for Ethereum/EVM chains."""
        try:
            from eth_account import Account
            from eth_account.messages import encode_defunct
            from eth_keys import keys

            # Create account from private key
            account = Account.from_key(private_key)

            # Sign the hash directly (not as a message)
            pk = keys.PrivateKey(private_key)
            signature = pk.sign_msg_hash(message_hash)

            return SignatureResult(
                success=True,
                signature=signature.to_bytes().hex(),
                v=signature.v,
                r=hex(signature.r),
                s=hex(signature.s),
                public_key=pk.public_key.to_hex(),
            )

        except ImportError:
            return await self._sign_secp256k1(private_key, message_hash)

    async def _sign_btc(self, private_key: bytes, message_hash: bytes) -> SignatureResult:
        """Sign for Bitcoin."""
        return await self._sign_secp256k1(private_key, message_hash)

    async def _sign_trx(self, private_key: bytes, message_hash: bytes) -> SignatureResult:
        """Sign for Tron."""
        # Tron uses same secp256k1 as Ethereum
        return await self._sign_eth(private_key, message_hash)

    async def _sign_secp256k1(self, private_key: bytes, message_hash: bytes) -> SignatureResult:
        """Generic secp256k1 ECDSA signing."""
        try:
            from ecdsa import SECP256k1, SigningKey
            from ecdsa.util import sigencode_string

            sk = SigningKey.from_string(private_key, curve=SECP256k1)
            signature = sk.sign_digest(
                message_hash,
                sigencode=sigencode_string,
            )

            # Split into r and s components (each 32 bytes)
            r = signature[:32].hex()
            s = signature[32:].hex()

            return SignatureResult(
                success=True,
                signature=signature.hex(),
                r=r,
                s=s,
                public_key=sk.get_verifying_key().to_string().hex(),
            )

        except ImportError:
            return SignatureResult(
                success=False,
                error="ecdsa library not installed",
            )

    async def get_public_key(self, key_id: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Get public key from private key."""
        try:
            # Try to find the key
            private_key = None
            if key_id.upper() in self._keys:
                private_key = self._keys[key_id.upper()]
            elif "DEFAULT" in self._keys:
                private_key = self._keys["DEFAULT"]

            if not private_key:
                return None

            # Try eth_keys first (more reliable)
            try:
                from eth_keys import keys
                pk = keys.PrivateKey(private_key)
                return pk.public_key.to_hex()
            except ImportError:
                pass

            # Fall back to ecdsa
            try:
                from ecdsa import SECP256k1, SigningKey
                sk = SigningKey.from_string(private_key, curve=SECP256k1)
                return sk.get_verifying_key().to_string().hex()
            except ImportError:
                pass

            return None

        except Exception as e:
            logger.error(f"Failed to get public key: {e}")
            return None

    async def get_address(self, key_id: str, chain: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Derive blockchain address from private key."""
        try:
            private_key = None
            if key_id.upper() in self._keys:
                private_key = self._keys[key_id.upper()]
            elif chain.upper() in self._keys:
                private_key = self._keys[chain.upper()]
            elif "DEFAULT" in self._keys:
                private_key = self._keys["DEFAULT"]

            if not private_key:
                return None

            if chain.upper() in ("ETH", "BSC", "POLYGON", "ARBITRUM"):
                from eth_account import Account
                account = Account.from_key(private_key)
                return account.address

            elif chain.upper() == "BTC":
                # Would need bip_utils for proper BTC address derivation
                return None

            elif chain.upper() == "TRX":
                # Would need tronpy for TRX address
                return None

            return None

        except Exception as e:
            logger.error(f"Failed to get address: {e}")
            return None

    async def health_check(self) -> bool:
        """Check if any keys are loaded."""
        return len(self._keys) > 0

    def add_key(self, key_id: str, private_key_hex: str):
        """Add a private key dynamically (for testing).

        Args:
            key_id: Key identifier
            private_key_hex: Private key as hex string
        """
        self._keys[key_id.upper()] = bytes.fromhex(private_key_hex.replace("0x", ""))

    def remove_key(self, key_id: str):
        """Remove a private key."""
        self._keys.pop(key_id.upper(), None)
