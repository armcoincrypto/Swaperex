#!/usr/bin/env python3
"""Derive xpub keys from a seed phrase.

Usage:
    python scripts/derive_xpub.py "your seed phrase here"
    python scripts/derive_xpub.py  # prompts for seed phrase
"""

import sys
from getpass import getpass


def derive_xpubs(mnemonic: str) -> dict[str, str]:
    """Derive xpub keys for various coins from a mnemonic.

    Returns:
        Dict mapping coin symbols to xpub strings (base58 format)
    """
    try:
        from bip_utils import (
            Bip32Slip10Secp256k1,
            Bip39SeedGenerator,
            Bip44,
            Bip44Coins,
        )
    except ImportError:
        print("Error: bip_utils not installed. Run: pip install bip-utils")
        sys.exit(1)

    # Generate seed from mnemonic
    seed = Bip39SeedGenerator(mnemonic).Generate()

    xpubs = {}

    # BTC - BIP44 m/44'/0'/0'
    try:
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.BITCOIN)
        account = bip44_ctx.Purpose().Coin().Account(0)
        # Get the extended public key string directly from the account level
        xpubs["BTC"] = account.PublicKey().ToExtendedKey()
    except AttributeError:
        # Try alternative: use Bip32 directly
        try:
            from bip_utils import Bip32Secp256k1
            bip32 = Bip32Secp256k1.FromSeed(seed)
            # BIP44 path: m/44'/0'/0'
            account = bip32.DerivePath("44'/0'/0'")
            xpubs["BTC"] = account.PublicKey().ToExtendedKey()
        except Exception as e:
            print(f"BTC derivation error: {e}")
    except Exception as e:
        print(f"BTC derivation error: {e}")

    # LTC - BIP44 m/44'/2'/0'
    try:
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.LITECOIN)
        account = bip44_ctx.Purpose().Coin().Account(0)
        xpubs["LTC"] = account.PublicKey().ToExtendedKey()
    except AttributeError:
        try:
            from bip_utils import Bip32Secp256k1
            bip32 = Bip32Secp256k1.FromSeed(seed)
            account = bip32.DerivePath("44'/2'/0'")
            xpubs["LTC"] = account.PublicKey().ToExtendedKey()
        except Exception as e:
            print(f"LTC derivation error: {e}")
    except Exception as e:
        print(f"LTC derivation error: {e}")

    # DASH - BIP44 m/44'/5'/0'
    try:
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.DASH)
        account = bip44_ctx.Purpose().Coin().Account(0)
        xpubs["DASH"] = account.PublicKey().ToExtendedKey()
    except AttributeError:
        try:
            from bip_utils import Bip32Secp256k1
            bip32 = Bip32Secp256k1.FromSeed(seed)
            account = bip32.DerivePath("44'/5'/0'")
            xpubs["DASH"] = account.PublicKey().ToExtendedKey()
        except Exception as e:
            print(f"DASH derivation error: {e}")
    except Exception as e:
        print(f"DASH derivation error: {e}")

    # DOGE - BIP44 m/44'/3'/0'
    try:
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.DOGECOIN)
        account = bip44_ctx.Purpose().Coin().Account(0)
        xpubs["DOGE"] = account.PublicKey().ToExtendedKey()
    except AttributeError:
        try:
            from bip_utils import Bip32Secp256k1
            bip32 = Bip32Secp256k1.FromSeed(seed)
            account = bip32.DerivePath("44'/3'/0'")
            xpubs["DOGE"] = account.PublicKey().ToExtendedKey()
        except Exception as e:
            print(f"DOGE derivation error: {e}")
    except Exception as e:
        print(f"DOGE derivation error: {e}")

    # ETH - BIP44 m/44'/60'/0'
    try:
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.ETHEREUM)
        account = bip44_ctx.Purpose().Coin().Account(0)
        xpubs["ETH"] = account.PublicKey().ToExtendedKey()
    except AttributeError:
        try:
            from bip_utils import Bip32Secp256k1
            bip32 = Bip32Secp256k1.FromSeed(seed)
            account = bip32.DerivePath("44'/60'/0'")
            xpubs["ETH"] = account.PublicKey().ToExtendedKey()
        except Exception as e:
            print(f"ETH derivation error: {e}")
    except Exception as e:
        print(f"ETH derivation error: {e}")

    return xpubs


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        mnemonic = " ".join(sys.argv[1:])
    else:
        print("Enter your seed phrase (12 or 24 words):")
        mnemonic = getpass("Seed phrase: ")

    # Validate mnemonic
    words = mnemonic.strip().split()
    if len(words) not in [12, 24]:
        print(f"Error: Expected 12 or 24 words, got {len(words)}")
        sys.exit(1)

    print("\nDeriving xpub keys...\n")
    xpubs = derive_xpubs(mnemonic)

    print("=" * 60)
    print("Add these to your .env file:")
    print("=" * 60)
    for coin, xpub in xpubs.items():
        print(f"XPUB_{coin}={xpub}")

    print("\n" + "=" * 60)
    print("Or use environment variables:")
    print("=" * 60)
    for coin, xpub in xpubs.items():
        print(f"export XPUB_{coin}='{xpub}'")


if __name__ == "__main__":
    main()
