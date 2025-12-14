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
    },
    "ethereum": {
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "DAI": "0x6B175474E89094C44Da98b954EedcdeCB5BE3830",
        "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        "UNI": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        "AAVE": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        "SHIB": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
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


async def get_trx_balance(address: str) -> Optional[Decimal]:
    """Get Tron TRX balance using TronGrid API."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.trongrid.io/v1/accounts/{address}"
            )
            if response.status_code == 200:
                data = response.json()
                if "data" in data and len(data["data"]) > 0:
                    balance = data["data"][0].get("balance", 0)
                    return Decimal(balance) / Decimal(10**6)
    except Exception as e:
        logger.error(f"Failed to get TRX balance: {e}")
    return None


async def get_trx_usdt_balance(address: str) -> Optional[Decimal]:
    """Get Tron USDT (TRC20) balance."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.trongrid.io/v1/accounts/{address}"
            )
            if response.status_code == 200:
                data = response.json()
                if "data" in data and len(data["data"]) > 0:
                    trc20 = data["data"][0].get("trc20", [])
                    # USDT TRC20 contract
                    usdt_contract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
                    for token in trc20:
                        if usdt_contract in token:
                            balance = int(token[usdt_contract])
                            return Decimal(balance) / Decimal(10**6)
    except Exception as e:
        logger.error(f"Failed to get TRX USDT balance: {e}")
    return None


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

    Note: TON uses a different derivation than BIP44. This is a simplified
    approach using the EVM address as identifier. For full TON support,
    use the official TON SDK.
    """
    # TON address derivation is complex - for now return None
    # Full implementation would require tonsdk library
    logger.warning("TON address derivation not yet implemented - requires tonsdk")
    return None


def derive_near_address(seed_phrase: str) -> Optional[str]:
    """Derive NEAR implicit address from seed phrase.

    NEAR implicit addresses are the hex encoding of the ed25519 public key.
    """
    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.NEAR_PROTOCOL)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
        # NEAR implicit address is the hex pubkey
        pubkey_bytes = account.PublicKey().RawCompressed().ToBytes()
        return pubkey_bytes.hex()
    except Exception as e:
        logger.error(f"Failed to derive NEAR address: {e}")
        return None


async def get_all_chain_balances_with_addresses() -> dict:
    """Get balances from ALL chains with addresses.

    Returns dict like:
    {
        "bsc": {"address": "0x...", "balances": {"BNB": 0.5, "CAKE": 10.0}},
        "solana": {"address": "...", "balances": {"SOL": 5.0}},
        ...
    }
    """
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return {}

    all_data = {}

    # EVM address (same for all EVM chains)
    try:
        from bip_utils import Bip39SeedGenerator, Bip32Secp256k1, EthAddrEncoder
        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip32_ctx = Bip32Secp256k1.FromSeed(seed)
        account_ctx = bip32_ctx.DerivePath("44'/60'/0'/0/0")
        pubkey = account_ctx.PublicKey().RawUncompressed().ToBytes()
        evm_address = EthAddrEncoder.EncodeKey(pubkey)

        # BSC
        bsc_balances = await get_all_balances(evm_address, "bsc")
        if bsc_balances:
            all_data["bsc"] = {"address": evm_address, "balances": bsc_balances}

        # Ethereum
        eth_balances = await get_all_balances(evm_address, "ethereum")
        if eth_balances:
            all_data["ethereum"] = {"address": evm_address, "balances": eth_balances}

        # Polygon
        polygon_balances = await get_all_balances(evm_address, "polygon")
        if polygon_balances:
            all_data["polygon"] = {"address": evm_address, "balances": polygon_balances}

        # Avalanche
        avax_balances = await get_all_balances(evm_address, "avalanche")
        if avax_balances:
            all_data["avalanche"] = {"address": evm_address, "balances": avax_balances}

    except Exception as e:
        logger.error(f"Failed to get EVM balances: {e}")

    # Solana
    sol_address = derive_solana_address(seed_phrase)
    if sol_address:
        sol_balance = await get_sol_balance(sol_address)
        if sol_balance and sol_balance > 0:
            all_data["solana"] = {"address": sol_address, "balances": {"SOL": sol_balance}}

    # Tron
    trx_address = derive_tron_address(seed_phrase)
    if trx_address:
        trx_balances = {}
        trx_balance = await get_trx_balance(trx_address)
        if trx_balance and trx_balance > 0:
            trx_balances["TRX"] = trx_balance
        usdt_balance = await get_trx_usdt_balance(trx_address)
        if usdt_balance and usdt_balance > 0:
            trx_balances["USDT"] = usdt_balance
        if trx_balances:
            all_data["tron"] = {"address": trx_address, "balances": trx_balances}

    # Cosmos
    atom_address = derive_cosmos_address(seed_phrase)
    if atom_address:
        atom_balance = await get_atom_balance(atom_address)
        if atom_balance and atom_balance > 0:
            all_data["cosmos"] = {"address": atom_address, "balances": {"ATOM": atom_balance}}

    # TON (address derivation not yet implemented)
    ton_address = derive_ton_address(seed_phrase)
    if ton_address:
        ton_balance = await get_ton_balance(ton_address)
        if ton_balance and ton_balance > 0:
            all_data["ton"] = {"address": ton_address, "balances": {"TON": ton_balance}}

    # NEAR
    near_address = derive_near_address(seed_phrase)
    if near_address:
        near_balance = await get_near_balance(near_address)
        if near_balance and near_balance > 0:
            all_data["near"] = {"address": near_address, "balances": {"NEAR": near_balance}}

    return all_data
