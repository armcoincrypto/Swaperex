"""Real-time blockchain balance synchronization.

Fetches actual on-chain balances from various blockchains.
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# RPC endpoints
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
    },
    "ethereum": {
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "DAI": "0x6B175474E89094C44Da98b954EedcdeCB5BE3830",
    },
}

# ERC20 balanceOf(address) method signature
BALANCE_OF_SIGNATURE = "0x70a08231"


async def get_native_balance(address: str, chain: str = "bsc") -> Optional[Decimal]:
    """Get native token balance (BNB, ETH, MATIC, etc.) from blockchain.

    Args:
        address: Wallet address
        chain: Chain name (bsc, ethereum, polygon, avalanche)

    Returns:
        Balance in human-readable format (e.g., 0.5 BNB)
    """
    rpc_url = RPC_ENDPOINTS.get(chain)
    if not rpc_url:
        logger.error(f"Unknown chain: {chain}")
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
    """Get ERC20/BEP20 token balance from blockchain.

    Args:
        address: Wallet address
        token_contract: Token contract address
        chain: Chain name
        decimals: Token decimals (6 for USDT/USDC, 18 for most others)

    Returns:
        Token balance in human-readable format
    """
    rpc_url = RPC_ENDPOINTS.get(chain)
    if not rpc_url:
        logger.error(f"Unknown chain: {chain}")
        return None

    # Encode balanceOf(address) call
    # Remove 0x prefix and pad address to 32 bytes
    address_padded = address.lower().replace("0x", "").zfill(64)
    data = f"{BALANCE_OF_SIGNATURE}{address_padded}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_call",
                    "params": [
                        {
                            "to": token_contract,
                            "data": data,
                        },
                        "latest"
                    ],
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
        logger.error(f"Failed to get token balance for {address}: {e}")

    return None


async def get_all_balances(address: str, chain: str = "bsc") -> dict[str, Decimal]:
    """Get all balances (native + tokens) for an address.

    Args:
        address: Wallet address
        chain: Chain name

    Returns:
        Dictionary of {asset: balance}
    """
    balances = {}

    # Native token name mapping
    native_tokens = {
        "bsc": "BNB",
        "ethereum": "ETH",
        "polygon": "MATIC",
        "avalanche": "AVAX",
    }

    # Get native balance
    native_name = native_tokens.get(chain, "ETH")
    native_balance = await get_native_balance(address, chain)
    if native_balance is not None:
        balances[native_name] = native_balance

    # Get token balances
    tokens = TOKEN_CONTRACTS.get(chain, {})
    for token_name, contract in tokens.items():
        # Determine decimals
        decimals = 18
        if token_name in ("USDT", "USDC"):
            decimals = 6 if chain == "ethereum" else 18  # BSC USDT uses 18 decimals

        balance = await get_token_balance(address, contract, chain, decimals)
        if balance is not None and balance > 0:
            balances[token_name] = balance

    return balances


async def sync_wallet_balance(
    address: str,
    chain: str = "bsc",
) -> dict[str, Decimal]:
    """Sync wallet balance from blockchain.

    This function fetches real on-chain balances and returns them.

    Args:
        address: The wallet address to check
        chain: The blockchain to query

    Returns:
        Dictionary of real on-chain balances
    """
    logger.info(f"Syncing balance for {address} on {chain}")

    balances = await get_all_balances(address, chain)

    logger.info(f"Found {len(balances)} assets with balances on {chain}")
    for asset, balance in balances.items():
        logger.info(f"  {asset}: {balance}")

    return balances
