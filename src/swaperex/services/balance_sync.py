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


async def get_btc_balance(address: str) -> Optional[Decimal]:
    """Get Bitcoin balance using public API."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Use blockchain.info API
            response = await client.get(
                f"https://blockchain.info/balance?active={address}"
            )
            if response.status_code == 200:
                data = response.json()
                if address in data:
                    satoshis = data[address]["final_balance"]
                    return Decimal(satoshis) / Decimal(10**8)
    except Exception as e:
        logger.error(f"Failed to get BTC balance: {e}")
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
    """Get Tron balance using TronGrid API."""
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
            decimals = 6 if chain == "ethereum" else 18

        balance = await get_token_balance(address, contract, chain, decimals)
        if balance is not None and balance > 0:
            balances[token_name] = balance

    return balances


async def sync_wallet_balance(
    address: str,
    chain: str = "bsc",
) -> dict[str, Decimal]:
    """Sync wallet balance from blockchain."""
    logger.info(f"Syncing balance for {address} on {chain}")
    balances = await get_all_balances(address, chain)
    return balances


async def get_all_chain_balances() -> dict[str, dict[str, Decimal]]:
    """Get balances from ALL chains using seed phrase.

    Returns dict like:
    {
        "BSC": {"BNB": 0.5, "CAKE": 10.0},
        "ETH": {"ETH": 0.1},
        "BTC": {"BTC": 0.001},
        "SOL": {"SOL": 5.0},
        "TRX": {"TRX": 100.0},
    }
    """
    from swaperex.services.swap_executor import get_wallet_address

    all_balances = {}

    # Get EVM address (same for all EVM chains)
    evm_address = await get_wallet_address("bsc")

    if evm_address:
        # BSC
        bsc_balances = await get_all_balances(evm_address, "bsc")
        if bsc_balances:
            all_balances["BSC"] = bsc_balances

        # Ethereum
        eth_balances = await get_all_balances(evm_address, "ethereum")
        if eth_balances:
            all_balances["ETH"] = eth_balances

        # Polygon
        polygon_balances = await get_all_balances(evm_address, "polygon")
        if polygon_balances:
            all_balances["POLYGON"] = polygon_balances

    # For non-EVM chains, we need different address derivation
    # These would need their own HD wallet derivation
    # For now, just return EVM balances

    return all_balances
