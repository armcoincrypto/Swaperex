"""Automatic deposit sweeper - transfers funds from deposit addresses to main wallet."""

import asyncio
import logging
import os
from decimal import Decimal
from typing import Optional

import httpx
from eth_account import Account
from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes

from swaperex.config import get_settings

logger = logging.getLogger(__name__)

# RPC endpoints for different chains
RPC_ENDPOINTS = {
    "ethereum": "https://eth.llamarpc.com",
    "bsc": "https://bsc-dataseed.binance.org/",
    "polygon": "https://polygon-rpc.com/",
    "avalanche": "https://api.avax.network/ext/bc/C/rpc",
}

CHAIN_IDS = {
    "ethereum": 1,
    "bsc": 56,
    "polygon": 137,
    "avalanche": 43114,
}

# Minimum balance to sweep (must cover gas + leave some value)
MIN_SWEEP_WEI = {
    "ethereum": 100000000000000,  # 0.0001 ETH (~$0.30)
    "bsc": 1000000000000000,  # 0.001 BNB (~$0.60)
    "polygon": 10000000000000000,  # 0.01 MATIC (~$0.01)
    "avalanche": 10000000000000000,  # 0.01 AVAX (~$0.30)
}


def get_seed_phrase() -> Optional[str]:
    """Get seed phrase from environment."""
    settings = get_settings()
    return getattr(settings, 'wallet_seed_phrase', None) or os.environ.get('WALLET_SEED_PHRASE')


def derive_private_key(index: int = 0) -> Optional[str]:
    """Derive private key for given address index."""
    seed_phrase = get_seed_phrase()
    if not seed_phrase:
        logger.error("No seed phrase found")
        return None

    try:
        seed_bytes = Bip39SeedGenerator(seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed_bytes, Bip44Coins.ETHEREUM)
        account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(index)
        return account.PrivateKey().Raw().ToHex()
    except Exception as e:
        logger.error(f"Failed to derive private key: {e}")
        return None


def get_main_wallet_address() -> str:
    """Get main wallet address (index 0)."""
    private_key = derive_private_key(0)
    if private_key:
        return Account.from_key(private_key).address
    return ""


async def get_balance(address: str, chain: str = "ethereum") -> int:
    """Get native balance in wei."""
    rpc_url = RPC_ENDPOINTS.get(chain, RPC_ENDPOINTS["ethereum"])

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(rpc_url, json={
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": [address, "latest"],
                "id": 1
            })
            result = resp.json()
            if "result" in result:
                return int(result["result"], 16)
    except Exception as e:
        logger.error(f"Failed to get balance for {address}: {e}")
    return 0


async def get_nonce(address: str, rpc_url: str) -> int:
    """Get transaction nonce."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(rpc_url, json={
            "jsonrpc": "2.0",
            "method": "eth_getTransactionCount",
            "params": [address, "latest"],
            "id": 1
        })
        return int(resp.json()["result"], 16)


async def get_gas_price(rpc_url: str) -> int:
    """Get current gas price."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(rpc_url, json={
            "jsonrpc": "2.0",
            "method": "eth_gasPrice",
            "params": [],
            "id": 1
        })
        return int(resp.json()["result"], 16)


async def sweep_address(
    from_index: int,
    to_address: str,
    chain: str = "ethereum"
) -> Optional[str]:
    """Sweep all funds from a deposit address to main wallet.

    Args:
        from_index: Derivation index of the deposit address
        to_address: Destination address (main wallet)
        chain: Blockchain network

    Returns:
        Transaction hash if successful, None otherwise
    """
    private_key = derive_private_key(from_index)
    if not private_key:
        return None

    account = Account.from_key(private_key)
    from_address = account.address

    rpc_url = RPC_ENDPOINTS.get(chain, RPC_ENDPOINTS["ethereum"])
    chain_id = CHAIN_IDS.get(chain, 1)
    min_sweep = MIN_SWEEP_WEI.get(chain, 100000000000000)

    try:
        # Get balance
        balance = await get_balance(from_address, chain)

        if balance < min_sweep:
            logger.debug(f"Balance too low to sweep: {balance} wei at {from_address}")
            return None

        # Get nonce and gas price
        nonce = await get_nonce(from_address, rpc_url)
        gas_price = await get_gas_price(rpc_url)

        # Calculate transfer amount (balance - gas)
        gas_limit = 21000
        gas_cost = gas_limit * gas_price
        transfer_amount = balance - gas_cost

        if transfer_amount <= 0:
            logger.debug(f"Not enough for gas at {from_address}")
            return None

        logger.info(f"Sweeping {transfer_amount / 1e18:.8f} from index {from_index} on {chain}")

        # Build and sign transaction
        tx = {
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": gas_limit,
            "to": to_address,
            "value": transfer_amount,
            "chainId": chain_id,
        }

        signed_tx = account.sign_transaction(tx)
        raw_tx = "0x" + signed_tx.raw_transaction.hex()

        # Broadcast
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(rpc_url, json={
                "jsonrpc": "2.0",
                "method": "eth_sendRawTransaction",
                "params": [raw_tx],
                "id": 1
            })
            result = resp.json()

        if "result" in result:
            txid = result["result"]
            logger.info(f"Sweep successful: {txid}")
            return txid
        else:
            logger.error(f"Sweep failed: {result}")
            return None

    except Exception as e:
        logger.error(f"Sweep error for index {from_index}: {e}")
        return None


async def sweep_all_deposits(chains: list[str] = None) -> dict:
    """Sweep all deposit addresses across specified chains.

    Args:
        chains: List of chains to sweep. Default: all supported chains

    Returns:
        Dict with results: {chain: [(index, txid), ...]}
    """
    if chains is None:
        chains = ["ethereum", "bsc", "polygon", "avalanche"]

    main_wallet = get_main_wallet_address()
    if not main_wallet:
        logger.error("Could not get main wallet address")
        return {}

    logger.info(f"Sweeping deposits to main wallet: {main_wallet}")

    results = {}

    # Get deposit addresses from database
    try:
        from swaperex.ledger.database import get_db
        from sqlalchemy import text

        async with get_db() as session:
            # Get all EVM deposit addresses with their derivation indices
            stmt = text("""
                SELECT DISTINCT derivation_index, address
                FROM deposit_addresses
                WHERE derivation_path LIKE '%/60/%'
                AND derivation_index > 0
            """)
            result = await session.execute(stmt)
            deposit_indices = [(row[0], row[1]) for row in result.fetchall()]

        logger.info(f"Found {len(deposit_indices)} deposit addresses to check")

        for chain in chains:
            chain_results = []

            for index, address in deposit_indices:
                # Check balance first
                balance = await get_balance(address, chain)
                min_sweep = MIN_SWEEP_WEI.get(chain, 100000000000000)

                if balance >= min_sweep:
                    logger.info(f"Found {balance / 1e18:.8f} at index {index} ({address}) on {chain}")
                    txid = await sweep_address(index, main_wallet, chain)
                    if txid:
                        chain_results.append((index, txid))
                    # Small delay between transactions
                    await asyncio.sleep(1)

            if chain_results:
                results[chain] = chain_results

    except Exception as e:
        logger.error(f"Failed to sweep deposits: {e}")

    return results


async def run_sweeper_loop(interval_seconds: int = 300):
    """Run deposit sweeper in a continuous loop.

    Args:
        interval_seconds: How often to check for deposits (default: 5 minutes)
    """
    logger.info(f"Starting deposit sweeper (interval: {interval_seconds}s)")

    while True:
        try:
            results = await sweep_all_deposits()

            if results:
                total_swept = sum(len(txs) for txs in results.values())
                logger.info(f"Swept {total_swept} deposit(s)")
                for chain, txs in results.items():
                    for index, txid in txs:
                        logger.info(f"  {chain}: index {index} -> {txid}")
            else:
                logger.debug("No deposits to sweep")

        except Exception as e:
            logger.error(f"Sweeper error: {e}")

        await asyncio.sleep(interval_seconds)


# CLI entry point for testing
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)

    async def main():
        if len(sys.argv) > 1 and sys.argv[1] == "--loop":
            await run_sweeper_loop()
        else:
            results = await sweep_all_deposits()
            print(f"Results: {results}")

    asyncio.run(main())
