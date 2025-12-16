"""Real-time blockchain balance synchronization.

Fetches actual on-chain balances from various blockchains.
"""

import logging
import os
from decimal import Decimal
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# EVM RPC endpoints
RPC_ENDPOINTS = {
    "bsc": "https://bsc-dataseed.binance.org/",
    "ethereum": "https://eth.llamarpc.com",
    "polygon": "https://polygon-rpc.com/",
    "avalanche": "https://api.avax.network/ext/bc/C/rpc",
}

# Token contract addresses for balance queries
TOKEN_CONTRACTS = {
    "bsc": {
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "BUSD": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        "CAKE": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        "ETH": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
        "BTCB": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
        "XVS": "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
        "FLOKI": "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E",
        "BABYDOGE": "0xc748673057861a797275CD8A068AbB95A902e8de",
    },
    "ethereum": {
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "DAI": "0x6B175474E89094C44Da98b954EedcdeCB5BE3830",
        "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        "UNI": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        "AAVE": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        "SHIB": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
        "SUSHI": "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        "CRV": "0xD533a949740bb3306d119CC777fa900bA034cd52",
    },
    "polygon": {
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "USDC": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        "WETH": "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        "LINK": "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    },
    "avalanche": {
        "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
        "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        "JOE": "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd",
    },
}

# ERC20 balanceOf(address) method signature
BALANCE_OF_SIGNATURE = "0x70a08231"


async def get_native_balance(address: str, chain: str = "bsc") -> Optional[Decimal]:
    """Get native token balance (BNB, ETH, MATIC, etc.) from blockchain."""
    rpc_url = RPC_ENDPOINTS.get(chain)
    if not rpc_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_getBalance",
                    "params": [address, "latest"],
                    "id": 1,
                },
            )

            if response.status_code == 200:
                data = response.json()
                if "result" in data:
                    balance_wei = int(data["result"], 16)
                    balance = Decimal(balance_wei) / Decimal(10**18)
                    return balance

    except Exception as e:
        logger.error(f"Failed to get {chain} balance for {address}: {e}")

    return None


async def get_token_balance(
    address: str,
    token_contract: str,
    chain: str = "bsc",
    decimals: int = 18
) -> Optional[Decimal]:
    """Get ERC20/BEP20 token balance from blockchain."""
    rpc_url = RPC_ENDPOINTS.get(chain)
    if not rpc_url:
        return None

    address_padded = address.lower().replace("0x", "").zfill(64)
    data = f"{BALANCE_OF_SIGNATURE}{address_padded}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_call",
                    "params": [{"to": token_contract, "data": data}, "latest"],
                    "id": 1,
                },
            )

            if response.status_code == 200:
                result = response.json()
                if "result" in result and result["result"] != "0x":
                    balance_wei = int(result["result"], 16)
                    balance = Decimal(balance_wei) / Decimal(10**decimals)
                    return balance

    except Exception as e:
        logger.error(f"Failed to get token balance: {e}")

    return None


async def get_sol_balance(address: str) -> Optional[Decimal]:
    """Get Solana balance using public RPC."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.mainnet-beta.solana.com",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getBalance",
                    "params": [address]
                },
            )
            if response.status_code == 200:
                data = response.json()
                if "result" in data and "value" in data["result"]:
                    lamports = data["result"]["value"]
                    return Decimal(lamports) / Decimal(10**9)
    except Exception as e:
        logger.error(f"Failed to get SOL balance: {e}")
    return None


async def get_trx_all_balances(address: str) -> dict[str, Decimal]:
    """Get all Tron balances (TRX + TRC20 tokens) in a SINGLE API call.

    Returns dict like {"TRX": 1.5, "USDT": 100.0}
    """
    import asyncio
    balances = {}

    for attempt in range(3):  # Retry up to 3 times for rate limiting
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"https://api.trongrid.io/v1/accounts/{address}"
                )

                if response.status_code == 429:
                    # Rate limited - wait and retry
                    await asyncio.sleep(1 * (attempt + 1))
                    continue

                if response.status_code == 200:
                    data = response.json()
                    if "data" in data and len(data["data"]) > 0:
                        account_data = data["data"][0]

                        # TRX balance
                        trx_balance = account_data.get("balance", 0)
                        if trx_balance > 0:
                            balances["TRX"] = Decimal(trx_balance) / Decimal(10**6)

                        # TRC20 tokens
                        trc20 = account_data.get("trc20", [])
                        usdt_contract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
                        for token in trc20:
                            if usdt_contract in token:
                                usdt_balance = int(token[usdt_contract])
                                if usdt_balance > 0:
                                    balances["USDT"] = Decimal(usdt_balance) / Decimal(10**6)
                    break
        except Exception as e:
            logger.error(f"Failed to get TRX balances (attempt {attempt + 1}): {e}")

    return balances


async def get_trx_balance(address: str) -> Optional[Decimal]:
    """Get Tron TRX balance. Kept for backwards compatibility."""
    balances = await get_trx_all_balances(address)
    return balances.get("TRX")


async def get_trx_usdt_balance(address: str) -> Optional[Decimal]:
    """Get Tron USDT balance. Kept for backwards compatibility."""
    balances = await get_trx_all_balances(address)
    return balances.get("USDT")


async def get_atom_balance(address: str) -> Optional[Decimal]:
    """Get Cosmos ATOM balance using public API."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://lcd-cosmoshub.keplr.app/cosmos/bank/v1beta1/balances/{address}"
            )
            if response.status_code == 200:
                data = response.json()
                balances = data.get("balances", [])
                for bal in balances:
                    if bal.get("denom") == "uatom":
                        amount = int(bal.get("amount", 0))
                        return Decimal(amount) / Decimal(10**6)
    except Exception as e:
        logger.error(f"Failed to get ATOM balance: {e}")
    return None


async def get_ton_balance(address: str) -> Optional[Decimal]:
    """Get TON balance using public API."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://toncenter.com/api/v2/getAddressBalance?address={address}"
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    balance = int(data.get("result", 0))
                    return Decimal(balance) / Decimal(10**9)
    except Exception as e:
        logger.error(f"Failed to get TON balance: {e}")
    return None


async def get_near_balance(address: str) -> Optional[Decimal]:
    """Get NEAR balance using public RPC."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://rpc.mainnet.near.org",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "query",
                    "params": {
                        "request_type": "view_account",
                        "finality": "final",
                        "account_id": address
                    }
                },
            )
            if response.status_code == 200:
                data = response.json()
                if "result" in data and "amount" in data["result"]:
                    # NEAR uses yoctoNEAR (10^24)
                    yocto_near = int(data["result"]["amount"])
                    return Decimal(yocto_near) / Decimal(10**24)
    except Exception as e:
        logger.error(f"Failed to get NEAR balance: {e}")
    return None


async def get_all_balances(address: str, chain: str = "bsc") -> dict[str, Decimal]:
    """Get all balances (native + tokens) for an EVM address."""
    balances = {}

    native_tokens = {
        "bsc": "BNB",
        "ethereum": "ETH",
        "polygon": "MATIC",
        "avalanche": "AVAX",
    }

    native_name = native_tokens.get(chain, "ETH")
    native_balance = await get_native_balance(address, chain)
    if native_balance is not None:
        balances[native_name] = native_balance

    tokens = TOKEN_CONTRACTS.get(chain, {})
    for token_name, contract in tokens.items():
        decimals = 18
        if token_name in ("USDT", "USDC"):
            decimals = 6 if chain in ("ethereum", "polygon", "avalanche") else 18

        balance = await get_token_balance(address, contract, chain, decimals)
        if balance is not None and balance > 0:
            balances[token_name] = balance

    return balances


async def sync_wallet_balance(
    address: str,
    chain: str = "bsc",
) -> dict[str, Decimal]:
    """Sync wallet balance from blockchain."""
    balances = await get_all_balances(address, chain)
    return balances


# Address derivation helpers for non-EVM chains
def derive_solana_address(seed_phrase: str) -> Optional[str]:
    """Derive Solana address from seed phrase."""
    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
        return account.PublicKey().ToAddress()
    except Exception as e:
        logger.error(f"Failed to derive SOL address: {e}")
        return None


def derive_tron_address(seed_phrase: str) -> Optional[str]:
    """Derive Tron address from seed phrase."""
    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.TRON)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
        return account.PublicKey().ToAddress()
    except Exception as e:
        logger.error(f"Failed to derive TRX address: {e}")
        return None


def derive_cosmos_address(seed_phrase: str) -> Optional[str]:
    """Derive Cosmos ATOM address from seed phrase."""
    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
        return account.PublicKey().ToAddress()
    except Exception as e:
        logger.error(f"Failed to derive ATOM address: {e}")
        return None


def derive_ton_address(seed_phrase: str) -> Optional[str]:
    """Derive TON address from seed phrase.

    TON uses Ed25519 keys with wallet v4r2 contract.
    Derivation path: m/44'/607'/0'/0'/0'
    """
    try:
        import hashlib
        import base64
        from bip_utils import (
            Bip39SeedGenerator, Bip32Slip10Ed25519
        )

        # Generate seed
        seed = Bip39SeedGenerator(seed_phrase).Generate()

        # TON uses SLIP-10 Ed25519 with path m/44'/607'/0'/0'/0'
        bip32_ctx = Bip32Slip10Ed25519.FromSeed(seed)
        # Derive path for TON (coin type 607)
        derived = bip32_ctx.DerivePath("44'/607'/0'/0'/0'")

        # Get the 32-byte Ed25519 public key
        pubkey_bytes = derived.PublicKey().RawCompressed().ToBytes()
        # Remove the first byte (0x00 prefix) if present
        if len(pubkey_bytes) == 33 and pubkey_bytes[0] == 0:
            pubkey_bytes = pubkey_bytes[1:]

        # TON wallet v4r2 address calculation
        # This is a simplified version - creates bounceable address

        # Wallet v4r2 code cell hash (standard)
        wallet_code_hash = bytes.fromhex(
            "feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0"
        )

        # Create initial data cell: seqno(0) + subwallet_id + pubkey
        # Simplified: just hash pubkey with workchain
        workchain = 0  # basechain

        # Create state init hash (simplified)
        state_hash = hashlib.sha256(wallet_code_hash + pubkey_bytes).digest()

        # Create raw address: workchain (1 byte) + hash (32 bytes)
        raw_address = bytes([workchain]) + state_hash

        # Convert to user-friendly format (base64url with checksum)
        # Tag: 0x11 for bounceable, 0x51 for non-bounceable
        tag = 0x11  # bounceable
        address_bytes = bytes([tag, workchain]) + state_hash

        # Add CRC16 checksum
        crc = _crc16(address_bytes)
        address_with_crc = address_bytes + crc.to_bytes(2, 'big')

        # Base64 URL-safe encoding
        ton_address = base64.urlsafe_b64encode(address_with_crc).decode().rstrip('=')

        return ton_address

    except Exception as e:
        logger.error(f"Failed to derive TON address: {e}")
        return None


def _crc16(data: bytes) -> int:
    """Calculate CRC16-CCITT for TON address checksum."""
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
            crc &= 0xFFFF
    return crc


def derive_near_address(seed_phrase: str) -> Optional[str]:
    """Derive NEAR implicit address from seed phrase.

    NEAR implicit addresses are 64-character hex strings (ed25519 public key).
    Derivation path: m/44'/397'/0'
    """
    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip32Slip10Ed25519
        )

        seed = Bip39SeedGenerator(seed_phrase).Generate()

        # NEAR uses SLIP-10 Ed25519 with path m/44'/397'/0'
        bip32_ctx = Bip32Slip10Ed25519.FromSeed(seed)
        derived = bip32_ctx.DerivePath("44'/397'/0'")

        # Get the raw 32-byte Ed25519 public key
        pubkey_bytes = derived.PublicKey().RawCompressed().ToBytes()

        # Remove the 0x00 prefix if present (SLIP-10 adds it)
        if len(pubkey_bytes) == 33 and pubkey_bytes[0] == 0:
            pubkey_bytes = pubkey_bytes[1:]

        # NEAR implicit address is lowercase hex of the 32-byte public key
        return pubkey_bytes.hex().lower()

    except Exception as e:
        logger.error(f"Failed to derive NEAR address: {e}")
        return None


async def get_all_chain_balances_with_addresses() -> dict:
    """Get balances from ALL chains with addresses.

    Runs all balance checks in PARALLEL for faster response.

    Returns dict like:
    {
        "bsc": {"address": "0x...", "balances": {"BNB": 0.5, "CAKE": 10.0}},
        "solana": {"address": "...", "balances": {"SOL": 5.0}},
        ...
    }
    """
    import asyncio

    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return {}

    all_data = {}

    # Derive all addresses first (fast, CPU-bound)
    evm_address = None
    try:
        from bip_utils import Bip39SeedGenerator, Bip32Secp256k1, EthAddrEncoder
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip32_ctx = Bip32Secp256k1.FromSeed(seed)
        account_ctx = bip32_ctx.DerivePath("44'/60'/0'/0/0")
        pubkey = account_ctx.PublicKey().RawUncompressed().ToBytes()
        evm_address = EthAddrEncoder.EncodeKey(pubkey)
    except Exception as e:
        logger.error(f"Failed to derive EVM address: {e}")

    sol_address = derive_solana_address(seed_phrase)
    trx_address = derive_tron_address(seed_phrase)
    atom_address = derive_cosmos_address(seed_phrase)
    ton_address = derive_ton_address(seed_phrase)
    near_address = derive_near_address(seed_phrase)

    # Helper functions to wrap balance fetching
    async def fetch_evm_chain(chain: str, address: str):
        try:
            balances = await get_all_balances(address, chain)
            if balances:
                return (chain, {"address": address, "balances": balances})
        except Exception as e:
            logger.error(f"Failed to get {chain} balances: {e}")
        return None

    async def fetch_solana():
        if sol_address:
            try:
                sol_balance = await get_sol_balance(sol_address)
                if sol_balance and sol_balance > 0:
                    return ("solana", {"address": sol_address, "balances": {"SOL": sol_balance}})
            except Exception as e:
                logger.error(f"Failed to get Solana balance: {e}")
        return None

    async def fetch_tron():
        if trx_address:
            try:
                # Single API call gets both TRX and USDT
                trx_balances = await get_trx_all_balances(trx_address)
                if trx_balances:
                    return ("tron", {"address": trx_address, "balances": trx_balances})
            except Exception as e:
                logger.error(f"Failed to get Tron balances: {e}")
        return None

    async def fetch_cosmos():
        if atom_address:
            try:
                atom_balance = await get_atom_balance(atom_address)
                if atom_balance and atom_balance > 0:
                    return ("cosmos", {"address": atom_address, "balances": {"ATOM": atom_balance}})
            except Exception as e:
                logger.error(f"Failed to get Cosmos balance: {e}")
        return None

    async def fetch_ton():
        if ton_address:
            try:
                ton_balance = await get_ton_balance(ton_address)
                if ton_balance and ton_balance > 0:
                    return ("ton", {"address": ton_address, "balances": {"TON": ton_balance}})
            except Exception as e:
                logger.error(f"Failed to get TON balance: {e}")
        return None

    async def fetch_near():
        if near_address:
            try:
                near_balance = await get_near_balance(near_address)
                if near_balance and near_balance > 0:
                    return ("near", {"address": near_address, "balances": {"NEAR": near_balance}})
            except Exception as e:
                logger.error(f"Failed to get NEAR balance: {e}")
        return None

    # Build list of tasks to run in parallel
    tasks = []
    if evm_address:
        tasks.extend([
            fetch_evm_chain("bsc", evm_address),
            fetch_evm_chain("ethereum", evm_address),
            fetch_evm_chain("polygon", evm_address),
            fetch_evm_chain("avalanche", evm_address),
        ])
    tasks.extend([
        fetch_solana(),
        fetch_tron(),
        fetch_cosmos(),
        fetch_ton(),
        fetch_near(),
    ])

    # Run ALL balance fetches in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Collect results
    for result in results:
        if result and not isinstance(result, Exception):
            chain_id, chain_data = result
            all_data[chain_id] = chain_data

    return all_data
