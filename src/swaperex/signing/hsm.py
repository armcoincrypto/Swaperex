"""Hardware Security Module (HSM) signing backend.

Provides interface for PKCS#11 compliant HSMs such as:
- AWS CloudHSM
- Thales Luna HSM
- SafeNet HSM
- YubiHSM

Setup:
1. Install PKCS#11 library for your HSM
2. Set HSM_PKCS11_LIB environment variable to library path
3. Set HSM_PIN for HSM user PIN
4. Set HSM_SLOT (optional, defaults to first available)

Reference:
- https://docs.aws.amazon.com/cloudhsm/latest/userguide/pkcs11-library.html
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
)

logger = logging.getLogger(__name__)


class HSMSigner(SignerBackend):
    """PKCS#11 HSM signing backend.

    Uses PKCS#11 interface to communicate with hardware security modules.
    Keys are stored securely in the HSM and never exposed.

    Key identification:
    - By label: HSM_KEY_LABEL_{ASSET} or HSM_KEY_LABEL
    - By ID: HSM_KEY_ID_{ASSET} or HSM_KEY_ID
    """

    def __init__(
        self,
        pkcs11_lib: Optional[str] = None,
        pin: Optional[str] = None,
        slot: Optional[int] = None,
    ):
        """Initialize HSM signer.

        Args:
            pkcs11_lib: Path to PKCS#11 library (defaults to HSM_PKCS11_LIB env)
            pin: HSM user PIN (defaults to HSM_PIN env)
            slot: HSM slot number (defaults to HSM_SLOT env or first available)
        """
        super().__init__(SignerType.HSM)

        self.pkcs11_lib = pkcs11_lib or os.environ.get("HSM_PKCS11_LIB")
        self.pin = pin or os.environ.get("HSM_PIN")
        self.slot = slot if slot is not None else int(os.environ.get("HSM_SLOT", "0"))

        self._session = None
        self._key_cache: dict[str, str] = {}
        self._load_key_mappings()

    def _load_key_mappings(self):
        """Load HSM key label mappings from environment."""
        # Load chain-specific keys by label
        for key, value in os.environ.items():
            if key.startswith("HSM_KEY_LABEL_"):
                chain = key.replace("HSM_KEY_LABEL_", "")
                self._key_cache[chain.upper()] = ("label", value)
            elif key.startswith("HSM_KEY_ID_"):
                chain = key.replace("HSM_KEY_ID_", "")
                self._key_cache[chain.upper()] = ("id", value)

        # Load defaults
        if os.environ.get("HSM_KEY_LABEL"):
            self._key_cache["DEFAULT"] = ("label", os.environ["HSM_KEY_LABEL"])
        elif os.environ.get("HSM_KEY_ID"):
            self._key_cache["DEFAULT"] = ("id", os.environ["HSM_KEY_ID"])

    def _get_pkcs11_lib(self):
        """Get PKCS#11 library."""
        try:
            import pkcs11
            from pkcs11 import lib as pkcs11_lib

            if not self.pkcs11_lib:
                raise SigningError("HSM_PKCS11_LIB environment variable not set")

            return pkcs11_lib(self.pkcs11_lib)

        except ImportError:
            raise SigningError(
                "python-pkcs11 library not installed. Install with: pip install python-pkcs11"
            )

    async def _get_session(self):
        """Get or create HSM session."""
        if self._session is not None:
            return self._session

        try:
            import pkcs11
            from pkcs11 import Mechanism

            lib = self._get_pkcs11_lib()
            token = lib.get_token(slot_id=self.slot)

            if not self.pin:
                raise SigningError("HSM_PIN environment variable not set")

            # Open session with user login
            session = token.open(user_pin=self.pin)
            self._session = session

            return session

        except Exception as e:
            logger.error(f"Failed to open HSM session: {e}")
            raise SigningError(f"HSM session failed: {e}")

    def _get_key_handle(self, session, key_id: str, chain: str):
        """Get HSM key handle for signing.

        Args:
            session: PKCS#11 session
            key_id: Key identifier from request
            chain: Blockchain identifier

        Returns:
            PKCS#11 private key object

        Raises:
            KeyNotFoundError: If key not found
        """
        import pkcs11
        from pkcs11 import ObjectClass

        # Determine key lookup method
        lookup = None
        if chain.upper() in self._key_cache:
            lookup = self._key_cache[chain.upper()]
        elif "DEFAULT" in self._key_cache:
            lookup = self._key_cache["DEFAULT"]

        if lookup:
            lookup_type, lookup_value = lookup
            if lookup_type == "label":
                keys = list(session.get_objects({
                    pkcs11.Attribute.CLASS: ObjectClass.PRIVATE_KEY,
                    pkcs11.Attribute.LABEL: lookup_value,
                }))
            else:
                keys = list(session.get_objects({
                    pkcs11.Attribute.CLASS: ObjectClass.PRIVATE_KEY,
                    pkcs11.Attribute.ID: bytes.fromhex(lookup_value),
                }))
        else:
            # Try key_id as label
            keys = list(session.get_objects({
                pkcs11.Attribute.CLASS: ObjectClass.PRIVATE_KEY,
                pkcs11.Attribute.LABEL: key_id,
            }))

        if not keys:
            raise KeyNotFoundError(f"HSM key not found for {chain}")

        return keys[0]

    async def sign(self, request: SigningRequest) -> SignatureResult:
        """Sign message hash using HSM."""
        try:
            import pkcs11
            from pkcs11 import Mechanism

            session = await self._get_session()
            message_hash = bytes.fromhex(request.message_hash.replace("0x", ""))

            # Get private key
            loop = asyncio.get_event_loop()
            private_key = await loop.run_in_executor(
                None,
                lambda: self._get_key_handle(session, request.key_id, request.chain),
            )

            # Sign using ECDSA
            # Note: HSM might use different mechanism names
            signature = await loop.run_in_executor(
                None,
                lambda: private_key.sign(
                    message_hash,
                    mechanism=Mechanism.ECDSA,
                ),
            )

            # PKCS#11 returns raw r||s format (64 bytes for secp256k1)
            r = signature[:32]
            s = signature[32:]

            # For EVM chains, determine v
            v = None
            if request.chain.upper() in ("ETH", "BSC", "POLYGON", "ARBITRUM", "TRX"):
                public_key = await self.get_public_key(request.key_id)
                if public_key:
                    v = self._recover_v(message_hash, r, s, public_key, request.chain)

            return SignatureResult(
                success=True,
                signature=signature.hex(),
                v=v,
                r=r.hex(),
                s=s.hex(),
            )

        except KeyNotFoundError as e:
            return SignatureResult(success=False, error=str(e))
        except SigningError as e:
            return SignatureResult(success=False, error=str(e))
        except Exception as e:
            logger.error(f"HSM signing failed: {e}")
            return SignatureResult(success=False, error=str(e))

    def _recover_v(self, message_hash: bytes, r: bytes, s: bytes, public_key_hex: str, chain: str) -> int:
        """Recover v parameter for EVM chains."""
        chain_ids = {
            "ETH": 1,
            "BSC": 56,
            "POLYGON": 137,
            "ARBITRUM": 42161,
        }
        chain_id = chain_ids.get(chain.upper())

        try:
            from eth_keys import keys
            from eth_keys.datatypes import Signature

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

        return 27

    async def get_public_key(self, key_id: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Get public key from HSM."""
        try:
            import pkcs11
            from pkcs11 import ObjectClass

            session = await self._get_session()

            # Find public key
            lookup = None
            if key_id.upper() in self._key_cache:
                lookup = self._key_cache[key_id.upper()]
            elif "DEFAULT" in self._key_cache:
                lookup = self._key_cache["DEFAULT"]

            if lookup:
                lookup_type, lookup_value = lookup
                if lookup_type == "label":
                    keys = list(session.get_objects({
                        pkcs11.Attribute.CLASS: ObjectClass.PUBLIC_KEY,
                        pkcs11.Attribute.LABEL: lookup_value,
                    }))
                else:
                    keys = list(session.get_objects({
                        pkcs11.Attribute.CLASS: ObjectClass.PUBLIC_KEY,
                        pkcs11.Attribute.ID: bytes.fromhex(lookup_value),
                    }))
            else:
                keys = list(session.get_objects({
                    pkcs11.Attribute.CLASS: ObjectClass.PUBLIC_KEY,
                    pkcs11.Attribute.LABEL: key_id,
                }))

            if not keys:
                return None

            # Get EC point (public key)
            ec_point = keys[0][pkcs11.Attribute.EC_POINT]

            # EC_POINT is DER-encoded OCTET STRING
            # For secp256k1, it's 04 || x || y (65 bytes)
            if ec_point[0:2] == b"\x04\x41":  # DER wrapper
                public_key = ec_point[2:]
            elif ec_point[0] == 0x04:  # Raw uncompressed
                public_key = ec_point[1:]
            else:
                public_key = ec_point

            return public_key.hex()

        except Exception as e:
            logger.error(f"Failed to get HSM public key: {e}")
            return None

    async def get_address(self, key_id: str, chain: str, derivation_path: Optional[str] = None) -> Optional[str]:
        """Derive blockchain address from HSM public key."""
        public_key_hex = await self.get_public_key(key_id)
        if not public_key_hex:
            return None

        public_key_bytes = bytes.fromhex(public_key_hex)

        if chain.upper() in ("ETH", "BSC", "POLYGON", "ARBITRUM"):
            from Crypto.Hash import keccak
            k = keccak.new(digest_bits=256)
            k.update(public_key_bytes)
            return "0x" + k.hexdigest()[-40:]

        return None

    async def health_check(self) -> bool:
        """Check if HSM is accessible."""
        try:
            session = await self._get_session()
            return session is not None
        except Exception as e:
            logger.warning(f"HSM health check failed: {e}")
            return False

    async def close(self):
        """Close HSM session."""
        if self._session:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None
