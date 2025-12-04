#!/usr/bin/env python3
"""Derive DASH private key from BIP39 mnemonic (Trust Wallet recovery phrase).

Usage:
    python scripts/derive_dash_key.py

You'll be prompted to enter your 12 or 24 word recovery phrase.
The script will output the DASH address and WIF private key.

DASH BIP44 derivation path: m/44'/5'/0'/0/0
"""

import hashlib
import hmac
import struct
import sys

try:
    from mnemonic import Mnemonic
except ImportError:
    print("Installing mnemonic package...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "mnemonic", "-q"])
    from mnemonic import Mnemonic

try:
    from ecdsa import SECP256k1, SigningKey
except ImportError:
    print("Installing ecdsa package...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "ecdsa", "-q"])
    from ecdsa import SECP256k1, SigningKey

try:
    import base58
except ImportError:
    print("Installing base58 package...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "base58", "-q"])
    import base58


def mnemonic_to_seed(mnemonic: str, passphrase: str = "") -> bytes:
    """Convert mnemonic to seed using PBKDF2."""
    mnemonic_bytes = mnemonic.encode("utf-8")
    salt = ("mnemonic" + passphrase).encode("utf-8")
    return hashlib.pbkdf2_hmac("sha512", mnemonic_bytes, salt, 2048)


def derive_master_key(seed: bytes) -> tuple[bytes, bytes]:
    """Derive master private key and chain code from seed."""
    h = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    return h[:32], h[32:]


def derive_child_key(parent_key: bytes, parent_chain: bytes, index: int, hardened: bool = False) -> tuple[bytes, bytes]:
    """Derive child key from parent using BIP32."""
    if hardened:
        index += 0x80000000
        data = b"\x00" + parent_key + struct.pack(">I", index)
    else:
        # Get public key
        sk = SigningKey.from_string(parent_key, curve=SECP256k1)
        vk = sk.get_verifying_key()
        x = vk.pubkey.point.x()
        y = vk.pubkey.point.y()
        prefix = b'\x02' if y % 2 == 0 else b'\x03'
        pubkey = prefix + x.to_bytes(32, 'big')
        data = pubkey + struct.pack(">I", index)

    h = hmac.new(parent_chain, data, hashlib.sha512).digest()

    # Add parent key to derived key (mod curve order)
    curve_order = SECP256k1.order
    parent_int = int.from_bytes(parent_key, 'big')
    child_int = int.from_bytes(h[:32], 'big')
    derived_int = (parent_int + child_int) % curve_order

    derived_key = derived_int.to_bytes(32, 'big')
    derived_chain = h[32:]

    return derived_key, derived_chain


def derive_path(seed: bytes, path: str) -> bytes:
    """Derive private key for a BIP32 path."""
    # Parse path like m/44'/5'/0'/0/0
    parts = path.replace("m/", "").split("/")

    key, chain = derive_master_key(seed)

    for part in parts:
        hardened = part.endswith("'") or part.endswith("h")
        index = int(part.rstrip("'h"))
        key, chain = derive_child_key(key, chain, index, hardened)

    return key


def private_key_to_wif(privkey: bytes, compressed: bool = True) -> str:
    """Convert private key to WIF format for DASH."""
    # DASH mainnet WIF prefix: 0xCC (compressed) or 0x80 (uncompressed)
    if compressed:
        extended = b'\xcc' + privkey + b'\x01'
    else:
        extended = b'\xcc' + privkey

    return base58.b58encode_check(extended).decode()


def private_key_to_address(privkey: bytes, compressed: bool = True) -> str:
    """Convert private key to DASH address."""
    sk = SigningKey.from_string(privkey, curve=SECP256k1)
    vk = sk.get_verifying_key()

    x = vk.pubkey.point.x()
    y = vk.pubkey.point.y()

    if compressed:
        prefix = b'\x02' if y % 2 == 0 else b'\x03'
        pubkey = prefix + x.to_bytes(32, 'big')
    else:
        pubkey = b'\x04' + vk.to_string()

    # Hash160 = RIPEMD160(SHA256(pubkey))
    sha256 = hashlib.sha256(pubkey).digest()
    ripemd160 = hashlib.new('ripemd160', sha256).digest()

    # DASH mainnet P2PKH prefix: 0x4C (76 decimal) = 'X'
    extended = b'\x4c' + ripemd160

    return base58.b58encode_check(extended).decode()


def main():
    print("=" * 60)
    print("DASH Private Key Derivation from Trust Wallet")
    print("=" * 60)
    print()
    print("This will derive your DASH address and private key from")
    print("your 12 or 24 word recovery phrase.")
    print()
    print("BIP44 Path: m/44'/5'/0'/0/0 (DASH first address)")
    print()
    print("-" * 60)

    # Get mnemonic
    mnemonic = input("Enter your recovery phrase (12 or 24 words): ").strip().lower()

    # Validate mnemonic
    mnemo = Mnemonic("english")
    if not mnemo.check(mnemonic):
        print("\n❌ Invalid mnemonic! Please check your words.")
        return

    print("\n✅ Mnemonic is valid!")

    # Optional passphrase (most wallets don't use this)
    passphrase = input("Enter passphrase (press Enter for none): ").strip()

    # Derive seed
    seed = mnemonic_to_seed(mnemonic, passphrase)

    # Derive DASH key using BIP44 path: m/44'/5'/0'/0/0
    # 44' = BIP44, 5' = DASH coin type, 0' = account, 0 = external, 0 = first address
    path = "m/44'/5'/0'/0/0"
    privkey = derive_path(seed, path)

    # Convert to WIF and address
    wif = private_key_to_wif(privkey, compressed=True)
    address = private_key_to_address(privkey, compressed=True)

    print()
    print("=" * 60)
    print("YOUR DASH HOT WALLET CREDENTIALS")
    print("=" * 60)
    print()
    print(f"Address:     {address}")
    print(f"Private Key: {wif}")
    print()
    print("-" * 60)
    print("Add these to your .env file:")
    print("-" * 60)
    print()
    print(f"HOT_WALLET_ADDRESS_DASH={address}")
    print(f"HOT_WALLET_PRIVATE_KEY_DASH={wif}")
    print()
    print("=" * 60)
    print("⚠️  KEEP YOUR PRIVATE KEY SECRET!")
    print("⚠️  Fund this address with DASH for withdrawals")
    print("=" * 60)


if __name__ == "__main__":
    main()
