"""AWS KMS signing backend.

Uses AWS Key Management Service for secure key storage and signing.
KMS keys never leave AWS - signing happens in the cloud.

Setup:
1. Create an asymmetric key in AWS KMS (ECC_SECG_P256K1)
2. Set AWS_KMS_KEY_ID environment variable (or per-chain keys)
3. Configure AWS credentials (IAM role, access keys, etc.)

Key naming convention:
- AWS_KMS_KEY_ID_{ASSET}: Chain-specific KMS key ID
- AWS_KMS_KEY_ID: Default KMS key ID

Reference:
- https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-concepts.html
"""

import asyncio
import logging
import os
from typing import Optional

from swaperex.signing.base import (
    KeyNotFoundError,
    SignatureResult,
    SignerBackend,
    SignerType,
    SigningError,
    SigningRequest,
    SigningTimeoutError,
)

logger = logging.getLogger(__name__)


class KMSSigner(SignerBackend):
    """AWS KMS signing backend.

    Uses AWS KMS asymmetric keys for signing. Supports:
    - ECC_SECG_P256K1 (secp256k1) - used by BTC, ETH, etc.
    - ECDSA signing algorithm

    Keys are identified by:
    - AWS KMS Key ID (e.g., "1234abcd-12ab-34cd-56ef-1234567890ab")
    - AWS KMS Key ARN
    - AWS KMS Key Alias (e.g., "alias/my-signing-key")
    """

    def __init__(self, region: Optional[str] = None):
        """Initialize KMS signer.

        Args:
            region: AWS region (defaults to AWS_DEFAULT_REGION or us-east-1)
        """
        super().__init__(SignerType.KMS)
        self.region = region or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
        self._key_cache: dict[str, str] = {}  # chain -> key_id mapping
        self._load_key_mappings()

    def _load_key_mappings(self):
        """Load KMS key ID mappings from environment."""
        # Load chain-specific keys
        for key, value in os.environ.items():
            if key.startswith("AWS_KMS_KEY_ID_"):
                chain = key.replace("AWS_KMS_KEY_ID_", "")
                self._key_cache[chain.upper()] = value
                logger.info(f"Loaded KMS key for {chain}")

        # Load default key
        default_key = os.environ.get("AWS_KMS_KEY_ID")
        if default_key:
            self._key_cache["DEFAULT"] = default_key
            logger.info("Loaded default KMS key")

    def _get_key_id(self, key_id: str, chain: str) -> str:
        """Resolve KMS key ID for signing.

        Args:
            key_id: Key identifier from request
            chain: Blockchain identifier

        Returns:
            AWS KMS Key ID/ARN/Alias

        Raises:
            KeyNotFoundError: If no key configured
        """
        # Try chain-specific key
        if chain.upper() in self._key_cache:
            return self._key_cache[chain.upper()]

        # Try key_id directly (might be KMS ID)
        if key_id.startswith("arn:") or key_id.startswith("alias/") or "-" in key_id:
            return key_id

        # Fall back to default
        if "DEFAULT" in self._key_cache:
            return self._key_cache["DEFAULT"]

        raise KeyNotFoundError(f"No KMS key configured for {chain}")

    async def sign(self, request: SigningRequest) -> SignatureResult:
        """Sign message hash using AWS KMS."""
        try:
            import boto3
            from botocore.exceptions import BotoCoreError, ClientError
        except ImportError:
            return SignatureResult(
                success=False,
                error="boto3 library not installed. Install with: pip install boto3",
            )

        try:
            kms_key_id = self._get_key_id(request.key_id, request.chain)
            message_hash = bytes.fromhex(request.message_hash.replace("0x", ""))

            # Create KMS client
            kms_client = boto3.client("kms", region_name=self.region)

            # Sign using KMS (run in thread pool for async)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: kms_client.sign(
                    KeyId=kms_key_id,
                    Message=message_hash,
                    MessageType="DIGEST",
                    SigningAlgorithm="ECDSA_SHA_256",
                ),
            )

            # Parse DER-encoded signature
            der_signature = response["Signature"]
            r, s = self._parse_der_signature(der_signature)

            # For Ethereum, we need to determine recovery parameter (v)
            v = None
            if request.chain.upper() in ("ETH", "BSC", "POLYGON", "ARBITRUM", "TRX"):
                # Get public key to determine v
                public_key = await self.get_public_key(request.key_id)
                if public_key:
                    v = self._recover_v(message_hash, r, s, public_key, request.chain)

            return SignatureResult(
                success=True,
                signature=(r + s).hex() if isinstance(r, bytes) else (bytes.fromhex(r) + bytes.fromhex(s)).hex(),
                v=v,
                r=r.hex() if isinstance(r, bytes) else r,
                s=s.hex() if isinstance(s, bytes) else s,
            )

        except KeyNotFoundError as e:
            return SignatureResult(success=False, error=str(e))
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "AccessDeniedException":
                return SignatureResult(
                    success=False,
                    error="Access denied to KMS key. Check IAM permissions.",
                )
            elif error_code == "NotFoundException":
                return SignatureResult(
                    success=False,
                    error="KMS key not found. Check key ID/ARN.",
                )
            logger.error(f"KMS signing error: {e}")
            return SignatureResult(success=False, error=str(e))
        except Exception as e:
            logger.error(f"KMS signing failed: {e}")
            return SignatureResult(success=False, error=str(e))

    def _parse_der_signature(self, der_signature: bytes) -> tuple[bytes, bytes]:
        """Parse DER-encoded ECDSA signature into r and s components.

        DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
        """
        # Skip sequence header (0x30) and total length
        offset = 2

        # Parse r
        assert der_signature[offset] == 0x02  # Integer tag
        r_len = der_signature[offset + 1]
        r = der_signature[offset + 2 : offset + 2 + r_len]
        offset += 2 + r_len

        # Parse s
        assert der_signature[offset] == 0x02  # Integer tag
        s_len = der_signature[offset + 1]
        s = der_signature[offset + 2 : offset + 2 + s_len]

        # Remove leading zeros if present (DER integers are signed)
        if r[0] == 0 and len(r) > 32:
            r = r[1:]
        if s[0] == 0 and len(s) > 32:
            s = s[1:]

        # Pad to 32 bytes if needed
        r = r.rjust(32, b"\x00")
        s = s.rjust(32, b"\x00")

        return r, s

    def _recover_v(self, message_hash: bytes, r: bytes, s: bytes, public_key_hex: str, chain: str) -> int:
        """Recover the v parameter for EVM signatures.

        For EIP-155, v = chain_id * 2 + 35 + recovery_id
        For legacy, v = 27 + recovery_id
        """
        chain_ids = {
            "ETH": 1,
            "BSC": 56,
            "POLYGON": 137,
            "ARBITRUM": 42161,
            "TRX": None,  # Tron uses different scheme
        }

        chain_id = chain_ids.get(chain.upper())

        try:
            from eth_keys import keys
            from eth_keys.datatypes import Signature

            # Try recovery with v=0 and v=1
            for recovery_id in (0, 1):
                try:
                    sig = Signature(vrs=(recovery_id + 27, int.from_bytes(r, "big"), int.from_bytes(s, "big")))
                    recovered_pub = sig.recover_public_key_from_msg_hash(message_hash)
                    if recovered_pub.to_hex() == public_key_hex:
                        if chain_id:
                            return chain_id * 2 + 35 + recovery_id
                        return 27 + recovery_id
                except Exception:
                    continue

        except ImportError:
            pass

        # Default to 27 if we can't determine
        return 27

    async def get_public_key(self, key_id: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Get public key from KMS."""
        try:
            import boto3
            from botocore.exceptions import ClientError

            kms_client = boto3.client("kms", region_name=self.region)

            # Try to resolve key ID
            kms_key_id = key_id
            if key_id.upper() in self._key_cache:
                kms_key_id = self._key_cache[key_id.upper()]
            elif "DEFAULT" in self._key_cache:
                kms_key_id = self._key_cache["DEFAULT"]

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: kms_client.get_public_key(KeyId=kms_key_id),
            )

            # Parse DER-encoded public key
            der_public_key = response["PublicKey"]
            public_key = self._parse_der_public_key(der_public_key)

            return public_key.hex()

        except Exception as e:
            logger.error(f"Failed to get KMS public key: {e}")
            return None

    def _parse_der_public_key(self, der_key: bytes) -> bytes:
        """Parse DER-encoded public key to raw format.

        For secp256k1, returns 64-byte uncompressed public key (without 0x04 prefix).
        """
        # DER format for EC public key is complex - use cryptography library
        try:
            from cryptography.hazmat.primitives.serialization import load_der_public_key
            from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey

            public_key = load_der_public_key(der_key)
            if isinstance(public_key, EllipticCurvePublicKey):
                # Get raw format (uncompressed: 04 || x || y)
                from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
                raw = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
                return raw[1:]  # Remove 0x04 prefix

        except ImportError:
            pass

        # Fallback: try to extract from ASN.1 structure
        # This is a simplified parser for EC public keys
        # Full implementation would need proper ASN.1 parsing
        if der_key[-64:]:
            return der_key[-64:]

        raise ValueError("Cannot parse DER public key")

    async def get_address(self, key_id: str, chain: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Derive blockchain address from KMS public key."""
        public_key_hex = await self.get_public_key(key_id)
        if not public_key_hex:
            return None

        public_key_bytes = bytes.fromhex(public_key_hex)

        if chain.upper() in ("ETH", "BSC", "POLYGON", "ARBITRUM"):
            # Ethereum address: last 20 bytes of keccak256(public_key)
            from Crypto.Hash import keccak
            k = keccak.new(digest_bits=256)
            k.update(public_key_bytes)
            address = "0x" + k.hexdigest()[-40:]
            return address

        elif chain.upper() == "TRX":
            # Tron address: similar to ETH but with different prefix
            from Crypto.Hash import keccak
            import base58
            k = keccak.new(digest_bits=256)
            k.update(public_key_bytes)
            address_bytes = b"\x41" + bytes.fromhex(k.hexdigest()[-40:])
            # Add checksum
            import hashlib
            checksum = hashlib.sha256(hashlib.sha256(address_bytes).digest()).digest()[:4]
            return base58.b58encode(address_bytes + checksum).decode()

        return None

    async def health_check(self) -> bool:
        """Check if KMS is accessible."""
        try:
            import boto3
            kms_client = boto3.client("kms", region_name=self.region)

            # Try to list keys (minimal permission check)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: kms_client.list_keys(Limit=1),
            )
            return True

        except Exception as e:
            logger.warning(f"KMS health check failed: {e}")
            return False
